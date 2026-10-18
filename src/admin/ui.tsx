import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ChevronLeft, Loader2, Search, X } from "lucide-react";
import { cx } from "../lib/format";
import { TONE_CLASSES, type Tone } from "./labels";

export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link to={back} className="mb-2 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
            <ChevronLeft className="h-4 w-4" /> Retour
          </Link>
        )}
        <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1 text-sm text-ink-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={cx("chip whitespace-nowrap", TONE_CLASSES[tone])}>{children}</span>;
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-sm text-ink-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-900/25 bg-red-50 p-4 text-sm text-red-900">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">{error}</div>
      {onRetry && <button className="font-semibold underline" onClick={onRetry}>Réessayer</button>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone/70 px-6 py-12 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-ink-muted">{children}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("card p-4 sm:p-5", className)}>
      {(title || actions) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-sm font-bold uppercase tracking-wider text-ink-muted">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, className, htmlFor }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Rechercher…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone" />
      <input type="search" className="input pl-9" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[] }) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="inline-flex gap-1 rounded-full border border-stone/50 bg-white p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={cx("whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold", value === t.value ? "bg-ink text-paper" : "text-ink-muted hover:text-ink")}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button className="btn-ghost btn-sm -mr-2" onClick={onClose} aria-label="Fermer"><X className="h-4 w-4" /></button>
        </div>
        {children}
        {footer && <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

// --- Confirmation -----------------------------------------------------------

interface ConfirmOptions { title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        footer={
          <>
            <button className="btn-ghost" onClick={() => close(false)}>Annuler</button>
            <button className={state?.danger ? "btn-danger" : "btn-primary"} onClick={() => close(true)}>{state?.confirmLabel ?? "Confirmer"}</button>
          </>
        }
      >
        {state?.message && <div className="text-sm text-ink-soft">{state.message}</div>}
      </Modal>
    </ConfirmCtx.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmCtx);

// --- Notifications ----------------------------------------------------------

interface Toast { id: number; text: string; tone: "ok" | "bad" }
const ToastCtx = createContext<(text: string, tone?: "ok" | "bad") => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: "ok" | "bad" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "bad" ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[3000] flex flex-col items-center gap-2 px-4 lg:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx("pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm shadow-lg", t.tone === "ok" ? "bg-ink text-paper" : "bg-red-900 text-white")}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/** Exécute une action avec notification de succès / d'erreur et état "en cours". */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const r = await fn();
        if (success) toast(success);
        return r;
      } catch (e) {
        toast((e as Error).message, "bad");
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, run };
}

export function Stat({ label, value, hint, to }: { label: string; value: ReactNode; hint?: ReactNode; to?: string }) {
  const inner = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </>
  );
  return to ? (
    <Link to={to} className="card block p-4 transition hover:border-ink">{inner}</Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}
