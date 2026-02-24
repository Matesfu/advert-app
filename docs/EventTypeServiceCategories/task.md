# EventType → ServiceCategory Browsing – Task List

## Phase 1: Implement Browsing Endpoint

- [x] Implement `getEventTypeBySlug(slug)` in `category.service.ts`
- [x] Controller already calls service correctly — no changes needed

## Phase 2: E2E Tests

- [x] Create `src/modules/categories/__tests__/category.test.ts`
  - [x] Test returns event type with linked service categories
  - [x] Test includes imageUrl and vendorCount per category
  - [x] Test 404 for non-existent slug
  - [x] Test no auth required (public)

## Phase 3: Verification

- [x] Run new tests — **4/4 pass** ✅
- [x] Run event-type regression tests — **57/57 pass** ✅
- [x] Service-category tests — pre-existing FK cleanup failure (unrelated to changes)
- [x] TypeScript compiles cleanly ✅
