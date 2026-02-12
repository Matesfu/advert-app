# User Module Implementation Guide

## 1. Overview

The User module provides profile management for authenticated users. It follows the same 4-file pattern as all other modules in the Eventify backend:

```
src/modules/users/
├── user.schema.ts      # Zod validation schemas
├── user.service.ts     # Business logic (Prisma queries)
├── user.controller.ts  # HTTP request handlers
└── user.routes.ts      # Express route definitions
```

**Key Design Decisions:**
- **Soft-delete:** User accounts are deactivated by setting `deletedAt` timestamp, not permanently removed
- **Safe field selection:** `passwordHash` is never returned in any response
- **Session cleanup:** Deleting an account invalidates all refresh tokens

---

## 2. Database Schema

```prisma
model User {
  id            Int       @id @default(autoincrement())
  email         String    @unique
  passwordHash  String?
  displayName   String?
  avatarUrl     String?
  phone         String?
  role          UserRole  @default(CUSTOMER)
  authProvider  String    @default("local")
  isVerified    Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?                    // ← Soft-delete (Phase 2)
  // ... relationships
}
```

### Soft-Delete Behavior

```
Active User:     deletedAt = null     → accessible
Deleted User:    deletedAt = 2026-02-12T...  → hidden from all queries
```

When a user "deletes" their account:
1. `deletedAt` is set to current timestamp
2. All refresh tokens are deleted (sessions invalidated)
3. The user can no longer log in or access protected routes
4. The user record remains in the database for data integrity

---

## 3. API Endpoints

All routes require authentication (`protect` middleware).

| Method | Path | Description | Auth |
|:-------|:-----|:------------|:-----|
| `GET`    | `/api/v1/users/me`    | Get own profile | Bearer + CSRF (GET exempt) |
| `PATCH`  | `/api/v1/users/me`    | Update own profile | Bearer + CSRF |
| `DELETE` | `/api/v1/users/me`    | Soft-delete own account | Bearer + CSRF |
| `GET`    | `/api/v1/users/:id`   | Get user by ID (Admin only) | Bearer |

---

## 4. Validation Schema

### Update Profile (`PATCH /users/me`)

```typescript
{
  displayName?: string   // 1-100 chars, optional
  phone?: string         // Regex: /^\+?[\d\s-]{10,}$/, optional
  avatarUrl?: string     // Valid URL, optional
}
```

All fields are optional — only provided fields are updated.

---

## 5. Service Layer Details

### `findById(id: number)`
- Queries with safe field selection (excludes `passwordHash`)
- Returns 404 if user not found or soft-deleted

### `updateMe(userId: number, data)`
- Verifies user exists and is not soft-deleted
- Updates only `displayName`, `phone`, `avatarUrl`
- Returns updated user profile

### `deleteMe(userId: number)`
- Uses Prisma transaction for atomicity:
  1. Sets `deletedAt = new Date()`
  2. Deletes all refresh tokens for the user
- Returns 404 if already deleted

```typescript
await prisma.$transaction([
  prisma.user.update({
    where: { id: userId },
    data: { deletedAt: new Date() },
  }),
  prisma.refreshToken.deleteMany({
    where: { userId },
  }),
]);
```

---

## 6. Request/Response Flow

```
Client Request
      │
      ▼
┌─────────────┐
│   Router    │  user.routes.ts
│  protect()  │  ← JWT + CSRF verification
│  validate() │  ← Zod schema validation
└──────┬──────┘
       │
       ▼
┌──────────────┐
│  Controller  │  user.controller.ts
│  Extract     │  ← req.user.id, req.body
│  Delegate    │  ← call service method
│  Respond     │  ← sendSuccess / sendNoContent
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Service    │  user.service.ts
│  Validate    │  ← business rules
│  Query       │  ← Prisma operations
│  Return      │  ← clean user object
└──────────────┘
```

---

## 7. Testing Guide

### Prerequisites
- User must be registered, verified, and logged in
- You need: `ACCESS_TOKEN` and `CSRF_TOKEN` from the login response

### A. Get Profile

```bash
curl -X GET http://localhost:8000/api/v1/users/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

**Expected Response:**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": 1,
      "email": "testuser@example.com",
      "displayName": null,
      "avatarUrl": null,
      "phone": "+1234567890",
      "role": "CUSTOMER",
      "authProvider": "local",
      "isVerified": true,
      "createdAt": "2026-02-12T...",
      "updatedAt": "2026-02-12T..."
    }
  }
}
```

### B. Update Profile

```bash
curl -X PATCH http://localhost:8000/api/v1/users/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "x-csrf-token: <CSRF_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "John Doe",
    "phone": "+1987654321"
  }'
```

**Expected:** 200 with updated user object and message "Profile updated successfully".

### C. Delete Account (Soft-Delete)

```bash
curl -X DELETE http://localhost:8000/api/v1/users/me \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "x-csrf-token: <CSRF_TOKEN>"
```

**Expected:** 204 No Content. After this:
- Login attempts will fail ("Invalid email or password")
- Refresh token attempts will fail (tokens deleted)
- The user row still exists in the database with `deletedAt` set

### D. Get User by ID (Admin Only)

```bash
curl -X GET http://localhost:8000/api/v1/users/1 \
  -H "Authorization: Bearer <ADMIN_ACCESS_TOKEN>"
```

**Expected:** 200 with user profile (or 403 if not admin).

---

## 8. File Reference

| File | Purpose |
|:-----|:--------|
| `src/modules/users/user.schema.ts` | Zod schemas for update and ID param validation |
| `src/modules/users/user.service.ts` | Prisma queries with soft-delete logic |
| `src/modules/users/user.controller.ts` | HTTP handlers |
| `src/modules/users/user.routes.ts` | Route definitions with auth middleware |
| `prisma/schema.prisma` | User model with `deletedAt` field |
