# Favorite Module — Implementation Plan

## Overview

Complete the existing stub-only favorite module so users can **add** vendor profiles to their favorites, **remove** them, and **list** all their favorites. A critical business rule is that **vendors must not be able to favorite their own profiles**.

The Prisma `Favorite` model already exists (`userId + vendorProfileId`, unique constraint). The route layer, controller, schema, and service skeleton are in place but the service methods throw `501 Not Implemented`. This plan fills in the real logic.

---

## Proposed Changes

### 1. Service Layer — `src/modules/favorites/favorite.service.ts`

Replace the three stub methods with Prisma-backed implementations:

#### `findByUser(userId: number)`
- Query `prisma.favorite.findMany()` filtered by `userId`.
- Include related `vendorProfile` fields (`id`, `businessName`, `city`, `basePrice`, `averageRating`, `portfolioImages`, `serviceCategory`).
- Only include favorites whose vendor profile is **not soft-deleted** (`deletedAt: null`).
- Return the array of favorites.

#### `add(userId: number, vendorProfileId: number)`
- **Validate** the vendor profile exists and is not soft-deleted → `404` if missing.
- **Self-favorite guard**: Query the vendor profile's `userId`. If it matches the requesting `userId`, throw `403 "You cannot add your own vendor profile to favorites"`.
- **Duplicate guard**: Prisma's unique constraint handles this. Use `upsert` or catch `P2002` (unique violation) and throw `409 "Vendor profile is already in your favorites"`.
- Create the favorite record via `prisma.favorite.create()`.
- Include `vendorProfile` in the response.

#### `remove(userId: number, vendorProfileId: number)`
- Attempt `prisma.favorite.delete()` using the unique `userId_vendorProfileId` compound key.
- On `P2025` (record not found), throw `404 "Favorite not found"`.

### 2. Controller — `src/modules/favorites/favorite.controller.ts`

No functional changes needed — the controller already delegates to the service and uses the correct response helpers (`sendSuccess`, `sendCreated`, `sendNoContent`).

### 3. Routes — `src/modules/favorites/favorite.routes.ts`

No changes needed — routes are already wired with `protect` middleware and param validation.

### 4. Schema — `src/modules/favorites/favorite.schema.ts`

No changes needed — `vendorIdParamSchema` is sufficient.

### 5. E2E Tests — `src/modules/favorites/__tests__/favorite.test.ts` [NEW]

Following the existing `vendor.test.ts` pattern (supertest + real DB):

| # | Test Case | Method | Expected |
|---|-----------|--------|----------|
| 1 | List favorites (empty initially) | `GET /favorites` | `200`, empty array |
| 2 | Add vendor to favorites | `POST /favorites/:vendorId` | `201`, favorite returned |
| 3 | List favorites (contains added vendor) | `GET /favorites` | `200`, 1 item |
| 4 | Duplicate add → conflict | `POST /favorites/:vendorId` | `409` |
| 5 | Self-favorite → forbidden | `POST /favorites/:vendorId` (own profile) | `403` |
| 6 | Remove favorite | `DELETE /favorites/:vendorId` | `204` |
| 7 | Remove non-existent favorite → not found | `DELETE /favorites/:vendorId` | `404` |
| 8 | Add non-existent vendor → not found | `POST /favorites/999999` | `404` |
| 9 | All routes require auth (no token) | `GET`, `POST`, `DELETE` | `401` |
| 10 | CSRF required for POST/DELETE | `POST`, `DELETE` without csrf | `403` |
| 11 | Soft-deleted vendor cannot be favorited | `POST /favorites/:vendorId` (soft-deleted) | `404` |

**Setup**: Create test users (CUSTOMER, VENDOR), a service category, and a vendor profile. Cleanup in `afterAll`.

---

## Verification Plan

### Automated E2E Tests

Run the full favorite test suite against the real database:

```bash
npx jest --testPathPattern="favorites/__tests__/favorite.test" --forceExit --verbose
```

All 11 test cases must pass.

### Quick Manual Smoke Test (optional)

1. Start the dev server: `npm run dev`
2. Authenticate as a CUSTOMER user.
3. `POST /api/v1/favorites/:vendorId` → should return `201`.
4. `GET /api/v1/favorites` → should include the added vendor.
5. `DELETE /api/v1/favorites/:vendorId` → should return `204`.
6. Authenticate as the VENDOR who owns the profile.
7. `POST /api/v1/favorites/:vendorId` (own profile) → should return `403`.

---

## Files Changed Summary

| File | Action | Description |
|------|--------|-------------|
| `src/modules/favorites/favorite.service.ts` | **MODIFY** | Replace stubs with Prisma logic |
| `src/modules/favorites/__tests__/favorite.test.ts` | **NEW** | E2E test suite (11 cases) |
| `docs/favorite/implementation_plan.md` | **NEW** | This document |
| `docs/favorite/task.md` | **NEW** | Task checklist |
| `docs/favorite/report.md` | **NEW** | Post-implementation report |
