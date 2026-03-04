/* ── Eventify Real-Time Chat Test Client — Logic ── */

let socket = null;
let currentConversationId = null;
let typingTimeout = null;
let isTyping = false;

// ── Helpers ──
function timestamp() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function logEvent(type, text) {
    const log = document.getElementById('eventLog');
    const entry = document.createElement('div');
    entry.className = `event-entry ${type}`;
    entry.innerHTML = `<span class="time">${timestamp()}</span>${text}`;
    log.prepend(entry);
}

function addMessage(content, senderId, senderName, time, isSent) {
    const container = document.getElementById('messagesContainer');
    const msg = document.createElement('div');
    msg.className = `message ${isSent ? 'sent' : 'received'}`;
    const t = new Date(time).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    msg.innerHTML = `${content}<div class="meta">${isSent ? 'You' : (senderName || 'User ' + senderId)} · ${t}</div>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

function getMyUserId() {
    const token = document.getElementById('jwtToken').value.trim();
    if (!token) return null;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.userId;
    } catch { return null; }
}

// ── Connection ──
function toggleConnection() {
    if (socket && socket.connected) {
        socket.disconnect();
        return;
    }
    connect();
}

function connect() {
    const url = document.getElementById('serverUrl').value.trim();
    const token = document.getElementById('jwtToken').value.trim();

    if (!url || !token) {
        alert('Please enter both server URL and JWT token');
        return;
    }

    logEvent('system', `Connecting to ${url}...`);

    socket = io(url, {
        auth: { token: `Bearer ${token}` },
        transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
        const userId = getMyUserId();
        document.getElementById('statusBar').className = 'status connected';
        document.getElementById('statusBar').textContent = `● Connected as User ${userId || '?'} (${socket.id})`;
        document.getElementById('connectionBadge').textContent = 'Connected';
        document.getElementById('connectionBadge').style.background = '#10b981';
        document.getElementById('connectBtn').textContent = 'Disconnect';
        logEvent('system', `✅ Connected — socket ID: ${socket.id}`);
    });

    socket.on('disconnect', (reason) => {
        document.getElementById('statusBar').className = 'status disconnected';
        document.getElementById('statusBar').textContent = `● Disconnected: ${reason}`;
        document.getElementById('connectionBadge').textContent = 'Disconnected';
        document.getElementById('connectionBadge').style.background = '#ef4444';
        document.getElementById('connectBtn').textContent = 'Connect';
        logEvent('system', `❌ Disconnected — ${reason}`);
    });

    socket.on('connect_error', (err) => {
        logEvent('system', `⚠️ Connection error: ${err.message}`);
    });

    // ── Server Events ──
    socket.on('joined_conversation', (data) => {
        logEvent('receive', `Joined conversation_${data.conversationId}`);
    });

    socket.on('new_message', (data) => {
        logEvent('receive', `📩 new_message — conv: ${data.conversationId}, from: ${data.message.senderId}`);
        const myId = getMyUserId();
        if (data.conversationId === currentConversationId) {
            const isSent = data.message.senderId === myId;
            addMessage(
                data.message.content,
                data.message.senderId,
                data.message.sender?.displayName,
                data.message.createdAt,
                isSent
            );
        }
    });

    socket.on('conversation_updated', (data) => {
        logEvent('receive', `🔄 conversation_updated — conv: ${data.conversationId}`);
    });

    socket.on('messages_read', (data) => {
        logEvent('receive', `✅ messages_read — conv: ${data.conversationId}, by: ${data.readBy}`);
    });

    socket.on('user_typing', (data) => {
        if (data.conversationId === currentConversationId) {
            document.getElementById('typingIndicator').textContent = `User ${data.userId} is typing...`;
            clearTimeout(window._typingClear);
            window._typingClear = setTimeout(() => {
                document.getElementById('typingIndicator').textContent = '';
            }, 3000);
        }
        logEvent('receive', `⌨️ user_typing — conv: ${data.conversationId}, user: ${data.userId}`);
    });

    socket.on('user_stop_typing', (data) => {
        if (data.conversationId === currentConversationId) {
            document.getElementById('typingIndicator').textContent = '';
        }
        logEvent('receive', `⌨️ user_stop_typing — conv: ${data.conversationId}`);
    });

    socket.on('error', (data) => {
        logEvent('system', `⚠️ Socket error: ${data.message}`);
    });
}

// ── Room ──
function joinConversation() {
    const id = parseInt(document.getElementById('convId').value);
    if (!id || !socket?.connected) return;

    currentConversationId = id;
    socket.emit('join_conversation', { conversationId: id });
    document.getElementById('chatHeader').textContent = `Conversation #${id}`;
    document.getElementById('messagesContainer').innerHTML = '';
    logEvent('emit', `join_conversation → ${id}`);
}

function leaveConversation() {
    if (!currentConversationId || !socket?.connected) return;
    socket.emit('leave_conversation', { conversationId: currentConversationId });
    logEvent('emit', `leave_conversation → ${currentConversationId}`);
    document.getElementById('chatHeader').textContent = 'No conversation joined';
    currentConversationId = null;
}

// ── Send Message (via REST) ──
async function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content || !currentConversationId) return;

    const url = document.getElementById('serverUrl').value.trim();
    const token = document.getElementById('jwtToken').value.trim();

    try {
        const res = await fetch(`${url}/api/v1/messages/conversations/${currentConversationId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'x-csrf-token': document.getElementById('csrfToken').value.trim(),
            },
            body: JSON.stringify({ content }),
        });

        const data = await res.json();
        if (res.ok) {
            logEvent('emit', `REST POST message → "${content.substring(0, 30)}..."`);
            input.value = '';
            stopTyping();
        } else {
            logEvent('system', `⚠️ REST error: ${data.message || res.status}`);
        }
    } catch (err) {
        logEvent('system', `⚠️ Fetch error: ${err.message}`);
    }
}

// ── Mark as Read (via REST) ──
async function markAsRead() {
    if (!currentConversationId) return;
    const url = document.getElementById('serverUrl').value.trim();
    const token = document.getElementById('jwtToken').value.trim();

    try {
        const res = await fetch(`${url}/api/v1/messages/conversations/${currentConversationId}/read`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'x-csrf-token': document.getElementById('csrfToken').value.trim(),
            },
        });
        logEvent('emit', `REST PATCH mark-as-read → conv ${currentConversationId} (${res.status})`);
    } catch (err) {
        logEvent('system', `⚠️ Fetch error: ${err.message}`);
    }
}

// ── Typing Indicators ──
function handleTyping() {
    if (!currentConversationId || !socket?.connected) return;

    if (!isTyping) {
        isTyping = true;
        socket.emit('typing_start', { conversationId: currentConversationId });
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(stopTyping, 2000);
}

function stopTyping() {
    if (isTyping && socket?.connected && currentConversationId) {
        isTyping = false;
        socket.emit('typing_stop', { conversationId: currentConversationId });
    }
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// ── Wire up event listeners (CSP-safe, no inline handlers) ──
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('connectBtn').addEventListener('click', toggleConnection);
    document.getElementById('joinBtn').addEventListener('click', joinConversation);
    document.getElementById('leaveBtn').addEventListener('click', leaveConversation);
    document.getElementById('markReadBtn').addEventListener('click', markAsRead);
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keydown', handleKeyDown);
    document.getElementById('messageInput').addEventListener('input', handleTyping);
});
