import bcrypt from "bcrypt";
import mongoose from "mongoose";
import User from "../Models/User.js";
import Family from "../Models/Family.js";
import { signToken } from "../utils/token.js";
import { createVerificationToken, hashToken } from "../utils/verificationToken.js";
import { mailer } from "../utils/mailer.js";

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

export async function registerParent(req, res) {
  const { name, email, password, country, policyVersion } = req.body;

  const passwordHash = await bcrypt.hash(password, 10);
  const verification = createVerificationToken();

  const session = await mongoose.startSession();
  let user;
  let family;

  try {
    await session.withTransaction(async () => {
      [user] = await User.create(
        [
          {
            name,
            email,
            passwordHash,
            role: "parent",
            country,
            termsAcceptedVersion: policyVersion,
            termsAcceptedAt: new Date(),
            verificationTokenHash: verification.tokenHash,
            verificationExpiresAt: verification.expiresAt,
          },
        ],
        { session },
      );
      [family] = await Family.create([{ name: `${name}'s Family`, parentId: user._id }], {
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  // The email goes out after the account is saved. A failed email must not undo the registration.
  try {
    await mailer.sendVerificationEmail({ to: user.email, token: verification.token });
  } catch (error) {
    console.error("Failed to send verification email:", error.message);
  }

  res.status(201).json({
    status: "success",
    token: signToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
    family: { id: family._id, name: family.name },
  });
}

export async function login(req, res) {
  const { email, password } = req.body;

  const user = await User.findOne({ email: String(email) }).select("+passwordHash");

  const passwordMatches = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

  if (!user || !passwordMatches || user.status !== "active") {
    return res.status(401).json({ status: "fail", message: "Invalid email or password" });
  }

  res.status(200).json({
    status: "success",
    token: signToken(user),
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
}

export async function verifyEmail(req, res) {
  // One atomic step: find the matching, unexpired, unused token and mark the parent verified.
  // Two requests with the same token cannot both succeed.
  const user = await User.findOneAndUpdate(
    {
      verificationTokenHash: hashToken(req.body.token),
      verificationExpiresAt: { $gt: new Date() },
      emailVerifiedAt: null,
    },
    {
      $set: { emailVerifiedAt: new Date() },
      $unset: { verificationTokenHash: "", verificationExpiresAt: "" },
    },
  );

  // The same answer for an unknown, expired or already used token.
  if (!user) {
    return res
      .status(400)
      .json({ status: "fail", message: "Invalid or expired verification link" });
  }

  res.status(200).json({ status: "success", message: "Email verified" });
}

export async function resendVerification(req, res) {
  const user = await User.findById(req.user._id);

  if (user.emailVerifiedAt) {
    return res.status(409).json({ status: "fail", message: "Email is already verified" });
  }

  // A new token replaces the old one, so earlier links stop working.
  const verification = createVerificationToken();
  user.verificationTokenHash = verification.tokenHash;
  user.verificationExpiresAt = verification.expiresAt;
  await user.save();

  try {
    await mailer.sendVerificationEmail({ to: user.email, token: verification.token });
  } catch (error) {
    console.error("Failed to send verification email:", error.message);
    return res.status(503).json({
      status: "fail",
      message: "Could not send the verification email, please try again later",
    });
  }

  res.status(200).json({ status: "success", message: "Verification email sent" });
}
