import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { generateAccessToken } from '../../../utils/token';
import { UserRole } from '@prisma/client';

describe('EventType Admin API', () => {
    let adminToken: string;
    let userToken: string;

    let categoryIds: number[] = [];

    beforeAll(async () => {
        // Create a mock admin user URL-safe
        const adminUser = await prisma.user.upsert({
            where: { email: 'admin-test@example.com' },
            update: { role: 'ADMIN' as any },
            create: {
                email: 'admin-test@example.com',
                passwordHash: 'hashedpassword123',
                displayName: 'Admin Test',
                role: 'ADMIN' as any,
                isVerified: true,
            },
        });

        // Create a regular user
        const regularUser = await prisma.user.upsert({
            where: { email: 'user-test@example.com' },
            update: { role: 'USER' as any },
            create: {
                email: 'user-test@example.com',
                passwordHash: 'hashedpassword123',
                displayName: 'User Test',
                role: 'USER' as any,
                isVerified: true,
            },
        });

        adminToken = generateAccessToken({
            userId: adminUser.id,
            email: adminUser.email,
            role: adminUser.role,
            authProvider: adminUser.authProvider,
        });
        userToken = generateAccessToken({
            userId: regularUser.id,
            email: regularUser.email,
            role: regularUser.role,
            authProvider: regularUser.authProvider,
        });

        // Create test ServiceCategories
        const cat1 = await prisma.serviceCategory.create({
            data: { name: 'Test Cat 1', slug: 'test-cat-1' },
        });
        const cat2 = await prisma.serviceCategory.create({
            data: { name: 'Test Cat 2', slug: 'test-cat-2' },
        });
        categoryIds = [cat1.id, cat2.id];
    });

    afterAll(async () => {
        // Cleanup created data
        await prisma.eventType.deleteMany({
            where: { name: { contains: 'Test Event' } },
        });
        await prisma.serviceCategory.deleteMany({
            where: { id: { in: categoryIds } },
        });
        await prisma.user.deleteMany({
            where: { email: { in: ['admin-test@example.com', 'user-test@example.com'] } },
        });
        await prisma.$disconnect();
    });

    const baseUrl = '/api/v1/admin/event-types';
    let createdEventId: number;

    // ============================================
    // AUTHENTICATION TESTS
    // ============================================

    describe('Authentication & Authorization', () => {
        it('should return 401 if no token is provided', async () => {
            const res = await request(app).get(baseUrl);
            expect(res.status).toBe(401);
        });

        it('should return 403 if user is not ADMIN', async () => {
            const res = await request(app)
                .get(baseUrl)
                .set('Authorization', `Bearer ${userToken}`);
            expect(res.status).toBe(403);
        });
    });

    // ============================================
    // CRUD TESTS
    // ============================================

    describe('CRUD Operations', () => {
        it('should create a new event type', async () => {
            const res = await request(app)
                .post(baseUrl)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Test Event 2024' });

            expect(res.status).toBe(201);
            expect(res.body.data.eventType).toHaveProperty('id');
            expect(res.body.data.eventType.name).toBe('Test Event 2024');
            expect(res.body.data.eventType.slug).toBe('test-event-2024');

            createdEventId = res.body.data.eventType.id;
        });

        it('should return 400 for invalid input (empty name)', async () => {
            const res = await request(app)
                .post(baseUrl)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: '' });

            expect(res.status).toBe(400);
        });

        it('should return 400 for invalid input (name too short)', async () => {
            const res = await request(app)
                .post(baseUrl)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'A' });

            expect(res.status).toBe(400);
        });

        it('should prevent duplicate names', async () => {
            const res = await request(app)
                .post(baseUrl)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Test Event 2024' });

            expect(res.status).toBe(409);
        });

        it('should list event types with pagination and search', async () => {
            // Create another one to test search
            await request(app)
                .post(baseUrl)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Other Event' });

            const res = await request(app)
                .get(baseUrl)
                .query({ search: '2024', limit: 5 })
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(Array.isArray(res.body.data.eventTypes)).toBe(true);
            // Should find only the one with '2024'
            expect(res.body.data.eventTypes.length).toBe(1);
            expect(res.body.data.eventTypes[0].name).toBe('Test Event 2024');
            expect(res.body.meta.total).toBe(1);
        });

        it('should get a single event type by ID', async () => {
            const res = await request(app)
                .get(`${baseUrl}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.eventType.id).toBe(createdEventId);
        });

        it('should return 404 for non-existent ID', async () => {
            const res = await request(app)
                .get(`${baseUrl}/999999`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
        });

        it('should update event type name', async () => {
            const res = await request(app)
                .patch(`${baseUrl}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ name: 'Test Event Updated' });

            expect(res.status).toBe(200);
            expect(res.body.data.eventType.name).toBe('Test Event Updated');
            expect(res.body.data.eventType.slug).toBe('test-event-updated');
        });

        it('should sync service categories', async () => {
            const res = await request(app)
                .put(`${baseUrl}/${createdEventId}/categories`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ serviceCategoryIds: categoryIds });

            expect(res.status).toBe(200);
            expect(res.body.data.eventType.serviceCategories).toHaveLength(2);

            // Verify they are actually linked by fetching again
            const getRes = await request(app)
                .get(`${baseUrl}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(getRes.body.data.eventType.serviceCategories).toHaveLength(2);
            expect(getRes.body.data.eventType.serviceCategories[0].serviceCategory).toHaveProperty('id');
        });

        it('should clear service categories (empty list)', async () => {
            const res = await request(app)
                .put(`${baseUrl}/${createdEventId}/categories`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ serviceCategoryIds: [] });

            expect(res.status).toBe(200);
            expect(res.body.data.eventType.serviceCategories).toHaveLength(0);
        });

        it('should delete the event type', async () => {
            const res = await request(app)
                .delete(`${baseUrl}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(204);

            // Verify it's gone
            const check = await request(app)
                .get(`${baseUrl}/${createdEventId}`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(check.status).toBe(404);
        });

        it('should return 404 when deleting non-existent event type', async () => {
            const res = await request(app)
                .delete(`${baseUrl}/999999`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(404);
        });
    });
});
