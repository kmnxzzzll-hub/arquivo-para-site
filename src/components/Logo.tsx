const FONT = "-apple-system, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif";

/** Dado com volume: corpo em gradiente, brilho superior, borda de luz e pontos com relevo. */
function Die({ id, pips, x, y, rot }: { id: "blue" | "red"; pips: [number, number][]; x: number; y: number; rot: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot} 30 30)`} filter="url(#bb-shadow)">
      <rect width="60" height="60" rx="16" fill={`url(#bb-${id})`} />
      <rect width="60" height="60" rx="16" fill="url(#bb-gloss)" />
      <rect x="0.75" y="0.75" width="58.5" height="58.5" rx="15.3" fill="none" stroke="white" strokeOpacity="0.45" strokeWidth="1.5" />
      <rect x="1" y="52" width="58" height="7" rx="3.5" fill="black" opacity="0.18" />
      {pips.map(([px, py], i) => (
        <g key={i}>
          <circle cx={px} cy={py + 1} r="5.2" fill="black" opacity="0.28" />
          <circle cx={px} cy={py} r="5" fill="url(#bb-pip)" />
        </g>
      ))}
    </g>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 300 110" role="img" aria-label="Bac Bo Live" className={`h-auto overflow-visible ${className}`} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bb-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="oklch(0.96 0.09 95)" />
          <stop offset="0.45" stopColor="oklch(0.82 0.14 85)" />
          <stop offset="1" stopColor="oklch(0.6 0.12 68)" />
        </linearGradient>
        <linearGradient id="bb-blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.75 0.17 252)" />
          <stop offset="1" stopColor="oklch(0.46 0.22 264)" />
        </linearGradient>
        <linearGradient id="bb-red" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.74 0.19 28)" />
          <stop offset="1" stopColor="oklch(0.48 0.22 25)" />
        </linearGradient>
        <linearGradient id="bb-gloss" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="white" stopOpacity="0.05" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="bb-pip" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="white" />
          <stop offset="1" stopColor="oklch(0.88 0.02 250)" />
        </radialGradient>
        <linearGradient id="bb-live" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="oklch(0.66 0.23 25)" />
          <stop offset="1" stopColor="oklch(0.5 0.22 22)" />
        </linearGradient>
        <filter id="bb-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="black" floodOpacity="0.5" />
        </filter>
        <filter id="bb-glow" x="-20%" y="-40%" width="140%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="oklch(0.8 0.13 85)" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Dado azul (Player) com 5 pontos */}
      <g className="animate-float">
        <Die id="blue" x={4} y={14} rot={-10} pips={[[16, 16], [44, 16], [30, 30], [16, 44], [44, 44]]} />
      </g>
      {/* Dado vermelho (Banker) com 6 pontos */}
      <g className="animate-float" style={{ animationDelay: "-2s" }}>
        <Die id="red" x={52} y={30} rot={9} pips={[[18, 15], [42, 15], [18, 30], [42, 30], [18, 45], [42, 45]]} />
      </g>

      {/* Nome */}
      <g filter="url(#bb-glow)">
        <text x="124" y="60" fontFamily={FONT} fontWeight="900" fontSize="44" letterSpacing="-1.5" fill="url(#bb-gold)" stroke="oklch(0.45 0.09 70)" strokeOpacity="0.5" strokeWidth="0.8">BAC BO</text>
      </g>

      {/* Selo LIVE */}
      <g transform="translate(126 70)">
        <rect width="78" height="26" rx="13" fill="url(#bb-live)" />
        <rect x="0.5" y="0.5" width="77" height="25" rx="12.5" fill="none" stroke="white" strokeOpacity="0.35" />
        <circle cx="15" cy="13" r="4.5" fill="white" />
        <text x="26" y="18.5" fontFamily={FONT} fontWeight="800" fontSize="14" letterSpacing="3" fill="white">LIVE</text>
      </g>
    </svg>
  );
}
