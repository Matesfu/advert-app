# Messaging Module — Implementation Report

## Implementation Summary

The messaging module delivers a production-grade, Airbnb-style inbox system for Eventify. It enables **Customers** to initiate conversations with **Vendor Profiles**, and both parties to exchange messages in real time with full read-tracking, email notifications, and graceful handling of soft-deleted accounts.

### Architecture Overview

```
┌──────────────┐     ┌───────────────┐     ┌──────────────────┐     ┌────────────┐
│  HTTP Routes │────▶│  Controller   │────▶│  MessageService  │────▶│  Prisma DB │
│  (Express)   │     │  (Delegation) │     │  (Business Logic)│     │            │
└──────────────┘     └───────────────┘     └────────┬─────────┘     └────────────┘
                                                    │
                                                    ▼
                                           ┌──────────────────┐
                                           │  Mailer (SMTP)   │
                                           │  Fire-and-forget │
                                           └──────────────────┘
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/messages/conversations` | List inbox (sorted by recent activity) |
| `POST` | `/api/v1/messages/conversations` | Start a new conversation |
| `GET` | `/api/v1/messages/conversations/:id` | Get conversation thread (paginated) |
| `POST` | `/api/v1/messages/conversations/:id/messages` | Send a message |
| `PATCH` | `/api/v1/messages/conversations/:id/read` | Mark conversation as read |
| `GET` | `/api/v1/messages/unread-count` | Get total unread message count |

### Key Design Patterns

1. **Dual-Perspective Queries**: Conversations are fetched where the user is either the customer (`userId`) or the vendor owner (`vendorProfile.userId`), ensuring both parties see the same inbox.

2. **Soft-Delete Awareness**: Sending is blocked (403) when either participant is deleted, but history remains readable. Deleted participants appear as "Deleted User" or "Deleted Business".

3. **Email Notifications**: Controlled by `EMAIL_NOTIFICATIONS_ENABLED` env flag. Uses first-unread-only rate limiting — only the first unread message triggers an email; subsequent ones do not spam the recipient. All emails are fire-and-forget.

4. **Idempotent Conversation Start**: The `POST /conversations` endpoint leverages the `@@unique([userId, vendorProfileId])` constraint. If a conversation already exists, the new message is appended to it.

5. **Auto-Mark-Read**: When a user opens a conversation via `GET /conversations/:id`, all unread messages from the other party are automatically marked as read.

### Files Modified

| File | Change |
|------|--------|
| `src/config/env.ts` | Added `EMAIL_NOTIFICATIONS_ENABLED` feature flag |
| `.env` | Added `EMAIL_NOTIFICATIONS_ENABLED=false` |
| `src/utils/mailer.ts` | Added `sendNewMessageEmail()` function |
| `src/modules/messages/message.service.ts` | Replaced 5 stubs with 6 Prisma-backed methods |
| `src/modules/messages/message.controller.ts` | Added `getUnreadCount` handler |
| `src/modules/messages/message.routes.ts` | Added `GET /unread-count` route |
| `src/modules/messages/__tests__/message.test.ts` | **NEW** — 31 E2E tests |

---

## E2E Test Results

```
Test Suites: 1 passed, 1 total
Tests:       31 passed, 31 total
Exit code:   0
```

### Test Coverage Breakdown

| Suite | Tests | Description |
|-------|:-----:|-------------|
| Authentication & CSRF | 4 | 401 without auth, 403 without CSRF |
| Start Conversation | 5 | Create, idempotency, self-messaging guard, missing vendor, validation |
| Send Message | 5 | Vendor reply, customer follow-up, outsider blocked, empty msg, missing conv |
| List Conversations | 3 | Customer inbox, vendor inbox, outsider empty |
| Get Conversation | 4 | Chronological order, auto-mark-read, outsider blocked, missing conv |
| Mark as Read | 2 | Successful mark + verify count, outsider blocked |
| Unread Count | 1 | Correct count after new message |
| Soft-Delete Scenarios | 5 | Blocked sending (vendor/customer), readable history (both sides), start with deleted vendor |
| Sort by Activity | 2 | Newest first, bump on new message |

---

## Manual Testing Guide (cURL)

> **Prerequisites**: The server must be running at `http://localhost:8000`. You need a valid JWT access token and CSRF token. Replace the placeholder values below with actual tokens and IDs.

### Variables

```bash
# Set these once
BASE_URL="http://localhost:8000/api/v1/messages"
TOKEN="your_jwt_access_token_here"
CSRF="your_csrf_token_here"
VENDOR_ID=1          # An existing vendor profile ID
CONVERSATION_ID=1    # Returned after starting a conversation
```

---

### 1. Start a Conversation

```bash
curl -X POST "$BASE_URL/conversations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-csrf-token: $CSRF" \
  -d '{
    "vendorProfileId": '"$VENDOR_ID"',
    "message": "Hi! I am interested in booking your service for a wedding on March 15th."
  }'
```

**Expected Response (201):**
```json
{
  "status": "success",
  "data": {
    "conversation": {
      "id": 1,
      "userId": 5,
      "vendorProfileId": 1,
      "createdAt": "2026-03-02T...",
      "message": {
        "id": 1,
        "content": "Hi! I am interested in booking your service...",
        "senderId": 5,
        "sender": { "id": 5, "displayName": "John", "avatarUrl": null }
      }
    }
  },
  "message": "Conversation started"
}
```

---

### 2. Send a Reply

```bash
curl -X POST "$BASE_URL/conversations/$CONVERSATION_ID/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-csrf-token: $CSRF" \
  -d '{"content": "That date works for me! Here is my pricing sheet."}'
```

**Expected Response (201):**
```json
{
  "status": "success",
  "data": {
    "message": {
      "id": 2,
      "content": "That date works for me! Here is my pricing sheet.",
      "isRead": false,
      "senderId": 10,
      "conversationId": 1,
      "createdAt": "2026-03-02T..."
    }
  },
  "message": "Message sent"
}
```

---

### 3. Check Inbox (List Conversations)

```bash
curl -X GET "$BASE_URL/conversations" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200):**
```json
{
  "status": "success",
  "data": {
    "conversations": [
      {
        "id": 1,
        "updatedAt": "2026-03-02T...",
        "customer": { "id": 5, "displayName": "John", "avatarUrl": null },
        "vendorProfile": { "id": 1, "businessName": "DJ Beats" },
        "lastMessage": {
          "id": 2,
          "content": "That date works for me!...",
          "senderId": 10,
          "isRead": false,
          "createdAt": "2026-03-02T..."
        },
        "unreadCount": 1
      }
    ]
  }
}
```

---

### 4. Read a Conversation (Thread)

```bash
curl -X GET "$BASE_URL/conversations/$CONVERSATION_ID" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200):**
Messages are ordered oldest-first. Unread messages from the other party are automatically marked as read.

```json
{
  "status": "success",
  "data": {
    "conversation": {
      "id": 1,
      "customer": { "id": 5, "displayName": "John" },
      "vendorProfile": { "id": 1, "businessName": "DJ Beats" },
      "messages": [
        { "id": 1, "content": "Hi! I am interested...", "senderId": 5, "createdAt": "..." },
        { "id": 2, "content": "That date works for me!...", "senderId": 10, "createdAt": "..." }
      ],
      "pagination": { "page": 1, "limit": 50, "total": 2, "totalPages": 1 }
    }
  }
}
```

---

### 5. Mark Conversation as Read

```bash
curl -X PATCH "$BASE_URL/conversations/$CONVERSATION_ID/read" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-csrf-token: $CSRF"
```

**Expected Response:** `204 No Content` (empty body)

---

### 6. Check Unread Count

```bash
curl -X GET "$BASE_URL/unread-count" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response (200):**
```json
{
  "status": "success",
  "data": { "unreadCount": 0 }
}
```

---

### 7. Email Notification Verification

Email notifications are disabled by default (`EMAIL_NOTIFICATIONS_ENABLED=false`). To test:

1. Set `EMAIL_NOTIFICATIONS_ENABLED=true` in `.env`
2. SMTP is already configured with Ethereal: `smtp.ethereal.email`
3. Send a message using command from step 2
4. Visit [Ethereal Messages](https://ethereal.email/messages) and log in with the credentials from `.env`
5. You should see an email with subject: `"New message from {SenderName} — Eventify"`

When disabled, the server logs: `[Mailer] Email notifications disabled — skipping notification to {email}`

---

### 8. Self-Messaging Prevention

```bash
# Use the vendor owner's token and try to message their own profile
curl -X POST "$BASE_URL/conversations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VENDOR_OWNER_TOKEN" \
  -H "x-csrf-token: $CSRF" \
  -d '{"vendorProfileId": '"$OWN_VENDOR_ID"', "message": "Talking to myself"}'
```

**Expected Response (403):**
```json
{
  "status": "error",
  "message": "You cannot start a conversation with your own vendor profile"
}
```

---

### 9. Soft-Delete Scenario

**Step A**: Soft-delete a user via database:
```sql
UPDATE "User" SET "deletedAt" = NOW() WHERE id = 5;
```

**Step B**: Try sending a message to the conversation as the vendor:
```bash
curl -X POST "$BASE_URL/conversations/$CONVERSATION_ID/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VENDOR_OWNER_TOKEN" \
  -H "x-csrf-token: $CSRF" \
  -d '{"content": "Are you still there?"}'
```

**Expected Response (403):**
```json
{
  "status": "error",
  "message": "Cannot send messages — the customer account has been deleted"
}
```

**Step C**: Read the conversation — history is preserved:
```bash
curl -X GET "$BASE_URL/conversations/$CONVERSATION_ID" \
  -H "Authorization: Bearer $VENDOR_OWNER_TOKEN"
```

**Expected**: Customer appears as `"Deleted User"`, all messages are still visible.
