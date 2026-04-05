import mongoose from "mongoose";
import { UserGender, UserMaritalStatus } from "../constants/user.js";

const userSchema = new mongoose.Schema(
    {
        name: { type: String },
        email: { type: String, required: true },
        password: { type: String, required: true },
        image: { type: String },
        gender: {
            type: String,
            enum: [UserGender.MALE, UserGender.FEMALE, UserGender.OTHER],
            default: UserGender.MALE,
        },
        marital_status: {
            type: String,
            enum: [
                UserMaritalStatus.SINGLE,
                UserMaritalStatus.MARRIED,
                UserMaritalStatus.DIVORCED,
                UserMaritalStatus.WIDOWED,
            ],
            default: UserMaritalStatus.SINGLE,
        },
        dob: { type: Date },
        phone: { type: String },
        bio: { type: String },
        country: { type: String },
        state: { type: String },
        city: { type: String },
        zip: { type: String },
        address: { type: String },
    },
    { timestamps: true },
);

const userSupportRequestSchema = new mongoose.Schema(
    {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null },
        email: { type: String, required: true, trim: true, lowercase: true },
        feedback: { type: String, required: true, trim: true },
    },
    { timestamps: true },
);

const authOtpSchema = new mongoose.Schema(
    {
        email: { type: String, required: true, trim: true, lowercase: true, index: true },
        purpose: { type: String, required: true, trim: true, index: true },
        code_hash: { type: String, required: true, trim: true },
        expires_at: { type: Date, required: true },
        consumed_at: { type: Date, default: null },
        verified_at: { type: Date, default: null },
        reset_token_hash: { type: String, default: null, trim: true },
        attempts: { type: Number, default: 0 },
    },
    { timestamps: true },
);

authOtpSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

const AuthOtp = mongoose.model("auth_otps", authOtpSchema);
const User = mongoose.model("users", userSchema);
const UserSupportRequest = mongoose.model("user_support_requests", userSupportRequestSchema);

export { User, AuthOtp, UserSupportRequest };