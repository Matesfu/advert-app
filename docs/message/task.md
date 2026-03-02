# Messaging Module — Task List

## Configuration
- [x] Add `EMAIL_NOTIFICATIONS_ENABLED=false` to `.env`
- [x] Add `EMAIL_NOTIFICATIONS_ENABLED` to `src/config/env.ts` Zod schema

## Email Notification
- [x] Add `sendNewMessageEmail()` to `src/utils/mailer.ts`
  - Check `EMAIL_NOTIFICATIONS_ENABLED` feature flag
  - Fire-and-forget (never blocks API response)
  - First-unread-only rate limiting (skip if recipient already has unread messages in that conversation)

## Service Implementation — `src/modules/messages/message.service.ts`
- [x] `getConversations(userId)` — inbox listing sorted by `updatedAt DESC`
  - Include last message preview, unread count, participant details
  - Handle both customer and vendor-owner perspectives
  - Show "Deleted User" / "Deleted Business" for soft-deleted participants
- [x] `getConversation(userId, conversationId)` — full chat thread
  - Messages sorted `createdAt ASC`, with pagination
  - Auto-mark unread messages as read
  - Participant access guard (403 for non-participants)
- [x] `startConversation(userId, data)` — create or retrieve conversation
  - Validate vendor profile (active, not self-messaging)
  - Idempotent: return existing conversation if already exists
  - Create first message atomically
  - Trigger email notification
- [x] `sendMessage(userId, conversationId, data)` — send message
  - Participant access guard
  - Soft-delete guard (can't send if either party is deleted)
  - Create message + bump `updatedAt`
  - Trigger email notification
- [x] `markAsRead(userId, conversationId)` — bulk mark read
- [x] `getUnreadCount(userId)` — global unread total

## Controller & Routes
- [x] Add `getUnreadCount` handler to `message.controller.ts`
- [x] Add `GET /unread-count` route to `message.routes.ts`

## E2E Tests — `src/modules/messages/__tests__/message.test.ts`
- [x] Test: Auth required (401) & CSRF required (403) — 4 tests
- [x] Test: Start conversation (201) & idempotency — 5 tests
- [x] Test: Self-messaging prevention (403)
- [x] Test: Send message in conversation (201) — 5 tests
- [x] Test: List conversations (sorted by updatedAt DESC, last message, unread count) — 3 tests
- [x] Test: Get conversation with messages & auto-mark-read — 4 tests
- [x] Test: Mark as read (204) — 2 tests
- [x] Test: Unread count endpoint — 1 test
- [x] Test: Soft-delete — blocked sending & readable history — 5 tests
- [x] Test: Conversations sorted by activity — 2 tests

## Verification & Report
- [x] Run test suite — **31 tests passed**
- [x] Write `docs/message/report.md` with implementation summary & cURL commands
