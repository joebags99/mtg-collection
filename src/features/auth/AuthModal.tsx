import { useState, type FormEvent } from 'react';
import { apiPost } from '../../lib/api';
import { saveAuthToken, saveAuthUser } from '../../lib/storage';
import type { AuthResponse, AuthUser } from '../../types/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (user: AuthUser, token: string) => void;
}

type Mode = 'login' | 'register';

export function AuthModal({ isOpen, onClose, onLogin }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const data = await apiPost<AuthResponse>(endpoint, { username, password });
      saveAuthToken(data.token);
      saveAuthUser(data.user);
      onLogin(data.user, data.token);
      onClose();
      setLoading(false);
    } catch (err) {
      console.error('Auth error:', err);
      setError((err as Error).message || 'Something went wrong. Check if the backend is running.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const switchMode = (next: Mode) => { setMode(next); setError(''); };

  return (
    <div className="fixed inset-0 bg-surface-0/70 flex items-center justify-center z-50 p-4">
      <div className="bg-surface-2 rounded-lg p-6 w-full max-w-sm space-y-4 page-fade-in">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">{mode === 'login' ? 'Login' : 'Create Account'}</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-xl">&times;</button>
        </div>

        <p className="text-sm text-ink-muted">
          {mode === 'login'
            ? 'Login to sync your collection and decks across devices.'
            : 'Create an account to save your collection and decks to the cloud.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-ink-muted mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              className="w-full bg-surface-1 border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-accent/70"
              required
              minLength={3}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-ink-muted mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full bg-surface-1 border border-line rounded px-3 py-2 text-sm focus:outline-none focus:border-accent/70"
              required
              minLength={4}
            />
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/40 rounded p-2 text-danger text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent text-accent-ink hover:bg-accent-hi disabled:bg-surface-3 disabled:text-ink-faint px-4 py-2 rounded font-medium transition-colors"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Login' : 'Create Account'}
          </button>
        </form>

        <div className="text-center text-sm text-ink-faint">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button onClick={() => switchMode('register')} className="text-accent hover:underline">Create one</button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={() => switchMode('login')} className="text-accent hover:underline">Login</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
