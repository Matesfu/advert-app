# Real-Time Messaging — Socket.io Implementation Plan

## Overview

Upgrade the existing REST-based messaging module with **Socket.io** to deliver instant message delivery, typing indicators, and real-time read receipts — matching the UX of Airbnb and WhatsApp.

### Design Principle

> **REST for writes, Socket.io for push.**
>
> All business logic (validation, DB writes, soft-delete guards) stays in the existing `MessageService` and REST controllers. Socket.io is used exclusively to **push events** to connected clients after a successful REST operation. This keeps the system testable, idempotent, and avoids duplicating logic.

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                     src/server.ts                         │
│  const httpServer = http.createServer(app)                │
│  const io = new Server(httpServer, { cors, ... })         │
│  initializeSocket(io)   ← sets up auth middleware & events│
│  httpServer.listen(PORT)                                  │
└──────────────────────────┬────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              │   src/socket/index.ts   │
              │  - JWT auth middleware  │
              │  - Connection handler   │
              │  - join_conversation    │
              │  - leave_conversation   │
              │  - typing events        │
              └────────────┬────────────┘
                           │
              ┌────────────┴────────────────────────┐
              │  src/socket/socketEmitter.ts         │
              │  Singleton holding the `io` instance │
              │  Called from MessageService after    │
              │  DB writes to emit events            │
              └─────────────────────────────────────┘
```

### How It Fits the Existing Stack

| Component | Current | After |
|-----------|---------|-------|
| `src/app.ts` | Express app (unchanged) | **No changes** — remains pure Express |
| `src/server.ts` | `app.listen(PORT)` | Wrap with `http.createServer(app)`, attach Socket.io, then `httpServer.listen(PORT)` |
| `message.service.ts` | Saves message → returns | Saves message → **emits via socketEmitter** → returns |
| `message.controller.ts` | No changes | No changes |
| `message.routes.ts` | No changes | No changes |

---

## Authentication (Socket Middleware)

Socket.io connections are authenticated using the **same JWT** the REST API uses.

```
Client connects:  io("ws://host", { auth: { token: "Bearer <jwt>" } })
                            │
                            ▼
               socketAuthMiddleware(socket, next)
                 1. Extract token from socket.handshake.auth.token
                 2. Call verifyAccessToken(token) — reuse existing util
                 3. Attach decoded user to socket.data.user
                 4. On failure → next(new Error("Authentication error"))
```

- Reuses `verifyAccessToken` from `src/utils/token.ts` — single source of truth.
- No CSRF required for WebSocket (CSRF is a browser‑form concern; the token itself provides auth).

---

## Event Map

### Client → Server Events

| Event | Payload | Description |
|-------|---------|-------------|
| `join_conversation` | `{ conversationId: number }` | Client joins room `conversation_<id>`. Server validates the user is a participant before joining. |
| `leave_conversation` | `{ conversationId: number }` | Client leaves the room. |
| `typing_start` | `{ conversationId: number }` | Broadcast to room (excl. sender) that user started typing. |
| `typing_stop` | `{ conversationId: number }` | Broadcast to room (excl. sender) that user stopped typing. |

### Server → Client Events

| Event | Payload | Description |
|-------|---------|-------------|
| `new_message` | `{ message, conversationId }` | Pushed to all members of the conversation room after a message is saved via REST. |
| `messages_read` | `{ conversationId, readBy }` | Pushed when a participant marks messages as read. |
| `conversation_updated` | `{ conversationId, lastMessage, updatedAt }` | Pushed to user-level rooms so inbox lists stay current. |
| `user_typing` | `{ conversationId, userId, displayName }` | Forwarded typing indicator. |
| `user_stop_typing` | `{ conversationId, userId }` | Forwarded stop-typing indicator. |
| `error` | `{ message: string }` | Auth or validation failure. |

---

## Room Strategy

Two levels of rooms:

1. **Conversation room**: `conversation_<id>` — joined when the user opens a chat thread. Used for `new_message`, `user_typing`, `messages_read`.
2. **User room**: `user_<id>` — auto-joined on connection. Used for `conversation_updated` (inbox badge refresh) so the client doesn't need to be inside the specific conversation.

```
User connects → auto-join  user_5
User opens chat → join     conversation_12
User leaves chat → leave   conversation_12
User disconnects → auto-leave all rooms
```

---

## Service Integration

### `MessageService.sendMessage()` — after the DB transaction:

```typescript
// After message is saved to DB (existing logic)...
const savedMessage = await prisma.$transaction([...]);

// NEW: Emit to connected clients
socketEmitter.emitNewMessage(conversationId, savedMessage);
socketEmitter.emitConversationUpdated(conversation, savedMessage);
```

### `MessageService.startConversation()` — after initial message:

```typescript
// NEW: Emit to vendor owner's user room
socketEmitter.emitConversationUpdated(conversation, initialMessage);
```

### `MessageService.markAsRead()` — after bulk update:

```typescript
// NEW: Emit to conversation room
socketEmitter.emitMessagesRead(conversationId, userId);
```

---

## Socket Emitter (Singleton Pattern)

```typescript
// src/socket/socketEmitter.ts
class SocketEmitter {
  private io: Server | null = null;

  initialize(io: Server) { this.io = io; }

  emitNewMessage(conversationId, message) {
    this.io?.to(`conversation_${conversationId}`).emit('new_message', { conversationId, message });
  }

  emitConversationUpdated(conversation, lastMessage) {
    // Emit to both participants' user rooms for inbox refresh
    this.io?.to(`user_${conversation.userId}`).emit('conversation_updated', { ... });
    this.io?.to(`user_${vendorOwnerId}`).emit('conversation_updated', { ... });
  }

  emitMessagesRead(conversationId, readByUserId) {
    this.io?.to(`conversation_${conversationId}`).emit('messages_read', { conversationId, readBy: readByUserId });
  }
}

export const socketEmitter = new SocketEmitter();
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `CORS_ORIGIN` | `*` (dev) | Already handled by existing CORS config; Socket.io will reuse it. |

No new env variables are required. Socket.io runs on the same port as Express via the shared HTTP server.

---

## Soft-Delete Considerations

- **Connection**: Soft-deleted users can still connect (token may be valid). Room joins are guarded by participant validation.
- **Typing**: Events are only forwarded if the user is in the room (already validated).
- **Sending**: Blocked at the REST layer (existing 403 guard). The socket layer never handles writes.

---

## Test Client

A `public/test-chat.html` file will be provided so you can open two browser tabs and verify real-time message delivery, typing indicators, and read receipts visually.

---

## Verification Plan

### Automated Tests
- Run existing messaging E2E suite (`npx jest --testPathPatterns="messages"`) to confirm no regressions.
- Socket-specific behavior is best tested interactively (see manual verification).

### Manual Verification
1. Open `test-chat.html` in two browser tabs (User A & User B).
2. User A sends a message via the UI → User B sees it instantly.
3. User A types → User B sees "typing..." indicator.
4. User B opens the conversation → User A sees read receipt.
5. Verify inbox badge updates in real time when a new message arrives.
