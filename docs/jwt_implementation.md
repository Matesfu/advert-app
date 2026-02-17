# JWT Authentication Implementation Guide

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT                                    │
│                                                                  │
│  Stores:                                                         │
│  • accessToken  → Memory / Authorization header                  │
│  • csrfToken    → Memory / x-csrf-token header                   │
│  • refreshToken → HttpOnly cookie (automatic)                    │
└──────────────┬──────────────────────────┬───────────────────────┘
               │                          │
     Protected Request              Token Expired?
               │                          │
               ▼                          ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│   protect middleware     │  │  POST /auth/refresh       │
│                          │  │                           │
│  1. Extract Bearer token │  │  1. Read refreshToken     │
│  2. Verify JWT signature │  │     from HttpOnly cookie  │
│  3. Check CSRF token     │  │  2. Verify JWT + DB lookup│
│     (POST/PUT/PATCH/DEL) │  │  3. Delete old token      │
│  4. Attach req.user      │  │  4. Issue new token set   │
└──────────────────────────┘  │  5. Set new cookie        │
                              └──────────────────────────┘
```

### Token Types

| Token | Storage | Lifetime | Purpose |
|:------|:--------|:---------|:--------|
| **Access Token** | Client memory → `Authorization: Bearer <token>` | 15 min (configurable) | Authenticate API requests |
| **Refresh Token** | HttpOnly cookie + Database | 7 days (configurable) | Silently renew access tokens |
| **CSRF Token** | Client memory → `x-csrf-token` header | Renewed on every refresh | Prevent cross-site request forgery |

---

## 2. Database Schema

### RefreshToken Model

```prisma
model RefreshToken {
  id        Int      @id @default(autoincrement())
  token     String   @unique
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userAgent String?                // Browser/device info
  ipAddress String?                // Client IP for audit
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([userId])                // Fast lookup by user
  @@index([expiresAt])             // Fast cleanup of expired tokens
}
```

**Why database-backed refresh tokens?**
- Enables proper logout (delete token → session invalidated)
- Supports "logout from all devices" (delete all tokens for a user)
- Detects token reuse attacks (if a used token reappears, revoke everything)
- Provides audit trail (userAgent, ipAddress)

---

## 3. Environment Configuration

All secrets and expiry durations are loaded from `.env` and validated at startup via Zod:

```env
# JWT Access Token
JWT_ACCESS_SECRET="your-strong-random-secret-min-16-chars"
JWT_ACCESS_EXPIRES_IN="15m"

# JWT Refresh Token
JWT_REFRESH_SECRET="different-strong-random-secret"
JWT_REFRESH_EXPIRES_IN="7d"

# CSRF Token
CSRF_SECRET="yet-another-strong-random-secret"

# Cookie
COOKIE_DOMAIN="localhost"
```

---

## 4. Token Flow Diagrams

### Login Flow

```
Client                          Server                         Database
  │                                │                              │
  │  POST /auth/login              │                              │
  │  { email, password }           │                              │
  │───────────────────────────────▶│                              │
  │                                │  Verify credentials          │
  │                                │─────────────────────────────▶│
  │                                │                              │
  │                                │  Generate tokens:            │
  │                                │  • accessToken (JWT)         │
  │                                │  • refreshToken (JWT)        │
  │                                │  • csrfToken (HMAC)          │
  │                                │                              │
  │                                │  Store refreshToken          │
  │                                │─────────────────────────────▶│
  │                                │       INSERT RefreshToken    │
  │                                │                              │
  │  Response:                     │                              │
  │  Body: { accessToken,          │                              │
  │          csrfToken, user }     │                              │
  │  Cookie: refreshToken (HttpOnly)                              │
  │◀───────────────────────────────│                              │
```

### Refresh Flow (Token Rotation)

```
Client                          Server                         Database
  │                                │                              │
  │  POST /auth/refresh            │                              │
  │  Cookie: refreshToken          │                              │
  │───────────────────────────────▶│                              │
  │                                │  1. Verify JWT signature     │
  │                                │  2. Lookup token in DB       │
  │                                │─────────────────────────────▶│
  │                                │     SELECT RefreshToken      │
  │                                │                              │
  │                                │  3. Delete old token         │
  │                                │─────────────────────────────▶│
  │                                │     DELETE RefreshToken      │
  │                                │                              │
  │                                │  4. Generate new token set   │
  │                                │  5. Store new refreshToken   │
  │                                │─────────────────────────────▶│
  │                                │     INSERT RefreshToken      │
  │                                │                              │
  │  Response:                     │                              │
  │  Body: { accessToken,          │                              │
  │          csrfToken, user }     │                              │
  │  Cookie: new refreshToken      │                              │
  │◀───────────────────────────────│                              │
```

### Logout Flow

```
Client                          Server                         Database
  │                                │                              │
  │  POST /auth/logout             │                              │
  │  Bearer: accessToken           │                              │
  │  x-csrf-token: csrfToken       │                              │
  │  Cookie: refreshToken          │                              │
  │───────────────────────────────▶│                              │
  │                                │  Delete refreshToken from DB │
  │                                │─────────────────────────────▶│
  │                                │     DELETE RefreshToken      │
  │                                │                              │
  │  Response:                     │                              │
  │  Clear-Cookie: refreshToken    │                              │
  │  Body: { message: "Logged out"}│                              │
  │◀───────────────────────────────│                              │
```

---

## 5. Security Features

### CSRF Protection
- CSRF tokens use HMAC-SHA256 with a server secret
- Validated via timing-safe comparison to prevent timing attacks
- Only enforced on state-changing methods: `POST`, `PUT`, `PATCH`, `DELETE`
- `GET`, `HEAD`, `OPTIONS` are exempt

### Refresh Token Rotation
Every time a refresh token is used, the old one is deleted and a new one is issued. If a previously-used token is presented again (reuse attack), **all sessions for that user are revoked**.

### Cookie Security
```typescript
{
  httpOnly: true,           // No JavaScript access
  secure: true,             // HTTPS only (production)
  sameSite: 'strict',       // No cross-site sending (production)
  path: '/api/v1/auth',     // Only sent to auth endpoints
  maxAge: 7 * 24 * 60 * 60 * 1000  // 7 days
}
```

### Password Change
Changing password invalidates **all refresh tokens** for the user, forcing re-authentication on all devices.

---

## 6. API Reference

### Public Endpoints

| Method | Path | Description |
|:-------|:-----|:------------|
| `POST` | `/api/v1/auth/register` | Register new user (local) |
| `POST` | `/api/v1/auth/login` | Login and get tokens |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `GET`  | `/api/v1/auth/verify-email` | Verify email with token |
| `POST` | `/api/v1/auth/resend-verification` | Resend verification email |
| `GET`  | `/api/v1/auth/google` | Initiate Google OAuth |
| `GET`  | `/api/v1/auth/google/callback` | Google OAuth callback |

### Protected Endpoints (require Bearer token + CSRF)

| Method | Path | Description |
|:-------|:-----|:------------|
| `POST`  | `/api/v1/auth/logout` | Logout (invalidate refresh token) |
| `POST`  | `/api/v1/auth/logout-all` | Logout from all devices |
| `GET`   | `/api/v1/auth/me` | Get current user profile |
| `PATCH` | `/api/v1/auth/change-password` | Change password (revokes all sessions) |

---

## 7. Testing Guide

### Prerequisites
```bash
# Run the Prisma migration first
npx prisma migrate dev --name add_refresh_token_and_soft_delete
```

### A. Login and Get Tokens

```bash
curl -v -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "Password123"
  }'
```

**Expected Response:**
- **Body:** `{ status: "success", data: { user: {...}, accessToken: "eyJ...", csrfToken: "abc123..." } }`
- **Set-Cookie Header:** `refreshToken=eyJ...; HttpOnly; Path=/api/v1/auth; ...`

### B. Access Protected Route

```bash
curl -X GET http://localhost:8000/api/v1/auth/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

### C. Access Protected Route with State Change

```bash
curl -X PATCH http://localhost:8000/api/v1/auth/change-password \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "x-csrf-token: <CSRF_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "Password123",
    "newPassword": "NewSecurePassword123"
  }'
```

### D. Refresh Token

```bash
curl -v -X POST http://localhost:8000/api/v1/auth/refresh \
  -H "Cookie: refreshToken=<REFRESH_TOKEN>"
```

**Expected:** New `accessToken`, `csrfToken` in body, new `refreshToken` cookie in `Set-Cookie` header.

### E. Logout

```bash
curl -v -X POST http://localhost:8000/api/v1/auth/logout \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "x-csrf-token: <CSRF_TOKEN>" \
  -H "Cookie: refreshToken=<REFRESH_TOKEN>"
```

**Expected:** 200 OK, `refreshToken` cookie cleared. Attempting to use the old refresh token should return 401.

### F. Logout from All Devices

```bash
curl -X POST http://localhost:8000/api/v1/auth/logout-all \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "x-csrf-token: <CSRF_TOKEN>"
```

---

## 8. File Reference

| File | Purpose |
|:-----|:--------|
| `src/utils/token.ts` | Token generation, verification, cookie helpers |
| `src/config/env.ts` | Environment validation (JWT secrets, expiry, CSRF) |
| `src/middlewares/auth.middleware.ts` | JWT + CSRF verification middleware |
| `src/modules/auth/auth.service.ts` | Auth business logic (login, refresh, logout) |
| `src/modules/auth/auth.controller.ts` | HTTP handlers, cookie management |
| `src/modules/auth/auth.routes.ts` | Route definitions |
| `prisma/schema.prisma` | RefreshToken model |
