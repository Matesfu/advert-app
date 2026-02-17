# Editing Admin Routes — Task Classification

> **Context**: This document breaks the [implementation plan](./implementation_plan.md) into staged, sequential tasks. Each task is self-contained with clear prerequisites, file targets, steps, and acceptance criteria. Any agent can pick up a task independently by reading the implementation plan for design details and this file for the specific step. Mark items `[x]` when complete.

---

## Stage 1: Route Refactoring

> Modify route definitions and app mounting. No test changes yet — this stage focuses on the production code.

---

### Task 1: Update App Mount Paths

**Goal**: Remove `/admin` from the event-types and service-categories mount paths in `app.ts`.

**Prerequisites**: None (first task).

**File to modify**:
- `src/app.ts`

**Steps**:
1. Open `src/app.ts`
2. Find the "Admin Module Routes" section (lines 51–53)
3. Change mount paths:
   - `/api/v1/admin/event-types` → `/api/v1/event-types`
   - `/api/v1/admin/service-categories` → `/api/v1/service-categories`
4. Update the section comment from "Admin Module Routes" to something like "Event & Category Routes (GET: public, mutations: admin-only)"

**Sub-tasks**:
- [x] 1.1 — Update `event-types` mount path
- [x] 1.2 — Update `service-categories` mount path
- [x] 1.3 — Update section comment

**Acceptance criteria**:
- [x] Mount paths no longer contain `/admin`
- [x] `npx tsc --noEmit` still passes

---

### Task 2: Refactor Event-Type Routes (Per-Route Auth)

**Goal**: Remove global auth middleware and apply it inline only to mutation routes (POST, PATCH, DELETE, PUT). GET routes become public.

**Prerequisites**: Task 1.

**File to modify**:
- `src/modules/event-types/event-type.routes.ts`

**Steps**:
1. **Remove** the line: `router.use(protect, restrictTo('ADMIN'));`
2. **Add** `protect, restrictTo(UserRole.ADMIN)` as inline middleware to each mutation route:
   - `POST /` — add after `'/'` and before `validateRequest(...)`
   - `PATCH /:id` — add after `'/:id'` and before `validateRequest(...)`
   - `DELETE /:id` — add after `'/:id'` and before `validateRequest(...)`
   - `PUT /:id/categories` — add after `'/:id/categories'` and before `validateRequest(...)`
3. **Keep** GET routes (`GET /` and `GET /:id`) **without** any auth middleware
4. **Update** JSDoc `@access` tags:
   - GET routes: `@access  Public`
   - Mutation routes: `@access  Admin only`
5. **Update** the header comment block to reflect mixed access

**Sub-tasks**:
- [x] 2.1 — Remove global `router.use(protect, restrictTo('ADMIN'))`
- [x] 2.2 — Add inline auth to `POST /`
- [x] 2.3 — Add inline auth to `PATCH /:id`
- [x] 2.4 — Add inline auth to `DELETE /:id`
- [x] 2.5 — Add inline auth to `PUT /:id/categories`
- [x] 2.6 — Update JSDoc comments (`@access` tags)
- [x] 2.7 — Verify: `npx tsc --noEmit` passes

**Acceptance criteria**:
- [x] `GET /` and `GET /:id` have NO auth middleware
- [x] `POST`, `PATCH`, `DELETE`, `PUT` all have inline `protect, restrictTo(UserRole.ADMIN)`
- [x] TypeScript compiles cleanly

---

### Task 3: Refactor Service-Category Routes (Per-Route Auth)

**Goal**: Same as Task 2, but for service-categories.

**Prerequisites**: Task 1.

**File to modify**:
- `src/modules/service-categories/service-category.routes.ts`

**Steps**:
1. **Remove** the line: `router.use(protect, restrictTo(UserRole.ADMIN));`
2. **Add** inline `protect, restrictTo(UserRole.ADMIN)` to mutation routes:
   - `POST /`
   - `PATCH /:id`
   - `DELETE /:id`
3. **Keep** `GET /` and `GET /:id` without auth middleware
4. **Update** route comments to reflect new access levels

**Sub-tasks**:
- [x] 3.1 — Remove global `router.use(protect, restrictTo(UserRole.ADMIN))`
- [x] 3.2 — Add inline auth to `POST /`
- [x] 3.3 — Add inline auth to `PATCH /:id`
- [x] 3.4 — Add inline auth to `DELETE /:id`
- [x] 3.5 — Update route comments
- [x] 3.6 — Verify: `npx tsc --noEmit` passes

**Acceptance criteria**:
- [x] `GET /` and `GET /:id` have NO auth middleware
- [x] `POST`, `PATCH`, `DELETE` all have inline `protect, restrictTo(UserRole.ADMIN)`
- [x] TypeScript compiles cleanly

---

## Stage 2: Test Suite Updates

> Modify E2E tests to reflect new public routes and updated URLs.

---

### Task 4: Update Event-Type E2E Tests

**Goal**: Update base URL and auth guard tests to reflect public GET access.

**Prerequisites**: Tasks 1 + 2 complete.

**File to modify**:
- `src/modules/event-types/__tests__/event-type.test.ts`

**Steps**:
1. Change `BASE` constant from `'/api/v1/admin/event-types'` to `'/api/v1/event-types'`
2. Update the **Auth Guard** test group:
   - **Remove** test: "GET → 401 when no token" (GET is public now)
   - **Remove** test: "GET → 403 when CUSTOMER" (GET is public now)
   - **Add** test: "GET / → 200 without any token" (verify public access)
   - **Add** test: "GET /:id → 200 without any token" (verify public access)
   - **Keep** tests: POST/PATCH/DELETE → 401/403 (still admin-protected)

**Sub-tasks**:
- [x] 4.1 — Update `BASE` URL constant
- [x] 4.2 — Modify existing auth guard tests for GET routes
- [x] 4.3 — Add public access verification tests
- [x] 4.4 — Verify all existing tests still pass

**Acceptance criteria**:
- [x] `BASE` URL has no `/admin` prefix
- [x] GET-based auth tests verify 200 (public), not 401/403
- [x] Mutation auth tests still verify 401/403
- [x] All tests pass

---

### Task 5: Update Service-Category E2E Tests

**Goal**: Same as Task 4, but for service-categories.

**Prerequisites**: Tasks 1 + 3 complete.

**File to modify**:
- `src/modules/service-categories/__tests__/service-category.test.ts`

**Steps**:
1. Change `BASE` constant from `'/api/v1/admin/service-categories'` to `'/api/v1/service-categories'`
2. Update the **Auth Guard** test group:
   - **Modify** "401 no token" test → test against `POST` (mutation) instead of `GET`
   - **Add** test: "GET / → 200 without any token" (public access)
   - **Add** test: "GET /:id → 200 without any token" (public detail)
   - **Keep** CSRF test (still needed for mutations)

**Sub-tasks**:
- [x] 5.1 — Update `BASE` URL constant
- [x] 5.2 — Modify auth guard test (401 test targets mutation, not GET)
- [x] 5.3 — Add public access verification tests
- [x] 5.4 — Verify all tests pass

**Acceptance criteria**:
- [x] `BASE` URL has no `/admin` prefix
- [x] Auth guard tests properly test mutations (not GETs)
- [x] Public access tests verify unauthenticated GET works
- [x] All 28+ tests pass

---

## Stage 3: Verification & Report

> Full-suite verification and documentation update.

---

### Task 6: Full Verification

**Goal**: Run all tests, verify build, and confirm the refactoring is complete.

**Prerequisites**: Tasks 1–5 all complete.

**Sub-tasks**:
- [x] 6.1 — TypeScript build check passes (zero errors)
- [x] 6.2 — Event-type E2E tests pass (35/35)
- [x] 6.3 — Service-category E2E tests pass (28/28)
- [x] 6.4 — Public GET routes verified (200 without auth)
- [x] 6.5 — Unauthed POST routes verified (401)
- [x] 6.6 — Reports created

**Acceptance criteria**:
- [x] Zero TypeScript errors
- [x] All 63 E2E tests pass
- [x] Public GET is accessible without auth
- [x] Mutations are still admin-protected
