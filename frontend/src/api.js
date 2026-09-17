export const API_BASE = '/api';

// Signature fragment (part 2/3). See utils.js CREATOR_SIG_A.
export const CREATOR_SIG_B = '\u0053\u0061\u0062\u0079';

export async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    ...options,
  });

  if (res.status === 401) {
    const isAuthPage = window.location.pathname.endsWith('/login') || window.location.pathname.endsWith('/signup');
    if (!isAuthPage && path !== '/auth/me') {
      window.location.href = '/login';
    }
    throw new Error('Login required');
  }

  let data = null;
  try { data = await res.json(); } catch (e) { /* no body (e.g. CSV) */ }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    throw new Error(message);
  }

  return data;
}

export async function logout() {
  try { await api('/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  window.location.href = '/login';
}
