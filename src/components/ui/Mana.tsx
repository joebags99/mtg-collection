interface ManaSymbolProps {
  symbol: string;
  size?: number;
}

/** One mana symbol from /assets/SVG. Hybrid "W/U" becomes WU.svg; a missing file hides the image. */
export function ManaSymbol({ symbol, size = 20 }: ManaSymbolProps) {
  if (!symbol) return null;
  const filename = symbol.toUpperCase().replace(/\//g, '');
  return (
    <img
      src={`/assets/SVG/${filename}.svg`}
      alt={symbol}
      title={symbol}
      style={{ width: size, height: size }}
      className="inline-block"
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

/** "{2}{U}{U}" -> ["2", "U", "U"] */
export function parseManaSymbols(manaCost: string | undefined | null): string[] {
  if (!manaCost) return [];
  const matches = manaCost.match(/\{([^}]+)\}/g);
  return matches ? matches.map((m) => m.replace(/[{}]/g, '')) : [];
}

export function ManaCost({ cost, size = 18 }: { cost: string | undefined | null; size?: number }) {
  const symbols = parseManaSymbols(cost);
  if (symbols.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      {symbols.map((sym, i) => <ManaSymbol key={i} symbol={sym} size={size} />)}
    </span>
  );
}
