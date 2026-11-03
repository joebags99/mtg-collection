import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ColorBadge } from '../ColorBadge';
import { ManaCost, parseManaSymbols } from '../Mana';
import { MatchBar } from '../MatchBar';
import { AvailDot } from '../DeckBadges';

describe('ui primitives', () => {
  it('parses mana costs', () => {
    expect(parseManaSymbols('{2}{W/U}{G}')).toEqual(['2', 'W/U', 'G']);
    expect(parseManaSymbols('')).toEqual([]);
  });

  it('renders one image per symbol with hybrid slashes stripped', () => {
    render(<ManaCost cost="{1}{W/U}" />);
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[1]).toHaveAttribute('src', '/assets/SVG/WU.svg');
  });

  it('shows C for colorless identity', () => {
    render(<ColorBadge colors={[]} />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('colors the match bar by threshold', () => {
    const { container } = render(<MatchBar percentage={75} />);
    expect(container.querySelector('.bg-green-500')).not.toBeNull();
  });

  it('describes availability in the title', () => {
    render(<AvailDot card={{ qty_owned: 2, qty_in_decks: 1, in_decks: [{ id: 'd', name: 'Deck' }] }} />);
    expect(screen.getByTitle('Owned: 2, In decks: 1 (Deck)')).toBeInTheDocument();
  });
});
