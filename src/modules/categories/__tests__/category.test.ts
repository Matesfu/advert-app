import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';

/**
 * E2E Tests for the Public Category Browsing API
 *
 * Endpoint tested:
 *   GET /api/v1/categories/event-types/:slug  → getEventTypeBySlug
 */
describe('Category Browsing API – E2E', () => {
    const BASE = '/api/v1/categories';

    // Test data
    let eventTypeSlug: string;
    let eventTypeId: number;
    let categoryId1: number;
    let categoryId2: number;

    // ──────────────────────────────────────────────
    // SETUP & TEARDOWN
    // ──────────────────────────────────────────────

    beforeAll(async () => {
        // 1. Create an EventType
        const eventType = await prisma.eventType.create({
            data: { name: 'Browse Test Wedding', slug: 'browse-test-wedding' },
        });
        eventTypeId = eventType.id;
        eventTypeSlug = eventType.slug;

        // 2. Create two ServiceCategories
        const cat1 = await prisma.serviceCategory.create({
            data: {
                name: 'Browse Test DJ',
                slug: 'browse-test-dj',
                imageUrl: 'https://example.com/dj.jpg',
            },
        });
        const cat2 = await prisma.serviceCategory.create({
            data: {
                name: 'Browse Test Photographer',
                slug: 'browse-test-photographer',
                imageUrl: null,
            },
        });
        categoryId1 = cat1.id;
        categoryId2 = cat2.id;

        // 3. Link them via bridge table
        await prisma.eventTypeServiceCategory.createMany({
            data: [
                { eventTypeId: eventTypeId, serviceCategoryId: categoryId1 },
                { eventTypeId: eventTypeId, serviceCategoryId: categoryId2 },
            ],
        });
    });

    afterAll(async () => {
        // Clean up in FK-safe order
        await prisma.eventTypeServiceCategory.deleteMany({
            where: { eventTypeId },
        });
        await prisma.serviceCategory.deleteMany({
            where: { id: { in: [categoryId1, categoryId2] } },
        });
        await prisma.eventType.deleteMany({
            where: { id: eventTypeId },
        });
        await prisma.$disconnect();
    });

    // ──────────────────────────────────────────────
    // GET /api/v1/categories/event-types/:slug
    // ──────────────────────────────────────────────

    describe('GET /event-types/:slug', () => {
        it('should return 200 without any auth token (public)', async () => {
            const res = await request(app).get(
                `${BASE}/event-types/${eventTypeSlug}`
            );
            expect(res.status).toBe(200);
        });

        it('should return the event type with its linked service categories', async () => {
            const res = await request(app).get(
                `${BASE}/event-types/${eventTypeSlug}`
            );

            expect(res.status).toBe(200);
            const { eventType } = res.body.data;

            // Event type fields
            expect(eventType.id).toBe(eventTypeId);
            expect(eventType.name).toBe('Browse Test Wedding');
            expect(eventType.slug).toBe('browse-test-wedding');

            // Service categories (flattened, not bridge table shape)
            expect(eventType.serviceCategories).toHaveLength(2);

            const names = eventType.serviceCategories.map(
                (c: { name: string }) => c.name
            );
            expect(names).toContain('Browse Test DJ');
            expect(names).toContain('Browse Test Photographer');
        });

        it('should include imageUrl and vendorCount per category', async () => {
            const res = await request(app).get(
                `${BASE}/event-types/${eventTypeSlug}`
            );

            expect(res.status).toBe(200);
            const categories = res.body.data.eventType.serviceCategories;

            for (const cat of categories) {
                // Every category must have these fields
                expect(cat).toHaveProperty('id');
                expect(cat).toHaveProperty('name');
                expect(cat).toHaveProperty('slug');
                expect(cat).toHaveProperty('imageUrl');
                expect(cat).toHaveProperty('vendorCount');
                expect(typeof cat.vendorCount).toBe('number');
            }

            // Check the specific imageUrl values
            const dj = categories.find(
                (c: { name: string }) => c.name === 'Browse Test DJ'
            );
            expect(dj.imageUrl).toBe('https://example.com/dj.jpg');

            const photographer = categories.find(
                (c: { name: string }) => c.name === 'Browse Test Photographer'
            );
            expect(photographer.imageUrl).toBeNull();
        });

        it('should return 404 for a non-existent slug', async () => {
            const res = await request(app).get(
                `${BASE}/event-types/this-slug-does-not-exist`
            );
            expect(res.status).toBe(404);
        });
    });
});
