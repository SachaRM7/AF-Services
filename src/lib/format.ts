export function formatDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  if (!d) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d);
  return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...opts }).format(date);
}

export function formatDateTime(d: string | null | undefined): string {
  return formatDate(d, { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(d: string | null | undefined): string {
  return formatDate(d, { hour: "2-digit", minute: "2-digit" });
}

export function formatKm(km: number | null | undefined): string {
  if (km == null) return "—";
  return `${Number(km).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

/** Date du jour (Europe/Paris) au format AAAA-MM-JJ. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function minutesLabel(min: number | null | undefined): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
