import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

// Define schema for valid environment variables
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('3000'),
    DATABASE_URL: z.string().url(),

    // Google OAuth 2.0
    GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
    GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
    GOOGLE_REDIRECT_URL: z.string().url('GOOGLE_REDIRECT_URL must be a valid URL'),

    // SMTP / Email Verification
    SMTP_HOST: z.string().min(1, 'SMTP_HOST is required'),
    SMTP_PORT: z.string().default('587'),
    SMTP_USER: z.string().min(1, 'SMTP_USER is required'),
    SMTP_PASS: z.string().min(1, 'SMTP_PASS is required'),
    SMTP_FROM: z.string().min(1, 'SMTP_FROM is required'),

    // Frontend
    FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL'),

    // JWT Access Token
    JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
    JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),

    // JWT Refresh Token
    JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
    JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

    // CSRF
    CSRF_SECRET: z.string().min(16, 'CSRF_SECRET must be at least 16 characters'),

    // Cookie
    COOKIE_DOMAIN: z.string().optional(),
});

// Validate process.env
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error('❌ Invalid environment variables:', parsedEnv.error.format());
    process.exit(1);
}

export const env = parsedEnv.data;
