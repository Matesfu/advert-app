
import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { generateAccessToken, generateCsrfToken } from '../../../utils/token';
import { UserRole } from '@prisma/client';

describe('ServiceCategory API – E2E', () => {
    const BASE = '/api/v1/service-categories';

    // Auth tokens
    let adminToken: string;
    let userToken: string;
    let csrfToken: string;

    // Test data IDs
    let eventTypeId: number;
    let categoryId: number;

    // ──────────────────────────────────────────────
    // SETUP & TEARDOWN
    // ──────────────────────────────────────────────

    beforeAll(async () => {
        // 1. Create Admin User
        const adminEmail = `admin.${Date.now()}@example.com`;
        const admin = await prisma.user.create({
            data: {
                email: adminEmail,
                passwordHash: 'hashed_pwd_placeholder',
                role: UserRole.ADMIN,
                isVerified: true,
                displayName: 'Admin User',
                authProvider: 'local',
            },
        });
        adminToken = generateAccessToken({
            userId: admin.id,
            email: admin.email,
            role: admin.role,
            authProvider: admin.authProvider,
        });

        // 2. Create Regular User
        const userEmail = `user.${Date.now()}@example.com`;
        const user = await prisma.user.create({
            data: {
                email: userEmail,
                passwordHash: 'hashed_pwd_placeholder',
                role: UserRole.CUSTOMER,
                isVerified: true,
                displayName: 'Regular User',
                authProvider: 'local',
            },
        });
        userToken = generateAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role,
            authProvider: user.authProvider,
        });

        // 3. Create an EventType for linking tests
        const et = await prisma.eventType.create({
            data: {
                name: `Test Event ${Date.now()}`,
                slug: `test-event-${Date.now()}`,
            },
        });
        eventTypeId = et.id;

        // 4. Generate CSRF token
        csrfToken = generateCsrfToken();
    });

    afterAll(async () => {
        // Cleanup strictly in order to respect FKs
        await prisma.eventTypeServiceCategory.deleteMany();
        await prisma.service.deleteMany();
        await prisma.serviceCategory.deleteMany();
        await prisma.vendorProfile.deleteMany(); // Delete vendor profiles before users
        await prisma.eventType.deleteMany();
        await prisma.user.deleteMany();
        await prisma.$disconnect();
    });

    // ──────────────────────────────────────────────
    // 1. AUTH GUARD TESTS
    // ──────────────────────────────────────────────
    describe('Public Access (GET routes)', () => {
        it('GET / → 200 without any auth token (public)', async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data.serviceCategories)).toBe(true);
        });

        it('GET /:id → 200 without any auth token (public)', async () => {
            // Create a category first so we have an ID to query
            const createRes = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'Public View Test Category' });
            const id = createRes.body.data.serviceCategory.id;

            const res = await request(app).get(`${BASE}/${id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.serviceCategory.name).toBe('Public View Test Category');
        });
    });

    describe('Auth Guard (mutation routes)', () => {
        it('POST / → 401 if no token provided', async () => {
            const res = await request(app)
                .post(BASE)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'No Auth Category' });
            expect(res.status).toBe(401);
        });

        it('POST / → 403 if user is not ADMIN', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${userToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'Customer Category' });
            expect(res.status).toBe(403);
        });

        it('should return 403 if CSRF header missing on mutation', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'CSRF Test' });
            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/CSRF/);
        });
    });

    // ──────────────────────────────────────────────
    // 2. CREATE (POST)
    // ──────────────────────────────────────────────
    describe('POST /', () => {
        it('should create a service category successfully', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    name: 'Test Category',
                    imageUrl: 'https://example.com/image.jpg',
                });

            expect(res.status).toBe(201);
            expect(res.body.status).toBe('success');
            expect(res.body.data.serviceCategory).toMatchObject({
                name: 'Test Category',
                slug: 'test-category',
                imageUrl: 'https://example.com/image.jpg',
            });

            categoryId = res.body.data.serviceCategory.id;
        });

        it('should fail if name is duplicate', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'Test Category' }); // Same name as above

            expect(res.status).toBe(409);
        });

        it('should fail with invalid input (name too short)', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'A' });

            expect(res.status).toBe(400);
        });

        it('should fail with empty name', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: '' });

            expect(res.status).toBe(400);
        });

        it('should fail with missing body', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({});

            expect(res.status).toBe(400);
        });

        it('should fail with invalid imageUrl', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'Bad Image', imageUrl: 'not-a-url' });

            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 3. READ (GET)
    // ──────────────────────────────────────────────
    describe('GET /', () => {
        beforeAll(async () => {
            // Create another category linked to event type
            const linked = await prisma.serviceCategory.create({
                data: {
                    name: 'Linked Category',
                    slug: 'linked-category',
                },
            });
            // Manual link
            await prisma.eventTypeServiceCategory.create({
                data: {
                    eventTypeId,
                    serviceCategoryId: linked.id,
                },
            });
        });

        it('should list all categories (paginated)', async () => {
            const res = await request(app)
                .get(BASE)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data.serviceCategories)).toBe(true);
            expect(res.body.meta).toBeDefined();
            expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
        });

        it('should filter by search term', async () => {
            const res = await request(app)
                .get(`${BASE}?search=Test`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            const names = res.body.data.serviceCategories.map((c: any) => c.name);
            expect(names).toContain('Test Category');
            expect(names).not.toContain('Linked Category');
        });

        it('should filter by eventTypeId', async () => {
            const res = await request(app)
                .get(`${BASE}?eventTypeId=${eventTypeId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            const names = res.body.data.serviceCategories.map((c: any) => c.name);
            expect(names).toContain('Linked Category');
            expect(names).not.toContain('Test Category'); // Not linked
        });

        it('should respect pagination params (page & limit)', async () => {
            const res = await request(app)
                .get(`${BASE}?page=1&limit=1`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.serviceCategories.length).toBeLessThanOrEqual(1);
            expect(res.body.meta.page).toBe(1);
            expect(res.body.meta.limit).toBe(1);
        });

        it('should sort by name descending', async () => {
            const res = await request(app)
                .get(`${BASE}?sortBy=name&order=desc`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            const names: string[] = res.body.data.serviceCategories.map((c: any) => c.name);
            for (let i = 1; i < names.length; i++) {
                expect(names[i - 1].localeCompare(names[i])).toBeGreaterThanOrEqual(0);
            }
        });
    });

    describe('GET /:id', () => {
        it('should get a single category', async () => {
            const res = await request(app)
                .get(`${BASE}/${categoryId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.serviceCategory.id).toBe(categoryId);
        });

        it('should return 400 for invalid ID param', async () => {
            const res = await request(app)
                .get(`${BASE}/notanumber`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(400);
        });

        it('should return 404 for non-existent ID', async () => {
            const res = await request(app)
                .get(`${BASE}/999999`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 4. UPDATE (PATCH)
    // ──────────────────────────────────────────────
    describe('PATCH /:id', () => {
        it('should update name and slug', async () => {
            const res = await request(app)
                .patch(`${BASE}/${categoryId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'Updated Category' });

            expect(res.status).toBe(200);
            expect(res.body.data.serviceCategory.name).toBe('Updated Category');
            expect(res.body.data.serviceCategory.slug).toBe('updated-category');
        });

        it('should update imageUrl alone', async () => {
            const res = await request(app)
                .patch(`${BASE}/${categoryId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ imageUrl: 'https://cdn.example.com/new.jpg' });

            expect(res.status).toBe(200);
            expect(res.body.data.serviceCategory.imageUrl).toBe('https://cdn.example.com/new.jpg');
        });

        it('should clear imageUrl (set null)', async () => {
            const res = await request(app)
                .patch(`${BASE}/${categoryId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ imageUrl: null });

            expect(res.status).toBe(200);
            expect(res.body.data.serviceCategory.imageUrl).toBeNull();
        });

        it('should update both name and imageUrl', async () => {
            const res = await request(app)
                .patch(`${BASE}/${categoryId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'Both Updated', imageUrl: 'https://cdn.example.com/both.jpg' });

            expect(res.status).toBe(200);
            expect(res.body.data.serviceCategory.name).toBe('Both Updated');
            expect(res.body.data.serviceCategory.imageUrl).toBe('https://cdn.example.com/both.jpg');
        });

        it('should reject empty body (400)', async () => {
            const res = await request(app)
                .patch(`${BASE}/${categoryId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({});

            expect(res.status).toBe(400);
        });

        it('should return 404 for non-existent category', async () => {
            const res = await request(app)
                .patch(`${BASE}/999999`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'Ghost Update' });

            expect(res.status).toBe(404);
        });

        it('should return 409 if renaming to duplicate name', async () => {
            // Create a dummy category to conflict with
            await prisma.serviceCategory.create({
                data: { name: 'Conflict Cat', slug: 'conflict-cat' },
            });

            const res = await request(app)
                .patch(`${BASE}/${categoryId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'Conflict Cat' });

            expect(res.status).toBe(409);
        });
    });

    // ──────────────────────────────────────────────
    // 5. DELETE (DELETE)
    // ──────────────────────────────────────────────
    describe('DELETE /:id', () => {
        it('should fail (409) if linked services exist', async () => {
            // 1. Create a category
            const cat = await prisma.serviceCategory.create({
                data: { name: 'Service Guard Cat', slug: 'service-guard-cat' },
            });

            // 2. Create a dummy vendor profile (required for Service)
            const vendorUser = await prisma.user.create({
                data: {
                    email: `vendor.${Date.now()}@example.com`,
                    passwordHash: 'hashed_pwd_placeholder',
                    role: UserRole.VENDOR,
                    isVerified: true,
                    displayName: 'Vendor User',
                    authProvider: 'local',
                },
            });
            const vendorProfile = await prisma.vendorProfile.create({
                data: {
                    userId: vendorUser.id,
                    businessName: 'Vendor Biz',
                    city: 'Test City',
                    basePrice: 100.0,
                    serviceCategoryId: cat.id,
                },
            });

            // 3. Create a service linked to this category
            await prisma.service.create({
                data: {
                    name: 'Test Service',
                    price: 100,
                    vendorProfileId: vendorProfile.id,
                },
            });

            // 4. Try to delete category
            const res = await request(app)
                .delete(`${BASE}/${cat.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/Cannot delete/);
        });

        it('should delete successfully if no services exist (cascade bridge)', async () => {
            // The main 'categoryId' has no services linked
            const res = await request(app)
                .delete(`${BASE}/${categoryId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(204);

            // Verify db
            const check = await prisma.serviceCategory.findUnique({
                where: { id: categoryId },
            });
            expect(check).toBeNull();
        });

        it('should return 404 for already deleted ID', async () => {
            const res = await request(app)
                .delete(`${BASE}/${categoryId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(404);
        });

        it('should return 404 for non-existent ID', async () => {
            const res = await request(app)
                .delete(`${BASE}/999999`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(404);
        });
    });
});
