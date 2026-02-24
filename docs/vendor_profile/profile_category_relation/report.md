# Vendor Profiles by ServiceCategory — Report

## What Was Built

Added `serviceCategoryId` as an optional query parameter to the existing `GET /api/v1/vendors` endpoint. When provided, only vendors in that category are returned. When omitted, all vendors are returned as before.

### Files Changed

| File | Change |
|---|---|
| `src/modules/vendors/vendor.schema.ts` | Added `serviceCategoryId` to `listVendorsQuerySchema` |
| `src/modules/vendors/vendor.service.ts` | Added `serviceCategoryId` filter in `findAll()` WHERE clause |

### Verification

- ✅ TypeScript compiles cleanly
- ✅ All 47 existing vendor tests pass (no regressions)

---

## Manual Testing with curl

> **Prerequisite**: Start the server with `npm run dev` (port 8000). Seed some vendors in different service categories.

### 1. List All Vendors (existing behavior, unchanged)

```bash
curl http://localhost:8000/api/v1/vendors
```

### 2. Filter Vendors by ServiceCategory (NEW)

```bash
# Get only DJ vendors (replace 5 with your serviceCategoryId)
curl http://localhost:8000/api/v1/vendors?serviceCategoryId=5
```

### 3. Combine with Existing Filters

```bash
# DJ vendors in Addis, sorted by popularity
curl "http://localhost:8000/api/v1/vendors?serviceCategoryId=5&city=Addis&sortBy=popularity"

# DJ vendors with price range
curl "http://localhost:8000/api/v1/vendors?serviceCategoryId=5&minPrice=100&maxPrice=500"

# DJ vendors, search by name
curl "http://localhost:8000/api/v1/vendors?serviceCategoryId=5&search=premium"

# DJ vendors, page 2, 5 per page, sorted by rating
curl "http://localhost:8000/api/v1/vendors?serviceCategoryId=5&page=2&limit=5&sortBy=averageRating&sortOrder=desc"
```

### 4. Complete Browsing Flow

```bash
# Step 1: List event types
curl http://localhost:8000/api/v1/event-types

# Step 2: Get service categories for "Wedding"
curl http://localhost:8000/api/v1/categories/event-types/wedding

# Step 3: Browse DJ vendors (category ID from step 2)
curl "http://localhost:8000/api/v1/vendors?serviceCategoryId=5&sortBy=popularity"
```
