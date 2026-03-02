# Favorite Module — Task List

## Service Implementation
- [x] Implement `findByUser()` — query favorites with vendor profile details, excluding soft-deleted vendors
- [x] Implement `add()` — validate vendor exists, prevent self-favorite, handle duplicate, create record
- [x] Implement `remove()` — delete by compound key, handle not-found

## E2E Tests
- [x] Create `src/modules/favorites/__tests__/favorite.test.ts`
- [x] Test: List favorites (empty)
- [x] Test: Add vendor to favorites (201)
- [x] Test: List favorites with items (200)
- [x] Test: Duplicate add (409)
- [x] Test: Self-favorite blocked (403)
- [x] Test: Remove favorite (204)
- [x] Test: Remove non-existent (404)
- [x] Test: Add non-existent vendor (404)
- [x] Test: Auth required (401)
- [x] Test: CSRF required (403)
- [x] Test: Soft-deleted vendor cannot be favorited (404)

## Verification
- [x] Run test suite — **20/20 passed** ✅
- [x] Write report.md with results
