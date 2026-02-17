import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { generateAccessToken, generateCsrfToken } from '../../../utils/token';

/**
 * End-to-End Tests for the EventType API
 *
 * Routes under test:
 *   GET    /api/v1/event-types              → getAll (list)       [Public]
 *   GET    /api/v1/event-types/:id          → getOne              [Public]
 *   POST   /api/v1/event-types              → create              [Admin]
 *   PATCH  /api/v1/event-types/:id          → update              [Admin]
 *   DELETE /api/v1/event-types/:id          → remove              [Admin]
 *   PUT    /api/v1/event-types/:id/categories → syncCategories    [Admin]
 */
describe('EventType API – E2E', () => {
    const BASE = '/api/v1/event-types';

    // Auth tokens
    let adminToken: string;
    let userToken: string;
    let csrfToken: string;

    // Test data IDs
    let categoryIds: number[] = [];
    let createdEventId: number;

    // ──────────────────────────────────────────────
    // SETUP & TEARDOWN
    // ──────────────────────────────────────────────

    beforeAll(async () => {
        // 1. Seed an ADMIN user
        const admin = await prisma.user.upsert({
            where: { email: 'et-admin@test.local' },
            update: { role: 'ADMIN' },
            create: {
                email: 'et-admin@test.local',
                passwordHash: 'hashed_pwd_placeholder',
                displayName: 'ET Admin',
                role: 'ADMIN',
                isVerified: true,
            },
        });

        // 2. Seed a regular CUSTOMER user
        const customer = await prisma.user.upsert({
            where: { email: 'et-customer@test.local' },
            update: { role: 'CUSTOMER' },
            create: {
                email: 'et-customer@test.local',
                passwordHash: 'hashed_pwd_placeholder',
                displayName: 'ET Customer',
                role: 'CUSTOMER',
                isVerified: true,
            },
        });

        // 3. Generate JWT tokens
        adminToken = generateAccessToken({
            userId: admin.id,
            email: admin.email,
            role: admin.role,
            authProvider: admin.authProvider,
        });
        userToken = generateAccessToken({
            userId: customer.id,
            email: customer.email,
            role: customer.role,
            authProvider: customer.authProvider,
        });

        // 4. Generate a valid CSRF token (needed for POST/PUT/PATCH/DELETE)
        csrfToken = generateCsrfToken();

        // 5. Seed ServiceCategories for sync-categories tests
        const cat1 = await prisma.serviceCategory.create({
            data: { name: 'ET Test Cat A', slug: 'et-test-cat-a' },
        });
        const cat2 = await prisma.serviceCategory.create({
            data: { name: 'ET Test Cat B', slug: 'et-test-cat-b' },
        });
        categoryIds = [cat1.id, cat2.id];
    });

    afterAll(async () => {
        // Clean up in correct order to avoid FK constraint issues
        await prisma.eventTypeServiceCategory.deleteMany({
            where: { serviceCategoryId: { in: categoryIds } },
        });
        await prisma.eventType.deleteMany({
            where: { name: { startsWith: 'ET Test' } },
        });
        await prisma.serviceCategory.deleteMany({
            where: { id: { in: categoryIds } },
        });
        await prisma.user.deleteMany({
            where: { email: { in: ['et-admin@test.local', 'et-customer@test.local'] } },
        });
        await prisma.$disconnect();
    });

    // ──────────────────────────────────────────────
    // 1. AUTHENTICATION & AUTHORIZATION
    // ──────────────────────────────────────────────

    describe('Public Access (GET routes)', () => {
        it('GET /  → 200 without any auth token (public)', async () => {
            const res = await request(app).get(BASE);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data.eventTypes)).toBe(true);
        });

        it('GET /:id → 200 without any auth token (public)', async () => {
            // First create one so we have an ID to query
            const createRes = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'ET Test Public View' });
            const id = createRes.body.data.eventType.id;

            const res = await request(app).get(`${BASE}/${id}`);
            expect(res.status).toBe(200);
            expect(res.body.data.eventType.name).toBe('ET Test Public View');
        });
    });

    describe('Auth Guard (mutation routes)', () => {
        it('POST / → 401 when no token provided', async () => {
            const res = await request(app)
                .post(BASE)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'No Auth Event' });
            expect(res.status).toBe(401);
        });

        it('POST / → 403 when caller is CUSTOMER', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${userToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'No Auth Event' });
            expect(res.status).toBe(403);
        });

        it('POST / → 403 when CSRF token is missing', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Missing CSRF' });
            expect(res.status).toBe(403);
        });
    });

    // ──────────────────────────────────────────────
    // 2. POST / – Create Event Type
    // ──────────────────────────────────────────────

    describe('POST / – Create', () => {
        it('should create a new event type (201)', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'ET Test Wedding' });

            expect(res.status).toBe(201);
            expect(res.body.data.eventType).toMatchObject({
                name: 'ET Test Wedding',
                slug: 'et-test-wedding',
            });
            expect(res.body.data.eventType).toHaveProperty('id');

            createdEventId = res.body.data.eventType.id;
        });

        it('should reject duplicate name (409)', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'ET Test Wedding' });

            expect(res.status).toBe(409);
        });

        it('should reject empty name (400)', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: '' });

            expect(res.status).toBe(400);
        });

        it('should reject name shorter than 2 chars (400)', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'X' });

            expect(res.status).toBe(400);
        });

        it('should reject missing body (400)', async () => {
            const res = await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({});

            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 3. GET / – List Event Types
    // ──────────────────────────────────────────────

    describe('GET / – List', () => {
        beforeAll(async () => {
            // Seed a second event type so list/search tests are meaningful
            await request(app)
                .post(BASE)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'ET Test Birthday' });
        });

        it('should list event types with default pagination (200)', async () => {
            const res = await request(app)
                .get(BASE)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data.eventTypes)).toBe(true);
            expect(res.body.meta).toMatchObject({
                page: 1,
                limit: 10,
            });
            expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
        });

        it('should filter by search term', async () => {
            const res = await request(app)
                .get(BASE)
                .query({ search: 'Wedding' })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.eventTypes.length).toBe(1);
            expect(res.body.data.eventTypes[0].name).toBe('ET Test Wedding');
        });

        it('should respect pagination (page & limit)', async () => {
            const res = await request(app)
                .get(BASE)
                .query({ page: 1, limit: 1, sortBy: 'name', order: 'asc' })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.eventTypes.length).toBeLessThanOrEqual(1);
            expect(res.body.meta.page).toBe(1);
            expect(res.body.meta.limit).toBe(1);
        });

        it('should sort by name descending', async () => {
            const res = await request(app)
                .get(BASE)
                .query({ sortBy: 'name', order: 'desc', search: 'ET Test' })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            const names: string[] = res.body.data.eventTypes.map((e: any) => e.name);
            // Verify descending alphabetical
            for (let i = 1; i < names.length; i++) {
                expect(names[i - 1].localeCompare(names[i])).toBeGreaterThanOrEqual(0);
            }
        });
    });

    // ──────────────────────────────────────────────
    // 4. GET /:id – Get One
    // ──────────────────────────────────────────────

    describe('GET /:id – Get One', () => {
        it('should return a single event type by ID (200)', async () => {
            const res = await request(app)
                .get(`${BASE}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.eventType.id).toBe(createdEventId);
            expect(res.body.data.eventType).toHaveProperty('serviceCategories');
        });

        it('should return 404 for non-existent ID', async () => {
            const res = await request(app)
                .get(`${BASE}/999999`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
        });

        it('should return 400 for invalid ID param', async () => {
            const res = await request(app)
                .get(`${BASE}/notanumber`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 5. PATCH /:id – Update
    // ──────────────────────────────────────────────

    describe('PATCH /:id – Update', () => {
        it('should update the event type name (200)', async () => {
            const res = await request(app)
                .patch(`${BASE}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'ET Test Wedding Deluxe' });

            expect(res.status).toBe(200);
            expect(res.body.data.eventType.name).toBe('ET Test Wedding Deluxe');
            expect(res.body.data.eventType.slug).toBe('et-test-wedding-deluxe');
        });

        it('should update name and sync categories together (200)', async () => {
            const res = await request(app)
                .patch(`${BASE}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({
                    name: 'ET Test Wedding Premium',
                    serviceCategoryIds: categoryIds,
                });

            expect(res.status).toBe(200);
            expect(res.body.data.eventType.name).toBe('ET Test Wedding Premium');
            expect(res.body.data.eventType.serviceCategories).toHaveLength(2);
        });

        it('should reject update with no fields (400)', async () => {
            const res = await request(app)
                .patch(`${BASE}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({});

            expect(res.status).toBe(400);
        });

        it('should return 404 for non-existent event type', async () => {
            const res = await request(app)
                .patch(`${BASE}/999999`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'Ghost Update' });

            expect(res.status).toBe(404);
        });

        it('should reject duplicate name on update (409)', async () => {
            const res = await request(app)
                .patch(`${BASE}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ name: 'ET Test Birthday' }); // already exists

            expect(res.status).toBe(409);
        });

        it('should reject invalid category IDs on update (400)', async () => {
            const res = await request(app)
                .patch(`${BASE}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ serviceCategoryIds: [999888, 999777] });

            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 6. PUT /:id/categories – Sync Categories
    // ──────────────────────────────────────────────

    describe('PUT /:id/categories – Sync Categories', () => {
        it('should sync categories (full-replace) (200)', async () => {
            const res = await request(app)
                .put(`${BASE}/${createdEventId}/categories`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ serviceCategoryIds: [categoryIds[0]] });

            expect(res.status).toBe(200);
            expect(res.body.data.eventType.serviceCategories).toHaveLength(1);
            expect(
                res.body.data.eventType.serviceCategories[0].serviceCategory.id
            ).toBe(categoryIds[0]);
        });

        it('should sync to multiple categories (200)', async () => {
            const res = await request(app)
                .put(`${BASE}/${createdEventId}/categories`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ serviceCategoryIds: categoryIds });

            expect(res.status).toBe(200);
            expect(res.body.data.eventType.serviceCategories).toHaveLength(2);
        });

        it('should clear all categories with empty array (200)', async () => {
            const res = await request(app)
                .put(`${BASE}/${createdEventId}/categories`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ serviceCategoryIds: [] });

            expect(res.status).toBe(200);
            expect(res.body.data.eventType.serviceCategories).toHaveLength(0);
        });

        it('should return 404 for non-existent event type', async () => {
            const res = await request(app)
                .put(`${BASE}/999999/categories`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ serviceCategoryIds: categoryIds });

            expect(res.status).toBe(404);
        });

        it('should return 400 for invalid category IDs', async () => {
            const res = await request(app)
                .put(`${BASE}/${createdEventId}/categories`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ serviceCategoryIds: [999888] });

            expect(res.status).toBe(400);
        });

        it('should return 400 when serviceCategoryIds is missing', async () => {
            const res = await request(app)
                .put(`${BASE}/${createdEventId}/categories`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({});

            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 7. DELETE /:id – Remove
    // ──────────────────────────────────────────────

    describe('DELETE /:id – Remove', () => {
        it('should delete an event type (204)', async () => {
            const res = await request(app)
                .delete(`${BASE}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(204);
        });

        it('should confirm deletion – GET returns 404', async () => {
            const res = await request(app)
                .get(`${BASE}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
        });

        it('should return 404 when deleting already-deleted ID', async () => {
            const res = await request(app)
                .delete(`${BASE}/${createdEventId}`)
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
