/** Brand mark — dice chip mark + wordmark for Bac Bo Live */
export function Logo({
  className = "",
  markOnly = false,
}: {
  className?: string;
  markOnly?: boolean;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Bac Bo Live">
      <svg
        width="36"
        height="36"
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 drop-shadow-[0_0_12px_oklch(0.62_0.2_262/0.45)]"
        aria-hidden
      >
        <defs>
          <linearGradient id="bbg" x1="6" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.55 0.2 262)" />
            <stop offset="1" stopColor="oklch(0.42 0.18 280)" />
          </linearGradient>
          <linearGradient id="bbgold" x1="12" y1="10" x2="28" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="oklch(0.9 0.12 90)" />
            <stop offset="1" stopColor="oklch(0.72 0.14 75)" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#bbg)" />
        <rect x="2.5" y="2.5" width="35" height="35" rx="10.5" stroke="white" strokeOpacity="0.18" />
        {/* chip ring */}
        <circle cx="20" cy="20" r="11.5" stroke="url(#bbgold)" strokeWidth="1.6" fill="none" />
        <circle cx="20" cy="20" r="8.2" fill="oklch(0.18 0.04 265)" />
        {/* dice pips */}
        <circle cx="16.2" cy="16.2" r="1.35" fill="url(#bbgold)" />
        <circle cx="23.8" cy="16.2" r="1.35" fill="url(#bbgold)" />
        <circle cx="20" cy="20" r="1.35" fill="url(#bbgold)" />
        <circle cx="16.2" cy="23.8" r="1.35" fill="url(#bbgold)" />
        <circle cx="23.8" cy="23.8" r="1.35" fill="url(#bbgold)" />
      </svg>
      {!markOnly && (
        <span className="font-display text-[15px] font-extrabold uppercase tracking-[0.18em] text-foreground">
          Bac Bo<span className="text-primary"> Live</span>
        </span>
      )}
    </span>
  );
}
