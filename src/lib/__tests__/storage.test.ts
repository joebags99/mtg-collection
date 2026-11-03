import { beforeEach, describe, expect, it } from 'vitest';
import { getSessionId, resetSession } from '../session';
import { clearAuth, clearLegacyStorage, loadAuthToken, loadAuthUser, saveAuthToken, saveAuthUser } from '../storage';

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips auth and clears it', () => {
    saveAuthToken('t');
    saveAuthUser({ id: 1, username: 'joe' });
    expect(loadAuthToken()).toBe('t');
    expect(loadAuthUser()).toEqual({ id: 1, username: 'joe' });
    clearAuth();
    expect(loadAuthToken()).toBeNull();
    expect(loadAuthUser()).toBeNull();
  });

  it('tolerates corrupt JSON', () => {
    localStorage.setItem('mtg_auth_user', '{not json');
    expect(loadAuthUser()).toBeNull();
  });

  it('removes keys written by earlier versions', () => {
    localStorage.setItem('mtg_collection', '{}');
    clearLegacyStorage();
    expect(localStorage.getItem('mtg_collection')).toBeNull();
  });
});

describe('session', () => {
  beforeEach(() => { localStorage.clear(); resetSession(); });

  it('is stable across calls and persisted', () => {
    const id = getSessionId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(getSessionId()).toBe(id);
    expect(localStorage.getItem('mtg_session')).toBe(id);
  });

  it('changes on reset', () => {
    const before = getSessionId();
    expect(resetSession()).not.toBe(before);
  });
});
