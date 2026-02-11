# Auth Module Setup Guide

This document defines the actionable steps and commands required to implement the recent changes to the Authentication Module (Schema updates, Dependencies, and Database sync).

## 1. Install Missing Dependencies

The updated Auth module requires `jsonwebtoken` for handling JWTs. While `bcryptjs` and `google-auth-library` are already in `package.json`, `jsonwebtoken` is missing.

Run the following command to install it along with its TypeScript definitions:

```bash
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
```

> **Note:** `bcryptjs` and `google-auth-library` are already installed. If you encounter issues, ensure they are present:
> `npm install bcryptjs google-auth-library`

---

## 2. Update Database Schema

You have modified the `User` model and added `EmailVerificationToken` to `prisma/schema.prisma`. You need to apply these changes to your local PostgreSQL database.

### Step A: Verify Schema (Optional)
Ensure your `prisma/schema.prisma` contains the `authProvider`, `isVerified` fields in `User` and the new `EmailVerificationToken` model.

### Step B: Create Migration
Run the following command to create a new migration file and apply it to the database:

```bash
npx prisma migrate dev --name auth_schema_update
```

*This command will:*
1.  Compare your Prisma schema with the database.
2.  Generate SQL files in `prisma/migrations`.
3.  Execute the SQL against your local database.
4.  Regenerate the Prisma Client (`node_modules/@prisma/client`).

> **Troubleshooting:** If you face conflicts or want to reset the database completely (WARNING: Deletes all data), use:
> `npx prisma migrate reset`

---

## 3. Generate Prisma Client

If the migration command didn't automatically regenerate the client, or if you made manual changes, run:

```bash
npx prisma generate
```

This ensures TypeScript knows about your new fields (`user.authProvider`, `user.isVerified`, etc.).

---

## 4. Environment Configuration

Ensure your `.env` file has the new required variables for Google OAuth and Email services.

```bash
# Check if .env exists and has these keys
cat .env
```

**Required Keys:**
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URL`
- `SMTP_HOST`
- `SMTP_USER`
- `SMTP_PASS`

---

## 5. Build and Run

Finally, clean the build and start the server to verify everything works.

```bash
# Build the TypeScript project
npm run build

# Start the development server
npm run dev
```

## Summary of All Commands

```bash
# 1. Install Dependencies
npm install jsonwebtoken
npm install -D @types/jsonwebtoken

# 2. Database Migration
npx prisma migrate dev --name auth_schema_update

# 3. Start Server
npm run dev
```
