# Review Module — Task Checklist

## 1. Prisma Schema & Migration
- [ ] Add `updatedAt DateTime @updatedAt` to Review model
- [ ] Add `@@unique([userId, vendorProfileId])` to Review model
- [ ] Run `npx prisma migrate dev --name add_review_unique_and_updatedAt`
- [ ] Run `npx prisma generate`

## 2. Validation Schemas (`review.schema.ts`)
- [ ] Add `updateReviewSchema` (partial: rating and/or comment, at least one required)
- [ ] Add `reviewIdParamSchema` (`:reviewId` as integer)
- [ ] Add `sortBy` option to `listReviewsQuerySchema` (newest/oldest/highest/lowest)
- [ ] Export new types

## 3. Service Layer (`review.service.ts`)
- [ ] Implement `create()` — with all business rule guards:
  - [ ] Vendor exists and active check
  - [ ] Self-review prevention
  - [ ] Same-category competition guard
  - [ ] Duplicate review check (friendly 409 error)
  - [ ] Call `vendorService.recalculateReviewStats()`
  - [ ] Send email notification to vendor owner (fire-and-forget)
- [ ] Implement `findByVendor()` — paginated, sorted, with aggregate stats
  - [ ] Include reviewer user info (displayName, avatarUrl)
  - [ ] Handle soft-deleted reviewers ("Deleted User")
- [ ] Implement `update()` — ownership check, partial update, stats recalc
- [ ] Implement `delete()` — author or ADMIN, stats recalc

## 4. Controller (`review.controller.ts`)
- [ ] Update `createReview` handler (remove placeholder call)
- [ ] Update `getVendorReviews` handler (add meta/pagination)
- [ ] Add `updateReview` handler
- [ ] Add `deleteReview` handler

## 5. Routes (`review.routes.ts`)
- [ ] Add `PATCH /:reviewId` route (protected)
- [ ] Add `DELETE /:reviewId` route (protected)

## 6. Email Notification (`mailer.ts`)
- [ ] Add `sendNewReviewEmail()` function following `sendNewMessageEmail()` pattern
- [ ] Gate with `EMAIL_NOTIFICATIONS_ENABLED` flag
- [ ] Skip in test environment
- [ ] HTML template with rating, comment preview, and deep link to vendor profile

## 7. E2E Tests (`review.test.ts`)
- [ ] Test setup (users, vendor profiles, service categories, tokens)
- [ ] Auth & CSRF tests
- [ ] Create review — happy path
- [ ] Create review — self-review blocked
- [ ] Create review — duplicate blocked (409)
- [ ] Create review — soft-deleted vendor blocked
- [ ] Create review — same-category competitor blocked
- [ ] Create review — different-category vendor CAN review
- [ ] List reviews — paginated, sorted, includes reviewer info
- [ ] Update review — owner can update
- [ ] Update review — non-owner blocked
- [ ] Delete review — owner can delete
- [ ] Delete review — ADMIN can delete
- [ ] Stats recalculation after create/update/delete
- [ ] Test teardown (cleanup)

## 8. Verification
- [ ] All tests pass
- [ ] Manual curl test: create, list, update, delete
- [ ] Verify `averageRating` / `reviewCount` in Prisma Studio
