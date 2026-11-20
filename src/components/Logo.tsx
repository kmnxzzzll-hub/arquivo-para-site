/** Temporary text brand — image logo removed while a new one is prepared. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`select-none font-display text-lg font-extrabold tracking-[0.12em] text-foreground ${className}`}
      aria-label="Bac Bo Live"
    >
      BAC BO
    </span>
  );
}
