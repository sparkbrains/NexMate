const state = {
  threadId: null,
  threads: [],
  socket: null,
  streamBubble: null,
  pendingMessage: null,
  threadTitleSeeds: {},
};

const threadListEl = document.getElementById("thread-list");
const messageListEl = document.getElementById("message-list");
const threadTitleEl = document.getElementById("thread-title");
const statusPillEl = document.getElementById("status-pill");
const newThreadBtn = document.getElementById("new-thread-btn");
const deleteThreadBtn = document.getElementById("delete-thread-btn");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");


function createThreadId() {
  return `thread-${Date.now()}`;
}

function setStatus(text) {
  statusPillEl.textContent = text;
}

function renderThreads() {
  threadListEl.innerHTML = "";
  state.threads.forEach((thread) => {
    const item = document.createElement("button");
    item.className = `thread-item ${thread.thread_id === state.threadId ? "active" : ""}`;
    item.type = "button";
    item.innerHTML = `
      <h3>${thread.title || thread.thread_id}</h3>
      <p>${thread.preview || "New conversation"}</p>
    `;
    item.addEventListener("click", () => selectThread(thread.thread_id));
    threadListEl.appendChild(item);
  });
}

function renderMessages(messages) {
  messageListEl.innerHTML = "";
  messages.forEach((msg) => appendMessage(msg.role, msg.content));
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return html;
}

function renderMarkdown(mdText) {
  const source = String(mdText || "").replace(/\r\n/g, "\n");
  const lines = source.split("\n");
  const out = [];
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let paragraphBuffer = [];

  const flushParagraph = () => {
    if (!paragraphBuffer.length) {
      return;
    }
    const content = paragraphBuffer.map((line) => renderInlineMarkdown(line)).join("<br>");
    out.push(`<p>${content}</p>`);
    paragraphBuffer = [];
  };

  const closeLists = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };

  lines.forEach((rawLine) => {
    const line = rawLine || "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      closeLists();
      if (!inCode) {
        inCode = true;
        out.push("<pre><code>");
      } else {
        inCode = false;
        out.push("</code></pre>");
      }
      return;
    }

    if (inCode) {
      out.push(`${escapeHtml(line)}\n`);
      return;
    }

    if (!trimmed) {
      flushParagraph();
      closeLists();
      return;
    }

    const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
    if (ulMatch) {
      flushParagraph();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push("<ul>");
        inUl = true;
      }
      out.push(`<li>${renderInlineMarkdown(ulMatch[1])}</li>`);
      return;
    }

    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (olMatch) {
      flushParagraph();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push("<ol>");
        inOl = true;
      }
      out.push(`<li>${renderInlineMarkdown(olMatch[1])}</li>`);
      return;
    }

    closeLists();
    paragraphBuffer.push(line);
  });

  flushParagraph();
  closeLists();
  if (inCode) {
    out.push("</code></pre>");
  }

  return out.join("");
}

function appendMessage(role, content) {
  const row = document.createElement("div");
  row.className = `message ${role}`;
  if (role === "assistant") {
    row.dataset.raw = content || "";
    row.innerHTML = renderMarkdown(content || "");
  } else {
    row.textContent = content;
  }
  messageListEl.appendChild(row);
  messageListEl.scrollTop = messageListEl.scrollHeight;
  return row;
}

function beginAssistantStream() {
  state.streamBubble = appendMessage("assistant", "");
}

function appendAssistantStream(delta) {
  if (!state.streamBubble) {
    beginAssistantStream();
  }
  const previous = state.streamBubble.dataset.raw || "";
  const next = previous + delta;
  state.streamBubble.dataset.raw = next;
  state.streamBubble.textContent = next;
  messageListEl.scrollTop = messageListEl.scrollHeight;
}

function endAssistantStream(finalText) {
  if (!state.streamBubble) {
    state.streamBubble = appendMessage("assistant", finalText || "");
  } else if (finalText && !(state.streamBubble.dataset.raw || "").trim()) {
    state.streamBubble.dataset.raw = finalText;
    state.streamBubble.textContent = finalText;
  }
  const raw = state.streamBubble?.dataset.raw || state.streamBubble?.textContent || "";
  state.streamBubble.innerHTML = renderMarkdown(raw);
  const rendered = raw.trim();
  if (rendered) {
    upsertThread(state.threadId, rendered);
  }
  state.streamBubble = null;
}

function compactTitle(parts) {
  if (!parts.length) {
    return "New thread";
  }
  const joined = parts.slice(0, 2).join(" | ");
  return joined.length > 56 ? `${joined.slice(0, 56)}…` : joined;
}

function updateTitleSeed(threadId, userText) {
  const trimmed = (userText || "").trim();
  const existing = state.threadTitleSeeds[threadId] || [];
  if (trimmed && existing.length < 2) {
    existing.push(trimmed);
  }
  state.threadTitleSeeds[threadId] = existing;
  return compactTitle(existing);
}

function upsertThread(threadId, preview, titleOverride = null) {
  const existing = state.threads.find((t) => t.thread_id === threadId);
  if (existing) {
    existing.preview = preview;
    if (titleOverride) {
      existing.title = titleOverride;
    }
    existing.updated_at = new Date().toISOString();
  } else {
    state.threads.unshift({
      thread_id: threadId,
      title: titleOverride || preview.slice(0, 40) || threadId,
      preview,
      updated_at: new Date().toISOString(),
    });
  }
  state.threads.sort((a, b) => (a.updated_at > b.updated_at ? -1 : 1));
  renderThreads();
}

async function refreshThreadsPreserveSelection() {
  const res = await fetch("/api/threads");
  const data = await res.json();
  state.threads = data.threads || [];
  renderThreads();
}

async function loadThreads() {
  const res = await fetch("/api/threads");
  const data = await res.json();
  state.threads = data.threads || [];
  if (!state.threads.length) {
    const id = createThreadId();
    state.threads = [{ thread_id: id, title: "New thread", preview: "Start chatting", updated_at: new Date().toISOString() }];
  }
  renderThreads();
  if (!state.threadId) {
    await selectThread(state.threads[0].thread_id);
  }
}

async function selectThread(threadId) {
  state.threadId = threadId;
  threadTitleEl.textContent = threadId;
  renderThreads();

  const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}/messages`);
  const data = await res.json();
  renderMessages(data.messages || []);
  connectSocket();
}

function connectSocket() {
  if (!state.threadId) {
    return;
  }
  if (state.socket) {
    state.socket.close();
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const url = `${protocol}://${window.location.host}/ws/chat/${encodeURIComponent(state.threadId)}`;
  const ws = new WebSocket(url);
  state.socket = ws;

  ws.onclose = () => setStatus("Disconnected");
  ws.onerror = () => setStatus("Error");
  ws.onopen = () => {
    setStatus("Connected");
    if (state.pendingMessage) {
      ws.send(JSON.stringify({ message: state.pendingMessage }));
      state.pendingMessage = null;
    }
  };

  ws.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    const eventType = payload.event || "message";
    if (eventType === "start") {
      beginAssistantStream();
      return;
    }
    if (eventType === "chunk") {
      appendAssistantStream(payload.delta || "");
      return;
    }
    if (eventType === "done") {
      endAssistantStream(payload.content || "");
      refreshThreadsPreserveSelection().catch(() => {
        // Keep local sidebar state when refresh fails.
      });
      return;
    }
    appendMessage(payload.role || "assistant", payload.content || "");
    upsertThread(state.threadId, payload.content || "Updated");
  };
}

async function deleteCurrentThread() {
  if (!state.threadId) {
    return;
  }
  const targetThread = state.threadId;
  const ok = window.confirm(`Delete thread "${targetThread}"?`);
  if (!ok) {
    return;
  }

  const res = await fetch(`/api/threads/${encodeURIComponent(targetThread)}`, { method: "DELETE" });
  if (!res.ok) {
    setStatus("Delete failed");
    return;
  }

  if (state.socket) {
    state.socket.close();
    state.socket = null;
  }

  state.threads = state.threads.filter((t) => t.thread_id !== targetThread);
  delete state.threadTitleSeeds[targetThread];
  state.streamBubble = null;
  state.pendingMessage = null;

  if (state.threads.length) {
    await selectThread(state.threads[0].thread_id);
    return;
  }

  const newId = createThreadId();
  state.threadTitleSeeds[newId] = [];
  state.threads = [{
    thread_id: newId,
    title: "New thread",
    preview: "Start chatting",
    updated_at: new Date().toISOString(),
  }];
  messageListEl.innerHTML = "";
  await selectThread(newId);
}

function sendMessage(text) {
  if (!text.trim()) {
    return;
  }
  appendMessage("user", text);
  const title = updateTitleSeed(state.threadId, text);
  upsertThread(state.threadId, text, title);

  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    state.pendingMessage = text;
    connectSocket();
    return;
  }
  state.socket.send(JSON.stringify({ message: text }));
}

newThreadBtn.addEventListener("click", async () => {
  const threadId = createThreadId();
  state.threadTitleSeeds[threadId] = [];
  state.threads.unshift({
    thread_id: threadId,
    title: "New thread",
    preview: "Start chatting",
    updated_at: new Date().toISOString(),
  });
  await selectThread(threadId);
});

deleteThreadBtn.addEventListener("click", () => {
  deleteCurrentThread().catch(() => {
    setStatus("Delete failed");
  });
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) {
    return;
  }
  chatInput.value = "";
  sendMessage(text);
});

chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

loadThreads().catch(() => {
  setStatus("Failed to load");
});
