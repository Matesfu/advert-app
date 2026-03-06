# Review Module — Implementation Plan

## Goal

Build a production-grade review system where users can rate and comment on vendor profiles. This follows patterns from **Airbnb** and similar marketplace platforms: one review per user per vendor, rating + optional comment, public listing with aggregate stats, and competitive fairness guards.

> [!NOTE]
> **WebSocket is NOT used** for the review module — this is the correct approach. Professional apps like Airbnb, Google Maps, Booking.com, and Yelp all use pure REST for reviews. Unlike messaging, reviews are not time-sensitive write-heavy flows. There is no real-time collaboration happening; users submit a review, and others fetch them on page load. WebSocket would add unnecessary complexity for zero UX benefit.

---

## User Review Required

> [!IMPORTANT]
> **Prisma Schema Change**: Adding `@@unique([userId, vendorProfileId])` to the Review model and an `updatedAt` field. This requires a Prisma migration.

> [!IMPORTANT]
> **Same-Category Competition Guard**: Vendors with a VendorProfile in the same ServiceCategory as the reviewed vendor will be blocked from leaving reviews. This is an app-level business rule enforced in the service layer — not a DB constraint.

---

## Proposed Changes

### Prisma Schema

#### [MODIFY] [schema.prisma](file:///d:/work/advert_app/backend/prisma/schema.prisma)

Add `updatedAt` field and unique constraint to the Review model:

```diff
 model Review {
   id        Int      @id @default(autoincrement())
   rating    Int      // 1-5
   comment   String?  @db.Text

   userId          Int
   user            User          @relation(fields: [userId], references: [id])

   vendorProfileId Int
   vendorProfile   VendorProfile @relation(fields: [vendorProfileId], references: [id])

   createdAt DateTime @default(now())
+  updatedAt DateTime @updatedAt
+
+  @@unique([userId, vendorProfileId]) // One review per user per vendor
 }
```

Run `npx prisma migrate dev --name add_review_unique_and_updatedAt` after this change.

---

### Review Schema (Validation)

#### [MODIFY] [review.schema.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.schema.ts)

Add schemas for update and delete operations, and a `reviewId` param schema:

- **`updateReviewSchema`** — Partial update: optional `rating` (1–5) + optional `comment` (max 1000 chars), at least one field required
- **`reviewIdParamSchema`** — Validates `:reviewId` route param as integer
- **`listReviewsQuerySchema`** — Add optional `sortBy` param (`newest` / `oldest` / `highest` / `lowest`, default `newest`)

---

### Review Service (Business Logic)

#### [MODIFY] [review.service.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.service.ts)

Replace placeholder implementations with full business logic:

**`create(userId, vendorProfileId, data)`**
1. Verify vendor profile exists and is active (`deletedAt: null`) → 404
2. Prevent self-review (user owns the vendor profile) → 403
3. **Same-category competition guard**: query if the reviewer has any active VendorProfile in the same `serviceCategoryId` as the target vendor → 403
4. Check for duplicate review (`@@unique` handles DB-level, but provide friendly error) → 409
5. Create review in DB
6. Call `vendorService.recalculateReviewStats(vendorProfileId)`
7. Return review with user info

**`findByVendor(vendorProfileId, query)`**
1. Verify vendor profile exists → 404
2. Paginated query with sorting (newest / oldest / highest / lowest rating)
3. Include reviewer info (`displayName`, `avatarUrl`) — show "Deleted User" for soft-deleted
4. Return `{ reviews, averageRating, reviewCount, pagination }`

**`update(reviewId, userId, data)`**
1. Find review → 404
2. Ownership check (`review.userId === userId`) → 403
3. Update review fields
4. Call `vendorService.recalculateReviewStats()` if rating changed
5. Return updated review

**`delete(reviewId, userId, userRole)`**
1. Find review → 404
2. Authorization: author OR ADMIN → 403
3. Delete review
4. Call `vendorService.recalculateReviewStats()`

---

### Review Controller

#### [MODIFY] [review.controller.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.controller.ts)

Add handlers for update and delete operations:

- **`updateReview`** — `PATCH /api/v1/vendors/:vendorId/reviews/:reviewId`
- **`deleteReview`** — `DELETE /api/v1/vendors/:vendorId/reviews/:reviewId`

---

### Email Notifications

#### [MODIFY] [mailer.ts](file:///d:/work/advert_app/backend/src/utils/mailer.ts)

Add a `sendNewReviewEmail()` function — same pattern as `sendNewMessageEmail()`:

- **Gated by** `EMAIL_NOTIFICATIONS_ENABLED` env flag
- **Fire-and-forget**: failures are logged, never thrown (don't block the API response)
- **Skips** in test environment
- **Params**: `to` (vendor owner email), `reviewerName`, `rating`, `comment`, `vendorProfileId`
- **Email content**: "You received a new X-star review on [businessName]" with a deep link to the vendor profile
- Called in `ReviewService.create()` after the review is saved and stats are recalculated

---

### Review Routes

#### [MODIFY] [review.routes.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.routes.ts)

Add routes for update and delete:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Public | List reviews for vendor (paginated) |
| POST | `/` | Protected | Create review |
| PATCH | `/:reviewId` | Protected | Update own review |
| DELETE | `/:reviewId` | Protected | Delete own review (or ADMIN) |

---

## API Response Shapes

**POST (Create) → 201**
```json
{
  "status": "success",
  "data": {
    "review": {
      "id": 1,
      "rating": 5,
      "comment": "Amazing DJ, highly recommend!",
      "userId": 28,
      "vendorProfileId": 15,
      "user": { "displayName": "John", "avatarUrl": null },
      "createdAt": "...",
      "updatedAt": "..."
    }
  },
  "message": "Review created successfully"
}
```

**GET (List) → 200**
```json
{
  "status": "success",
  "data": {
    "reviews": [...],
    "averageRating": 4.3,
    "reviewCount": 12
  },
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 12,
    "totalPages": 2
  }
}
```

---

## Verification Plan

### Automated Tests

A comprehensive E2E test suite following the same pattern as the existing `message.test.ts`:

**File**: `src/modules/reviews/__tests__/review.test.ts`

**Run command**: `npx jest --testPathPattern=review --forceExit --detectOpenHandles`

**Test groups**:

1. **Authentication & CSRF** — POST/PATCH/DELETE require auth and CSRF token; GET is public
2. **Create Review** — Happy path, self-review blocked, duplicate blocked, soft-deleted vendor blocked, same-category competitor blocked, invalid rating rejected
3. **List Reviews** — Paginated, sorted by newest/oldest/highest/lowest, includes reviewer info, shows "Deleted User" for soft-deleted authors, returns aggregate stats
4. **Update Review** — Owner can update, non-owner blocked, partial update (only comment, only rating), rating change triggers stats recalculation
5. **Delete Review** — Owner can delete, ADMIN can delete, non-owner non-admin blocked, stats recalculated after delete
6. **Competition Guard** — Vendor in same ServiceCategory cannot review, vendor in different ServiceCategory CAN review
7. **Stats Recalculation** — Verify `averageRating` and `reviewCount` on VendorProfile update correctly after create/update/delete

### Manual Verification

After tests pass, verify using curl or Prisma Studio:

1. Create a review via `POST /api/v1/vendors/:vendorId/reviews`
2. Check the vendor's `averageRating` and `reviewCount` updated in Prisma Studio
3. List reviews via `GET /api/v1/vendors/:vendorId/reviews`
4. Update and delete the review, verify stats recalculate each time
5. Set `EMAIL_NOTIFICATIONS_ENABLED=true`, create a review, verify email arrives at vendor owner's address
6. Set `EMAIL_NOTIFICATIONS_ENABLED=false`, create a review, verify no email is sent (check server logs)
