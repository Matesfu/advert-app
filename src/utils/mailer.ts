import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: parseInt(env.SMTP_PORT),
    secure: parseInt(env.SMTP_PORT) === 465, // true for 465, false for other ports
    auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
    },
});

/**
 * Send a verification email to the user.
 * 
 * @param to - Recipient email address
 * @param token - Verification token
 */
export const sendVerificationEmail = async (to: string, token: string): Promise<void> => {
    const verificationUrl = `${env.FRONTEND_URL}/verify-email?token=${token}`;

    const mailOptions = {
        from: env.SMTP_FROM,
        to,
        subject: 'Verify your email address - Eventify',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2>Welcome to Eventify!</h2>
                <p>Please click the button below to verify your email address:</p>
                <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0;">Verify Email</a>
                <p>Or copy and paste this link into your browser:</p>
                <p><a href="${verificationUrl}">${verificationUrl}</a></p>
                <p>This link will expire in 24 hours.</p>
                <p>If you did not request this, please ignore this email.</p>
            </div>
        `,
    };

    try {
        if (env.NODE_ENV === 'test') return; // Don't send emails in test mode

        await transporter.sendMail(mailOptions);
        logger.info(`Verification email sent to ${to}`);
    } catch (error) {
        logger.error(`Error sending verification email to ${to}:`, error);
        // We don't throw here to avoid failing the registration if email sending fails
        // In a production app, we might want to handle this differently (e.g., job queue)
    }
};
