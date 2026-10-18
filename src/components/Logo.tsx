import { cx } from "../lib/format";

export function Logo({ className, inverted = false, compact = false }: { className?: string; inverted?: boolean; compact?: boolean }) {
  const fg = inverted ? "#F5F4F1" : "#292C2B";
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 40 40" className="h-9 w-9 shrink-0" aria-hidden="true">
        <rect x="1" y="1" width="38" height="38" rx="9" fill="none" stroke={fg} strokeWidth="1.5" />
        <path d="M8 29 14.5 11h2.5l6.5 18M10.6 22.5h10.3M27.5 29V11h7.5M27.5 19.5h6" fill="none" stroke={fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className={cx("text-[1.05rem] font-bold tracking-tight", inverted ? "text-paper" : "text-ink")}>AF Nettoyage</span>
          <span className={cx("mt-1 text-[0.62rem] font-semibold uppercase tracking-[0.2em]", inverted ? "text-stone" : "text-ink-muted")}>
            Vitrerie & Entretien
          </span>
        </span>
      )}
    </span>
  );
}
