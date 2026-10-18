import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, Phone, X } from "lucide-react";
import { Logo } from "../components/Logo";
import { usePublicConfig } from "../lib/publicConfig";
import { cx } from "../lib/format";

const NAV = [
  { to: "/prestations", label: "Prestations" },
  { to: "/zone-intervention", label: "Zone d'intervention" },
  { to: "/contact", label: "Contact" },
];

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const config = usePublicConfig();

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">
        Aller au contenu
      </a>
      <header className="sticky top-0 z-40 border-b border-stone/30 bg-paper/90 backdrop-blur">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Link to="/" aria-label="AF Nettoyage — accueil">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Navigation principale">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  cx("rounded-full px-3.5 py-2 text-sm font-medium transition-colors", isActive ? "bg-ink/5 text-ink" : "text-ink-muted hover:text-ink")
                }
              >
                {n.label}
              </NavLink>
            ))}
            <Link to="/devis" className="btn-primary ml-3">
              Demander un devis
            </Link>
          </nav>
          <button className="btn-ghost -mr-2 px-3 md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <nav className="border-t border-stone/30 bg-paper md:hidden" aria-label="Navigation mobile">
            <div className="container-page flex flex-col py-3">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} className="border-b border-stone/20 py-3.5 text-lg font-medium">
                  {n.label}
                </NavLink>
              ))}
              <Link to="/devis" className="btn-primary mt-4">
                Demander un devis
              </Link>
            </div>
          </nav>
        )}
      </header>

      <main id="contenu" className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-24 bg-ink pb-24 pt-14 text-paper md:pb-14">
        <div className="container-page grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo inverted />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-stone">
              Vitrerie et entretien pour particuliers et professionnels à Toulouse et dans son agglomération. Départ des
              interventions : {config.base_label}.
            </p>
          </div>
          <div>
            <p className="eyebrow text-stone">Le site</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link to="/prestations" className="hover:underline">Prestations</Link></li>
              <li><Link to="/zone-intervention" className="hover:underline">Zone et frais de déplacement</Link></li>
              <li><Link to="/devis" className="hover:underline">Demande de devis</Link></li>
              <li><Link to="/contact" className="hover:underline">Contact</Link></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow text-stone">Informations</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li><Link to="/mentions-legales" className="hover:underline">Mentions légales</Link></li>
              <li><Link to="/confidentialite" className="hover:underline">Confidentialité & données personnelles</Link></li>
              {config.phone && <li><a href={`tel:${config.phone.replace(/\s/g, "")}`} className="hover:underline">{config.phone}</a></li>}
              {config.email && <li><a href={`mailto:${config.email}`} className="hover:underline">{config.email}</a></li>}
            </ul>
          </div>
        </div>
        <div className="container-page mt-12 flex flex-col gap-2 border-t border-paper/10 pt-6 text-xs text-stone sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} {config.trade_name}</p>
          <p>Toulouse · Colomiers · Tournefeuille · Blagnac et alentours</p>
        </div>
      </footer>

      {pathname !== "/devis" && (
        <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-stone/40 bg-paper/95 p-3 backdrop-blur md:hidden" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
          {config.phone && (
            <a href={`tel:${config.phone.replace(/\s/g, "")}`} className="btn-secondary px-4" aria-label="Appeler">
              <Phone className="h-4 w-4" />
            </a>
          )}
          <Link to="/devis" className="btn-primary flex-1">
            Demander un devis gratuit
          </Link>
        </div>
      )}
    </div>
  );
}
