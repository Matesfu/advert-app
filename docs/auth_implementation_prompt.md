# Full Authentication Implementation Prompt — Eventify Backend

> **What This Document Is:**  A ready-to-use prompt you can copy/paste into any AI assistant (or hand to another developer) to get a fully working authentication system for the Eventify backend.  It is based on a thorough analysis of every file in the current codebase.

---

## System / Context

You are a **Senior Backend Engineer** specializing in **Node.js, TypeScript, Express, and Prisma ORM**.

I have an existing backend project called **Eventify** (an event-marketplace app).  
The stack is:

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express 4 |
| ORM | Prisma (PostgreSQL) |
| Validation | Zod |
| Logging | Winston |
| Error Handling | Centralized `AppError` class + `express-async-errors` |
| Responses | Standardized helper functions (`sendSuccess`, `sendCreated`, `sendNoContent`) |

### Architecture Pattern (Route → Controller → Service)

Every module follows this fixed convention:

```
src/modules/<module>/
  ├── <module>.routes.ts      → Express Router, mounts middleware + controller handlers
  ├── <module>.controller.ts  → Thin HTTP layer; casts req.body, calls service, sends response
  ├── <module>.service.ts     → All business logic; talks to Prisma
  └── <module>.schema.ts      → Zod schemas + type exports
```

Global pieces live in:

```
src/config/env.ts              → Zod-validated environment variables (dotenv + z.object)
src/config/prisma.ts           → Singleton PrismaClient
src/middlewares/auth.middleware.ts      → `protect` and `restrictTo` middleware (currently placeholder)
src/middlewares/error.middleware.ts     → Global error handler
src/middlewares/validate.middleware.ts  → `validateRequest(zodSchema)` middleware factory
src/utils/AppError.ts          → Custom error class (message, statusCode, isOperational)
src/utils/response.ts          → sendSuccess, sendCreated, sendNoContent
src/utils/logger.ts            → Winston logger
src/types/express.d.ts         → Augments Express Request with `req.user`
src/app.ts                     → Express app setup, mounts routes at /api/v1/auth, etc.
src/server.ts                  → Starts server, connects Prisma
```

### Current State of the Auth Module

All four auth files exist but contain **only placeholder/stub implementations** that throw `AppError('…not implemented yet', 501)`. The routes, controller shape, and Zod schemas are wired up — they just need real logic.

### Current Prisma User Model

```prisma
model User {
  id            Int       @id @default(autoincrement())
  email         String    @unique
  passwordHash  String                          // ← currently required (not nullable)
  phone         String?
  role          UserRole  @default(CUSTOMER)
  isVerified    Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations omitted for brevity
}

enum UserRole {
  CUSTOMER
  VENDOR
  ADMIN
}
```

### Current `.env` Configuration (only these vars exist)

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://...
```

---

## Objective

Implement a **complete, fully working Authentication system** that supports **two registration/login methods**:

1. **Local Auth** — email + password (with email verification)
2. **Google OAuth 2.0** — Google Sign-In (server-side Authorization Code flow)

Both flows must coexist cleanly. The user should be able to choose either method.

---

## Detailed Requirements

### 1. Prisma Schema Changes (User Model)

Modify the `User` model to support both auth strategies:

```prisma
model User {
  id            Int       @id @default(autoincrement())
  email         String    @unique
  passwordHash  String?                         // ← Make NULLABLE (Google-only users won't have one)
  displayName   String?                         // ← NEW: populated from Google profile or user input
  avatarUrl     String?                         // ← NEW: Google profile picture URL
  phone         String?
  role          UserRole  @default(CUSTOMER)
  authProvider  String    @default("local")     // ← NEW: "local", "google", or "both"
  isVerified    Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // ... existing relations stay the same
}
```

Also add an `EmailVerificationToken` model:

```prisma
model EmailVerificationToken {
  id        Int      @id @default(autoincrement())
  token     String   @unique
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

> **Remember**: After changing the schema, generate a migration with `npx prisma migrate dev --name add_auth_fields`.

---

### 2. Environment Variables (`.env`)

All secrets and configurable values **MUST** live in `.env` — zero hard-coded credentials.

Add these to both `.env` and the Zod schema in `src/config/env.ts`:

```env
# ── Existing ──
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/eventify

# ── Google OAuth 2.0 ──
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URL=http://localhost:3000/api/v1/auth/google/callback

# ── Email Verification (SMTP) ──
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM='"Eventify" <noreply@eventify.com>'

# ── Frontend URL (for email verification link) ──
FRONTEND_URL=http://localhost:3000
```

Update `src/config/env.ts` — extend the Zod `envSchema` to validate **all** new variables:

```ts
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z.string().url(),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URL: z.string().url(),

  // SMTP / Email
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.string().default('587'),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().min(1),

  // Frontend
  FRONTEND_URL: z.string().url(),
});
```

---

### 3. NPM Dependencies to Install

```bash
npm install bcryptjs google-auth-library nodemailer uuid
npm install -D @types/bcryptjs @types/nodemailer @types/uuid
```

| Package | Purpose |
|---|---|
| `bcryptjs` | Hash & compare passwords |
| `google-auth-library` | Verify Google OAuth tokens and exchange authorization codes |
| `nodemailer` | Send verification emails via SMTP |
| `uuid` | Generate secure random verification tokens |

> **Do NOT install `passport` or `passport-google-oauth20`.** We are doing a lean, dependency-light implementation using `google-auth-library` directly.

---

### 4. API Routes to Implement

All routes are mounted at **`/api/v1/auth`**.

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/register` | Public | Local registration (email + password). Sends verification email. |
| `POST` | `/login` | Public | Local login (email + password). Must reject Google-registered users with a clear message. |
| `GET` | `/verify-email?token=xxx` | Public | Verify email address using token from email link. |
| `POST` | `/resend-verification` | Public | Resend the verification email (accepts `{ email }`). |
| `GET` | `/google` | Public | Redirects browser to **Google's OAuth consent screen**. |
| `GET` | `/google/callback` | Public | Google redirects here after consent. Exchanges code → tokens → user info. Creates/finds user. |
| `POST` | `/logout` | Private | Logout (currently a stub, will be implemented with JWT in phase 2). |
| `GET` | `/me` | Private | Get current user profile. |
| `PATCH` | `/change-password` | Private | Change password (only for `authProvider: "local"` users). |

---

### 5. Auth Service — Business Logic Rules

#### 5A. Local Registration (`POST /register`)

1. Check if email already exists in the database.
   - If exists and `authProvider` is `"google"` → throw error: *"This email is registered via Google. Please log in using Google Sign-In, or use Google Sign-In first to enable both methods."*
   - If exists and `authProvider` is `"local"` or `"both"` → throw error: *"Email already registered."*
2. Hash the password using `bcryptjs` (salt rounds: 12).
3. Create the user in the database with `authProvider: "local"`, `isVerified: false`.
4. Generate a verification token (`uuid.v4()`), store it in `EmailVerificationToken` with an expiry (e.g., 24 hours).
5. Send a verification email containing a link: `{FRONTEND_URL}/verify-email?token={token}`.
6. Return the created user data (exclude `passwordHash`). **Do NOT return a session token** (the user must verify their email first).
7. Response message: *"Registration successful. Please check your email to verify your account."*

#### 5B. Local Login (`POST /login`)

1. Find user by email.
2. **If user doesn't exist** → throw `401`: *"Invalid email or password."*
3. **If user exists but `authProvider` is `"google"` (Google-only)** → throw `403`: *"This account was registered using Google. Please use Google Sign-In to log in."* (Cross-method login prevention — Google-only users cannot use local login since they have no password.)
   - **If `authProvider` is `"both"`** → proceed normally (user has both methods available).
4. **If user exists and `authProvider` is `"local"` but `isVerified` is `false`** → throw `403`: *"Please verify your email before logging in. Check your inbox or request a new verification email."*
5. Compare provided password with stored `passwordHash` using `bcryptjs`.
6. If password doesn't match → throw `401`: *"Invalid email or password."* (Same generic message as step 2 for security.)
7. On success, return user data. (**No JWT token in this phase** — just return the user object. JWT will be implemented in phase 2.)

#### 5C. Email Verification (`GET /verify-email?token=xxx`)

1. Find the `EmailVerificationToken` record by `token`.
2. If not found → throw `400`: *"Invalid or expired verification token."*
3. If `expiresAt` is past → delete the token, throw `400`: *"Verification token has expired. Please request a new one."*
4. Update the associated user: set `isVerified = true`.
5. Delete the token (single-use).
6. Return success: *"Email verified successfully. You can now log in."*

#### 5D. Resend Verification Email (`POST /resend-verification`)

1. Accept `{ email }` in the body.
2. Find user by email.
3. If not found → return success anyway (don't reveal if email exists).
4. If already verified → throw `400`: *"Email is already verified."*
5. If `authProvider` is not `"local"` → throw `400`: *"This account uses Google Sign-In and does not require email verification."*
6. Delete any existing verification tokens for this user.
7. Generate new token, store it, send email.
8. Return success: *"If an account with that email exists, a verification link has been sent."*

#### 5E. Google OAuth Flow

**Step 1: `GET /google`** — Redirect to Google

1. Build the Google OAuth consent URL using `google-auth-library`'s `OAuth2Client`.
2. Set scopes: `['openid', 'email', 'profile']`.
3. Redirect the browser (`res.redirect(...)`) to the consent URL.

**Step 2: `GET /google/callback`** — Handle Google's response

1. Receive the `code` query parameter from Google.
2. Exchange the authorization code for tokens using `OAuth2Client.getToken(code)`.
3. **Verify the ID token** using `OAuth2Client.verifyIdToken()`. Extract the payload:
   - `email` (Google email, always verified by Google)
   - `name` (display name)
   - `picture` (profile picture URL)
   - `email_verified` (should be `true`)
4. Check if a user with this email already exists:
   - **If exists with `authProvider: "google"` or `"both"`** → this is a returning user; update `displayName` and `avatarUrl` if changed. Log them in.
   - **If exists with `authProvider: "local"`** → **UPGRADE the account**: update `authProvider` to `"both"`, set `isVerified: true` (Google has verified their email), populate `displayName` and `avatarUrl` from Google profile. The user's existing `passwordHash` is preserved — they can now use either login method.
   - **If doesn't exist** → create a new user with `authProvider: "google"`, `isVerified: true`, `passwordHash: null`, `displayName`, `avatarUrl`.
5. Return user data (or redirect to a frontend URL with a success indicator — for now, return JSON since we're testing with curl/browser).

> **Why allow local → Google upgrade?** A user who registered with email+password and then signs in via Google is *proving ownership* of the same email through Google's verification. This is safe to auto-link. The reverse (Google → local login) is blocked because Google-only users never set a password.

**Security rules for Google OAuth (what NOT to do):**

- ❌ **Do NOT** use Google access token as a session token
- ❌ **Do NOT** trust Google token without verification (always use `verifyIdToken`)
- ❌ **Do NOT** store Google access tokens permanently
- ❌ **Do NOT** send Google tokens to the frontend

#### 5F. Change Password (`PATCH /change-password`)

1. Only allowed for users who have a password (i.e., `authProvider` is `"local"` or `"both"`). If the user's `authProvider` is `"google"` (Google-only, no password), throw `400`: *"Cannot change password for Google-authenticated accounts. You can set a password by signing in with Google first."*
2. Verify current password matches.
3. Hash new password, update in database.

#### 5G. Get Me (`GET /me`)

1. Fetch user by `req.user.id`.
2. Return user data excluding `passwordHash`.

---

### 6. Email Utility — Create a Reusable Mailer

Create a new utility: **`src/utils/mailer.ts`**

- Configure `nodemailer` transporter using `.env` SMTP variables (from `env.ts`).
- Export a `sendVerificationEmail(to: string, token: string)` function.
- The email should contain: app name, greeting, verification link (`{FRONTEND_URL}/verify-email?token={token}`), expiration notice, and a professional HTML template.

---

### 7. Zod Schema Updates (`auth.schema.ts`)

Update/add schemas:

```ts
// Existing (keep as-is)
export const registerSchema = z.object({ ... });  // email, password, phone?, role?
export const loginSchema = z.object({ ... });      // email, password
export const changePasswordSchema = z.object({ ... }); // currentPassword, newPassword

// NEW
export const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const verifyEmailQuerySchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});
```

---

### 8. File-by-File Summary of Changes

| # | File | Action | What to Do |
|---|---|---|---|
| 1 | `prisma/schema.prisma` | **MODIFY** | Add `displayName`, `avatarUrl`, `authProvider` to User; make `passwordHash` optional; add `EmailVerificationToken` model; add relation |
| 2 | `.env` | **CREATE** | Add all Google OAuth + SMTP + Frontend URL variables |
| 3 | `src/config/env.ts` | **MODIFY** | Extend Zod schema to validate all new env vars |
| 4 | `src/utils/mailer.ts` | **CREATE** | Nodemailer transporter + `sendVerificationEmail` function |
| 5 | `src/modules/auth/auth.schema.ts` | **MODIFY** | Add `resendVerificationSchema` and `verifyEmailQuerySchema` |
| 6 | `src/modules/auth/auth.service.ts` | **REWRITE** | Replace all placeholder stubs with real business logic (see §5 above) |
| 7 | `src/modules/auth/auth.controller.ts` | **REWRITE** | Add new handlers: `verifyEmail`, `resendVerification`, `googleAuth`, `googleCallback`; update existing handlers |
| 8 | `src/modules/auth/auth.routes.ts` | **MODIFY** | Add new routes for verify-email, resend-verification, google, google/callback |
| 9 | `src/middlewares/auth.middleware.ts` | **NOTE** | The `protect` middleware is currently a mock. For this phase, keep it as a placeholder. JWT-based `protect` will be implemented in Phase 2. |
| 10 | `src/types/express.d.ts` | **MODIFY** | Optionally add `authProvider` to the `req.user` type if needed |

---

### 9. Critical Edge Cases to Handle

| Scenario | Expected Behavior |
|---|---|
| User registers with Google, then tries local login | Reject with 403: *"This account was registered using Google. Please use Google Sign-In to log in."* |
| User registers locally, then uses Google OAuth with same email | **Allow**: upgrade `authProvider` to `"both"`, auto-verify email, populate Google profile data. User can now use either method. |
| User with `authProvider: "both"` tries local login | **Allow**: they have a password, proceed normally. |
| User registers locally but hasn't verified email, tries to login | Reject with 403: *"Please verify your email before logging in."* |
| User registers locally (unverified), then uses Google OAuth | **Allow**: upgrade to `"both"` and **auto-verify** email (Google proved ownership). |
| User tries to change password but is a Google-only user | Reject with 400: *"Cannot change password for Google-authenticated accounts."* |
| User with `authProvider: "both"` changes password | **Allow**: they have a password to verify. |
| Verification token is expired | Delete token, return 400: *"Verification token has expired."* |
| Verification token is used twice | First use succeeds, second use returns *"Invalid or expired token"* (token is deleted after first use) |
| Resend verification for non-existent email | Return generic success (don't reveal if email exists) |

---

### 10. Response Format

Follow the existing standardized response format used everywhere in this project:

**Success:**
```json
{
  "status": "success",
  "data": { "user": { "id": 1, "email": "...", "role": "CUSTOMER", "authProvider": "local", "isVerified": true } },
  "message": "Login successful"
}
```

**Error:**
```json
{
  "status": "fail",
  "message": "This account was registered using Google. Please use Google Sign-In to log in."
}
```

Always exclude `passwordHash` from any response.

---

### 11. Testing Guide

#### 11A. Prerequisites

1. Create a `.env` file with all required variables (see §2).
2. Run `npx prisma migrate dev --name add_auth_fields` to apply schema changes.
3. Start the server: `npm run dev`.
4. Set up a **Google Cloud Project** with OAuth 2.0 credentials:
   - Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
   - Create an **OAuth 2.0 Client ID** (Web Application).
   - Add `http://localhost:3000/api/v1/auth/google/callback` as an **Authorized redirect URI**.
   - Copy the Client ID and Client Secret into `.env`.
5. For SMTP, if using Gmail: enable [App Passwords](https://myaccount.google.com/apppasswords) and use the generated password as `SMTP_PASS`.

#### 11B. Test: Local Registration

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Test1234"
  }'
```

**Expected:** 201 response with user data + message about checking email. An email should arrive with a verification link.

#### 11C. Test: Login Before Verification (Should Fail)

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Test1234"
  }'
```

**Expected:** 403 — *"Please verify your email before logging in."*

#### 11D. Test: Email Verification

Copy the token from the email link, then:

```bash
curl http://localhost:3000/api/v1/auth/verify-email?token=YOUR_TOKEN_HERE
```

**Expected:** 200 — *"Email verified successfully. You can now log in."*

#### 11E. Test: Login After Verification (Should Succeed)

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Test1234"
  }'
```

**Expected:** 200 with user data.

#### 11F. Test: Resend Verification Email

```bash
curl -X POST http://localhost:3000/api/v1/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{ "email": "testuser@example.com" }'
```

**Expected:** 200 — generic success message.

#### 11G. Test: Google OAuth Flow — New User (Browser)

1. Open in browser: `http://localhost:3000/api/v1/auth/google`
2. Browser redirects to Google consent screen.
3. Sign in with a Google account that has **not** been registered locally.
4. Google redirects back to `http://localhost:3000/api/v1/auth/google/callback?code=...`
5. **Expected:** JSON response with the **newly created** user data (including `displayName`, `avatarUrl`, `authProvider: "google"`).

#### 11H. Test: Local User Uses Google OAuth — Account Upgrade (Browser)

1. First, register a local user with `testuser@example.com` (if not already done in 11B).
2. Open in browser: `http://localhost:3000/api/v1/auth/google`
3. Sign in with the **same** Google account whose email matches `testuser@example.com`.
4. **Expected:** JSON response with user data showing `authProvider: "both"`, `isVerified: true`, plus `displayName` and `avatarUrl` populated from Google.
5. Now test that local login **still works** for this upgraded account:

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Test1234"
  }'
```

**Expected:** 200 — login succeeds (user has both methods).

#### 11I. Test: Google-Only User Tries Local Login (Should Fail)

After registering a fresh account via Google (with an email never registered locally):

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-google-only-email@gmail.com",
    "password": "anything"
  }'
```

**Expected:** 403 — *"This account was registered using Google. Please use Google Sign-In to log in."*

#### 11J. Test: Change Password (Local or "both" User)

```bash
curl -X PATCH http://localhost:3000/api/v1/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer mock-token" \
  -d '{
    "currentPassword": "Test1234",
    "newPassword": "NewPass1234"
  }'
```

**Expected:** 204 No Content (password changed).

> **Note:** Since `protect` middleware is still a mock in this phase (always returns user ID 1), test password change by ensuring the mock user ID matches a locally registered user or a "both" user.

#### 11K. Test: Change Password (Google-Only User — Should Fail)

Same curl as above, but with a user whose `authProvider` is `"google"` (never set a password).

**Expected:** 400 — *"Cannot change password for Google-authenticated accounts."*

---

### 12. Code Quality Standards

- Follow the **exact same patterns** used in the existing codebase (class-based service as singleton, functional controllers, Zod validation middleware, Winston logging, `AppError` for errors, response helpers).
- Use `express-async-errors` — **no try/catch blocks** in controllers.
- Every controller function must have JSDoc with `@route`, `@desc`, and `@access`.
- Log meaningful events with `logger.info()` and errors with `logger.error()`.
- Passwords must **never** appear in logs or responses.

---

### 13. What NOT To Implement in This Phase

| Item | Reason |
|---|---|
| JWT token generation/verification | Phase 2 — the `protect` middleware stays as a placeholder |
| Token refresh / rotation | Phase 2 |
| Password reset (forgot password) | Future feature |
| Rate limiting on auth endpoints | Future feature |
| Full account unlinking (removing Google or password) | Future feature — once linked, both methods stay active |

---

### 14. Deliverables Checklist

- [ ] Updated `prisma/schema.prisma` with new fields + `EmailVerificationToken` model
- [ ] Migration created and applied
- [ ] `.env` file created with all required variables
- [ ] `src/config/env.ts` updated with Zod validation for all new vars
- [ ] `src/utils/mailer.ts` created (Nodemailer setup + `sendVerificationEmail`)
- [ ] `src/modules/auth/auth.schema.ts` updated with new schemas
- [ ] `src/modules/auth/auth.service.ts` fully implemented (no more 501 errors)
- [ ] `src/modules/auth/auth.controller.ts` fully implemented with new handlers
- [ ] `src/modules/auth/auth.routes.ts` updated with all new routes
- [ ] All edge cases from §9 are handled
- [ ] Server starts without errors
- [ ] All test scenarios from §11 pass
