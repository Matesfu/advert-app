import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { generateAccessToken, generateCsrfToken } from '../../../utils/token';
import { UserRole } from '@prisma/client';

describe('Favorite API – E2E', () => {
    const BASE = '/api/v1/favorites';

    // ── Auth tokens ──
    let customerToken: string;
    let vendorToken: string;
    let otherCustomerToken: string;
    let csrfToken: string;

    // ── User IDs ──
    let customerUserId: number;
    let vendorUserId: number;
    let otherCustomerUserId: number;

    // ── Test data IDs ──
    let serviceCategoryId: number;
    let vendorProfileId: number;
    let secondVendorProfileId: number;

    // ──────────────────────────────────────────────
    // SETUP & TEARDOWN
    // ──────────────────────────────────────────────

    beforeAll(async () => {
        // 1. Create CUSTOMER user (will add favorites)
        const customer = await prisma.user.create({
            data: {
                email: `fav.customer.${Date.now()}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.CUSTOMER,
                isVerified: true,
                displayName: 'Fav Customer',
                authProvider: 'local',
            },
        });
        customerUserId = customer.id;
        customerToken = generateAccessToken({
            userId: customer.id,
            email: customer.email,
            role: customer.role,
            authProvider: customer.authProvider,
        });

        // 2. Create VENDOR user (owns the vendor profile)
        const vendor = await prisma.user.create({
            data: {
                email: `fav.vendor.${Date.now()}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.VENDOR,
                isVerified: true,
                displayName: 'Fav Vendor',
                authProvider: 'local',
            },
        });
        vendorUserId = vendor.id;
        vendorToken = generateAccessToken({
            userId: vendor.id,
            email: vendor.email,
            role: vendor.role,
            authProvider: vendor.authProvider,
        });

        // 3. Create another CUSTOMER user (for isolation tests)
        const otherCustomer = await prisma.user.create({
            data: {
                email: `fav.other.${Date.now()}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.CUSTOMER,
                isVerified: true,
                displayName: 'Other Customer',
                authProvider: 'local',
            },
        });
        otherCustomerUserId = otherCustomer.id;
        otherCustomerToken = generateAccessToken({
            userId: otherCustomer.id,
            email: otherCustomer.email,
            role: otherCustomer.role,
            authProvider: otherCustomer.authProvider,
        });

        // 4. Create service category
        const cat = await prisma.serviceCategory.create({
            data: {
                name: `Fav Test Cat ${Date.now()}`,
                slug: `fav-test-cat-${Date.now()}`,
            },
        });
        serviceCategoryId = cat.id;

        // 5. Create vendor profile (owned by vendor user)
        const profile = await prisma.vendorProfile.create({
            data: {
                businessName: 'Fav Test Vendor',
                city: 'Addis Ababa',
                basePrice: 150,
                userId: vendorUserId,
                serviceCategoryId,
            },
        });
        vendorProfileId = profile.id;

        // 6. Create a second vendor profile (for multi-favorite tests)
        const profile2 = await prisma.vendorProfile.create({
            data: {
                businessName: 'Second Fav Vendor',
                city: 'Bahir Dar',
                basePrice: 200,
                userId: otherCustomerUserId, // owned by other customer (who is also a vendor for this test)
                serviceCategoryId,
            },
        });
        secondVendorProfileId = profile2.id;

        // 7. CSRF token
        csrfToken = generateCsrfToken();
    });

    afterAll(async () => {
        // Cleanup in FK order
        await prisma.favorite.deleteMany({
            where: {
                userId: { in: [customerUserId, vendorUserId, otherCustomerUserId] },
            },
        });
        await prisma.vendorProfile.deleteMany({
            where: { id: { in: [vendorProfileId, secondVendorProfileId] } },
        });
        await prisma.serviceCategory.deleteMany({
            where: { id: serviceCategoryId },
        });
        await prisma.user.deleteMany({
            where: { id: { in: [customerUserId, vendorUserId, otherCustomerUserId] } },
        });
        await prisma.$disconnect();
    });

    // ──────────────────────────────────────────────
    // 1. AUTHENTICATION & CSRF
    // ──────────────────────────────────────────────
    describe('Authentication & CSRF', () => {
        it('GET /favorites → 401 without auth token', async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(401);
        });

        it('POST /favorites/:vendorId → 401 without auth token', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}`)
                .set('x-csrf-token', csrfToken);
            expect(res.status).toBe(401);
        });

        it('DELETE /favorites/:vendorId → 401 without auth token', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}`)
                .set('x-csrf-token', csrfToken);
            expect(res.status).toBe(401);
        });

        it('POST /favorites/:vendorId → 403 without CSRF token', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${customerToken}`);
            expect(res.status).toBe(403);
        });

        it('DELETE /favorites/:vendorId → 403 without CSRF token', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${customerToken}`);
            expect(res.status).toBe(403);
        });
    });

    // ──────────────────────────────────────────────
    // 2. LIST FAVORITES
    // ──────────────────────────────────────────────
    describe('List Favorites (GET /)', () => {
        it('should return empty array when no favorites exist', async () => {
            const res = await request(app)
                .get(BASE)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(res.body.data.favorites).toEqual([]);
        });
    });

    // ──────────────────────────────────────────────
    // 3. ADD TO FAVORITES
    // ──────────────────────────────────────────────
    describe('Add to Favorites (POST /:vendorId)', () => {
        it('should add a vendor profile to favorites → 201', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(201);
            expect(res.body.status).toBe('success');
            expect(res.body.data.favorite).toBeDefined();
            expect(res.body.data.favorite.vendorProfileId).toBe(vendorProfileId);
            expect(res.body.data.favorite.vendorProfile).toBeDefined();
            expect(res.body.data.favorite.vendorProfile.businessName).toBe('Fav Test Vendor');
        });

        it('should list the added favorite', async () => {
            const res = await request(app)
                .get(BASE)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.favorites).toHaveLength(1);
            expect(res.body.data.favorites[0].vendorProfileId).toBe(vendorProfileId);
            expect(res.body.data.favorites[0].vendorProfile.businessName).toBe('Fav Test Vendor');
            expect(res.body.data.favorites[0].vendorProfile.serviceCategory).toBeDefined();
        });

        it('should reject duplicate add → 409', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/already in your favorites/i);
        });

        it('should reject self-favorite (vendor adding own profile) → 403', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/your own vendor profile/i);
        });

        it('should reject non-existent vendor → 404', async () => {
            const res = await request(app)
                .post(`${BASE}/999999`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(404);
            expect(res.body.message).toMatch(/not found/i);
        });

        it('should reject invalid vendorId format → 400', async () => {
            const res = await request(app)
                .post(`${BASE}/notanumber`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(400);
        });

        it('should allow different users to favorite the same vendor', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${otherCustomerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(201);
            expect(res.body.data.favorite.vendorProfileId).toBe(vendorProfileId);
        });

        it('should not show soft-deleted vendor profile as favoritable → 404', async () => {
            // Soft-delete the second vendor profile
            await prisma.vendorProfile.update({
                where: { id: secondVendorProfileId },
                data: { deletedAt: new Date() },
            });

            const res = await request(app)
                .post(`${BASE}/${secondVendorProfileId}`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(404);

            // Restore the profile for cleanup
            await prisma.vendorProfile.update({
                where: { id: secondVendorProfileId },
                data: { deletedAt: null },
            });
        });
    });

    // ──────────────────────────────────────────────
    // 4. FAVORITES ISOLATION
    // ──────────────────────────────────────────────
    describe('Favorites Isolation', () => {
        it('each user should only see their own favorites', async () => {
            const customerRes = await request(app)
                .get(BASE)
                .set('Authorization', `Bearer ${customerToken}`);

            const otherRes = await request(app)
                .get(BASE)
                .set('Authorization', `Bearer ${otherCustomerToken}`);

            expect(customerRes.status).toBe(200);
            expect(otherRes.status).toBe(200);

            // Both have favorited vendorProfileId, but each sees only their own
            expect(customerRes.body.data.favorites).toHaveLength(1);
            expect(otherRes.body.data.favorites).toHaveLength(1);
        });
    });

    // ──────────────────────────────────────────────
    // 5. REMOVE FROM FAVORITES
    // ──────────────────────────────────────────────
    describe('Remove from Favorites (DELETE /:vendorId)', () => {
        it('should remove a favorite → 204', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(204);
        });

        it('should confirm favorite was removed from list', async () => {
            const res = await request(app)
                .get(BASE)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.favorites).toHaveLength(0);
        });

        it('should reject removing non-existent favorite → 404', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(404);
            expect(res.body.message).toMatch(/not found/i);
        });

        it('should reject removing favorite for non-existent vendor → 404', async () => {
            const res = await request(app)
                .delete(`${BASE}/999999`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 6. SOFT-DELETED VENDOR IN EXISTING FAVORITES
    // ──────────────────────────────────────────────
    describe('Soft-Deleted Vendor in Existing Favorites', () => {
        it('should hide favorites whose vendor profile is soft-deleted', async () => {
            // Add vendor to other customer's favorites
            await prisma.favorite.create({
                data: {
                    userId: customerUserId,
                    vendorProfileId: secondVendorProfileId,
                },
            });

            // Verify it shows up
            let res = await request(app)
                .get(BASE)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.body.data.favorites).toHaveLength(1);

            // Soft-delete the vendor
            await prisma.vendorProfile.update({
                where: { id: secondVendorProfileId },
                data: { deletedAt: new Date() },
            });

            // Should no longer appear in favorites
            res = await request(app)
                .get(BASE)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.body.data.favorites).toHaveLength(0);

            // Restore for cleanup
            await prisma.vendorProfile.update({
                where: { id: secondVendorProfileId },
                data: { deletedAt: null },
            });
        });
    });
});
