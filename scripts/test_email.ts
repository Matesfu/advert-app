import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';

// Force load the .env file from the backend root
const envPath = path.resolve(__dirname, '../.env');
console.log(`Loading .env from: ${envPath}`);
dotenv.config({ path: envPath });

const host = process.env.SMTP_HOST;
const port = parseInt(process.env.SMTP_PORT || '587');
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;

console.log('--- SMTP Debug ---');
console.log(`Host: ${host}`);
console.log(`Port: ${port}`);
console.log(`User: ${user}`);
console.log(`Pass: ${pass ? '****' + pass.slice(-4) : 'undefined'}`);
console.log('------------------');

const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
        user,
        pass,
    },
    logger: true,
    debug: true
});

async function main() {
    try {
        const info = await transporter.verify();
        console.log('✅ Connection verified successfully!', info);

        const sendInfo = await transporter.sendMail({
            from: process.env.SMTP_FROM || 'noreply@test.com',
            to: process.env.SMTP_USER, // Send to self
            subject: 'Test Email',
            text: 'It works!'
        });
        console.log('✅ Email sent successfully!', sendInfo.messageId);
    } catch (error) {
        console.error('❌ Error details:', error);
    }
}

main();
