import { afterEach, describe, expect, it, vi } from 'vitest';
import { API, apiGet, apiPost } from '../api';

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: status < 400,
    statusText: 'Bad',
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('serializes non-empty params on GET and sends the session header', async () => {
    const fn = mockFetch(200, { ok: true });
    await apiGet('/api/x', { q: 'thr', empty: '', skip: undefined, n: 2 });
    const url = String(fn.mock.calls[0][0]);
    expect(url).toBe(`${API}/api/x?q=thr&n=2`);
    const init = fn.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)['X-Session-Id']).toMatch(/^[0-9a-f]{32}$/);
  });

  it('adds the bearer token when logged in', async () => {
    localStorage.setItem('mtg_auth_token', 'tok');
    const fn = mockFetch(200, { ok: true });
    await apiGet('/api/x');
    expect((fn.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
    localStorage.removeItem('mtg_auth_token');
  });

  it('throws the server detail on error', async () => {
    mockFetch(400, { detail: 'Nope' });
    await expect(apiPost('/api/x', {})).rejects.toThrow('Nope');
  });

  it('wraps network failures with a helpful message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    await expect(apiGet('/api/x')).rejects.toThrow(/Cannot reach server/);
  });
});
