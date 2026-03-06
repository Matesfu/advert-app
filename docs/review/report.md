# Review Module — Implementation Report

> **Date**: 2026-03-04
> **Branch**: `realtime_implementation`
> **Status**: ✅ All tests passing

---

## Summary

Implemented a production-grade review system for vendor profiles with full CRUD operations, business rule enforcement, stats recalculation, and email notifications. The module follows the same patterns established by the existing messaging and favorites modules.

---

## Files Changed

| File | Action | Description |
|------|--------|-------------|
| [schema.prisma](file:///d:/work/advert_app/backend/prisma/schema.prisma) | MODIFIED | Added `updatedAt` and `@@unique([userId, vendorProfileId])` to Review model |
| [review.schema.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.schema.ts) | MODIFIED | Added `updateReviewSchema`, `vendorAndReviewParamSchema`, `sortBy` query param |
| [review.service.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.service.ts) | REWRITTEN | Full CRUD with business rules, stats recalc, and email notification |
| [review.controller.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.controller.ts) | REWRITTEN | 4 handlers: getVendorReviews, createReview, updateReview, deleteReview |
| [review.routes.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.routes.ts) | MODIFIED | Added PATCH and DELETE routes |
| [mailer.ts](file:///d:/work/advert_app/backend/src/utils/mailer.ts) | MODIFIED | Added `sendNewReviewEmail()` function |
| [review.test.ts](file:///d:/work/advert_app/backend/src/modules/reviews/__tests__/review.test.ts) | NEW | 30 E2E test cases |

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/vendors/:vendorId/reviews` | Public | List reviews (paginated, sortable) |
| `POST` | `/api/v1/vendors/:vendorId/reviews` | Protected | Create review |
| `PATCH` | `/api/v1/vendors/:vendorId/reviews/:reviewId` | Protected | Update own review |
| `DELETE` | `/api/v1/vendors/:vendorId/reviews/:reviewId` | Protected | Delete review (owner or ADMIN) |

---

## Business Rules Implemented

| Rule | Enforcement | HTTP Status |
|------|-------------|-------------|
| No self-reviews | Service layer check (`vendorProfile.userId === userId`) | 403 |
| One review per user per vendor | DB `@@unique` + app-level check | 409 |
| Same-category competition guard | Query for reviewer's VendorProfile in same `serviceCategoryId` | 403 |
| No reviews on soft-deleted vendors | `deletedAt` check | 404 |
| Rating range 1–5 | Zod schema validation | 400 |
| Update ownership | `review.userId === userId` | 403 |
| Delete authorization | Author OR ADMIN | 403 |
| Stats recalculation | `vendorService.recalculateReviewStats()` after every mutation | — |
| Email notification | `sendNewReviewEmail()` gated by `EMAIL_NOTIFICATIONS_ENABLED` | — |

---

## E2E Test Results

```
 PASS  src/modules/reviews/__tests__/review.test.ts (5.779 s)

  Review API – E2E
    Authentication & CSRF
      ✓ GET reviews → 200 without auth (public)        (70 ms)
      ✓ POST review → 401 without auth                 (20 ms)
      ✓ POST review → 403 without CSRF                 (10 ms)
    Create Review (POST /:vendorId/reviews)
      ✓ should create a review → 201                    (67 ms)
      ✓ should reject duplicate review → 409            (16 ms)
      ✓ should block self-review → 403                  (26 ms)
      ✓ should block same-category competitor → 403     (17 ms)
      ✓ should allow different-category vendor → 201    (29 ms)
      ✓ should reject review on soft-deleted vendor     (27 ms)
      ✓ should reject invalid rating → 400              (13 ms)
      ✓ should reject non-existent vendor → 404         (13 ms)
    List Reviews (GET /:vendorId/reviews)
      ✓ should return paginated reviews with stats      (27 ms)
      ✓ should sort by newest (default)                 (30 ms)
      ✓ should sort by lowest rating                    (15 ms)
      ✓ should include reviewer info                    (13 ms)
      ✓ should show "Deleted User" for soft-deleted     (20 ms)
      ✓ should paginate correctly                       (12 ms)
      ✓ should return 404 for non-existent vendor       (20 ms)
    Update Review (PATCH /:vendorId/reviews/:reviewId)
      ✓ owner should update their review → 200          (40 ms)
      ✓ should allow partial update (only comment)      (17 ms)
      ✓ non-owner should be blocked → 403               (11 ms)
      ✓ should reject empty update body → 400           (10 ms)
      ✓ should return 404 for non-existent review       (11 ms)
    Delete Review (DELETE /:vendorId/reviews/:reviewId)
      ✓ non-owner non-admin should be blocked → 403     (11 ms)
      ✓ owner should delete their review → 204          (18 ms)
      ✓ ADMIN should delete any review → 204            (22 ms)
      ✓ should return 404 for non-existent review       (10 ms)
    Stats Recalculation
      ✓ should update averageRating and reviewCount     (34 ms)
      ✓ should recalculate after update                 (52 ms)
      ✓ should recalculate after delete                 (19 ms)

Test Suites: 1 passed, 1 total
Tests:       30 passed, 30 total
Time:        5.779 s
```

---

## Bug Fixed During Implementation

**Param validation clobbering**: The `validateRequest` middleware replaces `req[target]` with validated data, stripping unknown keys. When two separate param schemas were applied sequentially (`vendorIdParamSchema` then `reviewIdParamSchema`), the first one stripped `reviewId` from `req.params`. Fix: created `vendorAndReviewParamSchema` that validates both params in a single pass.
