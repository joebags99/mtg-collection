import { describe, expect, it } from 'vitest';
import { getColorGlow } from '../colors';

describe('getColorGlow', () => {
  it('falls back for colorless', () => {
    expect(getColorGlow([])).toBe('rgba(128,128,128,0.3)');
  });
  it('uses the single color', () => {
    expect(getColorGlow(['R'])).toBe('rgba(211,32,41,0.4)');
  });
  it('averages several colors', () => {
    expect(getColorGlow(['W', 'B'])).toBe('rgba(175,165,182,0.4)');
  });
});
