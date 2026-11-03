/** Thin fetch wrappers for the backend. Every call resolves to parsed JSON or throws an Error with the server's detail. */
import { loadAuthToken } from './storage';

export const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

type Params = Record<string, string | number | boolean | null | undefined>;

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'API error');
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

function authHeaders(): Record<string, string> {
  const token = loadAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string, params: Params = {}): Promise<T> {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
  });
  return parse<T>(await send(url));
}

export async function apiPost<T>(path: string, body?: unknown, params: Params = {}): Promise<T> {
  const url = new URL(API + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
  });
  return parse<T>(await send(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }));
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  return parse<T>(await send(API + path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }));
}

export async function apiDelete<T>(path: string): Promise<T> {
  return parse<T>(await send(API + path, { method: 'DELETE' }));
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  return parse<T>(await send(API + path, { method: 'POST', body: form }));
}

export async function apiAuthPost<T>(path: string, body: unknown): Promise<T> {
  return parse<T>(await send(API + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(body),
  }));
}

export async function apiAuthGet<T>(path: string): Promise<T> {
  return parse<T>(await send(API + path, { headers: authHeaders() }));
}
