# Email Verification Setup Guide

Your code is **100% done**. The only thing missing is real SMTP credentials in `.env`. This guide shows you how to get them.

---

## Your Current Architecture (Already Built)

```
Registration Flow:
1. POST /api/v1/auth/register
2. auth.service.ts → creates user (isVerified: false)
3. auth.service.ts → creates EmailVerificationToken (UUID, 24h expiry)
4. auth.service.ts → calls sendVerificationEmail(email, token)
5. mailer.ts  → sends email via nodemailer SMTP
6. User clicks link → GET /api/v1/auth/verify-email?token=xxx
7. auth.service.ts → verifyEmail() marks user isVerified: true
```

**Files involved:**

| File | Role |
|------|------|
| `src/utils/mailer.ts` | Nodemailer transport + `sendVerificationEmail()` |
| `src/modules/auth/auth.service.ts` | `register()`, `verifyEmail()`, `resendVerification()` |
| `src/config/env.ts` | Validates SMTP env vars |
| `prisma/schema.prisma` | `EmailVerificationToken` model |
| `.env` | SMTP credentials (**currently placeholder `x`**) |

---

## Option 1: Ethereal Email (Easiest — Best for Testing)

[Ethereal](https://ethereal.email) is a **fake SMTP service** by the Nodemailer team. Emails are **never delivered** to real inboxes — you view them on their web UI. Perfect for development.

### Step 1: Create an Ethereal Account

```bash
# Run this one-liner in your terminal (Node.js)
node -e "const nm = require('nodemailer'); nm.createTestAccount().then(a => console.log(JSON.stringify(a, null, 2)))"
```

This prints something like:

```json
{
  "user": "abc123@ethereal.email",
  "pass": "randomPassword123",
  "smtp": { "host": "smtp.ethereal.email", "port": 587, "secure": false },
  "web": "https://ethereal.email"
}
```

### Step 2: Update `.env`

```env
SMTP_HOST="smtp.ethereal.email"
SMTP_PORT="587"
SMTP_USER="abc123@ethereal.email"       # from output above
SMTP_PASS="randomPassword123"           # from output above
SMTP_FROM="noreply@eventify.com"        # can be anything
```

### Step 3: Test It

1. Restart your server (`npm run dev`)
2. Register a user via API:
   ```bash
   curl -X POST http://localhost:8000/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com", "password": "Test1234!", "phone": "+1234567890"}'
   ```
3. Check the server logs — you should see: `Verification email sent to test@example.com`
4. Go to **https://ethereal.email** → Log in with the Ethereal credentials → Check the inbox
5. You will see the verification email with the link

### Step 4: Verify the Email

Copy the token from the link in the Ethereal inbox and call:

```bash
curl "http://localhost:8000/api/v1/auth/verify-email?token=<the-uuid-token>"
```

The user is now verified and can log in.

---

## Option 2: Gmail (Real Emails — Easy Setup)

Use your actual Gmail to send real emails. Good if you want to see emails arrive in a real inbox.

### Step 1: Enable 2-Step Verification on Gmail

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification** (required for App Passwords)

### Step 2: Create an App Password

1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Select **"Mail"** and **"Windows Computer"** (or Other)
3. Click **Generate**
4. Google gives you a **16-character password** like `abcd efgh ijkl mnop`

### Step 3: Update `.env`

```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="your-real-email@gmail.com"
SMTP_PASS="abcdefghijklmnop"            # the 16-char app password (no spaces)
SMTP_FROM="your-real-email@gmail.com"   # must match SMTP_USER for Gmail
```

### Step 4: Test It

Same as above — register a user and the verification email will arrive in the recipient's **real inbox** (check spam folder too).

> [!WARNING]
> Gmail has a **500 emails/day limit**. Fine for testing, not for production.

---

## Option 3: Mailtrap (Professional Testing)

[Mailtrap](https://mailtrap.io) is a popular email testing tool with a nice web UI to inspect emails. Free tier gives 100 emails/month.

### Step 1: Create a Free Account

1. Go to [mailtrap.io](https://mailtrap.io) and sign up
2. Go to **Email Testing** → **Inboxes** → click your inbox
3. Click **SMTP Settings** → Select **Nodemailer** from the integrations dropdown
4. Copy the credentials shown

### Step 2: Update `.env`

```env
SMTP_HOST="sandbox.smtp.mailtrap.io"
SMTP_PORT="2525"
SMTP_USER="your-mailtrap-username"      # from Mailtrap dashboard
SMTP_PASS="your-mailtrap-password"      # from Mailtrap dashboard
SMTP_FROM="noreply@eventify.com"        # can be anything
```

---

## Quick Comparison

| Feature | Ethereal | Gmail | Mailtrap |
|---------|----------|-------|----------|
| Setup Time | 30 seconds | 5 minutes | 2 minutes |
| Real Delivery | ❌ No | ✅ Yes | ❌ No |
| Web UI | ✅ Basic | N/A | ✅ Rich |
| Cost | Free | Free | Free (100/month) |
| Best For | Quick local dev | E2E testing | Team testing |

---

## My Recommendation

**Use Ethereal** — it takes 30 seconds, works instantly, and requires no account signup. Just run the one-liner, paste the creds in `.env`, restart the server, and you're sending test emails.

---

## Verification Flow Testing Checklist

After setting up any option above:

- [ ] Register → check that email is sent (server logs + inbox)
- [ ] Click verification link / call verify-email endpoint → user becomes verified
- [ ] Try logging in before verification → should be rejected (if you enforce it)
- [ ] Try logging in after verification → should succeed
- [ ] Resend verification → `POST /api/v1/auth/resend-verification` with `{"email": "..."}` 
- [ ] Expired token (wait 24h or manually change `expiresAt` in DB) → should fail with clear error
