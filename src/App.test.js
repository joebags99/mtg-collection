import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  // No backend in tests: every request fails like an unreachable server
  global.fetch = jest.fn(() => Promise.reject(new Error('offline')));
});

test('renders the app shell without a backend', () => {
  render(<App />);
  expect(screen.getByText('MTG Commander Recommender')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Upload Collection' })).toBeInTheDocument();
});
