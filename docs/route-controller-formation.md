# Eventify Backend: Route-Controller-Service Architecture

> **Professional Documentation** for the modular backend architecture.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Folder Structure](#folder-structure)
3. [Shared Infrastructure](#shared-infrastructure)
4. [Module Reference](#module-reference)
5. [API Endpoints](#api-endpoints)
6. [Implementation Status](#implementation-status)

---

## Architecture Overview

This backend follows **Clean Architecture** principles with a modular structure:

```
Request → Routes → Middleware → Controller → Service → Database
                      ↓              ↓           ↓
                 Validation      Logging     Business Logic
```

### Layer Responsibilities

| Layer | File | Responsibility |
|-------|------|----------------|
| **Routes** | `*.routes.ts` | Define endpoints, apply middleware, delegate to controllers |
| **Controllers** | `*.controller.ts` | Handle HTTP request/response, logging, call services |
| **Services** | `*.service.ts` | Business logic, database operations via Prisma |
| **Schemas** | `*.schema.ts` | Zod validation schemas for request data |

---

## Folder Structure

```
src/
├── app.ts                      # Express app configuration & route mounting
├── server.ts                   # Server entry point
│
├── config/
│   ├── env.ts                  # Environment variable validation (Zod)
│   └── prisma.ts               # Prisma client singleton
│
├── types/
│   └── express.d.ts            # TypeScript Request augmentation
│
├── utils/
│   ├── AppError.ts             # Custom error class
│   ├── logger.ts               # Winston logger
│   └── response.ts             # Standard API response helpers
│
├── middlewares/
│   ├── error.middleware.ts     # Global error handler
│   ├── validate.middleware.ts  # Zod validation middleware
│   └── auth.middleware.ts      # JWT auth & role-based access
│
└── modules/
    ├── auth/                   # Authentication (register, login, etc.)
    ├── users/                  # User profile management
    ├── vendors/                # Vendor profile CRUD + services
    ├── reviews/                # Vendor reviews
    ├── favorites/              # User wishlist
    ├── messages/               # Conversations & messaging
    └── categories/             # Event types & service categories
```

---

## Shared Infrastructure

### `src/types/express.d.ts`

**Purpose:** Extends Express Request with authenticated user data.

```typescript
interface Request {
    user?: { id: number; email: string; role: UserRole };
}
```

**Usage:** After `protect` middleware, access `req.user.id`, `req.user.role`.

---

### `src/utils/response.ts`

**Purpose:** Standardized API response format.

| Function | Status Code | Use Case |
|----------|-------------|----------|
| `sendSuccess(res, data)` | 200 | General success |
| `sendCreated(res, data)` | 201 | Resource created |
| `sendNoContent(res)` | 204 | Deletion success |

**Response Format:**
```json
{
    "status": "success",
    "data": { ... },
    "message": "Optional message"
}
```

---

### `src/middlewares/validate.middleware.ts`

**Purpose:** Validate request data using Zod schemas.

```typescript
// Validate body (default)
router.post('/register', validateRequest(registerSchema), controller);

// Validate params
router.get('/:id', validateRequest(idParamSchema, 'params'), controller);

// Validate query
router.get('/', validateRequest(querySchema, 'query'), controller);
```

**On Validation Failure:** Returns `400` with error details.

---

### `src/middlewares/auth.middleware.ts`

**Purpose:** Authentication and authorization.

| Middleware | Purpose |
|------------|---------|
| `protect` | Verify JWT, attach `req.user` |
| `restrictTo('VENDOR', 'ADMIN')` | Role-based access control |

**Usage:**
```typescript
// Auth required
router.get('/me', protect, controller.getMe);

// Auth + role required
router.post('/', protect, restrictTo('VENDOR'), controller.create);
```

> ⚠️ **Current Status:** Placeholder JWT. TODO: Implement with `jsonwebtoken`.

---

## Module Reference

### Auth Module (`/api/v1/auth`)

| File | Purpose |
|------|---------|
| `auth.schema.ts` | Zod schemas: `registerSchema`, `loginSchema`, `changePasswordSchema` |
| `auth.service.ts` | Business logic: register, login, logout, getMe, changePassword |
| `auth.controller.ts` | HTTP handlers with logging |
| `auth.routes.ts` | Route definitions |

**Endpoints:**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | ❌ | Create user account |
| POST | `/login` | ❌ | Authenticate & get token |
| POST | `/logout` | ✅ | Invalidate session |
| GET | `/me` | ✅ | Get current user profile |
| PATCH | `/change-password` | ✅ | Update password |

---

### Users Module (`/api/v1/users`)

| File | Purpose |
|------|---------|
| `user.schema.ts` | Zod schemas: `updateUserSchema`, `userIdParamSchema` |
| `user.service.ts` | Business logic: findById, updateMe, deleteMe |
| `user.controller.ts` | HTTP handlers |
| `user.routes.ts` | Route definitions (all protected) |

**Endpoints:**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/me` | ✅ | Get own profile |
| PATCH | `/me` | ✅ | Update own profile |
| DELETE | `/me` | ✅ | Delete account |
| GET | `/:id` | ✅ Admin | Get user by ID |

---

### Vendors Module (`/api/v1/vendors`)

| File | Purpose |
|------|---------|
| `vendor.schema.ts` | Zod schemas: create/update vendor, create service, query filters |
| `vendor.service.ts` | Business logic: CRUD + service management |
| `vendor.controller.ts` | HTTP handlers |
| `vendor.routes.ts` | Route definitions |

**Endpoints:**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ❌ | List vendors (paginated, filtered) |
| GET | `/:id` | ❌ | Get vendor profile |
| POST | `/` | ✅ VENDOR | Create vendor profile |
| PATCH | `/:id` | ✅ Owner | Update vendor profile |
| DELETE | `/:id` | ✅ Owner/Admin | Delete vendor profile |
| GET | `/:id/services` | ❌ | List vendor services |
| POST | `/:id/services` | ✅ Owner | Add service |
| DELETE | `/:id/services/:serviceId` | ✅ Owner | Remove service |

**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (max: 50)
- `city` - Filter by city
- `minPrice` / `maxPrice` - Price range filter

---

### Reviews Module (`/api/v1/vendors/:vendorId/reviews`)

| File | Purpose |
|------|---------|
| `review.schema.ts` | Zod schemas: `createReviewSchema`, `listReviewsQuerySchema` |
| `review.service.ts` | Business logic: findByVendor, create |
| `review.controller.ts` | HTTP handlers |
| `review.routes.ts` | Route definitions (nested under vendors) |

**Endpoints:**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ❌ | List vendor reviews |
| POST | `/` | ✅ | Create review (1-5 rating) |

---

### Favorites Module (`/api/v1/favorites`)

| File | Purpose |
|------|---------|
| `favorite.schema.ts` | Zod schemas: `vendorIdParamSchema` |
| `favorite.service.ts` | Business logic: findByUser, add, remove |
| `favorite.controller.ts` | HTTP handlers |
| `favorite.routes.ts` | Route definitions (all protected) |

**Endpoints:**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | ✅ | List user's favorites |
| POST | `/:vendorId` | ✅ | Add to favorites |
| DELETE | `/:vendorId` | ✅ | Remove from favorites |

---

### Messages Module (`/api/v1/messages`)

| File | Purpose |
|------|---------|
| `message.schema.ts` | Zod schemas: start conversation, send message |
| `message.service.ts` | Business logic: conversations & messages |
| `message.controller.ts` | HTTP handlers |
| `message.routes.ts` | Route definitions (all protected) |

**Endpoints:**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/conversations` | ✅ | List user's conversations |
| POST | `/conversations` | ✅ | Start new conversation |
| GET | `/conversations/:id` | ✅ | Get conversation with messages |
| POST | `/conversations/:id/messages` | ✅ | Send message |
| PATCH | `/conversations/:id/read` | ✅ | Mark as read |

---

### Categories Module (`/api/v1/categories`)

| File | Purpose |
|------|---------|
| `category.schema.ts` | Zod schemas: `slugParamSchema` |
| `category.service.ts` | Business logic: event types & service categories |
| `category.controller.ts` | HTTP handlers |
| `category.routes.ts` | Route definitions (all public) |

**Endpoints:**
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/event-types` | ❌ | List event types (Wedding, Birthday, etc.) |
| GET | `/event-types/:slug` | ❌ | Get event type with linked categories |
| GET | `/service-categories` | ❌ | List service categories (DJ, Photographer, etc.) |
| GET | `/service-categories/:slug` | ❌ | Get service category |

---

## API Endpoints

### Complete Summary

| Module | Base Path | Endpoints | Auth Required |
|--------|-----------|-----------|---------------|
| Auth | `/api/v1/auth` | 5 | Partial |
| Users | `/api/v1/users` | 4 | Yes |
| Vendors | `/api/v1/vendors` | 8 | Partial |
| Reviews | `/api/v1/vendors/:vendorId/reviews` | 2 | Partial |
| Favorites | `/api/v1/favorites` | 3 | Yes |
| Messages | `/api/v1/messages` | 5 | Yes |
| Categories | `/api/v1/categories` | 4 | No |
| **Total** | | **31** | |

---

## Implementation Status

### ✅ Completed (Boilerplate)

- Route definitions for all modules
- Controller handlers with logging
- Zod validation schemas
- Service interfaces with placeholder methods
- Middleware integration
- Express app configuration

### 🔄 TODO (Business Logic)

| Task | Files to Update |
|------|-----------------|
| JWT Authentication | `auth.middleware.ts`, `auth.service.ts` |
| User Registration | `auth.service.ts` |
| User Login | `auth.service.ts` |
| Vendor CRUD | `vendor.service.ts` |
| Review System | `review.service.ts` |
| Favorites | `favorite.service.ts` |
| Messaging | `message.service.ts` |
| Category Seeding | Database seed script |

### Required Dependencies

```bash
npm install jsonwebtoken bcryptjs
npm install -D @types/jsonwebtoken @types/bcryptjs
```

---

## Quick Start

```bash
# Development
npm run dev

# Build
npm run build

# Production
npm start
```

### Test Endpoints

```bash
# Health check
curl http://localhost:8000/api/v1/health

# List vendors (public)
curl http://localhost:8000/api/v1/vendors

# Register (validation test)
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "Test1234"}'
```

---

*Documentation generated for Eventify Backend v1.0.0*
