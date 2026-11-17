import bcrypt from "bcrypt";
import mongoose from "mongoose";
import User from "../Models/User.js";
import Family from "../Models/Family.js";
import { signToken } from "../utils/token.js";
import { createVerificationToken } from "../utils/verificationToken.js";
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
