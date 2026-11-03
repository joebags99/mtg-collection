/** localStorage persistence for the auth session. Everything else lives on the server. */
import type { AuthUser } from '../types/api';

export const AUTH_TOKEN_KEY = 'mtg_auth_token';
export const AUTH_USER_KEY = 'mtg_auth_user';

export function saveAuthToken(token: string): void {
  try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch (e) { console.error('Failed to save auth token:', e); }
}

export function loadAuthToken(): string | null {
  try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; }
}

export function saveAuthUser(user: AuthUser): void {
  try { localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user)); } catch (e) { console.error('Failed to save auth user:', e); }
}

export function loadAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  } catch { /* storage unavailable */ }
}

/** Keys written by earlier versions of the app, removed on startup. */
export function clearLegacyStorage(): void {
  try {
    ['mtg_collection', 'mtg_decks', 'mtg_favorites'].forEach((k) => localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
}
