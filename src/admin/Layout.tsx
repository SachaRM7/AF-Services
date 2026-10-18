import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3, CalendarDays, ClipboardList, FileSignature, Home, Inbox, LogOut, Menu, Receipt, ScrollText, Settings,
  Tags, Users, X,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { supabase } from "../lib/supabase";
import { cx } from "../lib/format";
import { useAuth } from "./auth";
import { useSettings } from "./settingsStore";

const NAV = [
  { to: "/admin", label: "Tableau de bord", icon: Home, end: true },
  { to: "/admin/demandes", label: "Demandes", icon: Inbox },
  { to: "/admin/clients", label: "Clients", icon: Users },
  { to: "/admin/diagnostics", label: "Diagnostics", icon: ClipboardList },
  { to: "/admin/devis", label: "Devis", icon: FileSignature },
  { to: "/admin/factures", label: "Factures", icon: Receipt },
  { to: "/admin/planning", label: "Planning", icon: CalendarDays },
  { to: "/admin/finances", label: "Finances", icon: BarChart3 },
  { to: "/admin/prestations", label: "Prestations & tarifs", icon: Tags },
  { to: "/admin/parametres", label: "Paramètres", icon: Settings },
  { to: "/admin/journal", label: "Journal", icon: ScrollText },
];

const MOBILE_TABS = [NAV[0], NAV[1], NAV[6], NAV[4]];

export default function AdminLayout() {
  const { session, profileName } = useAuth();
  const { settings } = useSettings();
  const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setMenu(false), [pathname]);

  const nav = (
    <nav className="flex flex-col gap-0.5" aria-label="Navigation administration">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium", isActive ? "bg-paper text-ink" : "text-stone hover:bg-ink-soft hover:text-paper")
          }
        >
          <Icon className="h-4 w-4" strokeWidth={1.8} /> {label}
        </NavLink>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-paper/10 pt-4 text-xs text-stone">
      <p className="truncate font-semibold text-paper">{profileName || session?.user.email}</p>
      <button className="mt-2 inline-flex items-center gap-1.5 hover:text-paper" onClick={() => supabase.auth.signOut()}>
        <LogOut className="h-3.5 w-3.5" /> Déconnexion
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-paper lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col justify-between bg-ink p-4 lg:flex">
        <div>
          <Link to="/admin" className="mb-8 block px-2 pt-2"><Logo inverted /></Link>
          {nav}
        </div>
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-stone/30 bg-ink px-4 text-paper lg:hidden">
        <Link to="/admin"><Logo inverted compact /></Link>
        <button className="p-2" onClick={() => setMenu(true)} aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button>
      </header>
      {menu && (
        <div className="fixed inset-0 z-50 flex flex-col justify-between overflow-y-auto bg-ink p-4 lg:hidden">
          <div>
            <div className="mb-6 flex items-center justify-between">
              <Logo inverted />
              <button className="p-2 text-paper" onClick={() => setMenu(false)} aria-label="Fermer le menu"><X className="h-5 w-5" /></button>
            </div>
            {nav}
          </div>
          {footer}
        </div>
      )}

      {settings?.mode === "preparation" && (
        <div className="border-b border-amber-900/20 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900">
          Mode préparation — les documents émis sont des <strong>simulations</strong> sans valeur commerciale.{" "}
          <Link to="/admin/parametres?onglet=mode" className="underline">Paramètres</Link>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pt-10">
        <Outlet />
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone/40 bg-white lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="Raccourcis">
        {MOBILE_TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx("flex flex-col items-center gap-0.5 py-2 text-[0.65rem] font-semibold", isActive ? "text-ink" : "text-ink-muted")}>
            <Icon className="h-5 w-5" strokeWidth={1.8} />
            {label.split(" ")[0]}
          </NavLink>
        ))}
        <button onClick={() => setMenu(true)} className="flex flex-col items-center gap-0.5 py-2 text-[0.65rem] font-semibold text-ink-muted">
          <Menu className="h-5 w-5" strokeWidth={1.8} /> Plus
        </button>
      </nav>
    </div>
  );
}
