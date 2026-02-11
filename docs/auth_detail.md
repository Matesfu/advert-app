# 🔐 Auth Module — Detailed Implementation Guide

> A beginner-friendly, file-by-file walkthrough of every piece that makes up the authentication system.

---

## Table of Contents

1. [Big Picture — How It All Fits Together](#1-big-picture)
2. [Database Layer (Prisma Schema)](#2-database-layer)
3. [Auth Module Files](#3-auth-module-files)
   - [auth.schema.ts — Validation Rules](#31-authschemats)
   - [auth.routes.ts — URL Map](#32-authroutests)
   - [auth.controller.ts — Traffic Cop](#33-authcontrollerts)
   - [auth.service.ts — Business Logic Brain](#34-authservicets)
4. [Supporting Files (Middlewares)](#4-supporting-files-middlewares)
   - [validate.middleware.ts](#41-validatemiddlewarets)
   - [auth.middleware.ts](#42-authmiddlewarets)
   - [error.middleware.ts](#43-errormiddlewarets)
5. [Utility Files](#5-utility-files)
   - [AppError.ts](#51-apperrorts)
   - [response.ts — Standard API Responses](#52-responsets)
   - [mailer.ts — Email Sending](#53-mailerts)
   - [logger.ts — Logging](#54-loggerts)
6. [Configuration Files](#6-configuration-files)
   - [env.ts — Environment Variables](#61-envts)
   - [prisma.ts — Database Connection](#62-prismats)
7. [Type Declarations](#7-type-declarations)
   - [express.d.ts — Extending Express](#71-expressdts)
8. [Request Flow Diagram](#8-request-flow-diagram)
9. [API Endpoints Summary](#9-api-endpoints-summary)

---

## 1. Big Picture

Think of the auth module like a **building with security**:

```
Client Request
     │
     ▼
┌──────────────────┐
│   app.ts         │  ← Front door (registers routes, global middleware)
└──────┬───────────┘
       │
       ▼
┌──────────────────┐
│  auth.routes.ts  │  ← Receptionist (maps URLs to handler functions)
└──────┬───────────┘
       │
       ▼
┌────────────────────────────┐
│  validate.middleware.ts    │  ← Security scanner (checks your input data)
│  auth.middleware.ts        │  ← ID checker (checks your login token)
└──────┬─────────────────────┘
       │
       ▼
┌──────────────────────┐
│  auth.controller.ts  │  ← Front desk clerk (receives request, sends response)
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│  auth.service.ts     │  ← Back office (ALL business logic lives here)
└──────┬───────────────┘
       │
       ▼
┌──────────────────┐
│  Prisma (DB)     │  ← Filing cabinet (stores/retrieves data)
└──────────────────┘
```

**Why separate files?** Each file has ONE job. If something breaks, you know exactly WHERE to look. This pattern is called **Separation of Concerns**.

---

## 2. Database Layer

📄 **File:** `prisma/schema.prisma` (Lines 33–65)

The auth module uses **two** database tables:

### User Table

| Column       | Type     | Purpose                                              |
|-------------|----------|------------------------------------------------------|
| `id`        | Int      | Unique identifier (auto-increments: 1, 2, 3...)     |
| `email`     | String   | User's email (must be unique — no duplicates)         |
| `passwordHash` | String? | Hashed password (nullable — Google users don't have one) |
| `displayName` | String? | Name from Google profile or user input               |
| `avatarUrl` | String?  | Profile picture URL                                   |
| `phone`     | String?  | Optional phone number                                 |
| `role`      | UserRole | `CUSTOMER`, `VENDOR`, or `ADMIN`                     |
| `authProvider` | String | `"local"`, `"google"`, or `"both"`                   |
| `isVerified` | Boolean | Has the email been verified? Default: `false`         |
| `createdAt` | DateTime | When the account was created                          |
| `updatedAt` | DateTime | When the account was last modified                    |

> **What is `authProvider`?** It tracks HOW the user signed up:
> - `"local"` → Registered with email + password
> - `"google"` → Signed in with Google
> - `"both"` → Started with email, then also linked Google account

### EmailVerificationToken Table

| Column      | Type     | Purpose                                           |
|------------|----------|---------------------------------------------------|
| `id`       | Int      | Unique identifier                                  |
| `token`    | String   | A random UUID string (the verification code)       |
| `userId`   | Int      | Links to the User who owns this token              |
| `expiresAt`| DateTime | When the token expires (24 hours after creation)   |
| `createdAt`| DateTime | When the token was created                         |

The `userId` field creates a **relationship** — each token belongs to one user, and if the user is deleted, their tokens are also deleted (`onDelete: Cascade`).

---

## 3. Auth Module Files

All four files live in `src/modules/auth/`.

---

### 3.1 `auth.schema.ts`

📄 **File:** `src/modules/auth/auth.schema.ts`
🎯 **Role:** Defines the **validation rules** for incoming request data using the **Zod** library.

**Think of it as:** A form with rules. Before anyone can register or login, their data must pass these checks.

#### Schemas Defined

**1. `registerSchema`** — Rules for creating a new account:

```typescript
{
  email:    required, must be valid email format
  password: required, min 8 chars, must have uppercase + lowercase + number
  phone:    optional, must match phone format if given
  role:     optional, defaults to "CUSTOMER" (can be CUSTOMER, VENDOR, ADMIN)
}
```

Example of a **valid** input:
```json
{
  "email": "john@example.com",
  "password": "MyPass123",
  "phone": "+251911123456",
  "role": "CUSTOMER"
}
```

Example of an **invalid** input (password too short, no uppercase):
```json
{
  "email": "john@example.com",
  "password": "abc"
}
```
→ Returns: `"Password must be at least 8 characters"`

---

**2. `loginSchema`** — Rules for logging in:

```typescript
{
  email:    required, must be valid email
  password: required, just need at least 1 character
}
```

> Notice the password rule is simpler here — we don't enforce complexity on login because the user already set a valid password during registration.

---

**3. `changePasswordSchema`** — Rules for changing password:

```typescript
{
  currentPassword: required, at least 1 character
  newPassword:     required, same rules as registration password
}
```

---

**4. `resendVerificationSchema`** — Rules for requesting a new verification email:

```typescript
{
  email: required, must be valid email
}
```

---

**5. `verifyEmailQuerySchema`** — Rules for the verification link token:

```typescript
{
  token: required, at least 1 character (comes from URL query string)
}
```

---

#### Type Exports

At the bottom, we export **TypeScript types** derived from each schema:

```typescript
export type RegisterInput = z.infer<typeof registerSchema>;
// This means: "RegisterInput is whatever shape registerSchema validates"
// Result: { email: string; password: string; phone?: string; role?: UserRole }
```

**Why?** So the controller and service can use these types for type-safety. If the schema changes, the types auto-update.

---

### 3.2 `auth.routes.ts`

📄 **File:** `src/modules/auth/auth.routes.ts`
🎯 **Role:** **Maps URLs to handler functions.** It's the routing table — "when someone visits THIS url, run THIS function."

#### How the Router Works

```typescript
const router = Router(); // Creates a mini-app dedicated to auth routes
```

This router is mounted in `app.ts` at the base path `/api/v1/auth`, so all paths here are relative to that.

#### Public Routes (No login required)

| Method | Path                 | Middleware                               | Handler                   | Purpose                  |
|--------|----------------------|------------------------------------------|---------------------------|--------------------------|
| POST   | `/register`          | `validateRequest(registerSchema)`        | `authController.register` | Create new account       |
| POST   | `/login`             | `validateRequest(loginSchema)`           | `authController.login`    | Log in                   |
| GET    | `/verify-email`      | `validateRequest(verifyEmailQuerySchema, 'query')` | `authController.verifyEmail` | Verify email via link |
| POST   | `/resend-verification` | `validateRequest(resendVerificationSchema)` | `authController.resendVerification` | Resend verification email |
| GET    | `/google`            | None                                     | `authController.googleAuth` | Start Google sign-in   |
| GET    | `/google/callback`   | None                                     | `authController.googleCallback` | Google returns here  |

#### Protected Routes (Must be logged in)

| Method | Path               | Middleware                                | Handler                      | Purpose            |
|--------|--------------------|-------------------------------------------|------------------------------|---------------------|
| POST   | `/logout`          | `protect`                                 | `authController.logout`      | Log out             |
| GET    | `/me`              | `protect`                                 | `authController.getMe`       | Get your own profile |
| PATCH  | `/change-password` | `protect`, `validateRequest(changePasswordSchema)` | `authController.changePassword` | Change password   |

#### What `protect` Does

The `protect` middleware (from `auth.middleware.ts`) runs BEFORE the handler. It checks if the user sent a valid token. If not, the request is rejected and the handler never runs.

#### Reading a Route Definition

```typescript
router.post(
    '/register',                        // 1. URL path (becomes /api/v1/auth/register)
    validateRequest(registerSchema),     // 2. Middleware: validate body first
    authController.register              // 3. Handler: if validation passes, run this
);
```

The middleware chain runs **left-to-right**. If `validateRequest` fails, the error handler catches it and the controller function is never called.

---

### 3.3 `auth.controller.ts`

📄 **File:** `src/modules/auth/auth.controller.ts`
🎯 **Role:** The **middleman** between the HTTP world and the business logic. It:
1. Extracts data from the request
2. Passes it to the service
3. Sends the response back to the client

**Think of it as:** A waiter at a restaurant. They take your order (request), give it to the kitchen (service), and bring back your food (response). They don't cook!

#### Functions Implemented

**1. `register`** — Handle registration:
```
Request Body → extract email, password, etc. → send to authService.register()
→ send 201 Created with user data
```

**2. `login`** — Handle login:
```
Request Body → extract email, password → send to authService.login()
→ send 200 OK with user data
```

**3. `verifyEmail`** — Handle email verification:
```
Query Params → extract token → send to authService.verifyEmail()
→ send 200 OK with success message
```

**4. `resendVerification`** — Resend verification email:
```
Request Body → extract email → send to authService.resendVerification()
→ send 200 OK with generic message (security: doesn't reveal if email exists)
```

**5. `googleAuth`** — Start Google OAuth:
```
Get Google URL from authService.getGoogleAuthUrl()
→ redirect the user's browser to Google's login page
```

**6. `googleCallback`** — Handle Google returning the user:
```
Query Params → extract authorization code → send to authService.googleCallback()
→ send 200 OK with user data
```

**7. `logout`** — Log out (protected):
```
req.user.id → send to authService.logout()
→ send 200 OK with success message
```

**8. `getMe`** — Get own profile (protected):
```
req.user.id → send to authService.getMe()
→ send 200 OK with user data
```

**9. `changePassword`** — Change password (protected):
```
req.user.id + body (currentPassword, newPassword) → send to authService.changePassword()
→ send 204 No Content (success, nothing to return)
```

#### Key Patterns

- **Every function is `async`** — database operations take time, so we `await` them.
- **`req.user!.id`** — The `!` tells TypeScript "I know `user` exists here" because the `protect` middleware already checked.
- **Logging everywhere** — Every action is logged for debugging and monitoring.

---

### 3.4 `auth.service.ts`

📄 **File:** `src/modules/auth/auth.service.ts`
🎯 **Role:** The **brain** of the auth module. ALL business logic lives here. This is the most important and complex file.

**Think of it as:** The kitchen in a restaurant. All the actual cooking (logic) happens here.

#### Class Structure

```typescript
class AuthService {
    // All methods live here
}
export const authService = new AuthService();
// ↑ "Singleton" pattern — only ONE instance exists in the entire app
```

#### Method-by-Method Breakdown

---

##### `register(data)` — User Registration

**What it does, step by step:**

```
Step 1: Check if email already exists in the database
        ├── If user exists with Google → throw error: "Use Google Sign-In"
        └── If user exists with local/both → throw error: "Email taken"

Step 2: Hash the password using bcrypt (salt rounds = 12)
        "MyPass123" → "$2a$12$LJ3m5..." (unreadable gibberish)

Step 3: Save the new user to the database
        - authProvider = "local"
        - isVerified = false (they haven't clicked the email link yet)

Step 4: Generate a verification token (UUID)
        "550e8400-e29b-41d4-a716-446655440000"
        Expires in 24 hours.

Step 5: Save the token in the EmailVerificationToken table

Step 6: Send a verification email with a clickable link

Step 7: Return the user data + success message
```

**Security details:**
- Passwords are NEVER stored as plain text. `bcrypt.genSalt(12)` generates a random salt, then `bcrypt.hash()` creates an irreversible hash.
- The salt round of `12` means 2^12 = 4,096 iterations — making brute-force attacks very expensive.

---

##### `login(data)` — User Login

**What it does, step by step:**

```
Step 1: Find user by email
        └── Not found → "Invalid email or password" (generic for security)

Step 2: Check authProvider
        └── If "google" → "Use Google Sign-In"

Step 3: Check email verification
        └── If "local" AND not verified → "Verify your email first"

Step 4: Check if passwordHash exists
        └── If null → "Invalid email or password"

Step 5: Compare entered password with stored hash
        bcrypt.compare("MyPass123", "$2a$12$LJ3m5...")
        └── If doesn't match → "Invalid email or password"

Step 6: Return user data (no JWT token yet — planned for Phase 2)
```

**Security detail:** Steps 1, 4, and 5 all return the **same** generic error: `"Invalid email or password."` This is intentional — it prevents attackers from knowing whether an email exists in the system.

---

##### `verifyEmail(token)` — Email Verification

**What it does:**

```
Step 1: Find the token in the database (include the related user)
        └── Not found → "Invalid or expired token"

Step 2: Check if the token has expired
        └── Expired → delete the token, throw "Token expired"

Step 3: Update the user: set isVerified = true

Step 4: Delete the used token (one-time use)
```

---

##### `resendVerification(data)` — Resend Verification Email

**What it does:**

```
Step 1: Find user by email
        └── Not found → return silently (don't reveal if email exists)

Step 2: Already verified? → throw "Already verified"

Step 3: Google user? → throw "Google users don't need verification"

Step 4: Delete ALL existing tokens for this user (cleanup)

Step 5: Generate a new token (UUID) with 24h expiry

Step 6: Save the new token

Step 7: Send a new verification email
```

---

##### `getGoogleAuthUrl()` — Generate Google Login URL

**What it does:**

```
Uses the google-auth-library to generate a consent URL.
Scopes requested: openid, email, profile
→ Returns a URL like: https://accounts.google.com/o/oauth2/v2/auth?...
```

The controller then **redirects** the user's browser to this URL.

---

##### `googleCallback(code)` — Handle Google Response

**What it does, step by step:**

```
Step 1: Exchange the authorization code for tokens
        Google gives us: access_token, id_token, refresh_token

Step 2: Verify the id_token to get user info
        Extract: email, name, picture, email_verified

Step 3: Reject if Google email is not verified

Step 4: Check if user already exists in our database
        ├── EXISTS + authProvider is "local"
        │   → UPGRADE to "both" (set isVerified=true, fill in Google profile data)
        │
        ├── EXISTS + authProvider is "google" or "both"
        │   → Update profile info (name/picture) if changed
        │
        └── DOES NOT EXIST
            → Create a new user with authProvider="google", isVerified=true

Step 5: Return user data
```

**Why "both"?** If a user registered with email+password and later clicks "Sign in with Google", they can now use EITHER method. Their existing password still works.

---

##### `logout(userId)` — Logout

```
Currently a placeholder.
Phase 2 will implement JWT token blacklisting here.
```

---

##### `getMe(userId)` — Get Current User Profile

```
Step 1: Find user by ID
        └── Not found → "User not found" (404)

Step 2: Return user profile data (safe fields only — no passwordHash)
```

---

##### `changePassword(userId, data)` — Change Password

```
Step 1: Find user by ID
        └── Not found → "User not found" (404)

Step 2: Check authProvider
        └── If "google" → "Can't change password for Google accounts"

Step 3: Verify current password using bcrypt.compare
        └── Wrong → "Incorrect password" (401)

Step 4: Hash the new password (bcrypt, salt rounds = 12)

Step 5: Update the user's passwordHash in the database
```

---

## 4. Supporting Files (Middlewares)

Middlewares are functions that run **between** the request arriving and the controller handling it.

### 4.1 `validate.middleware.ts`

📄 **File:** `src/middlewares/validate.middleware.ts`
🎯 **Role:** A reusable middleware factory that validates request data against a Zod schema.

**How it works:**

```typescript
validateRequest(schema, target = 'body')
```

1. Takes a Zod schema and a target (`'body'`, `'params'`, or `'query'`)
2. Runs `schema.parse()` on the target data
3. If valid → replaces `req[target]` with the cleaned data and calls `next()`
4. If invalid → throws an `AppError` with status 400 and a friendly error message

**Example in action:**

```
POST /api/v1/auth/register
Body: { "email": "bad-email", "password": "123" }

→ validateRequest(registerSchema) runs
→ Zod finds: "Invalid email format", "Password must be at least 8 characters"
→ Throws: AppError("Validation failed: email: Invalid email format, password: Password must be at least 8 characters", 400)
→ Global error handler catches it and sends the error response
→ Controller NEVER runs
```

---

### 4.2 `auth.middleware.ts`

📄 **File:** `src/middlewares/auth.middleware.ts`
🎯 **Role:** The security guard. Protects routes so only logged-in users can access them.

**Two functions exported:**

#### `protect` — Authentication Check

```
Step 1: Check for Authorization header
        └── Missing or doesn't start with "Bearer " → 401 error

Step 2: Extract the token after "Bearer "
        └── Empty → 401 error

Step 3: [TODO] Verify the JWT token and decode user ID
        Currently: Sets a mock user for development

Step 4: Attach user info to req.user

Step 5: Call next() to allow the request through
```

> ⚠️ **Current status:** This middleware is a **placeholder**. It accepts ANY token and always sets `req.user` to a mock user. Real JWT verification will be added in Phase 2.

#### `restrictTo(...roles)` — Authorization Check

```typescript
restrictTo('ADMIN', 'VENDOR')
```

A middleware factory that:
1. Checks if `req.user` exists (the `protect` middleware should have set it)
2. Checks if the user's role is in the `allowedRoles` list
3. If not allowed → 403 Forbidden error

**Usage pattern:**
```typescript
router.delete('/:id', protect, restrictTo('ADMIN'), controller.delete);
//                     ↑ must be logged in   ↑ must be admin
```

---

### 4.3 `error.middleware.ts`

📄 **File:** `src/middlewares/error.middleware.ts`
🎯 **Role:** The **safety net**. Catches ALL errors thrown anywhere in the app and sends a clean JSON response.

**How it works:**

```
Any throw new AppError(...) or unhandled error
     │
     ▼
globalErrorHandler catches it
     │
     ├── If it's an AppError → use its statusCode and message
     └── If it's a regular Error → wrap it as a 500 Internal Server Error
     │
     ▼
Log the error (with stack trace in development mode)
     │
     ▼
Send JSON response: { status, message, stack (dev only) }
```

**Why `express-async-errors`?** Express doesn't natively catch errors thrown inside `async` functions. The `express-async-errors` package (imported at the top of `app.ts`) automatically wraps all async route handlers in try/catch blocks and forwards errors to the global error handler.

---

## 5. Utility Files

### 5.1 `AppError.ts`

📄 **File:** `src/utils/AppError.ts`
🎯 **Role:** Custom error class that carries an HTTP status code.

```typescript
throw new AppError('Email already registered.', 400);
//                  ↑ message                    ↑ HTTP status code
```

Properties:
- `statusCode` — The HTTP code (400, 401, 403, 404, 500...)
- `status` — Auto-set: `"fail"` for 4xx errors, `"error"` for 5xx errors
- `isOperational` — Always `true`, meaning this is expected (not a bug)

---

### 5.2 `response.ts`

📄 **File:** `src/utils/response.ts`
🎯 **Role:** Helper functions that ensure ALL API responses follow the **same structure**.

| Function       | HTTP Code | When to Use                        |
|---------------|-----------|-------------------------------------|
| `sendSuccess` | 200       | Successful operation                |
| `sendCreated` | 201       | Successfully created a resource     |
| `sendNoContent` | 204     | Success but nothing to return (e.g., password changed) |

**Standard response format:**

```json
{
    "status": "success",
    "data": { ... },
    "message": "Optional message"
}
```

---

### 5.3 `mailer.ts`

📄 **File:** `src/utils/mailer.ts`
🎯 **Role:** Sends verification emails using **Nodemailer**.

**Configuration:** Uses SMTP settings from environment variables.

**`sendVerificationEmail(to, token)`:**
1. Builds a verification URL: `{FRONTEND_URL}/verify-email?token={token}`
2. Creates an HTML email with a "Verify Email" button
3. Sends it via the SMTP transporter
4. If sending fails → **logs the error but does NOT throw** (registration still succeeds)
5. In `test` mode → doesn't send anything

> **Why not throw on failure?** If the email server is temporarily down, we don't want to fail the entire registration. The user can always click "Resend verification" later.

---

### 5.4 `logger.ts`

📄 **File:** `src/utils/logger.ts`
🎯 **Role:** Centralized logging using **Winston**.

**Log levels (from most to least severe):**

| Level | Color   | When to Use                          |
|-------|---------|--------------------------------------|
| error | Red     | Something broke                      |
| warn  | Yellow  | Something unusual happened           |
| info  | Green   | Normal operations worth noting       |
| http  | Magenta | HTTP request logging                 |
| debug | White   | Detailed debugging info              |

In **development** mode: shows all levels (down to `debug`)
In **production** mode: shows only `warn` and `error`

---

## 6. Configuration Files

### 6.1 `env.ts`

📄 **File:** `src/config/env.ts`
🎯 **Role:** Loads and **validates** environment variables from `.env` file using Zod.

**Auth-related variables:**

| Variable             | Purpose                                      |
|---------------------|----------------------------------------------|
| `DATABASE_URL`      | PostgreSQL connection string                  |
| `GOOGLE_CLIENT_ID`  | Google OAuth app identifier                   |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app secret                    |
| `GOOGLE_REDIRECT_URL`  | Where Google sends the user back           |
| `SMTP_HOST`         | Email server hostname (e.g., smtp.gmail.com)  |
| `SMTP_PORT`         | Email server port (587 or 465)                |
| `SMTP_USER`         | Email account username                        |
| `SMTP_PASS`         | Email account password or app password        |
| `SMTP_FROM`         | "From" address on verification emails         |
| `FRONTEND_URL`      | Used to build verification email links        |

> **Why validate at startup?** If you forget to set a required variable, the app crashes **immediately** with a clear error message — instead of failing randomly when that variable is first used.

---

### 6.2 `prisma.ts`

📄 **File:** `src/config/prisma.ts`
🎯 **Role:** Creates and exports a **single** Prisma database client.

**Key feature: Singleton pattern**

```typescript
const globalForPrisma = global as unknown as { prisma: PrismaClient };
export const prisma = globalForPrisma.prisma || new PrismaClient({ ... });
if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

**Why?** In development, tools like `ts-node-dev` restart the file on every save. Without this pattern, each restart creates a NEW database connection, eventually exhausting the connection pool. This stores the client on `global` so it survives restarts.

---

## 7. Type Declarations

### 7.1 `express.d.ts`

📄 **File:** `src/types/express.d.ts`
🎯 **Role:** Tells TypeScript that `req.user` exists.

By default, Express has no `user` property on the Request object. This file **augments** the Express type:

```typescript
interface Request {
    user?: {
        id: number;
        email: string;
        role: UserRole;       // CUSTOMER | VENDOR | ADMIN
        authProvider: string; // "local" | "google" | "both"
    };
}
```

Without this file, `req.user.id` would cause a TypeScript error: _"Property 'user' does not exist on type 'Request'"_.

---

## 8. Request Flow Diagram

Here's what happens when a user registers, end to end:

```
1. Client sends POST /api/v1/auth/register
   Body: { "email": "user@test.com", "password": "Str0ngPass" }

2. app.ts receives the request
   ├── express.json() parses the JSON body
   ├── helmet() adds security headers
   └── Matches route → forwards to auth router

3. auth.routes.ts
   ├── Matches POST /register
   └── Runs middleware chain: validateRequest(registerSchema) → authController.register

4. validate.middleware.ts
   ├── Runs registerSchema.parse(req.body)
   ├── ✅ Valid → replaces req.body with cleaned data, calls next()
   └── ❌ Invalid → throws AppError(400) → caught by error handler

5. auth.controller.ts → register()
   ├── Extracts data from req.body
   ├── Calls authService.register(data)
   └── Sends response: sendCreated(res, user, message)

6. auth.service.ts → register()
   ├── Checks database for existing email
   ├── Hashes password with bcrypt
   ├── Creates user in database (Prisma)
   ├── Generates verification token
   ├── Sends verification email (mailer.ts)
   └── Returns user data

7. Client receives:
   Status: 201 Created
   Body: {
     "status": "success",
     "data": { "id": 1, "email": "user@test.com", ... },
     "message": "Registration successful. Please check your email..."
   }
```

---

## 9. API Endpoints Summary

| Method | Endpoint                         | Auth  | Body / Query                           | Response                                  |
|--------|----------------------------------|-------|----------------------------------------|-------------------------------------------|
| POST   | `/api/v1/auth/register`          | No    | `{ email, password, phone?, role? }`   | 201 + user object                         |
| POST   | `/api/v1/auth/login`             | No    | `{ email, password }`                  | 200 + user object                         |
| GET    | `/api/v1/auth/verify-email`      | No    | `?token=<uuid>`                        | 200 + success message                     |
| POST   | `/api/v1/auth/resend-verification` | No  | `{ email }`                            | 200 + generic message                     |
| GET    | `/api/v1/auth/google`            | No    | —                                      | 302 Redirect to Google                    |
| GET    | `/api/v1/auth/google/callback`   | No    | `?code=<auth_code>` (set by Google)    | 200 + user object                         |
| POST   | `/api/v1/auth/logout`            | Yes   | —                                      | 200 + success message                     |
| GET    | `/api/v1/auth/me`                | Yes   | —                                      | 200 + user object                         |
| PATCH  | `/api/v1/auth/change-password`   | Yes   | `{ currentPassword, newPassword }`     | 204 No Content                            |

---

> **What's coming next (Phase 2)?**
> - JWT token generation on login/register
> - Real token verification in `auth.middleware.ts`
> - Token blacklisting on logout
> - Password reset (forgot password) flow
