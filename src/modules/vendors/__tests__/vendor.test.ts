import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { env } from '../../../config/env';
import { generateAccessToken, generateCsrfToken } from '../../../utils/token';
import { UserRole } from '@prisma/client';

describe('Vendor Profile API – E2E', () => {
    const BASE = '/api/v1/vendors';

    // ── Auth tokens ──
    let adminToken: string;
    let customerToken: string;
    let vendorToken: string;
    let otherVendorToken: string;
    let csrfToken: string;

    // ── User IDs ──
    let adminUserId: number;
    let customerUserId: number;
    let vendorUserId: number;
    let otherVendorUserId: number;

    // ── Test data IDs ──
    let serviceCategoryId: number;
    let secondCategoryId: number;
    let vendorProfileId: number;

    // ── Original env value ──
    const originalVendorRoleEnforced = env.VENDOR_ROLE_ENFORCED;

    // ──────────────────────────────────────────────
    // SETUP & TEARDOWN
    // ──────────────────────────────────────────────

    beforeAll(async () => {
        // 1. Create ADMIN user
        const admin = await prisma.user.create({
            data: {
                email: `admin.vendor.${Date.now()}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.ADMIN,
                isVerified: true,
                displayName: 'Admin User',
                authProvider: 'local',
            },
        });
        adminUserId = admin.id;
        adminToken = generateAccessToken({
            userId: admin.id,
            email: admin.email,
            role: admin.role,
            authProvider: admin.authProvider,
        });

        // 2. Create CUSTOMER user
        const customer = await prisma.user.create({
            data: {
                email: `customer.vendor.${Date.now()}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.CUSTOMER,
                isVerified: true,
                displayName: 'Customer User',
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

        // 3. Create VENDOR user
        const vendor = await prisma.user.create({
            data: {
                email: `vendor.main.${Date.now()}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.VENDOR,
                isVerified: true,
                displayName: 'Vendor User',
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

        // 4. Create OTHER VENDOR user (for ownership tests)
        const otherVendor = await prisma.user.create({
            data: {
                email: `vendor.other.${Date.now()}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.VENDOR,
                isVerified: true,
                displayName: 'Other Vendor',
                authProvider: 'local',
            },
        });
        otherVendorUserId = otherVendor.id;
        otherVendorToken = generateAccessToken({
            userId: otherVendor.id,
            email: otherVendor.email,
            role: otherVendor.role,
            authProvider: otherVendor.authProvider,
        });

        // 5. Create service categories
        const cat1 = await prisma.serviceCategory.create({
            data: { name: `Vendor Test Cat ${Date.now()}`, slug: `vendor-test-cat-${Date.now()}` },
        });
        serviceCategoryId = cat1.id;

        const cat2 = await prisma.serviceCategory.create({
            data: { name: `Vendor Test Cat2 ${Date.now()}`, slug: `vendor-test-cat2-${Date.now()}` },
        });
        secondCategoryId = cat2.id;

        // 6. CSRF token
        csrfToken = generateCsrfToken();
    });

    afterAll(async () => {
        // Restore env
        (env as any).VENDOR_ROLE_ENFORCED = originalVendorRoleEnforced;

        // Cleanup in FK order
        await prisma.service.deleteMany();
        await prisma.review.deleteMany();
        await prisma.favorite.deleteMany();
        await prisma.vendorProfile.deleteMany();
        await prisma.serviceCategory.deleteMany({
            where: { id: { in: [serviceCategoryId, secondCategoryId] } },
        });
        await prisma.user.deleteMany({
            where: { id: { in: [adminUserId, customerUserId, vendorUserId, otherVendorUserId] } },
        });
        await prisma.$disconnect();
    });

    // ──────────────────────────────────────────────
    // 1. PUBLIC ACCESS & SEARCH
    // ──────────────────────────────────────────────
    describe('Public Access & Search', () => {
        it('GET /vendors → 200 without auth (public)', async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('success');
            expect(Array.isArray(res.body.data.items)).toBe(true);
        });

        it('GET /vendors/:id → 404 for non-existent ID', async () => {
            const res = await request(app).get(`${BASE}/999999`);
            expect(res.status).toBe(404);
        });

        it('GET /vendors/:id → 400 for invalid ID', async () => {
            const res = await request(app).get(`${BASE}/notanumber`);
            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 2. ROLE ENFORCEMENT (Feature Flag)
    // ──────────────────────────────────────────────
    describe('Role Enforcement (Feature Flag)', () => {
        afterEach(() => {
            (env as any).VENDOR_ROLE_ENFORCED = originalVendorRoleEnforced;
        });

        it('POST /vendors → 201 as CUSTOMER when VENDOR_ROLE_ENFORCED=false', async () => {
            (env as any).VENDOR_ROLE_ENFORCED = false;

            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    businessName: 'Customer Vendor Biz',
                    city: 'Test City',
                    basePrice: 50,
                    serviceCategoryId,
                });

            expect(res.status).toBe(201);
            expect(res.body.data.vendor).toBeDefined();

            // Clean up this profile for subsequent tests
            await prisma.vendorProfile.delete({ where: { id: res.body.data.vendor.id } });
        });

        it('POST /vendors → 403 as CUSTOMER when VENDOR_ROLE_ENFORCED=true', async () => {
            (env as any).VENDOR_ROLE_ENFORCED = true;

            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    businessName: 'Should Fail',
                    city: 'Test City',
                    basePrice: 50,
                    serviceCategoryId,
                });

            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/Vendor role required/);
        });

        it('POST /vendors → 201 as VENDOR when VENDOR_ROLE_ENFORCED=true', async () => {
            (env as any).VENDOR_ROLE_ENFORCED = true;

            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    businessName: 'Enforced Vendor Biz',
                    city: 'Addis Ababa',
                    basePrice: 100,
                    serviceCategoryId,
                });

            expect(res.status).toBe(201);

            // Clean up
            await prisma.vendorProfile.delete({ where: { id: res.body.data.vendor.id } });
        });

        it('POST /vendors → 401 without auth token', async () => {
            const res = await request(app)
                .post(BASE)
                .set('x-csrf-token', csrfToken)
                .send({
                    businessName: 'No Auth',
                    city: 'Test City',
                    basePrice: 50,
                    serviceCategoryId,
                });

            expect(res.status).toBe(401);
        });
    });

    // ──────────────────────────────────────────────
    // 3. CREATE VENDOR PROFILE
    // ──────────────────────────────────────────────
    describe('Create Vendor Profile (POST /)', () => {
        beforeAll(() => {
            (env as any).VENDOR_ROLE_ENFORCED = false;
        });

        it('should create a vendor profile successfully', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    businessName: 'Main Test Vendor',
                    bio: 'Premium DJ services',
                    city: 'Addis Ababa',
                    basePrice: 200,
                    portfolioImages: ['https://example.com/img1.jpg'],
                    serviceCategoryId,
                });

            expect(res.status).toBe(201);
            expect(res.body.data.vendor.businessName).toBe('Main Test Vendor');
            expect(res.body.data.vendor.serviceCategory).toBeDefined();
            vendorProfileId = res.body.data.vendor.id;
        });

        it('should fail with validation error (missing required fields)', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ businessName: 'No Price' });

            expect(res.status).toBe(400);
        });

        it('should fail with non-existent serviceCategoryId → 404', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${otherVendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    businessName: 'Bad Cat',
                    city: 'Test City',
                    basePrice: 50,
                    serviceCategoryId: 999999,
                });

            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 4. ONE PROFILE PER CATEGORY (Duplicate → 409)
    // ──────────────────────────────────────────────
    describe('One Profile Per Category', () => {
        it('should reject duplicate active profile in same category → 409', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    businessName: 'Duplicate Attempt',
                    city: 'Test City',
                    basePrice: 100,
                    serviceCategoryId,
                });

            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/already have a vendor profile/i);
        });

        it('should allow same user to create profile in a DIFFERENT category → 201', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    businessName: 'Second Category Vendor',
                    city: 'Bahir Dar',
                    basePrice: 150,
                    serviceCategoryId: secondCategoryId,
                });

            expect(res.status).toBe(201);

            // Clean up
            await prisma.vendorProfile.delete({ where: { id: res.body.data.vendor.id } });
        });
    });

    // ──────────────────────────────────────────────
    // 5. GET VENDOR PROFILE (detail + list)
    // ──────────────────────────────────────────────
    describe('Get Vendor Profiles', () => {
        it('GET /vendors/:id → 200 with related data', async () => {
            const res = await request(app).get(`${BASE}/${vendorProfileId}`);

            expect(res.status).toBe(200);
            expect(res.body.data.vendor.id).toBe(vendorProfileId);
            expect(res.body.data.vendor.businessName).toBe('Main Test Vendor');
            expect(res.body.data.vendor.serviceCategory).toBeDefined();
            expect(res.body.data.vendor.owner).toBeDefined();
            expect(res.body.data.vendor._count).toBeDefined();
        });

        it('GET /vendors → 200 with pagination meta', async () => {
            const res = await request(app).get(`${BASE}?page=1&limit=5`);

            expect(res.status).toBe(200);
            expect(res.body.meta).toBeDefined();
            expect(res.body.meta.page).toBe(1);
            expect(res.body.meta.limit).toBe(5);
            expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
        });

        it('GET /vendors → filter by city', async () => {
            const res = await request(app).get(`${BASE}?city=Addis`);

            expect(res.status).toBe(200);
            const items = res.body.data.items;
            items.forEach((v: any) => {
                expect(v.city.toLowerCase()).toContain('addis');
            });
        });

        it('GET /vendors → search by businessName', async () => {
            const res = await request(app).get(`${BASE}?search=Main Test`);

            expect(res.status).toBe(200);
            const names = res.body.data.items.map((v: any) => v.businessName);
            expect(names).toContain('Main Test Vendor');
        });

        it('GET /vendors → filter by price range', async () => {
            const res = await request(app).get(`${BASE}?minPrice=100&maxPrice=300`);

            expect(res.status).toBe(200);
            const items = res.body.data.items;
            items.forEach((v: any) => {
                const price = parseFloat(v.basePrice);
                expect(price).toBeGreaterThanOrEqual(100);
                expect(price).toBeLessThanOrEqual(300);
            });
        });

        it('GET /vendors → sort by basePrice asc', async () => {
            const res = await request(app).get(`${BASE}?sortBy=basePrice&sortOrder=asc`);

            expect(res.status).toBe(200);
            const prices = res.body.data.items.map((v: any) => parseFloat(v.basePrice));
            for (let i = 1; i < prices.length; i++) {
                expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
            }
        });

        it('GET /vendors → sort by averageRating desc', async () => {
            const res = await request(app).get(`${BASE}?sortBy=averageRating&sortOrder=desc`);

            expect(res.status).toBe(200);
            const ratings = res.body.data.items.map((v: any) => v.averageRating);
            for (let i = 1; i < ratings.length; i++) {
                expect(ratings[i]).toBeLessThanOrEqual(ratings[i - 1]);
            }
        });

        it('GET /vendors → sort by reviewCount desc', async () => {
            const res = await request(app).get(`${BASE}?sortBy=reviewCount&sortOrder=desc`);

            expect(res.status).toBe(200);
            const counts = res.body.data.items.map((v: any) => v.reviewCount);
            for (let i = 1; i < counts.length; i++) {
                expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
            }
        });

        it('GET /vendors → sort by popularity', async () => {
            const res = await request(app).get(`${BASE}?sortBy=popularity&sortOrder=desc`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data.items)).toBe(true);
        });
    });

    // ──────────────────────────────────────────────
    // 6. UPDATE VENDOR PROFILE
    // ──────────────────────────────────────────────
    describe('Update Vendor Profile (PATCH /:id)', () => {
        it('should update profile as owner → 200', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ businessName: 'Updated Vendor Name', city: 'Hawassa' });

            expect(res.status).toBe(200);
            expect(res.body.data.vendor.businessName).toBe('Updated Vendor Name');
            expect(res.body.data.vendor.city).toBe('Hawassa');
        });

        it('should reject update from non-owner → 403', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${otherVendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ businessName: 'Hijacked!' });

            expect(res.status).toBe(403);
        });

        it('should allow ADMIN to update any profile → 200', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ bio: 'Admin updated bio' });

            expect(res.status).toBe(200);
        });

        it('should return 404 for non-existent profile', async () => {
            const res = await request(app)
                .patch(`${BASE}/999999`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ businessName: 'Ghost' });

            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 7. PORTFOLIO IMAGE MANAGEMENT
    // ──────────────────────────────────────────────
    describe('Portfolio Image Management (PATCH /:id/images)', () => {
        it('should add images → 200', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}/images`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    add: [
                        'https://example.com/img2.jpg',
                        'https://example.com/img3.jpg',
                    ],
                });

            expect(res.status).toBe(200);
            expect(res.body.data.vendor.portfolioImages).toContain('https://example.com/img2.jpg');
            expect(res.body.data.vendor.portfolioImages).toContain('https://example.com/img3.jpg');
        });

        it('should remove images → 200', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}/images`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    remove: ['https://example.com/img1.jpg'],
                });

            expect(res.status).toBe(200);
            expect(res.body.data.vendor.portfolioImages).not.toContain('https://example.com/img1.jpg');
        });

        it('should deduplicate when adding same image twice → 200', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}/images`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    add: ['https://example.com/img2.jpg'], // already exists
                });

            expect(res.status).toBe(200);
            const count = res.body.data.vendor.portfolioImages.filter(
                (img: string) => img === 'https://example.com/img2.jpg'
            ).length;
            expect(count).toBe(1); // No duplicates
        });

        it('should reject when exceeding MAX_PORTFOLIO_IMAGES → 400', async () => {
            // Add images up to max
            const manyImages = Array.from({ length: 15 }, (_, i) =>
                `https://example.com/overflow-${i}.jpg`
            );

            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}/images`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ add: manyImages });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/Cannot add/);
        });

        it('should reject from non-owner → 403', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}/images`)
                .set('Authorization', `Bearer ${otherVendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ add: ['https://example.com/hack.jpg'] });

            expect(res.status).toBe(403);
        });

        it('should reject empty body (no add or remove) → 400', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}/images`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({});

            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 8. NESTED SERVICE MANAGEMENT
    // ──────────────────────────────────────────────
    describe('Service Management (nested under vendor)', () => {
        let serviceId: number;

        it('POST /vendors/:id/services → 201 add service as owner', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/services`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    name: 'Basic DJ Package',
                    description: '4 hours of music and lighting',
                    price: 500,
                });

            expect(res.status).toBe(201);
            expect(res.body.data.service.name).toBe('Basic DJ Package');
            expect(res.body.data.service.vendorProfileId).toBe(vendorProfileId);
            serviceId = res.body.data.service.id;
        });

        it('POST /vendors/:id/services → 403 as non-owner', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/services`)
                .set('Authorization', `Bearer ${otherVendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'Hack Service', price: 10 });

            expect(res.status).toBe(403);
        });

        it('POST /vendors/:id/services → 400 with invalid data', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/services`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'A' }); // too short + missing price

            expect(res.status).toBe(400);
        });

        it('GET /vendors/:id/services → 200 list services (public)', async () => {
            const res = await request(app).get(`${BASE}/${vendorProfileId}/services`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data.services)).toBe(true);
            expect(res.body.data.services.length).toBeGreaterThanOrEqual(1);
            expect(res.body.data.services[0].name).toBe('Basic DJ Package');
        });

        it('GET /vendors/:id → includes services in detail view', async () => {
            const res = await request(app).get(`${BASE}/${vendorProfileId}`);

            expect(res.status).toBe(200);
            expect(res.body.data.vendor.services).toBeDefined();
            expect(res.body.data.vendor.services.length).toBeGreaterThanOrEqual(1);
        });

        it('DELETE /vendors/:id/services/:serviceId → 403 as non-owner', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}/services/${serviceId}`)
                .set('Authorization', `Bearer ${otherVendorToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(403);
        });

        it('DELETE /vendors/:id/services/:serviceId → 204 as owner', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}/services/${serviceId}`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(204);
        });

        it('DELETE /vendors/:id/services/:serviceId → 404 already deleted', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}/services/${serviceId}`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 9. SOFT DELETE
    // ──────────────────────────────────────────────
    describe('Soft Delete', () => {
        it('DELETE /vendors/:id → 403 as non-owner', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${otherVendorToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(403);
        });

        it('DELETE /vendors/:id → 204 as owner (soft-delete)', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(204);
        });

        it('GET /vendors/:id → 404 for soft-deleted profile', async () => {
            const res = await request(app).get(`${BASE}/${vendorProfileId}`);
            expect(res.status).toBe(404);
        });

        it('GET /vendors → should NOT include soft-deleted profiles', async () => {
            const res = await request(app).get(BASE);

            expect(res.status).toBe(200);
            const ids = res.body.data.items.map((v: any) => v.id);
            expect(ids).not.toContain(vendorProfileId);
        });

        it('DELETE /vendors/:id → 404 for already deleted profile', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}`)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(404);
        });

        it('POST /vendors → 201 re-create profile after soft-delete (slot freed)', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${vendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    businessName: 'Reborn Vendor',
                    city: 'Dire Dawa',
                    basePrice: 300,
                    serviceCategoryId,
                });

            expect(res.status).toBe(201);
            expect(res.body.data.vendor.businessName).toBe('Reborn Vendor');

            // Update the ID for any remaining tests
            vendorProfileId = res.body.data.vendor.id;
        });
    });

    // ──────────────────────────────────────────────
    // 10. REVIEW STATS (recalculate)
    // ──────────────────────────────────────────────
    describe('Review Stats (recalculateReviewStats)', () => {
        it('should start with averageRating=0 and reviewCount=0', async () => {
            const res = await request(app).get(`${BASE}/${vendorProfileId}`);

            expect(res.status).toBe(200);
            expect(res.body.data.vendor.averageRating).toBe(0);
            expect(res.body.data.vendor.reviewCount).toBe(0);
        });

        it('should recalculate after creating reviews (DB-level test)', async () => {
            // Create reviews directly in DB
            await prisma.review.createMany({
                data: [
                    { rating: 5, comment: 'Excellent!', userId: customerUserId, vendorProfileId },
                    { rating: 4, comment: 'Great!', userId: otherVendorUserId, vendorProfileId },
                    { rating: 3, comment: 'Good', userId: adminUserId, vendorProfileId },
                ],
            });

            // Call recalculate (import the service directly)
            const { vendorService } = await import('../vendor.service');
            const stats = await vendorService.recalculateReviewStats(vendorProfileId);

            expect(stats.reviewCount).toBe(3);
            expect(stats.averageRating).toBe(4); // (5+4+3)/3 = 4.0

            // Verify via API
            const res = await request(app).get(`${BASE}/${vendorProfileId}`);
            expect(res.body.data.vendor.averageRating).toBe(4);
            expect(res.body.data.vendor.reviewCount).toBe(3);
        });
    });
});
