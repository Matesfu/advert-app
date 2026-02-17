# VendorProfile Module Implementation Tasks

> [!NOTE]
> **References**: 
> 1. Use `docs/vendor_profile/implementation_plan.md` as the primary guide.
> 2. Follow architectural patterns from `event-types` and `service-categories` modules.
> 3. Verify relationships in `prisma/schema.prisma` (Services, Reviews, Favorites).

- [ ] **Phase 1: Configuration & Setup** <!-- id: 0 -->
    - [ ] Add `VENDOR_ROLE_ENFORCED` to `.env` and `.env.example` <!-- id: 1 -->
    - [ ] Update `vendor.schema.ts` with search, sort, and filter validations <!-- id: 2 -->
- [ ] **Phase 2: Core Service Logic** (`vendor.service.ts`) <!-- id: 3 -->
    - [ ] Implement `create()` method with Feature Flag role check <!-- id: 4 -->
    - [ ] Implement `findAll()` with pagination, filtering (city, price), and sorting <!-- id: 5 -->
    - [ ] Implement `findById()` with relations (`services`, `reviews` count) <!-- id: 6 -->
    - [ ] Implement `update()` with ownership verification <!-- id: 7 -->
    - [ ] Implement `delete()` with ownership verification <!-- id: 8 -->
- [ ] **Phase 3: Nested Service Management** (`vendor.service.ts`) <!-- id: 9 -->
    - [ ] Implement `addService()` to create vendor packages <!-- id: 10 -->
    - [ ] Implement `removeService()` <!-- id: 11 -->
    - [ ] Implement `getServices()` <!-- id: 12 -->
- [ ] **Phase 4: Controller & Routes** <!-- id: 13 -->
    - [ ] Update `vendor.controller.ts` to pass `userRole` to service methods <!-- id: 14 -->
    - [ ] Update `vendor.routes.ts` to remove `restrictTo` from POST (defer to service) <!-- id: 15 -->
- [ ] **Phase 5: Verification & Testing** <!-- id: 16 -->
    - [ ] Create `src/modules/vendors/__tests__/vendor.test.ts` <!-- id: 17 -->
    - [ ] Implement E2E tests for Public Access & Search <!-- id: 18 -->
    - [ ] Implement E2E tests for Role Enforcement (Feature Flag) <!-- id: 19 -->
    - [ ] Implement E2E tests for Owner Validations <!-- id: 20 -->
    - [ ] Run full test suite (`npm test`) <!-- id: 21 -->
