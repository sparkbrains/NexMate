const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

const TOKEN_KEY = 'nextmate.token';
const USER_KEY = 'nextmate.user';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(token, user) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && auth) {
    clearSession();
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
  }

  if (!res.ok) {
    const detail = (data && (data.detail || data.message)) || res.statusText || 'Request failed';
    const err = new Error(typeof detail === 'string' ? detail : 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export async function signup(email, password) {
  const data = await request('/api/auth/signup', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  setSession(data.token, data.user);
  return data;
}

export async function login(email, password) {
  const data = await request('/api/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
  setSession(data.token, data.user);
  return data;
}

export async function logout() {
  const token = getToken();
  try {
    await request('/api/auth/logout', { method: 'POST', body: { token } });
  } finally {
    clearSession();
  }
}

export function listThreads() {
  return request('/api/threads');
}

export function getThreadMessages(threadId) {
  return request(`/api/threads/${encodeURIComponent(threadId)}/messages`);
}

export function deleteThread(threadId) {
  return request(`/api/threads/${encodeURIComponent(threadId)}`, { method: 'DELETE' });
}

export function getDashboardKpis() {
  return request('/api/dashboard/kpis');
}

export function getDashboardInsights(days = 30) {
  return request(`/api/dashboard/insights?days=${encodeURIComponent(days)}`);
}

export function listLoops() {
  return request('/api/loops');
}

export function getLoop(loopId) {
  return request(`/api/loops/${encodeURIComponent(loopId)}`);
}

export function resolveLoop(loopId) {
  return request(`/api/loops/${encodeURIComponent(loopId)}/resolve`, { method: 'POST' });
}

export function listJournalBooks() {
  return request('/api/journal/books');
}

export function getJournalStreak() {
  return request('/api/journal/streak');
}

export function createJournalBook({ name, color = '' }) {
  return request('/api/journal/books', {
    method: 'POST',
    body: { name, color },
  });
}

export function deleteJournalBook(id) {
  return request(`/api/journal/books/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function listJournalEntries(bookId = null) {
  const qs = bookId != null ? `?book_id=${encodeURIComponent(bookId)}` : '';
  return request(`/api/journal${qs}`);
}

export function createJournalEntry({ body, mood_emoji = '', mood_label = '', entry_date = null, translated = '', auto_translate = false, book_id = null }) {
  return request('/api/journal', {
    method: 'POST',
    body: { body, mood_emoji, mood_label, entry_date, translated, auto_translate, book_id },
  });
}

export function deleteJournalEntry(id) {
  return request(`/api/journal/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function chatSocketUrl(threadId) {
  const httpBase = API_BASE_URL;
  const wsBase = httpBase.replace(/^http/i, (m) => (m.toLowerCase() === 'https' ? 'wss' : 'ws'));
  const token = encodeURIComponent(getToken() || '');
  return `${wsBase}/ws/chat/${encodeURIComponent(threadId)}?token=${token}`;
}

export function answerDailyQuestion(questionId) {
  return request(`/api/dashboard/daily-question/${encodeURIComponent(questionId)}/answer`, {
    method: 'POST',
  });
}

export function getDailyQuestionContext(questionId) {
  return request(`/api/dashboard/daily-question/${encodeURIComponent(questionId)}/context`);
}