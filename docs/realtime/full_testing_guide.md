# Full End-to-End Manual Testing Guide

## Real-Time Socket.io Messaging — From Registration to Live Chat

> This guide walks you through every step: creating two users, setting up a vendor profile, starting a conversation, and verifying real-time events via the test client UI.

---

## Prerequisites

- The server is running: `npm run dev` (port `8000`)
- A service category exists in the database (we'll check first)
- Two browser tabs open to: `http://localhost:8000/test-chat.html`

---

## Overview of Steps

```
Step 1: Register User A (Customer)        → POST /auth/register
Step 2: Verify User A's email             → DB or GET /auth/verify-email
Step 3: Login User A                       → POST /auth/login → get tokens
Step 4: Register User B (Vendor Owner)     → POST /auth/register
Step 5: Verify User B's email             → DB or GET /auth/verify-email
Step 6: Login User B                       → POST /auth/login → get tokens
Step 7: Create vendor profile for User B   → POST /vendors
Step 8: User A starts conversation         → POST /messages/conversations
Step 9: Connect both users to Socket.io    → test-chat.html UI
Step 10: Test real-time messaging           → Send from one tab, see in other
```

---

## Step 1: Register User A (Customer)

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer_test@example.com",
    "password": "Test1234"
  }'
```

**Expected Response (201):**
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": 1,
      "email": "customer_test@example.com",
      "role": "CUSTOMER",
      "isVerified": false
    }
  },
  "message": "Registration successful. Please verify your email."
}
```

> **Save** the `user.id` value — you'll need it later.

---

## Step 2: Verify User A's Email

Email verification is required before login. There are two ways:

### Option A: Directly via the Database (fastest for dev)

```bash
# Run this in your database
npx prisma db execute --stdin <<< "UPDATE \"User\" SET \"isVerified\" = true WHERE email = 'customer_test@example.com';"
```

Or use Prisma Studio:
```bash
npx prisma studio
```
Find the user and set `isVerified = true`.

### Option B: Via the Email Token

If you have Ethereal SMTP configured, check your Ethereal inbox for the verification link. It will look like:
```
http://localhost:8000/api/v1/auth/verify-email?token=<VERIFICATION_TOKEN>
```

Open that URL in a browser, or:
```bash
curl "http://localhost:8000/api/v1/auth/verify-email?token=<VERIFICATION_TOKEN>"
```

---

## Step 3: Login User A

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "customer_test@example.com",
    "password": "Test1234"
  }'
```

**Expected Response (200):**
```json
{
  "status": "success",
  "data": {
    "user": { "id": 1, "email": "customer_test@example.com", "role": "CUSTOMER" },
    "accessToken": "eyJhbGciOiJIUzI1NiIs...",
    "csrfToken": "abc123def456.hmac789"
  }
}
```

> **📋 Save these — you will use them throughout the guide:**
> ```bash
> USER_A_TOKEN="eyJhbGciOiJIUzI1NiIs..."
> USER_A_CSRF="abc123def456.hmac789"
> USER_A_ID=1
> ```

---

## Step 4: Register User B (Vendor Owner)

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "vendor_test@example.com",
    "password": "Test1234"
  }'
```

> **Save** the `user.id` for User B.

---

## Step 5: Verify User B's Email

Same as Step 2, but for `vendor_test@example.com`:

```bash
npx prisma db execute --stdin <<< "UPDATE \"User\" SET \"isVerified\" = true WHERE email = 'vendor_test@example.com';"
```

---

## Step 6: Login User B

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "vendor_test@example.com",
    "password": "Test1234"
  }'
```

> **📋 Save these:**
> ```bash
> USER_B_TOKEN="eyJhbGciOiJIUzI1NiIs..."
> USER_B_CSRF="xyz789abc123.hmac456"
> USER_B_ID=2
> ```

---

## Step 7: Create a Vendor Profile for User B

First, you need to know a valid `serviceCategoryId`. Check existing ones:

```bash
curl http://localhost:8000/api/v1/service-categories
```

If none exist, create one (may require admin role — or seed data). If service categories exist, pick an `id` from the response.

Now create the vendor profile:

```bash
curl -X POST http://localhost:8000/api/v1/vendors \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_B_TOKEN" \
  -H "x-csrf-token: $USER_B_CSRF" \
  -d '{
    "businessName": "DJ Beats Entertainment",
    "bio": "Professional DJ services for all events",
    "basePrice": 5000,
    "city": "Addis Ababa",
    "serviceCategoryId": 1
  }'
```

**Expected Response (201):**
```json
{
  "status": "success",
  "data": {
    "vendorProfile": {
      "id": 1,
      "businessName": "DJ Beats Entertainment",
      "userId": 2,
      ...
    }
  }
}
```

> **📋 Save:**
> ```bash
> VENDOR_PROFILE_ID=1
> ```

> **Note:** Creating a vendor profile auto-upgrades User B's role to `VENDOR`. If `VENDOR_ROLE_ENFORCED=true`, User B may need to already have the VENDOR role. In that case, set the role via DB:
> ```bash
> npx prisma db execute --stdin <<< "UPDATE \"User\" SET \"role\" = 'VENDOR' WHERE email = 'vendor_test@example.com';"
> ```
> Then log in again to get a fresh token with the updated role.

---

## Step 8: User A Starts a Conversation

```bash
curl -X POST http://localhost:8000/api/v1/messages/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_A_TOKEN" \
  -H "x-csrf-token: $USER_A_CSRF" \
  -d '{
    "vendorProfileId": '"$VENDOR_PROFILE_ID"',
    "message": "Hi! I am interested in booking you for a wedding on March 15th."
  }'
```

**Expected Response (201):**
```json
{
  "status": "success",
  "data": {
    "conversation": {
      "id": 1,
      ...
    }
  }
}
```

> **📋 Save:**
> ```bash
> CONVERSATION_ID=1
> ```

---

## Step 9: Open the Test Client UI

### Tab 1 — User A (Customer)

1. Open `http://localhost:8000/test-chat.html` in a browser tab
2. In the **Server URL** field: `http://localhost:8000` (default)
3. In the **JWT Access Token** field: paste `$USER_A_TOKEN`
4. Click **Connect**
5. You should see: `● Connected as User 1 (socket-id)` and a green "Connected" badge
6. In **Conversation ID**: enter `1` (or your `$CONVERSATION_ID`)
7. Click **Join**
8. You should see in the Event Log: `join_conversation → 1` and `Joined conversation_1`

### Tab 2 — User B (Vendor Owner)

1. Open `http://localhost:8000/test-chat.html` in a **second** browser tab
2. Paste `$USER_B_TOKEN` in the JWT field
3. Click **Connect**
4. Enter the same **Conversation ID**: `1`
5. Click **Join**

**Both tabs are now in the same conversation room.**

---

## Step 10: Test Real-Time Features

### 10a. Real-Time Message Delivery

**On Tab 2 (User B)**, type a message in the input box and click **Send** (or press Enter).

The message is sent via REST to `POST /api/v1/messages/conversations/1/messages`. After the DB write succeeds, Socket.io emits `new_message` to the conversation room.

**On Tab 1 (User A)**, you should see:
- ✅ The message appears instantly in the chat area
- ✅ The Event Log shows: `📩 new_message — conv: 1, from: 2`

**On Tab 2 (User B)**, the Event Log also shows the same event (since both are in the room).

### 10b. Typing Indicators

**On Tab 1 (User A)**, start typing in the input box (don't send).

**On Tab 2 (User B)**, you should see:
- ✅ `User 1 is typing...` appears below the messages area
- ✅ The Event Log shows: `⌨️ user_typing — conv: 1, user: 1`

Stop typing for 2 seconds. On Tab 2:
- ✅ The typing indicator disappears
- ✅ The Event Log shows: `⌨️ user_stop_typing — conv: 1`

### 10c. Read Receipts

**On Tab 1 (User A)**, click the green **Mark as Read (REST)** button.

**On Tab 2 (User B)**, the Event Log should show:
- ✅ `✅ messages_read — conv: 1, by: 1`

### 10d. Conversation Updated (Inbox)

Every time a message is sent, both user rooms receive a `conversation_updated` event. Check the Event Log for:
- ✅ `🔄 conversation_updated — conv: 1`

This event lets inbox UIs update the last message preview and sort order without polling.

---

## Step 11: Send More Messages via cURL

You can also send messages purely via cURL and watch them appear live on the test client:

```bash
# User A sends a message
curl -X POST http://localhost:8000/api/v1/messages/conversations/$CONVERSATION_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_A_TOKEN" \
  -H "x-csrf-token: $USER_A_CSRF" \
  -d '{"content": "What availability do you have in March?"}'
```

**On Tab 2 (User B)**: the message appears instantly.

```bash
# User B replies
curl -X POST http://localhost:8000/api/v1/messages/conversations/$CONVERSATION_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_B_TOKEN" \
  -H "x-csrf-token: $USER_B_CSRF" \
  -d '{"content": "March 15th is open! I will send you the pricing details."}'
```

**On Tab 1 (User A)**: the reply appears instantly.

---

## Step 12: Check Unread Count

```bash
# User A checks unread count
curl http://localhost:8000/api/v1/messages/unread-count \
  -H "Authorization: Bearer $USER_A_TOKEN"
```

**Response:**
```json
{
  "status": "success",
  "data": { "unreadCount": 1 }
}
```

---

## Step 13: View Inbox

```bash
# User A views inbox
curl http://localhost:8000/api/v1/messages/conversations \
  -H "Authorization: Bearer $USER_A_TOKEN"
```

**Response includes**: lastMessage preview, unreadCount, conversation details sorted by most recent activity.

---

## Quick Reference: All Variables

```bash
# Set all your variables here
BASE="http://localhost:8000/api/v1"

USER_A_TOKEN="<paste from login response>"
USER_A_CSRF="<paste from login response>"

USER_B_TOKEN="<paste from login response>"
USER_B_CSRF="<paste from login response>"

VENDOR_PROFILE_ID=1
CONVERSATION_ID=1
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `401 — You are not logged in` | Token expired. Log in again to get a fresh `accessToken`. |
| `403 — CSRF token is required` | Add `-H "x-csrf-token: $CSRF"` to POST/PATCH/DELETE requests. |
| `403 — You do not have permission` | User B needs VENDOR role. Set via DB and re-login. |
| `404 — Vendor profile not found` | Create a vendor profile first (Step 7). |
| Socket: `Authentication error` | Token is expired or malformed. Log in again and paste the new token. |
| Test client won't connect | Make sure the server is running (`npm run dev`) and URL is correct. |
| No `new_message` event received | Make sure both tabs have joined the same conversation ID. |
