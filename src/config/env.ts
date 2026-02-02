import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

// Define schema for valid environment variables
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('3000'),
    DATABASE_URL: z.string().url(),
    // Add future variables here (e.g. JWT_SECRET, AWS_KEYS)
});

// Validate process.env
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
    console.error('❌ Invalid environment variables:', parsedEnv.error.format());
    process.exit(1);
}

export const env = parsedEnv.data;
