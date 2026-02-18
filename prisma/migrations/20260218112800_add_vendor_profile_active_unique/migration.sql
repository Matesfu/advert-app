-- =============================================
-- Partial Unique Index: One active VendorProfile per ServiceCategory per User
-- =============================================
--
-- WHY a partial index instead of @@unique?
-- -----------------------------------------
-- A standard `@@unique([userId, serviceCategoryId])` constraint applies to ALL rows,
-- including soft-deleted ones (where `deletedAt IS NOT NULL`).
-- This means if a user soft-deletes their profile in category "DJ", they can NEVER
-- create a new profile in "DJ" because the old row still occupies the unique slot.
--
-- A partial unique index with `WHERE "deletedAt" IS NULL` only enforces uniqueness
-- among ACTIVE rows — exactly the behavior we need for soft delete.
--
-- EFFECT:
--   ✅ User can have one active profile per category
--   ✅ User can re-create a profile in a category after soft-deleting the old one
--   ✅ Multiple soft-deleted profiles in the same category are allowed

CREATE UNIQUE INDEX "VendorProfile_userId_serviceCategoryId_active"
ON "VendorProfile" ("userId", "serviceCategoryId")
WHERE "deletedAt" IS NULL;
