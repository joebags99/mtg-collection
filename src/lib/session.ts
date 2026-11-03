/** A stable anonymous id for this browser, so the server can keep data for visitors without an account. */
const SESSION_KEY = 'mtg_session';

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '');
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

let cached: string | null = null;

export function getSessionId(): string {
  if (cached) return cached;
  let id: string | null = null;
  try { id = localStorage.getItem(SESSION_KEY); } catch { /* storage unavailable */ }
  if (!id) {
    id = makeId();
    try { localStorage.setItem(SESSION_KEY, id); } catch { /* storage unavailable */ }
  }
  cached = id;
  return id;
}

/** Start a new anonymous session, e.g. after logging out, so the old one's data is not shown. */
export function resetSession(): string {
  cached = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* storage unavailable */ }
  return getSessionId();
}
