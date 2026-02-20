# Review Module — Implementation Plan

> [!NOTE]
> This plan serves as a **reminder document** for when you start building the Review module.
> The module already has a scaffold in `src/modules/reviews/` with placeholder 501 responses.

---

## 1. Current State

The module has **placeholder files** ready to implement:

| File | Status | What Exists |
|:---|:---|:---|
| [review.schema.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.schema.ts) | ✅ Ready | `createReviewSchema`, `listReviewsQuerySchema`, `vendorIdParamSchema` |
| [review.service.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.service.ts) | 🔲 Placeholder | `create()` and `findByVendor()` throw `501 Not Implemented` |
| [review.controller.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.controller.ts) | 🔲 Placeholder | Handlers exist but call placeholder service |
| [review.routes.ts](file:///d:/work/advert_app/backend/src/modules/reviews/review.routes.ts) | ✅ Ready | Routes defined |

### Prisma Model (already exists)

```prisma
model Review {
  id              Int      @id @default(autoincrement())
  rating          Int      // 1-5
  comment         String?  @db.Text
  userId          Int      // Author
  vendorProfileId Int      // Target vendor
  createdAt       DateTime @default(now())
}
```

---

## 2. Critical Integration Point

> [!CAUTION]
> **You MUST call `vendorService.recalculateReviewStats()` after every review CRUD operation.**
>
> The vendor `sortBy=popularity` feature depends on denormalized `averageRating` and `reviewCount` fields on `VendorProfile`. If you skip this call, those fields will become stale and sorting will be incorrect.

### Where to Call It

```typescript
import { vendorService } from '../vendors/vendor.service';

// After CREATING a review:
async create(userId: number, vendorProfileId: number, data: CreateReviewInput) {
    const review = await prisma.review.create({ ... });
    await vendorService.recalculateReviewStats(vendorProfileId);  // ← DON'T FORGET
    return review;
}

// After UPDATING a review (if rating changes):
async update(reviewId: number, userId: number, data: UpdateReviewInput) {
    const review = await prisma.review.update({ ... });
    await vendorService.recalculateReviewStats(review.vendorProfileId);  // ← DON'T FORGET
    return review;
}

// After DELETING a review:
async delete(reviewId: number, userId: number) {
    const review = await prisma.review.delete({ ... });
    await vendorService.recalculateReviewStats(review.vendorProfileId);  // ← DON'T FORGET
}
```

### What `recalculateReviewStats()` Does

```typescript
// In vendor.service.ts (already implemented)
async recalculateReviewStats(vendorProfileId: number) {
    const stats = await prisma.review.aggregate({
        where: { vendorProfileId },
        _avg: { rating: true },
        _count: { rating: true },
    });
    const averageRating = Math.round((stats._avg.rating ?? 0) * 10) / 10;
    const reviewCount = stats._count.rating;

    await prisma.vendorProfile.update({
        where: { id: vendorProfileId },
        data: { averageRating, reviewCount },
    });
}
```

---

## 3. Features to Implement

### 3.1 `create(userId, vendorProfileId, data)`
- Verify vendor profile exists and is **active** (`deletedAt: null`)
- Prevent user from reviewing their **own** profile
- Consider: one review per user per vendor (prevent duplicates with `@@unique([userId, vendorProfileId])` or app-level check)
- **Call `vendorService.recalculateReviewStats(vendorProfileId)`**

### 3.2 `findByVendor(vendorProfileId, query)`
- Paginated list of reviews for a vendor
- Include `user` info (displayName, avatarUrl) for each review
- Return aggregate stats (averageRating, total count) alongside the list

### 3.3 `update(reviewId, userId, data)` (optional)
- Allow review author to edit their rating/comment
- Ownership check: `review.userId === userId`
- **Call `vendorService.recalculateReviewStats()`** if rating changed

### 3.4 `delete(reviewId, userId)`
- Allow review author or ADMIN to delete
- **Call `vendorService.recalculateReviewStats()`**

---

## 4. Business Rules to Remember

| Rule | Details |
|:---|:---|
| **No self-reviews** | A vendor owner cannot review their own profile |
| **One review per user per vendor** | Consider adding `@@unique([userId, vendorProfileId])` to Prisma schema |
| **Rating range** | 1–5 (already validated in `createReviewSchema`) |
| **Soft-deleted vendors** | Don't allow reviews on soft-deleted vendor profiles |
| **Recalculate stats** | Always call `recalculateReviewStats()` after any review mutation |
