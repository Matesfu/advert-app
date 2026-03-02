# Favorite Module — Implementation Report

**Date:** 2026-03-02  
**Status:** ✅ Complete

---

## Summary

The favorite module has been fully implemented. Users can add vendor profiles to their favorites, list them, and remove them. Vendors are prevented from adding their own profiles to favorites (self-favorite guard). The module is soft-delete aware — it excludes favorites referencing deleted vendor profiles.

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| `src/modules/favorites/favorite.service.ts` | **MODIFIED** | Replaced 3 stub methods with full Prisma-backed logic |
| `src/modules/favorites/__tests__/favorite.test.ts` | **NEW** | Comprehensive E2E test suite (20 test cases) |
| `docs/favorite/implementation_plan.md` | **NEW** | Implementation plan document |
| `docs/favorite/task.md` | **NEW** | Task checklist |
| `docs/favorite/report.md` | **NEW** | This report |

> **Note:** No changes were needed to `favorite.controller.ts`, `favorite.routes.ts`, or `favorite.schema.ts` — they were already correctly wired.

---

## Service Implementation Details

### `findByUser(userId)`
- Queries `prisma.favorite.findMany()` filtered by `userId`
- Includes vendor profile summary: `businessName`, `city`, `basePrice`, `averageRating`, `reviewCount`, `portfolioImages`, `serviceCategory`
- Excludes favorites whose vendor profile has been soft-deleted (`deletedAt: null`)
- Orders by `createdAt DESC` (newest first)

### `add(userId, vendorProfileId)`
Three validation guards:
1. **Existence check** — vendor profile must exist and not be soft-deleted → `404`
2. **Self-favorite guard** — if `vendorProfile.userId === userId` → `403`
3. **Duplicate guard** — catches Prisma `P2002` unique constraint error → `409`

### `remove(userId, vendorProfileId)`
- Deletes using the compound unique key `userId_vendorProfileId`
- Catches Prisma `P2025` (record not found) → `404`

---

## E2E Test Results

```
 PASS  src/modules/favorites/__tests__/favorite.test.ts (5.285 s)
  Favorite API – E2E
    Authentication & CSRF
      ✓ GET /favorites → 401 without auth token (54 ms)
      ✓ POST /favorites/:vendorId → 401 without auth token (7 ms)
      ✓ DELETE /favorites/:vendorId → 401 without auth token (7 ms)
      ✓ POST /favorites/:vendorId → 403 without CSRF token (12 ms)
      ✓ DELETE /favorites/:vendorId → 403 without CSRF token (7 ms)
    List Favorites (GET /)
      ✓ should return empty array when no favorites exist (58 ms)
    Add to Favorites (POST /:vendorId)
      ✓ should add a vendor profile to favorites → 201 (48 ms)
      ✓ should list the added favorite (12 ms)
      ✓ should reject duplicate add → 409 (230 ms)
      ✓ should reject self-favorite (vendor adding own profile) → 403 (8 ms)
      ✓ should reject non-existent vendor → 404 (8 ms)
      ✓ should reject invalid vendorId format → 400 (4 ms)
      ✓ should allow different users to favorite the same vendor (12 ms)
      ✓ should not show soft-deleted vendor profile as favoritable → 404 (15 ms)
    Favorites Isolation
      ✓ each user should only see their own favorites (18 ms)
    Remove from Favorites (DELETE /:vendorId)
      ✓ should remove a favorite → 204 (13 ms)
      ✓ should confirm favorite was removed from list (9 ms)
      ✓ should reject removing non-existent favorite → 404 (23 ms)
      ✓ should reject removing favorite for non-existent vendor → 404 (13 ms)
    Soft-Deleted Vendor in Existing Favorites
      ✓ should hide favorites whose vendor profile is soft-deleted (32 ms)

Test Suites: 1 passed, 1 total
Tests:       20 passed, 20 total
Time:        5.285 s
```

---

## Manual Testing with cURL

The following cURL commands let you manually verify the favorite module. Replace the placeholder values with your actual data.

### Prerequisites

Before testing, you need a valid **access token** and **CSRF token**. Log in first:

```bash
# 1. Login to get access token and CSRF token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "your-email@example.com",
    "password": "your-password"
  }'
```

Save the returned `accessToken` and `csrfToken` into variables:

```bash
# Set your tokens (replace with actual values)
ACCESS_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
CSRF_TOKEN="abc123..."
VENDOR_ID=1  # Replace with an actual vendor profile ID
```

---

### 1. List My Favorites (GET)

**Description:** Retrieve all vendor profiles the authenticated user has saved to their favorites. Returns an empty array if none exist.

```bash
curl -X GET http://localhost:3000/api/v1/favorites \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response (200 OK):**
```json
{
  "status": "success",
  "data": {
    "favorites": [
      {
        "id": 1,
        "userId": 5,
        "vendorProfileId": 3,
        "createdAt": "2026-03-02T06:45:00.000Z",
        "vendorProfile": {
          "id": 3,
          "businessName": "Premium DJ Services",
          "city": "Addis Ababa",
          "basePrice": "200.00",
          "averageRating": 4.5,
          "reviewCount": 12,
          "portfolioImages": ["https://example.com/img1.jpg"],
          "serviceCategory": {
            "id": 1,
            "name": "DJ",
            "slug": "dj"
          }
        }
      }
    ]
  }
}
```

---

### 2. Add Vendor to Favorites (POST)

**Description:** Add a specific vendor profile to the user's favorites. Requires the vendor profile ID in the URL path. The vendor profile must exist and must not be owned by the requesting user.

```bash
curl -X POST http://localhost:3000/api/v1/favorites/$VENDOR_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response (201 Created):**
```json
{
  "status": "success",
  "data": {
    "favorite": {
      "id": 1,
      "userId": 5,
      "vendorProfileId": 3,
      "createdAt": "2026-03-02T06:45:00.000Z",
      "vendorProfile": {
        "id": 3,
        "businessName": "Premium DJ Services",
        "city": "Addis Ababa",
        "basePrice": "200.00",
        "averageRating": 4.5,
        "reviewCount": 12,
        "portfolioImages": ["https://example.com/img1.jpg"],
        "serviceCategory": {
          "id": 1,
          "name": "DJ",
          "slug": "dj"
        }
      }
    }
  },
  "message": "Added to favorites"
}
```

---

### 3. Add Vendor to Favorites — Duplicate (POST)

**Description:** Attempting to add the same vendor profile again results in a conflict error. The DB unique constraint `(userId, vendorProfileId)` prevents duplicates.

```bash
# Run the same POST again — should fail
curl -X POST http://localhost:3000/api/v1/favorites/$VENDOR_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response (409 Conflict):**
```json
{
  "status": "fail",
  "message": "Vendor profile is already in your favorites"
}
```

---

### 4. Self-Favorite Guard (POST)

**Description:** A vendor user trying to add their OWN vendor profile to favorites receives a 403 Forbidden. This prevents vendors from gaming the system by favoriting their own profiles.

```bash
# Login as the VENDOR who owns VENDOR_ID, then:
curl -X POST http://localhost:3000/api/v1/favorites/$VENDOR_ID \
  -H "Authorization: Bearer $VENDOR_ACCESS_TOKEN" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response (403 Forbidden):**
```json
{
  "status": "fail",
  "message": "You cannot add your own vendor profile to favorites"
}
```

---

### 5. Add Non-Existent Vendor (POST)

**Description:** Attempting to favorite a vendor profile that does not exist or is soft-deleted returns a 404 Not Found error.

```bash
curl -X POST http://localhost:3000/api/v1/favorites/999999 \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response (404 Not Found):**
```json
{
  "status": "fail",
  "message": "Vendor profile not found"
}
```

---

### 6. Remove Vendor from Favorites (DELETE)

**Description:** Remove a specific vendor profile from the user's favorites. Uses the vendor profile ID in the URL. Returns 204 No Content on success (empty body).

```bash
curl -X DELETE http://localhost:3000/api/v1/favorites/$VENDOR_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -H "Content-Type: application/json" \
  -v
```

**Expected Response (204 No Content):**
```
< HTTP/1.1 204 No Content
(empty body)
```

---

### 7. Remove Non-Existent Favorite (DELETE)

**Description:** Trying to remove a favorite that does not exist (or was already removed) returns a 404 Not Found error.

```bash
curl -X DELETE http://localhost:3000/api/v1/favorites/999999 \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "x-csrf-token: $CSRF_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response (404 Not Found):**
```json
{
  "status": "fail",
  "message": "Favorite not found"
}
```

---

### 8. Unauthenticated Access (No Token)

**Description:** All favorite endpoints require authentication. Requests without a Bearer token are rejected with 401.

```bash
# GET without auth
curl -X GET http://localhost:3000/api/v1/favorites

# POST without auth
curl -X POST http://localhost:3000/api/v1/favorites/$VENDOR_ID \
  -H "x-csrf-token: $CSRF_TOKEN"

# DELETE without auth
curl -X DELETE http://localhost:3000/api/v1/favorites/$VENDOR_ID \
  -H "x-csrf-token: $CSRF_TOKEN"
```

**Expected Response (401 Unauthorized):**
```json
{
  "status": "fail",
  "message": "You are not logged in. Please log in to access this resource."
}
```

---

### 9. Missing CSRF Token on Mutation

**Description:** State-changing requests (POST, DELETE) require a valid CSRF token in the `x-csrf-token` header. Omitting it results in 403.

```bash
# POST without CSRF
curl -X POST http://localhost:3000/api/v1/favorites/$VENDOR_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

**Expected Response (403 Forbidden):**
```json
{
  "status": "fail",
  "message": "CSRF token is required for this request."
}
```

---

## API Endpoint Summary

| Method | Endpoint | Auth | CSRF | Description | Success | Error Codes |
|--------|----------|------|------|-------------|---------|-------------|
| `GET` | `/api/v1/favorites` | ✅ | ❌ | List user's favorites | 200 | 401 |
| `POST` | `/api/v1/favorites/:vendorId` | ✅ | ✅ | Add to favorites | 201 | 400, 401, 403, 404, 409 |
| `DELETE` | `/api/v1/favorites/:vendorId` | ✅ | ✅ | Remove from favorites | 204 | 400, 401, 403, 404 |
