# EventType → ServiceCategory Browsing — Report

## What Was Built

A single public endpoint that powers the **event-based browsing flow**:

```
GET /api/v1/categories/event-types/:slug
```

When a user clicks on an event type (e.g. "Wedding"), this endpoint returns that event type along with all its linked service categories — each with `imageUrl` and `vendorCount`.

### Files Changed

| File | Change |
|---|---|
| `src/modules/categories/category.service.ts` | Implemented `getEventTypeBySlug()` — Prisma query through the bridge table, flattens response |
| `src/modules/categories/__tests__/category.test.ts` | New E2E test file — 4 tests, all passing |

### Response Shape

```json
{
  "status": "success",
  "data": {
    "eventType": {
      "id": 1,
      "name": "Wedding",
      "slug": "wedding",
      "serviceCategories": [
        {
          "id": 5,
          "name": "DJ",
          "slug": "dj",
          "imageUrl": "https://cdn.example.com/dj.jpg",
          "vendorCount": 12
        },
        {
          "id": 8,
          "name": "Photographer",
          "slug": "photographer",
          "imageUrl": null,
          "vendorCount": 7
        }
      ]
    }
  }
}
```

### Test Results

```
✅ should return 200 without any auth token (public)
✅ should return the event type with its linked service categories
✅ should include imageUrl and vendorCount per category
✅ should return 404 for a non-existent slug
```

---

## Manual Testing with curl

> **Prerequisite**: Start the server with `npm run dev` (runs on port 8000).

### 1. Seed Test Data

First, create an admin user, event type, service categories, and link them. You can do this via the existing admin endpoints or directly with Prisma Studio (`npx prisma studio`).

For quick seeding via API (requires an admin token):

```bash
# Create an EventType
curl -X POST http://localhost:8000/api/v1/event-types \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "x-csrf-token: <CSRF_TOKEN>" \
  -d '{"name": "Wedding"}'

# Create ServiceCategories
curl -X POST http://localhost:8000/api/v1/service-categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "x-csrf-token: <CSRF_TOKEN>" \
  -d '{"name": "DJ", "imageUrl": "https://cdn.example.com/dj.jpg"}'

curl -X POST http://localhost:8000/api/v1/service-categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "x-csrf-token: <CSRF_TOKEN>" \
  -d '{"name": "Photographer"}'

# Link categories to the event type (replace :id and category IDs)
curl -X PUT http://localhost:8000/api/v1/event-types/1/categories \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ADMIN_TOKEN>" \
  -H "x-csrf-token: <CSRF_TOKEN>" \
  -d '{"serviceCategoryIds": [1, 2]}'
```

### 2. Browse — The New Endpoint (Public, No Auth)

```bash
# Get service categories for "Wedding"
curl http://localhost:8000/api/v1/categories/event-types/wedding
```

**Expected**: 200 with the event type and its linked service categories (including `imageUrl` and `vendorCount`).

### 3. Error Case — Non-Existent Slug

```bash
curl http://localhost:8000/api/v1/categories/event-types/does-not-exist
```

**Expected**: 404 with error message `Event type with slug "does-not-exist" not found`.

### 4. Full Browsing Flow

```bash
# Step 1: List all event types (existing endpoint, public)
curl http://localhost:8000/api/v1/event-types

# Step 2: User picks "Wedding" → get its service categories (NEW endpoint)
curl http://localhost:8000/api/v1/categories/event-types/wedding

# Step 3: User picks "DJ" (serviceCategoryId=1) → browse vendors (existing endpoint)
curl http://localhost:8000/api/v1/vendors?serviceCategoryId=1
```
