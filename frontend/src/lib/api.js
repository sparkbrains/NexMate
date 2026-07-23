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

export async function signup(email, password, name, age) {
  const data = await request('/api/auth/signup', {
    method: 'POST',
    body: { email, password, name, age },
    auth: false,
  });
  setSession(data.token, data.user);
  return data;
}

// Step 1 of OTP signup: request a code be emailed to the address. No
// account exists yet — the backend holds a pending signup (including
// name/age) until it's verified.
export async function signupRequestOtp(email, password) {
  return request('/api/auth/signup/request-otp', {
    method: 'POST',
    body: { email, password },
    auth: false,
  });
}

// Ask the backend to send a fresh code to the same pending signup.
export async function resendSignupOtp(email) {
  return request('/api/auth/signup/resend-otp', {
    method: 'POST',
    body: { email },
    auth: false,
  });
}

// Step 2 of OTP signup: verify the code. On success the backend creates
// the account and this returns the same {token, user} shape as login().
export async function signupVerifyOtp(email, otp) {
  const data = await request('/api/auth/signup/verify-otp', {
    method: 'POST',
    body: { email, otp },
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

export function getMe() {
  return request('/api/auth/me');
}

export async function logout() {
  const token = getToken();
  try {
    await request('/api/auth/logout', { method: 'POST', body: { token } });
  } finally {
    clearSession();
  }
}

// --- forgot password ------------------------------------------------
//
// Step 1: request a code be emailed to an existing account. The backend
// doesn't reveal whether the email is registered, so this resolves the
// same way either way.
export async function requestPasswordResetOtp(email) {
  return request('/api/auth/password-reset/request-otp', {
    method: 'POST',
    body: { email },
    auth: false,
  });
}

// Ask the backend to send a fresh code for the same pending reset.
export async function resendPasswordResetOtp(email) {
  return request('/api/auth/password-reset/resend-otp', {
    method: 'POST',
    body: { email },
    auth: false,
  });
}

// Step 2: verify the code. This does NOT change the password — it just
// marks the reset as verified so the caller can prompt for a new one.
export async function verifyPasswordResetOtp(email, otp) {
  return request('/api/auth/password-reset/verify-otp', {
    method: 'POST',
    body: { email, otp },
    auth: false,
  });
}

// Step 3: re-checks the code and sets the new password. No session is
// returned — the backend invalidates existing sessions, so the user
// signs in fresh afterward.
export async function resetPassword(email, otp, newPassword) {
  return request('/api/auth/password-reset/reset', {
    method: 'POST',
    body: { email, otp, new_password: newPassword },
    auth: false,
  });
}

// --- logged-in profile actions --------------------------------------
//
// Both of these invalidate the current session on success (password
// change logs everyone out for safety; account deletion obviously
// does too) — the caller should clearSession() and route back to
// AuthGate afterward.

export async function changePassword(currentPassword, newPassword) {
  const data = await request('/api/auth/change-password', {
    method: 'POST',
    body: { current_password: currentPassword, new_password: newPassword },
  });
  clearSession();
  return data;
}

export async function deleteAccount(password) {
  const data = await request('/api/auth/account', {
    method: 'DELETE',
    body: { password },
  });
  clearSession();
  return data;
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

export function reflectOnLoop(loopId) {
  return request(`/api/loops/${encodeURIComponent(loopId)}/reflect`, { method: 'POST' });
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

export function createJournalEntry({ body, mood_emoji = '', mood_label = '', entry_date = null, translated = '', auto_translate = false, book_id = null, allow_loop_detection = true }) {
  return request('/api/journal', {
    method: 'POST',
    body: { body, mood_emoji, mood_label, entry_date, translated, auto_translate, book_id, allow_loop_detection },
  });
}

export function deleteJournalEntry(id) {
  return request(`/api/journal/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function updateJournalEntry(id, fields) {
  return request(`/api/journal/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: fields,
  });
}

export function getJournalEntry(id) {
  return request(`/api/journal/${encodeURIComponent(id)}`);
}

export function translateJournalEntry({ body, mood_emoji = '', mood_label = '' }) {
  return request('/api/journal/translate', {
    method: 'POST',
    body: { body, mood_emoji, mood_label },
  });
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