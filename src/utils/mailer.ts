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

/**
 * Send an email notification when a new message is received.
 *
 * Controlled by the EMAIL_NOTIFICATIONS_ENABLED feature flag.
 * Fire-and-forget: failures are logged, never thrown.
 *
 * @param to - Recipient email address
 * @param senderName - Display name of the message sender
 * @param messagePreview - First 100 chars of the message content
 * @param conversationId - ID of the conversation (for deep-link)
 */
export const sendNewMessageEmail = async (
    to: string,
    senderName: string,
    messagePreview: string,
    conversationId: number
): Promise<void> => {
    // Feature flag check
    if (!env.EMAIL_NOTIFICATIONS_ENABLED) {
        logger.info(`[Mailer] Email notifications disabled — skipping notification to ${to}`);
        return;
    }

    // Skip in test environment
    if (env.NODE_ENV === 'test') return;

    const conversationUrl = `${env.FRONTEND_URL}/messages/${conversationId}`;
    const preview = messagePreview.length > 100
        ? messagePreview.substring(0, 100) + '…'
        : messagePreview;

    const mailOptions = {
        from: env.SMTP_FROM,
        to,
        subject: `New message from ${senderName} — Eventify`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">You have a new message</h2>
                <div style="background-color: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <p style="margin: 0 0 8px 0; font-weight: bold; color: #555;">${senderName}</p>
                    <p style="margin: 0; color: #333;">${preview}</p>
                </div>
                <a href="${conversationUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 16px 0;">View Conversation</a>
                <p style="color: #999; font-size: 12px; margin-top: 24px;">
                    You received this email because someone sent you a message on Eventify.
                </p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info(`[Mailer] New message notification sent to ${to}`);
    } catch (error) {
        logger.error(`[Mailer] Error sending message notification to ${to}:`, error);
        // Fire-and-forget: never block the API response
    }
};

/**
 * Send an email notification when a new review is received.
 *
 * Controlled by the EMAIL_NOTIFICATIONS_ENABLED feature flag.
 * Fire-and-forget: failures are logged, never thrown.
 *
 * @param to - Vendor owner email address
 * @param reviewerName - Display name of the reviewer
 * @param rating - Star rating (1-5)
 * @param comment - Review comment (optional)
 * @param businessName - Name of the vendor business
 * @param vendorProfileId - ID of the vendor profile (for deep-link)
 */
export const sendNewReviewEmail = async (
    to: string,
    reviewerName: string,
    rating: number,
    comment: string | null,
    businessName: string,
    vendorProfileId: number
): Promise<void> => {
    // Feature flag check
    if (!env.EMAIL_NOTIFICATIONS_ENABLED) {
        logger.info(`[Mailer] Email notifications disabled — skipping review notification to ${to}`);
        return;
    }

    // Skip in test environment
    if (env.NODE_ENV === 'test') return;

    const profileUrl = `${env.FRONTEND_URL}/vendors/${vendorProfileId}`;
    const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const commentPreview = comment
        ? (comment.length > 150 ? comment.substring(0, 150) + '…' : comment)
        : '<em>No comment provided</em>';

    const mailOptions = {
        from: env.SMTP_FROM,
        to,
        subject: `New ${rating}-star review on ${businessName} — Eventify`,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">You received a new review</h2>
                <div style="background-color: #f5f5f5; border-radius: 8px; padding: 16px; margin: 16px 0;">
                    <p style="margin: 0 0 8px 0; font-size: 24px; color: #f59e0b;">${stars}</p>
                    <p style="margin: 0 0 8px 0; font-weight: bold; color: #555;">${reviewerName}</p>
                    <p style="margin: 0; color: #333;">${commentPreview}</p>
                </div>
                <a href="${profileUrl}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block; margin: 16px 0;">View Your Profile</a>
                <p style="color: #999; font-size: 12px; margin-top: 24px;">
                    You received this email because someone left a review on your business profile on Eventify.
                </p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        logger.info(`[Mailer] New review notification sent to ${to}`);
    } catch (error) {
        logger.error(`[Mailer] Error sending review notification to ${to}:`, error);
        // Fire-and-forget: never block the API response
    }
};
