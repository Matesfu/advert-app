# Real-Time Socket.io — Task Checklist

## 1. Dependencies
- [x] Install `socket.io`

## 2. Socket Infrastructure
- [x] Create `src/socket/socketEmitter.ts` — singleton holding the `io` instance with typed emit helpers
- [x] Create `src/socket/index.ts` — auth middleware, connection handler, room join/leave, typing events

## 3. Server Integration
- [x] Update `src/server.ts` — wrap Express app with `http.createServer`, attach Socket.io, call `initializeSocket(io)`

## 4. Service Integration
- [x] Update `message.service.ts` → `sendMessage()` — emit `new_message` + `conversation_updated` after DB write
- [x] Update `message.service.ts` → `startConversation()` — emit `conversation_updated` to vendor owner
- [x] Update `message.service.ts` → `markAsRead()` — emit `messages_read` to conversation room

## 5. Test Client
- [x] Create `public/test-chat.html` — interactive two-tab chat client for manual testing

## 6. Verification
- [x] Run existing messaging E2E tests — **31/31 passed, 0 regressions**
- [ ] Manual test: real-time message delivery across two tabs
- [ ] Manual test: typing indicators
- [ ] Manual test: read receipts
- [ ] Manual test: inbox badge update

## 7. Documentation
- [x] Write `docs/realtime/report.md` with summary and manual testing instructions
