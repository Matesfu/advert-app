import request from 'supertest';
import app from '../../../app';
import { prisma } from '../../../config/prisma';
import { generateAccessToken, generateCsrfToken } from '../../../utils/token';
import { UserRole } from '@prisma/client';

describe('Messaging API – E2E', () => {
    const BASE = '/api/v1/messages';

    // ── Auth tokens ──
    let customerToken: string;
    let vendorOwnerToken: string;
    let outsiderToken: string;
    let csrfToken: string;

    // ── User IDs ──
    let customerUserId: number;
    let vendorOwnerUserId: number;
    let outsiderUserId: number;

    // ── Test data ──
    let serviceCategoryId: number;
    let vendorProfileId: number;
    let conversationId: number;

    // ──────────────────────────────────────────────
    // SETUP & TEARDOWN
    // ──────────────────────────────────────────────

    beforeAll(async () => {
        // 1. Create CUSTOMER user (starts conversations)
        const customer = await prisma.user.create({
            data: {
                email: `msg.customer.${Date.now()}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.CUSTOMER,
                isVerified: true,
                displayName: 'Chat Customer',
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
        const vendorOwner = await prisma.user.create({
            data: {
                email: `msg.vendor.${Date.now()}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.VENDOR,
                isVerified: true,
                displayName: 'Chat Vendor Owner',
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

        // 3. Create OUTSIDER user (not a participant — for access control tests)
        const outsider = await prisma.user.create({
            data: {
                email: `msg.outsider.${Date.now()}@test.com`,
                passwordHash: 'hashed_pwd',
                role: UserRole.CUSTOMER,
                isVerified: true,
                displayName: 'Outsider User',
                authProvider: 'local',
            },
        });
        outsiderUserId = outsider.id;
        outsiderToken = generateAccessToken({
            userId: outsider.id,
            email: outsider.email,
            role: outsider.role,
            authProvider: outsider.authProvider,
        });

        // 4. Create service category
        const cat = await prisma.serviceCategory.create({
            data: {
                name: `Msg Test Cat ${Date.now()}`,
                slug: `msg-test-cat-${Date.now()}`,
            },
        });
        serviceCategoryId = cat.id;

        // 5. Create vendor profile (owned by vendorOwner)
        const profile = await prisma.vendorProfile.create({
            data: {
                businessName: 'Chat Vendor Business',
                city: 'Addis Ababa',
                basePrice: 250,
                userId: vendorOwnerUserId,
                serviceCategoryId,
            },
        });
        vendorProfileId = profile.id;

        // 6. CSRF token
        csrfToken = generateCsrfToken();
    });

    afterAll(async () => {
        // Cleanup in FK order
        await prisma.message.deleteMany({
            where: {
                conversation: {
                    OR: [
                        { userId: { in: [customerUserId, vendorOwnerUserId, outsiderUserId] } },
                        { vendorProfileId },
                    ],
                },
            },
        });
        await prisma.conversation.deleteMany({
            where: {
                OR: [
                    { userId: { in: [customerUserId, vendorOwnerUserId, outsiderUserId] } },
                    { vendorProfileId },
                ],
            },
        });
        await prisma.vendorProfile.deleteMany({
            where: { id: vendorProfileId },
        });
        await prisma.serviceCategory.deleteMany({
            where: { id: serviceCategoryId },
        });
        await prisma.user.deleteMany({
            where: { id: { in: [customerUserId, vendorOwnerUserId, outsiderUserId] } },
        });
        await prisma.$disconnect();
    });

    // ──────────────────────────────────────────────
    // 1. AUTHENTICATION & CSRF
    // ──────────────────────────────────────────────
    describe('Authentication & CSRF', () => {
        it('GET /conversations → 401 without auth', async () => {
            const res = await request(app).get(`${BASE}/conversations`);
            expect(res.status).toBe(401);
        });

        it('POST /conversations → 401 without auth', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations`)
                .set('x-csrf-token', csrfToken)
                .send({ vendorProfileId, message: 'Hello' });
            expect(res.status).toBe(401);
        });

        it('POST /conversations → 403 without CSRF', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${customerToken}`)
                .send({ vendorProfileId, message: 'Hello' });
            expect(res.status).toBe(403);
        });

        it('GET /unread-count → 401 without auth', async () => {
            const res = await request(app).get(`${BASE}/unread-count`);
            expect(res.status).toBe(401);
        });
    });

    // ──────────────────────────────────────────────
    // 2. START CONVERSATION
    // ──────────────────────────────────────────────
    describe('Start Conversation (POST /conversations)', () => {
        it('should start a new conversation with initial message → 201', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ vendorProfileId, message: 'Hi, I need a DJ for my wedding!' });

            expect(res.status).toBe(201);
            expect(res.body.status).toBe('success');
            expect(res.body.data.conversation).toBeDefined();
            expect(res.body.data.conversation.vendorProfileId).toBe(vendorProfileId);
            expect(res.body.data.conversation.message).toBeDefined();
            expect(res.body.data.conversation.message.content).toBe('Hi, I need a DJ for my wedding!');
            conversationId = res.body.data.conversation.id;
        });

        it('should return existing conversation on duplicate start (idempotent) → 201', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ vendorProfileId, message: 'Follow-up question' });

            expect(res.status).toBe(201);
            expect(res.body.data.conversation.id).toBe(conversationId);
            expect(res.body.data.conversation.message.content).toBe('Follow-up question');
        });

        it('should prevent self-messaging → 403', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${vendorOwnerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ vendorProfileId, message: 'Talking to myself' });

            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/your own vendor profile/i);
        });

        it('should reject non-existent vendor → 404', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ vendorProfileId: 999999, message: 'Hello ghost' });

            expect(res.status).toBe(404);
        });

        it('should reject missing required fields → 400', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ vendorProfileId }); // missing message

            expect(res.status).toBe(400);
        });
    });

    // ──────────────────────────────────────────────
    // 3. SEND MESSAGE
    // ──────────────────────────────────────────────
    describe('Send Message (POST /conversations/:id/messages)', () => {
        it('vendor owner should be able to reply → 201', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations/${conversationId}/messages`)
                .set('Authorization', `Bearer ${vendorOwnerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ content: 'Sure! I am available for your date.' });

            expect(res.status).toBe(201);
            expect(res.body.data.message.content).toBe('Sure! I am available for your date.');
            expect(res.body.data.message.senderId).toBe(vendorOwnerUserId);
        });

        it('customer should send another message → 201', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations/${conversationId}/messages`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ content: 'Great! What about pricing?' });

            expect(res.status).toBe(201);
            expect(res.body.data.message.senderId).toBe(customerUserId);
        });

        it('outsider should NOT be able to send → 404', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations/${conversationId}/messages`)
                .set('Authorization', `Bearer ${outsiderToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ content: 'I should not be here' });

            expect(res.status).toBe(404);
        });

        it('should reject empty message → 400', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations/${conversationId}/messages`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ content: '' });

            expect(res.status).toBe(400);
        });

        it('should reject non-existent conversation → 404', async () => {
            const res = await request(app)
                .post(`${BASE}/conversations/999999/messages`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ content: 'Hello nobody' });

            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 4. LIST CONVERSATIONS (INBOX)
    // ──────────────────────────────────────────────
    describe('List Conversations (GET /conversations)', () => {
        it('customer should see their conversations with unread count', async () => {
            const res = await request(app)
                .get(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.conversations).toBeDefined();
            expect(Array.isArray(res.body.data.conversations)).toBe(true);
            expect(res.body.data.conversations.length).toBeGreaterThanOrEqual(1);

            const conv = res.body.data.conversations.find((c: any) => c.id === conversationId);
            expect(conv).toBeDefined();
            expect(conv.lastMessage).toBeDefined();
            expect(conv.vendorProfile.businessName).toBe('Chat Vendor Business');
            expect(conv.customer.displayName).toBe('Chat Customer');
            // Customer sent the last message, so unread count from vendor's reply
            expect(typeof conv.unreadCount).toBe('number');
        });

        it('vendor owner should also see the conversation', async () => {
            const res = await request(app)
                .get(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${vendorOwnerToken}`);

            expect(res.status).toBe(200);
            const conv = res.body.data.conversations.find((c: any) => c.id === conversationId);
            expect(conv).toBeDefined();
        });

        it('outsider should see empty inbox', async () => {
            const res = await request(app)
                .get(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${outsiderToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.conversations).toHaveLength(0);
        });
    });

    // ──────────────────────────────────────────────
    // 5. GET CONVERSATION (THREAD)
    // ──────────────────────────────────────────────
    describe('Get Conversation (GET /conversations/:id)', () => {
        it('should return conversation with messages sorted by createdAt ASC', async () => {
            const res = await request(app)
                .get(`${BASE}/conversations/${conversationId}`)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.conversation).toBeDefined();
            expect(res.body.data.conversation.messages).toBeDefined();
            expect(res.body.data.conversation.messages.length).toBeGreaterThanOrEqual(3);

            // Verify chronological order
            const messages = res.body.data.conversation.messages;
            for (let i = 1; i < messages.length; i++) {
                expect(new Date(messages[i].createdAt).getTime())
                    .toBeGreaterThanOrEqual(new Date(messages[i - 1].createdAt).getTime());
            }

            // Verify pagination info
            expect(res.body.data.conversation.pagination).toBeDefined();
            expect(res.body.data.conversation.pagination.total).toBeGreaterThanOrEqual(3);
        });

        it('should auto-mark messages as read when opening conversation', async () => {
            // Open as customer → vendor's messages become read
            await request(app)
                .get(`${BASE}/conversations/${conversationId}`)
                .set('Authorization', `Bearer ${customerToken}`);

            // Now check unread count — should be 0 for customer
            const res = await request(app)
                .get(`${BASE}/unread-count`)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.unreadCount).toBe(0);
        });

        it('outsider should NOT access conversation → 404', async () => {
            const res = await request(app)
                .get(`${BASE}/conversations/${conversationId}`)
                .set('Authorization', `Bearer ${outsiderToken}`);

            expect(res.status).toBe(404);
        });

        it('should return 404 for non-existent conversation', async () => {
            const res = await request(app)
                .get(`${BASE}/conversations/999999`)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 6. MARK AS READ
    // ──────────────────────────────────────────────
    describe('Mark as Read (PATCH /conversations/:id/read)', () => {
        it('should mark unread messages as read → 204', async () => {
            // First send a message from vendor so customer has unread
            await request(app)
                .post(`${BASE}/conversations/${conversationId}/messages`)
                .set('Authorization', `Bearer ${vendorOwnerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ content: 'Here is the pricing: $500' });

            // Customer marks as read
            const res = await request(app)
                .patch(`${BASE}/conversations/${conversationId}/read`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(204);

            // Verify unread count is 0
            const countRes = await request(app)
                .get(`${BASE}/unread-count`)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(countRes.body.data.unreadCount).toBe(0);
        });

        it('outsider should NOT mark as read → 404', async () => {
            const res = await request(app)
                .patch(`${BASE}/conversations/${conversationId}/read`)
                .set('Authorization', `Bearer ${outsiderToken}`)
                .set('x-csrf-token', csrfToken);

            expect(res.status).toBe(404);
        });
    });

    // ──────────────────────────────────────────────
    // 7. UNREAD COUNT
    // ──────────────────────────────────────────────
    describe('Unread Count (GET /unread-count)', () => {
        it('should return correct unread count', async () => {
            // Send a message from vendor → creates unread for customer
            await request(app)
                .post(`${BASE}/conversations/${conversationId}/messages`)
                .set('Authorization', `Bearer ${vendorOwnerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ content: 'Any update on the booking?' });

            const res = await request(app)
                .get(`${BASE}/unread-count`)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.unreadCount).toBeGreaterThanOrEqual(1);
        });
    });

    // ──────────────────────────────────────────────
    // 8. SOFT-DELETE SCENARIOS
    // ──────────────────────────────────────────────
    describe('Soft-Delete Scenarios', () => {
        it('should block sending when vendor profile is soft-deleted → 403', async () => {
            // Soft-delete the vendor profile
            await prisma.vendorProfile.update({
                where: { id: vendorProfileId },
                data: { deletedAt: new Date() },
            });

            const res = await request(app)
                .post(`${BASE}/conversations/${conversationId}/messages`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ content: 'Are you still there?' });

            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/vendor profile has been deleted/i);

            // Restore
            await prisma.vendorProfile.update({
                where: { id: vendorProfileId },
                data: { deletedAt: null },
            });
        });

        it('should block sending when customer user is soft-deleted → 403', async () => {
            // Soft-delete the customer
            await prisma.user.update({
                where: { id: customerUserId },
                data: { deletedAt: new Date() },
            });

            // Vendor owner tries to reply
            const res = await request(app)
                .post(`${BASE}/conversations/${conversationId}/messages`)
                .set('Authorization', `Bearer ${vendorOwnerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ content: 'Pinging you...' });

            expect(res.status).toBe(403);
            expect(res.body.message).toMatch(/customer account has been deleted/i);

            // Restore
            await prisma.user.update({
                where: { id: customerUserId },
                data: { deletedAt: null },
            });
        });

        it('vendor owner should still read history after customer soft-delete', async () => {
            // Soft-delete customer
            await prisma.user.update({
                where: { id: customerUserId },
                data: { deletedAt: new Date() },
            });

            // Vendor owner can still read the conversation
            const res = await request(app)
                .get(`${BASE}/conversations/${conversationId}`)
                .set('Authorization', `Bearer ${vendorOwnerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.conversation.messages.length).toBeGreaterThanOrEqual(1);
            // Customer should show as "Deleted User"
            expect(res.body.data.conversation.customer.displayName).toBe('Deleted User');

            // Restore
            await prisma.user.update({
                where: { id: customerUserId },
                data: { deletedAt: null },
            });
        });

        it('customer should still read history after vendor profile soft-delete', async () => {
            // Soft-delete vendor profile
            await prisma.vendorProfile.update({
                where: { id: vendorProfileId },
                data: { deletedAt: new Date() },
            });

            // Customer can still read the conversation
            const res = await request(app)
                .get(`${BASE}/conversations/${conversationId}`)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.data.conversation.messages.length).toBeGreaterThanOrEqual(1);
            // Vendor should show as "Deleted Business"
            expect(res.body.data.conversation.vendorProfile.businessName).toBe('Deleted Business');

            // Restore
            await prisma.vendorProfile.update({
                where: { id: vendorProfileId },
                data: { deletedAt: null },
            });
        });

        it('starting conversation with soft-deleted vendor → 404', async () => {
            await prisma.vendorProfile.update({
                where: { id: vendorProfileId },
                data: { deletedAt: new Date() },
            });

            const res = await request(app)
                .post(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${outsiderToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ vendorProfileId, message: 'Hello' });

            expect(res.status).toBe(404);

            // Restore
            await prisma.vendorProfile.update({
                where: { id: vendorProfileId },
                data: { deletedAt: null },
            });
        });
    });

    // ──────────────────────────────────────────────
    // 9. CONVERSATIONS SORTED BY ACTIVITY
    // ──────────────────────────────────────────────
    describe('Conversations Sorted by Activity', () => {
        let secondConversationId: number;
        let secondVendorProfileId: number;

        beforeAll(async () => {
            // Create a second vendor profile for the outsider to own
            const profile2 = await prisma.vendorProfile.create({
                data: {
                    businessName: 'Second Chat Vendor',
                    city: 'Hawassa',
                    basePrice: 300,
                    userId: outsiderUserId,
                    serviceCategoryId,
                },
            });
            secondVendorProfileId = profile2.id;
        });

        afterAll(async () => {
            await prisma.message.deleteMany({
                where: { conversation: { vendorProfileId: secondVendorProfileId } },
            });
            await prisma.conversation.deleteMany({
                where: { vendorProfileId: secondVendorProfileId },
            });
            await prisma.vendorProfile.deleteMany({
                where: { id: secondVendorProfileId },
            });
        });

        it('most recently active conversation should appear first', async () => {
            // Customer starts a second conversation
            const res = await request(app)
                .post(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ vendorProfileId: secondVendorProfileId, message: 'New conversation' });

            expect(res.status).toBe(201);
            secondConversationId = res.body.data.conversation.id;

            // List conversations — the newest one should be first
            const listRes = await request(app)
                .get(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${customerToken}`);

            expect(listRes.status).toBe(200);
            const convIds = listRes.body.data.conversations.map((c: any) => c.id);
            expect(convIds[0]).toBe(secondConversationId);
        });

        it('sending message in older conversation should bump it to top', async () => {
            // Send a message in the original conversation
            await request(app)
                .post(`${BASE}/conversations/${conversationId}/messages`)
                .set('Authorization', `Bearer ${customerToken}`)
                .set('x-csrf-token', csrfToken)
                .send({ content: 'Bumping this conversation!' });

            // List conversations — original should now be first
            const listRes = await request(app)
                .get(`${BASE}/conversations`)
                .set('Authorization', `Bearer ${customerToken}`);

            const convIds = listRes.body.data.conversations.map((c: any) => c.id);
            expect(convIds[0]).toBe(conversationId);
        });
    });
});
