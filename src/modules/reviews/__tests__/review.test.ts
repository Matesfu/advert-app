import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { generateAccessToken, generateCsrfToken } from '../../../utils/token';
import { UserRole } from '@prisma/client';

describe('Review API – E2E', () => {
    const BASE = '/api/v1/vendors';

    // ── Auth tokens ──
    let customerToken: string;
    let vendorOwnerToken: string;
    let competitorToken: string;
    let differentCatVendorToken: string;
    let adminToken: string;
    let csrfToken: string;

    // ── User IDs ──
    let customerUserId: number;
    let vendorOwnerUserId: number;
    let competitorUserId: number;
    let differentCatVendorUserId: number;
    let adminUserId: number;

    // ── Test data ──
    let serviceCategoryId: number;
    let otherServiceCategoryId: number;
    let vendorProfileId: number;
    let reviewId: number;

    // ──────────────────────────────────────────────
    // SETUP & TEARDOWN
    // ──────────────────────────────────────────────

    beforeAll(async () => {
        const ts = Date.now();

        // 1. CUSTOMER user (writes reviews)
        const customer = await prisma.user.create({
            data: {
                email: `rev.customer.${ts}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.CUSTOMER,
                isVerified: true,
                displayName: 'Review Customer',
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

        // 2. VENDOR OWNER (owns the profile being reviewed)
        const vendorOwner = await prisma.user.create({
            data: {
                email: `rev.vendor.${ts}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.VENDOR,
                isVerified: true,
                displayName: 'Vendor Owner',
                authProvider: 'local',
            },
        });
        vendorOwnerUserId = vendorOwner.id;
        vendorOwnerToken = generateAccessToken({
            userId: vendorOwner.id,
            email: vendorOwner.email,
            role: vendorOwner.role,
            authProvider: vendorOwner.authProvider,
        });

        // 3. COMPETITOR (same category vendor — should be blocked)
        const competitor = await prisma.user.create({
            data: {
                email: `rev.competitor.${ts}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.VENDOR,
                isVerified: true,
                displayName: 'Competitor Vendor',
                authProvider: 'local',
            },
        });
        competitorUserId = competitor.id;
        competitorToken = generateAccessToken({
            userId: competitor.id,
            email: competitor.email,
            role: competitor.role,
            authProvider: competitor.authProvider,
        });

        // 4. DIFFERENT CATEGORY VENDOR (should be allowed to review)
        const diffCatVendor = await prisma.user.create({
            data: {
                email: `rev.diffcat.${ts}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.VENDOR,
                isVerified: true,
                displayName: 'Different Cat Vendor',
                authProvider: 'local',
            },
        });
        differentCatVendorUserId = diffCatVendor.id;
        differentCatVendorToken = generateAccessToken({
            userId: diffCatVendor.id,
            email: diffCatVendor.email,
            role: diffCatVendor.role,
            authProvider: diffCatVendor.authProvider,
        });

        // 5. ADMIN user
        const admin = await prisma.user.create({
            data: {
                email: `rev.admin.${ts}@test.com`,
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

        // 6. Service categories
        const cat = await prisma.serviceCategory.create({
            data: { name: `Review Cat ${ts}`, slug: `review-cat-${ts}` },
        });
        serviceCategoryId = cat.id;

        const otherCat = await prisma.serviceCategory.create({
            data: { name: `Other Cat ${ts}`, slug: `other-cat-${ts}` },
        });
        otherServiceCategoryId = otherCat.id;

        // 7. Vendor profile (owned by vendorOwner, in serviceCategoryId)
        const profile = await prisma.vendorProfile.create({
            data: {
                businessName: 'Review Test Business',
                city: 'Addis Ababa',
                basePrice: 500,
                userId: vendorOwnerUserId,
                serviceCategoryId,
            },
        });
        vendorProfileId = profile.id;

        // 8. Competitor vendor profile (same category)
        await prisma.vendorProfile.create({
            data: {
                businessName: 'Competitor Business',
                city: 'Hawassa',
                basePrice: 300,
                userId: competitorUserId,
                serviceCategoryId, // SAME category
            },
        });

        // 9. Different category vendor profile
        await prisma.vendorProfile.create({
            data: {
                businessName: 'Photography Business',
                city: 'Bahir Dar',
                basePrice: 400,
                userId: differentCatVendorUserId,
                serviceCategoryId: otherServiceCategoryId, // DIFFERENT category
            },
        });

        // 10. CSRF token
        csrfToken = generateCsrfToken();
    });

    afterAll(async () => {
        // Cleanup in FK order
        await prisma.review.deleteMany({
            where: { vendorProfileId },
        });
        await prisma.vendorProfile.deleteMany({
            where: {
                userId: {
                    in: [vendorOwnerUserId, competitorUserId, differentCatVendorUserId],
                },
            },
        });
        await prisma.serviceCategory.deleteMany({
            where: { id: { in: [serviceCategoryId, otherServiceCategoryId] } },
        });
        await prisma.user.deleteMany({
            where: {
                id: {
                    in: [
                        customerUserId,
                        vendorOwnerUserId,
                        competitorUserId,
                        differentCatVendorUserId,
                        adminUserId,
                    ],
                },
            },
        });
        await prisma.$disconnect();
    });

    // ──────────────────────────────────────────────
    // 1. AUTHENTICATION & CSRF
    // ──────────────────────────────────────────────
    describe('Authentication & CSRF', () => {
        it('GET reviews → 200 without auth (public)', async () => {
            const res = await request(app).get(`${BASE}/${vendorProfileId}/reviews`);
            expect(res.status).toBe(200);
        });

        it('POST review → 401 without auth', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/reviews`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 5, comment: 'Great!' });
            expect(res.status).toBe(401);
        });

        it('POST review → 403 without CSRF', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/reviews`)
                .set('Authorization', `Bearer ${customerToken}`)
                .send({ rating: 5, comment: 'Great!' });
            expect(res.status).toBe(403);
        });
    });

    // ──────────────────────────────────────────────
    // 2. CREATE REVIEW
    // ──────────────────────────────────────────────
    describe('Create Review (POST /:vendorId/reviews)', () => {
        it('should create a review → 201', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/reviews`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 5, comment: 'Amazing service, highly recommend!' });

            expect(res.status).toBe(201);
            expect(res.body.status).toBe('success');
            expect(res.body.data.review).toBeDefined();
            expect(res.body.data.review.rating).toBe(5);
            expect(res.body.data.review.comment).toBe('Amazing service, highly recommend!');
            expect(res.body.data.review.vendorProfileId).toBe(vendorProfileId);
            expect(res.body.data.review.user.displayName).toBe('Review Customer');
            reviewId = res.body.data.review.id;
        });

        it('should reject duplicate review → 409', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/reviews`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 3, comment: 'Second review' });

            expect(res.status).toBe(409);
            expect(res.body.message).toMatch(/already reviewed/i);
        });

        it('should block self-review → 403', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/reviews`)
                .set('Authorization', `Bearer ${vendorOwnerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 5, comment: 'I am great!' });

            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/your own/i);
        });

        it('should block same-category competitor → 403', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/reviews`)
                .set('Authorization', `Bearer ${competitorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 1, comment: 'Terrible' });

            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/same service category/i);
        });

        it('should allow different-category vendor to review → 201', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/reviews`)
                .set('Authorization', `Bearer ${differentCatVendorToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 4, comment: 'Good service from a different category vendor' });

            expect(res.status).toBe(201);
            expect(res.body.data.review.rating).toBe(4);
        });

        it('should reject review on soft-deleted vendor → 404', async () => {
            await prisma.vendorProfile.update({
                where: { id: vendorProfileId },
                data: { deletedAt: new Date() },
            });

            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/reviews`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 3, comment: 'Ghost vendor' });

            expect(res.status).toBe(404);

            // Restore
            await prisma.vendorProfile.update({
                where: { id: vendorProfileId },
                data: { deletedAt: null },
            });
        });

        it('should reject invalid rating → 400', async () => {
            const res = await request(app)
                .post(`${BASE}/${vendorProfileId}/reviews`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 6, comment: 'Too high' });

            expect(res.status).toBe(400);
        });

        it('should reject non-existent vendor → 404', async () => {
            const res = await request(app)
                .post(`${BASE}/999999/reviews`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 5 });

            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 3. LIST REVIEWS
    // ──────────────────────────────────────────────
    describe('List Reviews (GET /:vendorId/reviews)', () => {
        it('should return paginated reviews with aggregate stats', async () => {
            const res = await request(app).get(`${BASE}/${vendorProfileId}/reviews`);

            expect(res.status).toBe(200);
            expect(res.body.data.reviews).toBeDefined();
            expect(Array.isArray(res.body.data.reviews)).toBe(true);
            expect(res.body.data.reviews.length).toBeGreaterThanOrEqual(2);
            expect(typeof res.body.data.averageRating).toBe('number');
            expect(typeof res.body.data.reviewCount).toBe('number');
            expect(res.body.meta.page).toBe(1);
            expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
        });

        it('should sort by newest (default)', async () => {
            const res = await request(app)
                .get(`${BASE}/${vendorProfileId}/reviews?sortBy=newest`);

            expect(res.status).toBe(200);
            const reviews = res.body.data.reviews;
            for (let i = 1; i < reviews.length; i++) {
                expect(new Date(reviews[i].createdAt).getTime())
                    .toBeLessThanOrEqual(new Date(reviews[i - 1].createdAt).getTime());
            }
        });

        it('should sort by lowest rating', async () => {
            const res = await request(app)
                .get(`${BASE}/${vendorProfileId}/reviews?sortBy=lowest`);

            expect(res.status).toBe(200);
            const reviews = res.body.data.reviews;
            for (let i = 1; i < reviews.length; i++) {
                expect(reviews[i].rating).toBeGreaterThanOrEqual(reviews[i - 1].rating);
            }
        });

        it('should include reviewer info', async () => {
            const res = await request(app).get(`${BASE}/${vendorProfileId}/reviews`);

            const reviews = res.body.data.reviews;
            for (const review of reviews) {
                expect(review.user).toBeDefined();
                expect(review.user.displayName).toBeDefined();
            }
        });

        it('should show "Deleted User" for soft-deleted reviewer', async () => {
            // Soft-delete the customer
            await prisma.user.update({
                where: { id: customerUserId },
                data: { deletedAt: new Date() },
            });

            const res = await request(app).get(`${BASE}/${vendorProfileId}/reviews`);

            const customerReview = res.body.data.reviews.find(
                (r: any) => r.userId === customerUserId
            );
            expect(customerReview.user.displayName).toBe('Deleted User');

            // Restore
            await prisma.user.update({
                where: { id: customerUserId },
                data: { deletedAt: null },
            });
        });

        it('should paginate correctly', async () => {
            const res = await request(app)
                .get(`${BASE}/${vendorProfileId}/reviews?page=1&limit=1`);

            expect(res.status).toBe(200);
            expect(res.body.data.reviews.length).toBe(1);
            expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
            expect(res.body.meta.totalPages).toBeGreaterThanOrEqual(2);
        });

        it('should return 404 for non-existent vendor', async () => {
            const res = await request(app).get(`${BASE}/999999/reviews`);
            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 4. UPDATE REVIEW
    // ──────────────────────────────────────────────
    describe('Update Review (PATCH /:vendorId/reviews/:reviewId)', () => {
        it('owner should update their review → 200', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}/reviews/${reviewId}`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 4, comment: 'Updated: still good but lowering to 4' });

            expect(res.status).toBe(200);
            expect(res.body.data.review.rating).toBe(4);
            expect(res.body.data.review.comment).toBe('Updated: still good but lowering to 4');
        });

        it('should allow partial update (only comment)', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}/reviews/${reviewId}`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ comment: 'Only updating the comment' });

            expect(res.status).toBe(200);
            expect(res.body.data.review.comment).toBe('Only updating the comment');
            expect(res.body.data.review.rating).toBe(4); // unchanged
        });

        it('non-owner should be blocked → 403', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}/reviews/${reviewId}`)
                .set('Authorization', `Bearer ${vendorOwnerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 1 });

            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/your own/i);
        });

        it('should reject empty update body → 400', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}/reviews/${reviewId}`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({});

            expect(res.status).toBe(400);
        });

        it('should return 404 for non-existent review', async () => {
            const res = await request(app)
                .patch(`${BASE}/${vendorProfileId}/reviews/999999`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 3 });

            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 5. DELETE REVIEW
    // ──────────────────────────────────────────────
    describe('Delete Review (DELETE /:vendorId/reviews/:reviewId)', () => {
        it('non-owner non-admin should be blocked → 403', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}/reviews/${reviewId}`)
                .set('Authorization', `Bearer ${vendorOwnerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(403);
        });

        it('owner should delete their review → 204', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}/reviews/${reviewId}`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(204);
        });

        it('ADMIN should delete any review → 204', async () => {
            // Create a review by differentCatVendor to be deleted by admin
            // (differentCatVendor already has one, so we use admin to create a new one)
            const adminReview = await prisma.review.create({
                data: {
                    rating: 2,
                    comment: 'Admin will delete this',
                    userId: adminUserId,
                    vendorProfileId,
                },
            });

            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}/reviews/${adminReview.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(204);
        });

        it('should return 404 for non-existent review', async () => {
            const res = await request(app)
                .delete(`${BASE}/${vendorProfileId}/reviews/999999`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 6. STATS RECALCULATION
    // ──────────────────────────────────────────────
    describe('Stats Recalculation', () => {
        it('should update averageRating and reviewCount on create', async () => {
            // Clean slate: delete all reviews for this vendor
            await prisma.review.deleteMany({ where: { vendorProfileId } });

            // Create a fresh review
            await request(app)
                .post(`${BASE}/${vendorProfileId}/reviews`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 5, comment: 'Stats test' });

            const vendor = await prisma.vendorProfile.findUnique({
                where: { id: vendorProfileId },
                select: { averageRating: true, reviewCount: true },
            });

            expect(vendor!.averageRating).toBe(5);
            expect(vendor!.reviewCount).toBe(1);
        });

        it('should recalculate after update', async () => {
            const review = await prisma.review.findFirst({
                where: { vendorProfileId, userId: customerUserId },
            });

            await request(app)
                .patch(`${BASE}/${vendorProfileId}/reviews/${review!.id}`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ rating: 3 });

            const vendor = await prisma.vendorProfile.findUnique({
                where: { id: vendorProfileId },
                select: { averageRating: true, reviewCount: true },
            });

            expect(vendor!.averageRating).toBe(3);
            expect(vendor!.reviewCount).toBe(1);
        });

        it('should recalculate after delete', async () => {
            const review = await prisma.review.findFirst({
                where: { vendorProfileId, userId: customerUserId },
            });

            await request(app)
                .delete(`${BASE}/${vendorProfileId}/reviews/${review!.id}`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            const vendor = await prisma.vendorProfile.findUnique({
                where: { id: vendorProfileId },
                select: { averageRating: true, reviewCount: true },
            });

            expect(vendor!.averageRating).toBe(0);
            expect(vendor!.reviewCount).toBe(0);
        });
    });
});
