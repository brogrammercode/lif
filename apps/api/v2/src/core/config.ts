import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().transform(Number).default(4001),
    BACKEND_URL: z.string().url().default('http://localhost:4001'),
    FRONTEND_URL: z.string().url().default('http://localhost:5173'),


    DB_STRING: z.string().min(1),

    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().default('7d'),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

    CORS_ORIGIN: z.string().transform(str => str.split(',')),

    // CLOUDINARY_CLOUD_NAME: z.string().min(1),
    // CLOUDINARY_API_KEY: z.string().min(1),
    // CLOUDINARY_API_SECRET: z.string().min(1),

    // RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default(60000),
    // RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default(100),

    MAIL_USER: z.string().default("[EMAIL_ADDRESS]"),
    GOOGLE_APP_PASSWORD: z.string().default("your-16-character-app-password"),
    // GOOGLE_CLIENT_ID: z.string().default("client-id"),
    // GOOGLE_CLIENT_SECRET: z.string().default("client-secret"),
    // GOOGLE_AUTH_CODE: z.string().default("auth-code"),

    // TWILIO_ACCOUNT_SID: z.string().min(1),
    // TWILIO_AUTH_TOKEN: z.string().min(1),
    // TWILIO_PHONE_NUMBER: z.string().min(1),

    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_PRIVATE_KEY: z.string().min(1),
    FIREBASE_CLIENT_EMAIL: z.string().min(1),

    // FACEBOOK_CLIENT_ID: z.string().default(''),
    // FACEBOOK_CLIENT_SECRET: z.string().default(''),
    // FACEBOOK_VERIFY_TOKEN: z.string().default('my_secure_token'),

    // LINKEDIN_CLIENT_ID: z.string().default(''),
    // LINKEDIN_CLIENT_SECRET: z.string().default(''),
    // LINKEDIN_REDIRECT_URI: z.string().default('http://localhost:3001/api/v1/setting/linkedin/callback'),

    // WHATSAPP_VERIFY_TOKEN: z.string().default('my_secure_token'),

    // RAZORPAY_KEY_ID: z.string().default(''),
    // RAZORPAY_KEY_SECRET: z.string().default(''),
    // RAZORPAY_WEBHOOK_SECRET: z.string().default(''),

    // STRIPE_SECRET_KEY: z.string().default(''),
    // STRIPE_WEBHOOK_SECRET: z.string().default(''),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error('Environment validation failed:', parsedEnv.error.format());
    process.exit(1);
}

export const config = parsedEnv.data;

export default config;
