import { createHash, randomBytes, randomInt } from "crypto";

export const FORGOT_PASSWORD_OTP_PURPOSE = "FORGOT_PASSWORD_RESET";
export const AUTH_OTP_EXPIRY_MINUTES = 10;
export const AUTH_OTP_MAX_ATTEMPTS = 5;

export const createOtpCode = () => {
    return randomInt(0, 1000000).toString().padStart(6, "0");
};

export const hashOtpCode = (value: string) => {
    return createHash("sha256").update(value).digest("hex");
};

export const createResetPasswordSessionToken = () => {
    return randomBytes(32).toString("hex");
};

export const hashResetPasswordSessionToken = (value: string) => {
    return hashOtpCode(value);
};

export const createOtpExpiryDate = () => {
    return new Date(Date.now() + AUTH_OTP_EXPIRY_MINUTES * 60 * 1000);
};

export const createForgotPasswordOtpEmail = (name: string | undefined, otp: string) => {
    const resolvedName = name?.trim() || "there";
    const subject = "Your OORG password reset OTP";
    const text = `Hi ${resolvedName}, your OORG password reset OTP is ${otp}. It expires in ${AUTH_OTP_EXPIRY_MINUTES} minutes.`;
    const html = `
        <div style="font-family: DM Sans, Arial, sans-serif; background:#f7f8fc; padding:32px;">
            <div style="max-width:520px; margin:0 auto; background:#ffffff; border:1px solid rgba(15,23,42,0.08); border-radius:20px; padding:32px;">
                <div style="font-size:12px; font-weight:600; letter-spacing:0.18em; text-transform:uppercase; color:#6b7280;">OORG Access</div>
                <h1 style="margin:16px 0 8px; font-size:28px; line-height:1.1; color:#111827;">Reset your password</h1>
                <p style="margin:0; font-size:15px; line-height:1.7; color:#4b5563;">Hi ${resolvedName}, use the verification code below to continue resetting your password. The code will expire in ${AUTH_OTP_EXPIRY_MINUTES} minutes.</p>
                <div style="margin:24px 0; padding:18px 20px; border-radius:16px; background:#eef2ff; color:#312e81; font-size:32px; font-weight:700; letter-spacing:0.28em; text-align:center;">${otp}</div>
                <p style="margin:0; font-size:13px; line-height:1.7; color:#6b7280;">If you did not request this code, you can ignore this email.</p>
            </div>
        </div>
    `;

    return { subject, text, html };
};
