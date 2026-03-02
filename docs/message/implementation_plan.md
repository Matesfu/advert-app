# Messaging Module — Implementation Plan

## Overview

Build a production-grade messaging system for Eventify, comparable to Airbnb's host–guest messaging. The system enables **Customers** and **Vendor Profiles** to communicate via conversations. Each conversation is unique per `(userId, vendorProfileId)` pair. Messages are ordered chronologically, unread counts drive in-app badges, and optional email notifications alert recipients of new messages.

---

## Architecture

### Data Model (Already Defined)

```
Conversation (1:N) ──→ Message
  ├── userId           (Customer side)
  ├── vendorProfileId  (Vendor side)
  ├── updatedAt        (bumped on each new message → sort key)
  └── @@unique([userId, vendorProfileId])

Message
  ├── content          (text body)
  ├── isRead           (per-message read flag)
  ├── senderId         (User.id of the author — could be customer or vendor owner)
  └── createdAt        (chronological ordering)
```

### Conversation Listing (`getConversations`)

- Fetch all conversations where the user is **either the customer (`userId`)** or **the vendor owner** (via `vendorProfile.userId`).
- Sort by `updatedAt DESC` (most recent activity first) — identical to Airbnb's inbox.
- Include the **last message** (for preview text) and **unread count** (messages not sent by this user where `isRead = false`).
- Include participant names/avatars: the customer's `displayName` and the vendor's `businessName`.

### Message Retrieval (`getConversation`)

- Fetch a single conversation with its messages sorted by `createdAt ASC` (oldest first, like a chat thread).
- Paginate messages with cursor-based or offset pagination (`page` & `limit`).
- Auto-mark unread messages as read when the recipient opens the conversation.
- Verify the requesting user is a participant (either customer or vendor owner) — `403` otherwise.

### Sending Messages (`sendMessage`)

1. Validate that the conversation exists and the user is a participant.
2. Check soft-delete guards (see below).
3. Create the `Message` record.
4. Update `Conversation.updatedAt` to `now()` (for sort ordering).
5. Trigger email notification (async, fire-and-forget — never blocks the response).

### Starting Conversations (`startConversation`)

1. Validate the vendor profile exists and is not soft-deleted.
2. Prevent self-messaging (user cannot message their own vendor profile).
3. If a conversation already exists for `(userId, vendorProfileId)`, return it (idempotent) and add the initial message.
4. Otherwise, create the conversation and the first message atomically in a transaction.
5. Trigger email notification.

### Mark as Read (`markAsRead`)

- Bulk-update all messages in the conversation that were **not sent by the requesting user** to `isRead = true`.
- Returns `204 No Content`.

---

## Soft-Delete Strategy

Both `User` and `VendorProfile` have `deletedAt` columns. The messaging system must gracefully handle deleted participants:

### Rules

| Scenario | New Messages? | Read History? | UI Display |
|----------|:---:|:---:|------------|
| Both active | ✅ | ✅ | Normal |
| User soft-deleted | ❌ | ✅ (vendor can read) | Vendor sees "Deleted User" |
| VendorProfile soft-deleted | ❌ | ✅ (customer can read) | Customer sees "Deleted Business" |
| Both soft-deleted | ❌ | ❌ (no active party) | N/A |

### Implementation

1. **Sending guard**: Before creating a message, check that **neither** the customer `User.deletedAt` **nor** the `VendorProfile.deletedAt` is set. If either is deleted → `403 "Cannot send messages in this conversation — a participant has been removed"`.
2. **Reading history**: The `getConversations` and `getConversation` endpoints **do not** filter by `deletedAt`. History is always visible to whichever party is still active.
3. **Display names**: When returning conversation data, the service will check `deletedAt` and substitute placeholder text:
   - User deleted → `{ displayName: "Deleted User", avatarUrl: null }`
   - VendorProfile deleted → `{ businessName: "Deleted Business" }`

---

## Notification System

### A. In-App (Database-Driven Unread Counts)

The `isRead` flag on each `Message` already provides the foundation:

- **Unread count per conversation** = `COUNT(messages WHERE senderId ≠ me AND isRead = false)`.
- **Total unread count** (for a badge on the inbox icon) = sum of all unread counts across conversations.
- The `getConversations` response includes `unreadCount` per conversation.
- A new **`GET /api/v1/messages/unread-count`** endpoint returns the global unread total.

### B. Email Notifications

When a new message is sent, an email is dispatched to the recipient:

- **Controlled by feature flag**: `EMAIL_NOTIFICATIONS_ENABLED` in `.env`. When `false`, emails are skipped entirely (logged as info).
- **Fire-and-forget**: The email is sent asynchronously. Failures are logged but never block the API response (consistent with the existing `sendVerificationEmail` pattern).
- **Rate limit**: To avoid spamming, only send an email if the recipient has **no unread messages in this conversation** before the new message (i.e., the first unread message triggers the email, subsequent ones don't).
- **Email content**: Subject: `"New message from {senderName} — Eventify"`, body includes a preview of the message and a link to the conversation.

### Email Service Architecture

We will extend the existing `src/utils/mailer.ts` by adding a new `sendNewMessageEmail` function alongside the existing `sendVerificationEmail`. This keeps all email logic centralized in one file.

---

## Configuration

### New `.env` Variables

```env
# Message Email Notifications (feature toggle)
EMAIL_NOTIFICATIONS_ENABLED=false
```

This is the **only** new env variable needed. SMTP settings (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) and `FRONTEND_URL` are already configured.

### `env.ts` Changes

Add `EMAIL_NOTIFICATIONS_ENABLED` to the Zod schema:

```typescript
EMAIL_NOTIFICATIONS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((val) => val === 'true'),
```

---

## Proposed Changes

### Config Layer

#### [MODIFY] [env.ts](file:///d:/work/advert_app/backend/src/config/env.ts)
Add `EMAIL_NOTIFICATIONS_ENABLED` to the Zod env schema.

#### [MODIFY] [.env](file:///d:/work/advert_app/backend/.env)
Add `EMAIL_NOTIFICATIONS_ENABLED=false`.

---

### Email / Notification

#### [MODIFY] [mailer.ts](file:///d:/work/advert_app/backend/src/utils/mailer.ts)
Add `sendNewMessageEmail(to, senderName, messagePreview, conversationUrl)` function. Checks `EMAIL_NOTIFICATIONS_ENABLED` feature flag before sending.

---

### Message Service

#### [MODIFY] [message.service.ts](file:///d:/work/advert_app/backend/src/modules/messages/message.service.ts)
Replace all 5 stub methods with full Prisma-backed implementations:
- `getConversations(userId)` — inbox listing with last message, unread count, participant info.
- `getConversation(userId, conversationId)` — full chat thread with pagination, auto-mark-read.
- `startConversation(userId, data)` — create or retrieve conversation, send first message.
- `sendMessage(userId, conversationId, data)` — create message, bump updatedAt, trigger email.
- `markAsRead(userId, conversationId)` — bulk-update isRead.
- `getUnreadCount(userId)` — total unread messages across all conversations.

---

### Controller & Routes

#### [MODIFY] [message.controller.ts](file:///d:/work/advert_app/backend/src/modules/messages/message.controller.ts)
Add `getUnreadCount` handler.

#### [MODIFY] [message.routes.ts](file:///d:/work/advert_app/backend/src/modules/messages/message.routes.ts)
Add `GET /unread-count` route.

---

### Tests

#### [NEW] [message.test.ts](file:///d:/work/advert_app/backend/src/modules/messages/__tests__/message.test.ts)
Comprehensive E2E test suite covering:
- Starting a conversation (201) & idempotency
- Sending messages (201) & ordering
- Listing conversations (sorted by updatedAt, with unread counts)
- Getting a conversation with messages (pagination, auto-mark-read)
- Mark as read (204)
- Unread count endpoint
- Self-messaging prevention (403)
- Non-participant access (403)
- Soft-delete: blocked sending, readable history
- Auth required (401) & CSRF required (403)

---

## Verification Plan

### Automated E2E Tests

```bash
npx jest --testPathPatterns="messages/__tests__/message.test" --forceExit --verbose
```

### Manual Verification (cURL)

Detailed cURL commands will be provided in the final `report.md`, covering:
1. Starting a conversation
2. Sending a reply
3. Checking inbox (conversation list)
4. Reading a conversation
5. Marking as read
6. Checking unread count
7. Soft-delete scenario
8. Email notification verification via Ethereal web dashboard
