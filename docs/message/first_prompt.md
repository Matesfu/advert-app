Act as a Senior Backend Architect and DevOps Engineer. I need you to fully implement the **Messaging Module** for the Eventify application.

**Context:**
I have already defined the `Conversation` and `Message` models in `schema.prisma`. Some basic controllers exist in `src/modules/messages`, but they are incomplete.

**Goal:**
Build a production-grade messaging system comparable to **Airbnb** or **WhatsApp**. It must handle real-time ordering, distinct conversation contexts, edge cases like deleted users, and a robust notification system.

### 1. Planning Phase (Documentation)
Before writing code, create a folder `docs/message/` and generate two files:

1.  **`docs/message/implementation_plan.md`**:
    *   **Architecture:** Explain how we will fetch conversations (sorted by `updatedAt` descending) and messages (sorted by `createdAt` ascending).
    *   **Soft Delete Strategy:** Define the logic for when a User or VendorProfile is soft-deleted. The messages must remain visible to the active party for history/legal reasons, but the UI should indicate "Deleted User."
    *   **Notification System:** Detail the logic for sending alerts. This must include:
        *   **In-App:** How the database state reflects unread counts.
        *   **Email:** How we trigger an email to the recipient when a new message arrives.
    *   **Configuration:** List the specific `.env` variables needed for SMTP and feature toggles (e.g., `ENABLE_EMAIL_NOTIFICATIONS`).

2.  **`docs/message/task.md`**:
    *   A step-by-step checklist of files to create/edit, environment variables to add, and tests to write.

### 2. Implementation Requirements

**A. Core Logic:**
*   Implement `sendMessage`: Create message, update Conversation `updatedAt`, and trigger notifications.
*   Implement `getConversations`: List chats ordered by most recent activity.
*   Implement `getMessages`: Pagination for messages within a chat.
*   **Edge Case:** Handle messaging permissions if a VendorProfile or User is soft-deleted (prevent new messages, allow reading old ones).

**B. Notification Service:**
*   Create a modular `EmailService`.
*   **Environment Control:** The email functionality must be controlled via `.env`. I must be able to disable it (e.g., `EMAIL_NOTIFICATIONS_ENABLED=false`) without touching the code.
*   **SMTP Config:** Use `.env` variables for Host, Port, User, and Password.

### 3. Testing & Reporting Phase

**A. E2E Tests:**
*   Write comprehensive tests (using Supertest/Jest) to verify the flow: User A starts chat -> Vendor B replies -> Email is triggered -> User A deletes account -> Vendor B can still read history.

**B. Final Report (`docs/message/report.md`):**
*   **Implementation Summary:** professional description of the architecture and patterns used.
*   **Manual Testing Guide:** A detailed section with `cURL` commands or steps to manually verify:
    1.  Sending a message.
    2.  Checking the inbox.
    3.  Verifying the email notification (using a tool like Ethereal or logging if disabled).
    4.  Testing the "Soft Delete" scenario.

**Deliverables:**
Start by generating the **Implementation Plan** and **Task List** first. Once I approve those, proceed with the Code and Report.