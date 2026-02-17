# ServiceCategory Admin Module — Task Classification

> **Context**: This document breaks the [implementation plan](./implementation_plan.md) into sequential, self-contained tasks. Each task includes prerequisites, exact file paths, what to implement, acceptance criteria, and verification commands. Any agent can pick up a task and execute it independently by reading the implementation plan for design details and this file for the specific step.

---

## Task 1: Prisma Schema Migration

**Goal**: Add `imageUrl` field to the `ServiceCategory` model.

**Prerequisites**: None (first task).

**Files to modify**:
- `prisma/schema.prisma`

**Steps**:
1. Open `prisma/schema.prisma`
2. Find the `ServiceCategory` model (around line 140)
3. Add `imageUrl String?` field after the `slug` field, with a comment: `// URL to category image (e.g. CDN link)`
4. Run migration: `npx prisma migrate dev --name add-service-category-image-url`
5. Verify the Prisma Client regenerated without errors

**Acceptance criteria**:
- [x] `imageUrl` is a nullable `String?` on `ServiceCategory`
- [x] Migration file created under `prisma/migrations/`
- [x] `npx prisma generate` completes without errors

---

## Task 2: Create Zod Validation Schemas

**Goal**: Create `service-category.schema.ts` with all Zod schemas and TypeScript types.

**Prerequisites**: Task 1 (Prisma schema updated — needed for understanding the model).

**File to create**:
- `src/modules/service-categories/service-category.schema.ts`

**Reference**: See `src/modules/event-types/event-type.schema.ts` for the 4-file pattern.

**Schemas to implement**:

| Schema Name | Target | Fields | Notes |
|---|---|---|---|
| `createServiceCategorySchema` | body | `name`: string, trim, min 2, max 50, required. `imageUrl`: string, url, optional | Export as `CreateServiceCategoryInput` |
| `updateServiceCategorySchema` | body | `name`: optional (same rules). `imageUrl`: string url or `null` (to clear), optional. Refine: at least one field required | Export as `UpdateServiceCategoryInput` |
| `idParamSchema` | params | `id`: coerce to number, int, positive | Export as `IdParam` |
| `listServiceCategoriesQuerySchema` | query | `page`: coerce int, positive, default 1. `limit`: coerce int, positive, max 100, default 10. `search`: string trim optional. `eventTypeId`: coerce int, positive, optional (filter by linked event type). `sortBy`: enum `['name','id','slug']` default `'name'`. `order`: enum `['asc','desc']` default `'asc'` | Export as `ListServiceCategoriesQuery` |

**Acceptance criteria**:
- [x] File exports 4 schemas and 4 types
- [x] `npx tsc --noEmit` passes

---

## Task 3: Create the Service Layer

**Goal**: Create `service-category.service.ts` with all business logic.

**Prerequisites**: Task 1 + Task 2.

**File to create**:
- `src/modules/service-categories/service-category.service.ts`

**Reference**: See `src/modules/event-types/event-type.service.ts` for the class pattern.

**Class `ServiceCategoryService`** — methods to implement:

### `private generateSlug(name: string): string`
Same logic as event-types: lowercase → trim → strip specials → spaces to hyphens → collapse hyphens.

### `private get includeEventTypes()`
Returns `{ eventTypes: { include: { eventType: { select: { id, name, slug } } } } }` for consistent includes.

### `async create(data: CreateServiceCategoryInput)`
1. Generate slug from `data.name`
2. Check uniqueness: `prisma.serviceCategory.findFirst({ where: { OR: [{ name }, { slug }] } })`
3. If duplicate → throw `AppError(409)`
4. `prisma.serviceCategory.create({ data: { name, slug, imageUrl: data.imageUrl }, include: this.includeEventTypes })`
5. Return created record

### `async findAll(query: ListServiceCategoriesQuery)`
1. Destructure `eventTypeId` from query alongside page, limit, search, sortBy, order
2. Build `where` object: add search filter (name OR slug, case-insensitive) if `search` provided
3. If `eventTypeId` provided → add `eventTypes: { some: { eventTypeId } }` to `where` (Prisma M2M filter)
4. `Promise.all([count, findMany])` with pagination, sorting
5. Include `_count: { select: { eventTypes: true, services: true } }` + `includeEventTypes`
6. Return `{ serviceCategories, meta: { page, limit, total, totalPages } }`

### `async findById(id: number)`
1. `prisma.serviceCategory.findUnique({ where: { id }, include: this.includeEventTypes })`
2. If not found → throw `AppError(404)`
3. Return record

### `async update(id: number, data: UpdateServiceCategoryInput)`
1. Check exists (`findUnique`) → 404 if not found
2. Build `updateData: { name?, slug?, imageUrl? }`
3. If `data.name` provided → generate new slug → check uniqueness excluding current ID → 409 if duplicate
4. If `data.imageUrl` provided (including `null` to clear) → set `updateData.imageUrl`
5. `prisma.serviceCategory.update({ where: { id }, data: updateData, include: this.includeEventTypes })`
6. Return updated record

### `async delete(id: number)`
1. `findUnique` with `include: { _count: { select: { services: true, eventTypes: true } } }` → 404 if not found
2. **Guard**: if `_count.services > 0` → throw `AppError('Cannot delete: N services still reference this category. Reassign or remove them first.', 409)`
3. Transaction:
   - `tx.eventTypeServiceCategory.deleteMany({ where: { serviceCategoryId: id } })`
   - `tx.serviceCategory.delete({ where: { id } })`
4. Log deletion

**Acceptance criteria**:
- [x] All 6 methods implemented (1 private helper, 1 private getter, 4 public + delete)
- [x] Delete is guarded — blocks when services exist
- [x] Delete cascade only removes bridge table rows
- [x] `npx tsc --noEmit` passes

---

## Task 4: Create the Controller Layer

**Goal**: Create `service-category.controller.ts` with 5 request handlers.

**Prerequisites**: Task 3.

**File to create**:
- `src/modules/service-categories/service-category.controller.ts`

**Reference**: See `src/modules/event-types/event-type.controller.ts` for the pattern.

**Handlers**:

| Handler | Import Types | Service Call | Response |
|---|---|---|---|
| `create` | `CreateServiceCategoryInput` | `serviceCategoryService.create(data)` | `sendCreated(res, { serviceCategory }, 'Service category created successfully')` |
| `getAll` | `ListServiceCategoriesQuery` | `serviceCategoryService.findAll(query)` | `sendSuccess(res, { serviceCategories }, 200, undefined, meta)` |
| `getOne` | `IdParam` | `serviceCategoryService.findById(id)` | `sendSuccess(res, { serviceCategory })` |
| `update` | `IdParam`, `UpdateServiceCategoryInput` | `serviceCategoryService.update(id, data)` | `sendSuccess(res, { serviceCategory }, 200, 'Service category updated successfully')` |
| `remove` | `IdParam` | `serviceCategoryService.delete(id)` | `sendNoContent(res)` |

Each handler: cast `req.body` / `req.params` / `req.query` to the correct type, log, delegate, respond.

**Acceptance criteria**:
- [x] 5 exported async functions
- [x] Each uses the correct response helper (`sendCreated`, `sendSuccess`, `sendNoContent`)
- [x] `npx tsc --noEmit` passes

---

## Task 5: Create Routes and Integrate into App

**Goal**: Create `service-category.routes.ts` and mount in `app.ts`.

**Prerequisites**: Task 4.

**Files**:
- **Create**: `src/modules/service-categories/service-category.routes.ts`
- **Modify**: `src/app.ts`

### Routes file
**Reference**: See `src/modules/event-types/event-type.routes.ts`.

1. Import `Router`, controller, `validateRequest`, `protect`, `restrictTo`, `UserRole`, and all schemas
2. `router.use(protect, restrictTo('ADMIN'))` — apply to all routes
3. Define routes:

| Method | Path | Validation |
|---|---|---|
| `POST /` | body: `createServiceCategorySchema` | `controller.create` |
| `GET /` | query: `listServiceCategoriesQuerySchema` | `controller.getAll` |
| `GET /:id` | params: `idParamSchema` | `controller.getOne` |
| `PATCH /:id` | params: `idParamSchema` + body: `updateServiceCategorySchema` | `controller.update` |
| `DELETE /:id` | params: `idParamSchema` | `controller.remove` |

### App integration
In `src/app.ts`:
1. Add import: `import serviceCategoryRoutes from './modules/service-categories/service-category.routes';`
2. Add mount: `app.use('/api/v1/admin/service-categories', serviceCategoryRoutes);` (after the event-types line)

**Acceptance criteria**:
- [x] Routes file has 5 routes, all behind auth + admin role
- [x] `app.ts` mounts at `/api/v1/admin/service-categories`
- [x] `npx tsc --noEmit` passes
- [x] Server starts without errors: `npm run dev` (verify health check)

---

## Task 6: Build Verification & Implementation Report

**Goal**: Verify the build compiles, then create a detailed implementation report with diagrams and curl examples.

**Prerequisites**: Tasks 1–5 all complete.

**Steps**:
1. Run `npx tsc --noEmit` — must pass with zero errors
2. Start server (`npm run dev`), hit health check endpoint
3. Create `docs/service_category_doc/implementation_report.md` with:
   - Summary of what was implemented
   - Data model diagram (Mermaid)
   - Route table with curl examples for every endpoint
   - Delete guard behavior explanation with diagram

**Acceptance criteria**:
- [x] TypeScript compiles cleanly
- [x] Report includes working curl commands for all 5 routes
- [x] Report includes Mermaid diagrams

---

## Task 7: E2E Test Suite

**Goal**: Write, run, and report comprehensive E2E tests.

**Prerequisites**: Task 6 passed (build verified).

**File to create**:
- `src/modules/service-categories/__tests__/service-category.test.ts`

**Test groups** (~30+ tests):

| Group | Tests |
|---|---|
| Auth Guard | 401 no token, 403 wrong role (CUSTOMER), 403 missing CSRF |
| POST (Create) | 201 happy path, 201 with imageUrl, 409 duplicate, 400 empty name, 400 name too short, 400 missing body, 400 invalid imageUrl |
| GET (List) | 200 default pagination, 200 search filter, 200 filter by eventTypeId, 200 pagination params, 200 sort desc |
| GET (Get One) | 200 happy path, 404 non-existent, 400 invalid ID |
| PATCH (Update) | 200 update name, 200 update imageUrl, 200 clear imageUrl (null), 200 update both, 400 empty body, 404 non-existent, 409 duplicate name |
| DELETE (Remove) | 204 happy path (no services), 409 blocked when services exist, 404 already deleted, 404 non-existent |

**Setup/Teardown**:
- `beforeAll`: Seed admin user, customer user, generate tokens + CSRF, seed an EventType for linking tests
- `afterAll`: Clean up all test data in correct FK order, disconnect Prisma

**Run command**:
```bash
npx cross-env NODE_ENV=test npx jest --detectOpenHandles --testPathPatterns="service-category" --verbose
```

**Acceptance criteria**:
- [x] All tests pass
- [x] Test report created at `docs/service_category_doc/test_report.md`
