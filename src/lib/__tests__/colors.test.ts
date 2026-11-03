import { describe, expect, it } from 'vitest';
import { getColorGlow } from '../colors';

describe('getColorGlow', () => {
  it('falls back for colorless', () => {
    expect(getColorGlow([])).toBe('rgba(128,128,128,0.3)');
  });
  it('uses the single color', () => {
    expect(getColorGlow(['R'])).toBe('rgba(224,90,79,0.4)');
  });
  it('averages several colors', () => {
    expect(getColorGlow(['W', 'B'])).toBe('rgba(201,183,201,0.4)');
  });
});
