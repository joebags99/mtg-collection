/** Thin fetch wrappers for the backend. Every call carries the session id and, when logged in, the bearer token. */
import { getSessionId } from './session';
import { loadAuthToken } from './storage';

export const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export type Params = Record<string, string | number | boolean | null | undefined>;

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const h: Record<string, string> = { 'X-Session-Id': getSessionId(), ...extra };
  const token = loadAuthToken();
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function withParams(path: string, params: Params): URL {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
  });
  return url;
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(err.detail || 'API error', res.status);
  }
  return res.json() as Promise<T>;
}

async function send(input: string | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (networkErr) {
    console.error(`Network error calling ${input}:`, networkErr);
    throw new Error(`Network error: Cannot reach server at ${API}. Is the backend running?`);
  }
}

export async function apiGet<T>(path: string, params: Params = {}): Promise<T> {
  return parse<T>(await send(withParams(path, params), { headers: headers() }));
}

export async function apiPost<T>(path: string, body?: unknown, params: Params = {}): Promise<T> {
  return parse<T>(await send(withParams(path, params), {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body ?? {}),
  }));
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return parse<T>(await send(API + path, {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  }));
}

export async function apiDelete<T>(path: string): Promise<T> {
  return parse<T>(await send(API + path, { method: 'DELETE', headers: headers() }));
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  return parse<T>(await send(API + path, { method: 'POST', body: form, headers: headers() }));
}
