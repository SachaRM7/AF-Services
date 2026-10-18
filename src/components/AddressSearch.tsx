import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Loader2 } from "lucide-react";
import { searchAddress, type GeoResult } from "../lib/geocode";
import { cx } from "../lib/format";

/** Champ d'adresse avec suggestions (combobox accessible). */
export function AddressSearch({
  value,
  onChange,
  onSelect,
  placeholder = "Ex. 12 rue de Metz, Toulouse",
  id,
  required,
  inputClassName,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: GeoResult) => void;
  placeholder?: string;
  id?: string;
  required?: boolean;
  inputClassName?: string;
}) {
  const [results, setResults] = useState<GeoResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const skipNext = useRef(false);
  const listId = useId();

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (value.trim().length < 4) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await searchAddress(value, ctrl.signal);
        setResults(r);
        setOpen(true);
        setActive(-1);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("Recherche d'adresse momentanément indisponible.");
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [value]);

  function choose(r: GeoResult) {
    skipNext.current = true;
    onChange(r.label);
    onSelect(r);
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone" aria-hidden />
        <input
          id={id}
          className={cx("input pl-9", inputClassName)}
          value={value}
          required={required}
          autoComplete="street-address"
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-stone" aria-hidden />}
      </div>
      {error && <p className="field-hint text-red-800">{error}</p>}
      {open && results.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-[1000] mt-1 max-h-72 w-full overflow-auto rounded-xl border border-stone/50 bg-white py-1 shadow-lg">
          {results.map((r, i) => (
            <li
              key={`${r.label}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={cx("cursor-pointer px-3 py-2 text-sm", i === active ? "bg-paper" : "hover:bg-paper")}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
            >
              <span className="font-medium">{r.street || r.label}</span>
              <span className="ml-1 text-ink-muted">
                {r.postcode} {r.city}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
