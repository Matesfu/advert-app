# Public Read Routes — Implementation Plan

## Overview

Currently, `event-types` and `service-categories` routes are exclusively admin-only, mounted at `/api/v1/admin/...` with a **global** `router.use(protect, restrictTo('ADMIN'))`. This plan refactors them so:

- **GET (list + detail)** routes are **public** — no authentication required.
- **Mutation routes** (POST, PATCH, DELETE, PUT) remain **admin-only**.
- The `/admin` prefix is **removed** from both modules' base URLs.

> [!NOTE]
> This follows the **industry-standard pattern** used by production APIs (e.g., Stripe, Shopify, GitHub):
> read endpoints are public or low-privilege, while write endpoints require elevated permissions.
> Authorization is enforced via **middleware**, not URL structure — making the API RESTful and clean.

---

## Design Decision

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **Remove global `router.use(protect, restrictTo('ADMIN'))`** | Enables per-route auth control — GET routes remain public, mutations stay protected. |
| 2 | **Apply `protect + restrictTo('ADMIN')` inline on mutation routes** | Standard Express pattern — explicit middleware per route is clearer and more maintainable than split routers. |
| 3 | **Remove `/admin` from mount path** | REST best practice — authorization is a middleware concern, not a URL concern. Paths become `/api/v1/event-types` and `/api/v1/service-categories`. |
| 4 | **Single router per module** | Keeps the existing 4-file pattern intact. No new files needed — just middleware rearrangement. |

---

## URL Changes

### Before

| Method | Old URL | Access |
|--------|---------|--------|
| `POST` | `/api/v1/admin/event-types` | Admin |
| `GET` | `/api/v1/admin/event-types` | Admin |
| `GET` | `/api/v1/admin/event-types/:id` | Admin |
| `PATCH` | `/api/v1/admin/event-types/:id` | Admin |
| `DELETE` | `/api/v1/admin/event-types/:id` | Admin |
| `PUT` | `/api/v1/admin/event-types/:id/categories` | Admin |
| `POST` | `/api/v1/admin/service-categories` | Admin |
| `GET` | `/api/v1/admin/service-categories` | Admin |
| `GET` | `/api/v1/admin/service-categories/:id` | Admin |
| `PATCH` | `/api/v1/admin/service-categories/:id` | Admin |
| `DELETE` | `/api/v1/admin/service-categories/:id` | Admin |

### After

| Method | New URL | Access |
|--------|---------|--------|
| `POST` | `/api/v1/event-types` | Admin + CSRF |
| `GET` | `/api/v1/event-types` | **Public** |
| `GET` | `/api/v1/event-types/:id` | **Public** |
| `PATCH` | `/api/v1/event-types/:id` | Admin + CSRF |
| `DELETE` | `/api/v1/event-types/:id` | Admin + CSRF |
| `PUT` | `/api/v1/event-types/:id/categories` | Admin + CSRF |
| `POST` | `/api/v1/service-categories` | Admin + CSRF |
| `GET` | `/api/v1/service-categories` | **Public** |
| `GET` | `/api/v1/service-categories/:id` | **Public** |
| `PATCH` | `/api/v1/service-categories/:id` | Admin + CSRF |
| `DELETE` | `/api/v1/service-categories/:id` | Admin + CSRF |

---

## Proposed Changes

### Component 1: App Configuration

#### [MODIFY] [app.ts](file:///d:/work/advert_app/backend/src/app.ts)

Change mount paths — remove `/admin` prefix:

```diff
- // Admin Module Routes
- app.use('/api/v1/admin/event-types', eventTypeRoutes);
- app.use('/api/v1/admin/service-categories', serviceCategoryRoutes);
+ // Event & Service Category Routes (GET: public, mutations: admin-only)
+ app.use('/api/v1/event-types', eventTypeRoutes);
+ app.use('/api/v1/service-categories', serviceCategoryRoutes);
```

---

### Component 2: Event-Types Route File

#### [MODIFY] [event-type.routes.ts](file:///d:/work/advert_app/backend/src/modules/event-types/event-type.routes.ts)

1. **Remove** the global `router.use(protect, restrictTo('ADMIN'))` line.
2. **Add** `protect, restrictTo(UserRole.ADMIN)` middleware **inline** to each mutation route (`POST`, `PATCH`, `DELETE`, `PUT`).
3. **Leave** `GET /` and `GET /:id` **without** auth middleware — they become public.
4. **Update** JSDoc comments to reflect new access levels.

```diff
- // Apply auth middleware to ALL routes in this router
- router.use(protect, restrictTo('ADMIN'));

  // GET /  — Public
  router.get('/', validateRequest(listEventTypesQuerySchema, 'query'), eventTypeController.getAll);

  // GET /:id — Public
  router.get('/:id', validateRequest(idParamSchema, 'params'), eventTypeController.getOne);

  // POST / — Admin only
- router.post('/', validateRequest(createEventTypeSchema), eventTypeController.create);
+ router.post('/', protect, restrictTo(UserRole.ADMIN), validateRequest(createEventTypeSchema), eventTypeController.create);

  // PATCH /:id — Admin only
- router.patch('/:id', ...);
+ router.patch('/:id', protect, restrictTo(UserRole.ADMIN), ...);

  // DELETE /:id — Admin only
- router.delete('/:id', ...);
+ router.delete('/:id', protect, restrictTo(UserRole.ADMIN), ...);

  // PUT /:id/categories — Admin only
- router.put('/:id/categories', ...);
+ router.put('/:id/categories', protect, restrictTo(UserRole.ADMIN), ...);
```

---

### Component 3: Service-Categories Route File

#### [MODIFY] [service-category.routes.ts](file:///d:/work/advert_app/backend/src/modules/service-categories/service-category.routes.ts)

Same pattern as event-types:

1. **Remove** global `router.use(protect, restrictTo(UserRole.ADMIN))`.
2. **Add** inline auth to `POST`, `PATCH`, `DELETE`.
3. **Leave** `GET /` and `GET /:id` public.
4. **Update** comments.

---

### Component 4: E2E Test Updates

#### [MODIFY] [event-type.test.ts](file:///d:/work/advert_app/backend/src/modules/event-types/__tests__/event-type.test.ts)

1. Change `BASE` constant: `'/api/v1/admin/event-types'` → `'/api/v1/event-types'`
2. Update Auth Guard tests:
   - **Remove** test: "GET → 401 when no token" (GET is public now)
   - **Remove** test: "GET → 403 when CUSTOMER" (GET is public now)
   - **Add** test: "GET / → 200 without any token" (verify public access)
   - **Add** test: "GET /:id → 200 without any token" (verify public access)
   - **Keep** tests: POST/PATCH/DELETE → 401/403 (still admin-protected)

#### [MODIFY] [service-category.test.ts](file:///d:/work/advert_app/backend/src/modules/service-categories/__tests__/service-category.test.ts)

1. Change `BASE` constant: `'/api/v1/admin/service-categories'` → `'/api/v1/service-categories'`
2. Update Auth Guard tests:
   - **Modify** "401 no token" test → test only against a mutation (POST), not GET
   - **Add** test: "GET / → 200 without any token" (verify public access)
   - **Add** test: "GET /:id → 200 without any token" (verify public detail)
   - **Keep** existing CSRF test on mutations

---

## Verification Plan

### Automated Tests

Run both E2E test suites after all changes:

```bash
npx cross-env NODE_ENV=test npx jest --detectOpenHandles --testPathPatterns="event-type|service-category" --verbose
```

Expected: All tests pass, including new public-access tests.

### Build Check

```bash
npx tsc --noEmit
```

Expected: Zero TypeScript errors.

### Manual Verification (optional quick smoke test)

1. Start server: `npm run dev`
2. Public GET (no token): `curl http://localhost:5000/api/v1/event-types` → should return 200 with data
3. Admin POST (no token): `curl -X POST http://localhost:5000/api/v1/event-types -H "Content-Type: application/json" -d '{"name":"Test"}'` → should return 401
