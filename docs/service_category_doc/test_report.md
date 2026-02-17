# ServiceCategory Admin Module — E2E Test Report

> **Date**: 2026-02-17  
> **Status**: ✅ ALL TESTS PASSED  
> **Suite**: `src/modules/service-categories/__tests__/service-category.test.ts`  
> **Result**: 28/28 passed | 0 failed | 0 skipped | ~2.4s

---

## Test Results Summary

| Group | Tests | Passed | Status |
|---|---|---|---|
| Auth Guard | 3 | 3 | ✅ |
| POST / (Create) | 6 | 6 | ✅ |
| GET / (List) | 5 | 5 | ✅ |
| GET /:id (Get One) | 3 | 3 | ✅ |
| PATCH /:id (Update) | 7 | 7 | ✅ |
| DELETE /:id (Remove) | 4 | 4 | ✅ |
| **Total** | **28** | **28** | **✅** |

---

## Detailed Results

### 1. Auth Guard (3/3 ✅)

| # | Test | Status | Time |
|---|---|---|---|
| 1 | 401 — no token provided | ✅ | 30ms |
| 2 | 403 — user is CUSTOMER (not ADMIN) | ✅ | 14ms |
| 3 | 403 — CSRF header missing on mutation (POST) | ✅ | 16ms |

### 2. POST / — Create (6/6 ✅)

| # | Test | Status | Time |
|---|---|---|---|
| 1 | 201 — create with name + imageUrl | ✅ | 23ms |
| 2 | 409 — duplicate name | ✅ | 12ms |
| 3 | 400 — name too short (1 char) | ✅ | 21ms |
| 4 | 400 — empty name | ✅ | 10ms |
| 5 | 400 — missing body | ✅ | 11ms |
| 6 | 400 — invalid imageUrl format | ✅ | 10ms |

### 3. GET / — List (5/5 ✅)

| # | Test | Status | Time |
|---|---|---|---|
| 1 | 200 — default pagination with meta | ✅ | 27ms |
| 2 | 200 — search filter (name match) | ✅ | 20ms |
| 3 | 200 — filter by eventTypeId (M2M bridge) | ✅ | 13ms |
| 4 | 200 — pagination params (page & limit) | ✅ | 13ms |
| 5 | 200 — sort by name descending | ✅ | 19ms |

### 4. GET /:id — Get One (3/3 ✅)

| # | Test | Status | Time |
|---|---|---|---|
| 1 | 200 — fetch existing category | ✅ | 12ms |
| 2 | 400 — invalid ID param ("notanumber") | ✅ | 10ms |
| 3 | 404 — non-existent ID | ✅ | 11ms |

### 5. PATCH /:id — Update (7/7 ✅)

| # | Test | Status | Time |
|---|---|---|---|
| 1 | 200 — update name (slug auto-regenerated) | ✅ | 30ms |
| 2 | 200 — update imageUrl alone | ✅ | 17ms |
| 3 | 200 — clear imageUrl (set to null) | ✅ | 16ms |
| 4 | 200 — update both name + imageUrl | ✅ | 17ms |
| 5 | 400 — reject empty body | ✅ | 10ms |
| 6 | 404 — non-existent category | ✅ | 11ms |
| 7 | 409 — duplicate name conflict | ✅ | 20ms |

### 6. DELETE /:id — Remove (4/4 ✅)

| # | Test | Status | Time |
|---|---|---|---|
| 1 | 409 — blocked when services still linked | ✅ | 29ms |
| 2 | 204 — successful delete (bridge rows cascade) | ✅ | 20ms |
| 3 | 404 — already deleted ID | ✅ | 11ms |
| 4 | 404 — non-existent ID | ✅ | 11ms |

---

## Bug Fixed During Testing

A bug was found and fixed in the original test file:

```diff
- expect(res.body.results).toBeGreaterThanOrEqual(1);
+ expect(res.body.meta).toBeDefined();
+ expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
```

The API returns count information in `meta.total`, not in a top-level `results` field.

---

## Run Command

```bash
npx cross-env NODE_ENV=test npx jest --detectOpenHandles --testPathPatterns="service-category" --verbose
```

## Coverage

| Feature | Covered |
|---|---|
| Authentication (401) | ✅ |
| Authorization / Role guard (403) | ✅ |
| CSRF protection (403) | ✅ |
| Input validation (400) | ✅ |
| Duplicate name/slug (409) | ✅ |
| Pagination + meta | ✅ |
| Search filter | ✅ |
| EventType filter (M2M bridge) | ✅ |
| Sorting (desc) | ✅ |
| imageUrl create/update/clear | ✅ |
| Delete guard (services linked) | ✅ |
| Bridge cascade on delete | ✅ |
| 404 not-found handling | ✅ |
| Invalid param types (400) | ✅ |
