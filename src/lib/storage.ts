/** localStorage persistence for the collection, decks, favorites, and auth session. */
import type { AuthUser, StoredDeck } from '../types/api';

export const STORAGE_KEY = 'mtg_collection';
export const DECKS_STORAGE_KEY = 'mtg_decks';
export const AUTH_TOKEN_KEY = 'mtg_auth_token';
export const AUTH_USER_KEY = 'mtg_auth_user';
export const FAVORITES_STORAGE_KEY = 'mtg_favorites';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    console.error(`Failed to load ${key} from localStorage:`, e);
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Failed to save ${key} to localStorage:`, e);
  }
}

export function saveAuthToken(token: string): void {
  try { localStorage.setItem(AUTH_TOKEN_KEY, token); } catch (e) { console.error('Failed to save auth token:', e); }
}
export function loadAuthToken(): string | null {
  try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; }
}
export function saveAuthUser(user: AuthUser): void { write(AUTH_USER_KEY, user); }
export function loadAuthUser(): AuthUser | null { return read<AuthUser>(AUTH_USER_KEY); }
export function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function saveCollection(cards: Record<string, number>): void { write(STORAGE_KEY, cards); }
export function loadCollection(): Record<string, number> | null { return read<Record<string, number>>(STORAGE_KEY); }
export function clearCollection(): void { localStorage.removeItem(STORAGE_KEY); }

export function saveDecks(decks: Record<string, StoredDeck>): void { write(DECKS_STORAGE_KEY, decks); }
export function loadDecks(): Record<string, StoredDeck> | null { return read<Record<string, StoredDeck>>(DECKS_STORAGE_KEY); }

export function saveFavorites(favs: Set<string>): void { write(FAVORITES_STORAGE_KEY, [...favs]); }
export function loadFavorites(): Set<string> {
  const list = read<string[]>(FAVORITES_STORAGE_KEY);
  return new Set(Array.isArray(list) ? list : []);
}
