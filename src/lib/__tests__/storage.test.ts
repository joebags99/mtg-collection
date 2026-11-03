import { beforeEach, describe, expect, it } from 'vitest';
import { clearAuth, loadAuthUser, loadCollection, loadDecks, loadFavorites, saveAuthToken, saveAuthUser, saveCollection, saveDecks, saveFavorites, loadAuthToken } from '../storage';

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips the collection', () => {
    expect(loadCollection()).toBeNull();
    saveCollection({ 'sol ring': 2 });
    expect(loadCollection()).toEqual({ 'sol ring': 2 });
  });

  it('round-trips decks', () => {
    saveDecks({ d1: { id: 'd1', name: 'A', commander: 'X', cards: { 'sol ring': 1 } } });
    expect(loadDecks()?.d1.cards).toEqual({ 'sol ring': 1 });
  });

  it('stores favorites as a Set', () => {
    expect(loadFavorites()).toEqual(new Set());
    saveFavorites(new Set(['sol ring']));
    expect(loadFavorites().has('sol ring')).toBe(true);
  });

  it('tolerates corrupt JSON', () => {
    localStorage.setItem('mtg_favorites', '{not json');
    expect(loadFavorites()).toEqual(new Set());
  });

  it('clears auth', () => {
    saveAuthToken('t');
    saveAuthUser({ id: 1, username: 'joe' });
    expect(loadAuthToken()).toBe('t');
    clearAuth();
    expect(loadAuthToken()).toBeNull();
    expect(loadAuthUser()).toBeNull();
  });
});
