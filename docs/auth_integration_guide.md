# Authentication System Documentation

## 1. Overview
This module implements a secure, dual-strategy authentication system for Eventify, supporting:
1.  **Local Authentication:** Email/Password with bcrypt hashing and mandatory email verification.
2.  **Google OAuth 2.0:** Secure server-side authorization code flow.

### Key Features
*   **Unified Account System:** Users can register via local or Google.
*   **Smart Account Linking:** Local users who sign in with Google are automatically upgraded to support both methods (`authProvider: "both"`).
*   **Security:**
    *   Google-only users are blocked from password login (no password set).
    *   Local users must verify email before logging in.
    *   Passwords are hashed using `bcryptjs` (salt rounds: 12).

---

## 2. Database Schema (`Prisma`)

### User Model
| Field | Type | Description |
| :--- | :--- | :--- |
| `email` | String | Unique identifier. |
| `passwordHash` | String? | Nullable. *Null* for Google-only users. |
| `authProvider` | String | `"local"`, `"google"`, or `"both"`. |
| `isVerified` | Boolean | `false` by default for local, `true` for Google. |
| `displayName` | String? | From Google profile or user input. |
| `avatarUrl` | String? | From Google profile. |

### EmailVerificationToken Model
| Field | Type | Description |
| :--- | :--- | :--- |
| `token` | String | Unique UUID v4 token. |
| `userId` | Int | Relation to User. |
| `expiresAt` | DateTime | Auto-expires in 24 hours. |

---

## 3. Configuration (`.env`)
The system requires the following environment variables (validated at startup):

```env
# Database
DATABASE_URL="postgresql://admin:password123@localhost:5433/eventify_db"

# Google OAuth
GOOGLE_CLIENT_ID="<your-client-id>"
GOOGLE_CLIENT_SECRET="<your-client-secret>"
GOOGLE_REDIRECT_URL="http://localhost:3000/api/v1/auth/google/callback"

# Email (SMTP)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="<your-email>"
SMTP_PASS="<your-app-password>"
SMTP_FROM='"Eventify" <noreply@eventify.com>'
FRONTEND_URL="http://localhost:3000"
```

---

## 4. Testing Guide (cURL Commands)

All commands assume the server is running on `http://localhost:3000`.

### A. Local Registration & Verification

**1. Register New User**
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Password123",
    "phone": "+1234567890"
  }'
```
*Expected:* `201 Created` - "Registration successful. Please check your email..."

**2. Verify Email (Simulated)**
Check your email (or logs) for the token. Replace `<TOKEN>` below:
```bash
curl -X GET "http://localhost:3000/api/v1/auth/verify-email?token=<TOKEN>"
```
*Expected:* `200 OK` - "Email verified successfully."

**3. Login (Success)**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Password123"
  }'
```
*Expected:* `200 OK` - Returns user object with `authProvider: "local"`.

### B. Error Scenarios

**4. Login Before Verification**
```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "unverified@example.com",
    "password": "Password123"
  }'
```
*Expected:* `403 Forbidden` - "Please verify your email..."

**5. Resend Verification Link**
```bash
curl -X POST http://localhost:3000/api/v1/auth/resend-verification \
  -H "Content-Type: application/json" \
  -d '{ "email": "unverified@example.com" }'
```
*Expected:* `200 OK` - Sends new email.

**6. Register Duplicate Email**
(Using an email that already exists)
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "NewPassword123"
  }'
```
*Expected:* `400 Bad Request` - "Email already registered."

**7. Invalid Password Format**
(Too short or missing complexity)
```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "weakpw@example.com",
    "password": "pw"
  }'
```
*Expected:* `400 Bad Request` - Validation error details.

### C. Google OAuth Flow

**8. Initiate Google Login**
Open in browser:
`http://localhost:3000/api/v1/auth/google`

*   **Result:** Redirects to Google consent screen.

**9. Callback (Manual Test)**
The callback URL will look like:
`http://localhost:3000/api/v1/auth/google/callback?code=4/0A...`
This is handled automatically by the browser, but you can see the logs:
`[AuthController] Google login successful for: testuser@example.com`

*   **Account Upgrade:** If `testuser@example.com` existed locally, check DB: `authProvider` should now be `"both"`.

### D. Authenticated User Actions

**Note:** For Phase 1, `req.user` is mocked on protected routes.

**10. Get Profile**
```bash
curl -X GET http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer mock-token"
```
*Expected:* `200 OK` - Returns user profile.

**11. Change Password**
```bash
curl -X PATCH http://localhost:3000/api/v1/auth/change-password \
  -H "Authorization: Bearer mock-token" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "Password123",
    "newPassword": "NewSecurePassword123"
  }'
```
*Expected:* `204 No Content` (Success).

**12. Logout**
```bash
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer mock-token"
```
*Expected:* `200 OK`.
