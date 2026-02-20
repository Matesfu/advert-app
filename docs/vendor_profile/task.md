# VendorProfile Module Implementation Tasks

> [!NOTE]
> **References**: 
> 1. Use `docs/vendor_profile/implementation_plan.md` as the primary guide.
> 2. Follow architectural patterns from `event-types` and `service-categories` modules.
> 3. Verify relationships in `prisma/schema.prisma` (Services, Reviews, Favorites).

- [x] **Phase 1: Configuration & Setup** <!-- id: 0 -->
    - [x] Add `VENDOR_ROLE_ENFORCED` to `.env` and `env.ts` validation <!-- id: 1 -->
    - [x] Update `vendor.schema.ts` with search, sort, and filter validations <!-- id: 2 -->
- [x] **Phase 2: Core Service Logic** (`vendor.service.ts`) <!-- id: 3 -->
    - [x] Implement `create()` method with Feature Flag role check (one profile per category) <!-- id: 4 -->
    - [x] Implement `findAll()` with pagination, filtering (city, price), and sorting <!-- id: 5 -->
    - [x] Implement `findById()` with relations (`services`, `reviews` count) <!-- id: 6 -->
    - [x] Implement `update()` with ownership verification <!-- id: 7 -->
    - [x] Implement `delete()` as **soft delete** (sets `deletedAt`) with ownership verification <!-- id: 8 -->
- [x] **Phase 2b: Soft Delete & Image Management** <!-- id: 22 -->
    - [x] Add `deletedAt DateTime?` to `VendorProfile` Prisma schema <!-- id: 23 -->
    - [x] Apply active filter (`deletedAt: null`) to all public queries <!-- id: 24 -->
    - [x] Add `MAX_PORTFOLIO_IMAGES` constant (10) to `vendor.schema.ts` <!-- id: 25 -->
    - [x] Add `updatePortfolioImagesSchema` (add/remove) to `vendor.schema.ts` <!-- id: 26 -->
    - [x] Remove `portfolioImages` from `updateVendorSchema` <!-- id: 27 -->
    - [x] Implement `updatePortfolioImages()` in `vendor.service.ts` <!-- id: 28 -->
    - [x] Add `updatePortfolioImages` controller handler <!-- id: 29 -->
    - [x] Add `PATCH /:id/images` route <!-- id: 30 -->
- [x] **Phase 2c: Data Integrity & Schema Alignment** <!-- id: 34 -->
    - [x] Replace `@@unique([userId, serviceCategoryId])` with partial unique index (custom migration) for soft-delete compatibility <!-- id: 35 -->
    - [x] Remove `serviceCategoryId` from `createServiceSchema` in `vendor.schema.ts` <!-- id: 36 -->
    - [x] Confirm `Service` model depends ONLY on `VendorProfile` (no ServiceCategory FK) <!-- id: 37 -->
    - [x] Decouple Service from ServiceCategory (Services inherit category from VendorProfile) <!-- id: 33 -->
- [x] **Phase 3: Nested Service Management** (`vendor.service.ts`) <!-- id: 9 -->
    - [x] Implement `addService()` to create vendor packages <!-- id: 10 -->
    - [x] Implement `removeService()` <!-- id: 11 -->
    - [x] Implement `getServices()` <!-- id: 12 -->
- [x] **Phase 4: Controller & Routes** <!-- id: 13 -->
    - [x] Update `vendor.controller.ts` to pass `userRole` to service methods <!-- id: 14 -->
    - [x] Update `vendor.routes.ts` to remove `restrictTo` from POST (defer to service) <!-- id: 15 -->
- [x] **Phase 4b: Sort by Reviews (Denormalized Stats)** <!-- id: 39 -->
    - [x] Add `averageRating Float @default(0)` and `reviewCount Int @default(0)` to `VendorProfile` Prisma schema <!-- id: 40 -->
    - [x] Create and apply migration (`add_vendor_review_stats`) <!-- id: 41 -->
    - [x] Extend `sortBy` enum in `listVendorsQuerySchema` with `averageRating`, `reviewCount`, `popularity` <!-- id: 42 -->
    - [x] Update `findAll()` to handle compound `popularity` sort <!-- id: 43 -->
    - [x] Add `recalculateReviewStats()` helper method in `vendor.service.ts` <!-- id: 44 -->
- [x] **Phase 5: Verification & Testing** <!-- id: 16 -->
    - [x] Create `src/modules/vendors/__tests__/vendor.test.ts` <!-- id: 17 -->
    - [x] Implement E2E tests for Public Access & Search <!-- id: 18 -->
    - [x] Implement E2E tests for Role Enforcement (Feature Flag) <!-- id: 19 -->
    - [x] Implement E2E tests for Owner Validations <!-- id: 20 -->
    - [x] Implement E2E tests for **One Profile Per Category** (duplicate → 409) <!-- id: 38 -->
    - [x] Implement E2E tests for **Soft Delete** (delete → hidden, re-create allowed) <!-- id: 31 -->
    - [x] Implement E2E tests for **Portfolio Image Management** (add, remove, max limit, dedup) <!-- id: 32 -->
    - [x] Run full test suite (`npm test`) <!-- id: 21 -->
