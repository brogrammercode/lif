import asyncHandler from "../middlewares/async-handler.js";
import { User } from "../models/user.model.js";
import { Request, Response } from "express";
import { randomBytes } from "crypto";
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from "../utils/error.js";
import hashService from "../infra/security/hash.js";
import jwtService from "../infra/security/jwt.js";
import { sendSuccess } from "../utils/response.js";
import { HttpStatus } from "../constants/http-status.js";
import { Messages } from "../constants/messages.js";
import { firebaseAdmin } from "../infra/firebase/connection.js";
import { AuthOtp } from "../models/user.model.js";
import emailClient from "../infra/email/client.js";
import {
    AUTH_OTP_EXPIRY_MINUTES,
    AUTH_OTP_MAX_ATTEMPTS,
    FORGOT_PASSWORD_OTP_PURPOSE,
    createForgotPasswordOtpEmail,
    createOtpCode,
    createOtpExpiryDate,
    createResetPasswordSessionToken,
    hashOtpCode,
    hashResetPasswordSessionToken
} from "../utils/auth-otp.js";

class AuthController {
    private normalizeEmail(value: unknown) {
        return String(value ?? "").trim().toLowerCase();
    }

    private normalizePassword(value: unknown) {
        return typeof value === "string" ? value : "";
    }

    private escapeRegex(value: string) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }

    private sanitizeUser(user: any) {
        if (!user) {
            return user;
        }

        const sanitizedUser = typeof user.toObject === "function"
            ? user.toObject()
            : { ...user };

        delete sanitizedUser.password;
        return sanitizedUser;
    }

    private async findUserByEmail(email: string) {
        return User.findOne({
            email: {
                $regex: `^${this.escapeRegex(email)}$`,
                $options: "i"
            }
        });
    }

    private createForgotPasswordResponse(email: string) {
        return {
            email,
            expires_in_minutes: AUTH_OTP_EXPIRY_MINUTES
        };
    }

    private createForgotPasswordVerificationResponse(email: string, resetToken: string) {
        return {
            email,
            reset_token: resetToken,
            expires_in_minutes: AUTH_OTP_EXPIRY_MINUTES
        };
    }

    private createAuthPayload(user: any) {
        const sanitizedUser = this.sanitizeUser(user);
        const payload = { userId: sanitizedUser._id.toString(), email: sanitizedUser.email };
        const token = jwtService.generateAccessToken(payload);
        const refresh_token = jwtService.generateRefreshToken(payload);

        return { user: sanitizedUser, token, refresh_token };
    }

    private async resolveGoogleUser(idToken: string, profile?: { name?: string; image?: string; phone?: string }) {
        let decodedToken;

        try {
            decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
        } catch {
            throw new UnauthorizedError("Google sign in failed");
        }

        const email = this.normalizeEmail(decodedToken.email);

        if (!email || decodedToken.email_verified === false) {
            throw new UnauthorizedError("Google sign in failed");
        }

        const profileName = typeof profile?.name === "string" && profile.name.trim()
            ? profile.name.trim()
            : undefined;
        const profileImage = typeof profile?.image === "string" && profile.image.trim()
            ? profile.image.trim()
            : undefined;
        const profilePhone = typeof profile?.phone === "string" && profile.phone.trim()
            ? profile.phone.trim()
            : undefined;

        const name = typeof decodedToken.name === "string" && decodedToken.name.trim()
            ? decodedToken.name.trim()
            : profileName
                ? profileName
                : email.split("@")[0];
        const image = typeof decodedToken.picture === "string" && decodedToken.picture.trim()
            ? decodedToken.picture.trim()
            : profileImage
                ? profileImage
                : undefined;
        const phone = typeof decodedToken.phone_number === "string" && decodedToken.phone_number.trim()
            ? decodedToken.phone_number.trim()
            : profilePhone
                ? profilePhone
                : undefined;

        let user = await this.findUserByEmail(email);

        if (!user) {
            const password = await hashService.hash(randomBytes(32).toString("hex"));
            user = await User.create({
                name,
                email,
                password,
                image,
                phone
            });
            return user;
        }

        const updateData: Record<string, string> = {};

        if (name && name !== user.name) {
            updateData.name = name;
        }

        if (image && image !== user.image) {
            updateData.image = image;
        }

        if (phone && phone !== user.phone) {
            updateData.phone = phone;
        }

        if (Object.keys(updateData).length === 0) {
            return user;
        }

        const updatedUser = await User.findByIdAndUpdate(user._id, updateData, { new: true });
        return updatedUser || user;
    }

    private async issueForgotPasswordOtp(email: string, userName?: string) {
        const otp = createOtpCode();
        const otpHash = hashOtpCode(otp);
        const expiresAt = createOtpExpiryDate();
        const { subject, text, html } = createForgotPasswordOtpEmail(userName, otp);

        await AuthOtp.deleteMany({
            email,
            purpose: FORGOT_PASSWORD_OTP_PURPOSE
        });

        await AuthOtp.create({
            email,
            purpose: FORGOT_PASSWORD_OTP_PURPOSE,
            code_hash: otpHash,
            expires_at: expiresAt
        });

        await emailClient.sendEmail(email, subject, text, html);
    }

    register = asyncHandler(async (req: Request, res: Response) => {
        const { name, password } = req.body;
        const email = this.normalizeEmail(req.body?.email);

        if (!name || !email || !password) {
            throw new BadRequestError(Messages.INVALID_CREDENTIALS);
        }

        const userExists = await this.findUserByEmail(email);
        if (userExists) {
            throw new ConflictError(Messages.USER_ALREADY_EXISTS);
        }

        const hashPassword = await hashService.hash(password);
        const user = await User.create({ name, email, password: hashPassword });
        sendSuccess(res, this.createAuthPayload(user), "User created successfully", HttpStatus.CREATED);
    });

    login = asyncHandler(async (req: Request, res: Response) => {
        const { password } = req.body;
        const email = this.normalizeEmail(req.body?.email);

        if (!email || !password) {
            throw new BadRequestError(Messages.INVALID_CREDENTIALS);
        }

        const user = await this.findUserByEmail(email);
        if (!user) {
            throw new NotFoundError(Messages.USER_NOT_FOUND);
        }

        const isPasswordValid = await hashService.compare(password, user.password);
        if (!isPasswordValid) {
            throw new UnauthorizedError(Messages.INVALID_CREDENTIALS);
        }

        sendSuccess(res, this.createAuthPayload(user), "User logged in successfully", HttpStatus.OK);
    });

    google = asyncHandler(async (req: Request, res: Response) => {
        const idToken = String(req.body?.id_token ?? "").trim();
        const profile = {
            name: String(req.body?.profile?.name ?? "").trim() || undefined,
            image: String(req.body?.profile?.image ?? "").trim() || undefined,
            phone: String(req.body?.profile?.phone ?? "").trim() || undefined
        };

        if (!idToken) {
            throw new BadRequestError(Messages.INVALID_CREDENTIALS);
        }

        const user = await this.resolveGoogleUser(idToken, profile);
        sendSuccess(res, this.createAuthPayload(user), "User authenticated successfully", HttpStatus.OK);
    });

    requestForgotPasswordOtp = asyncHandler(async (req: Request, res: Response) => {
        const email = this.normalizeEmail(req.body?.email);

        if (!email) {
            throw new BadRequestError("Email is required");
        }

        const user = await this.findUserByEmail(email);

        if (user) {
            await this.issueForgotPasswordOtp(email, user.name);
        }

        sendSuccess(
            res,
            this.createForgotPasswordResponse(email),
            "If an account exists, an OTP has been sent to the email.",
            HttpStatus.OK
        );
    });

    verifyForgotPasswordOtp = asyncHandler(async (req: Request, res: Response) => {
        const email = this.normalizeEmail(req.body?.email);
        const otp = String(req.body?.otp ?? "").trim();

        if (!email || !otp) {
            throw new BadRequestError("Email and OTP are required");
        }

        const otpRecord = await AuthOtp.findOne({
            email,
            purpose: FORGOT_PASSWORD_OTP_PURPOSE,
            verified_at: null,
            consumed_at: null,
            expires_at: { $gt: new Date() }
        }).sort({ createdAt: -1 });

        if (!otpRecord) {
            throw new UnauthorizedError("OTP is invalid or expired");
        }

        const incomingHash = hashOtpCode(otp);

        if (incomingHash !== otpRecord.code_hash) {
            otpRecord.attempts += 1;

            if (otpRecord.attempts >= AUTH_OTP_MAX_ATTEMPTS) {
                otpRecord.consumed_at = new Date();
            }

            await otpRecord.save();
            throw new UnauthorizedError("OTP is invalid or expired");
        }

        const user = await this.findUserByEmail(email);

        if (!user) {
            otpRecord.consumed_at = new Date();
            await otpRecord.save();
            throw new NotFoundError(Messages.USER_NOT_FOUND);
        }

        const resetToken = createResetPasswordSessionToken();

        otpRecord.verified_at = new Date();
        otpRecord.reset_token_hash = hashResetPasswordSessionToken(resetToken);
        otpRecord.expires_at = createOtpExpiryDate();
        await otpRecord.save();

        sendSuccess(
            res,
            this.createForgotPasswordVerificationResponse(email, resetToken),
            "OTP verified successfully",
            HttpStatus.OK
        );
    });

    resetForgotPassword = asyncHandler(async (req: Request, res: Response) => {
        const email = this.normalizeEmail(req.body?.email);
        const resetToken = String(req.body?.reset_token ?? "").trim();
        const password = this.normalizePassword(req.body?.password);
        const confirmPassword = this.normalizePassword(req.body?.confirm_password);

        if (!email || !resetToken || !password) {
            throw new BadRequestError("Email, reset token, and password are required");
        }

        if (password.length < 6) {
            throw new BadRequestError("Password must be at least 6 characters");
        }

        if (!confirmPassword || password !== confirmPassword) {
            throw new BadRequestError("Passwords do not match");
        }

        const otpRecord = await AuthOtp.findOne({
            email,
            purpose: FORGOT_PASSWORD_OTP_PURPOSE,
            verified_at: { $ne: null },
            consumed_at: null,
            expires_at: { $gt: new Date() },
            reset_token_hash: hashResetPasswordSessionToken(resetToken)
        }).sort({ createdAt: -1 });

        if (!otpRecord) {
            throw new UnauthorizedError("Password reset session is invalid or expired");
        }

        const user = await this.findUserByEmail(email);

        if (!user) {
            otpRecord.consumed_at = new Date();
            await otpRecord.save();
            throw new NotFoundError(Messages.USER_NOT_FOUND);
        }

        user.password = await hashService.hash(password);
        await user.save();

        otpRecord.consumed_at = new Date();
        otpRecord.reset_token_hash = null;
        await otpRecord.save();

        sendSuccess(res, this.createAuthPayload(user), "Password reset successfully", HttpStatus.OK);
    });

    refreshToken = asyncHandler(async (req: Request, res: Response) => {
        const { refresh_token } = req.body;
        if (!refresh_token) {
            throw new BadRequestError(Messages.INVALID_CREDENTIALS);
        }
        const decoded = jwtService.verifyRefreshToken(refresh_token);
        const user = await User.findById(decoded.userId);
        if (!user) {
            throw new UnauthorizedError(Messages.INVALID_CREDENTIALS);
        }
        const payload = { userId: user._id.toString(), email: user.email };
        const token = jwtService.generateAccessToken(payload);
        const new_refresh_token = jwtService.generateRefreshToken(payload);
        sendSuccess(res, { token, refresh_token: new_refresh_token }, "Token refreshed successfully", HttpStatus.OK);
    });
}

export default AuthController;