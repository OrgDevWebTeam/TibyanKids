import mongoose from "mongoose";
import { ROLES, USER_NAME_MAX_LENGTH } from "../constants/index.js";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: USER_NAME_MAX_LENGTH },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },

    passwordHash: { type: String, required: true, select: false },

    role: { type: String, enum: ROLES, default: "parent", required: true },

    status: { type: String, enum: ["active", "suspended"], default: "active" },

    country: { type: String, trim: true, maxlength: 60 },

    termsAcceptedVersion: { type: String, trim: true, maxlength: 50 },

    termsAcceptedAt: { type: Date },

    emailVerifiedAt: { type: Date, default: null },

    verificationTokenHash: { type: String, select: false },

    verificationExpiresAt: { type: Date, select: false },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.passwordHash;
        delete ret.verificationTokenHash;
        delete ret.verificationExpiresAt;
        delete ret.__v;
        return ret;
      },
    },
  },
);

userSchema.index({ role: 1, status: 1 });

const User = mongoose.model("User", userSchema);
export default User;
