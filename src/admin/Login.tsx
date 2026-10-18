import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { supabase, translateError } from "../lib/supabase";
import { useAuth } from "./auth";
import {
  INITIAL_AUTH_PARAMS, isExpiredLinkError, passwordResetRedirectUrl, setRecoveryPending,
} from "../lib/authRedirect";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-10 inline-block"><Logo /></Link>
        <h1 className="text-2xl font-bold">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(/invalid/i.test(error.message) ? "Identifiants incorrects." : translateError(error.message));
    else nav("/admin", { replace: true });
  }

  return (
    <Shell title="Espace de gestion">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="email">E-mail</label>
          <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="field-label" htmlFor="password">Mot de passe</label>
          <input id="password" type="password" autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Se connecter</button>
        <Link to="/admin/mot-de-passe-oublie" className="block text-center text-sm text-ink-muted underline">Mot de passe oublié ?</Link>
      </form>
    </Shell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordResetRedirectUrl(window.location.origin),
    });
    setBusy(false);
    // Même réponse que le compte existe ou non ; seules les limites d'envoi sont signalées.
    if (error && /rate limit|security purposes|429/i.test(error.message)) {
      setError("Trop de demandes rapprochées. Patientez une minute avant de réessayer.");
      return;
    }
    if (error && /fetch|network/i.test(error.message)) {
      setError(translateError(error.message));
      return;
    }
    setSent(true);
  }
  return (
    <Shell title="Mot de passe oublié">
      {sent ? (
        <p role="status" className="text-sm text-ink-soft">
          Si un compte correspond à cette adresse, un lien de réinitialisation vient d'être envoyé. Il est valable une heure
          et ne peut servir qu'une fois.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="email">E-mail</label>
            <input id="email" type="email" autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Envoyer le lien</button>
        </form>
      )}
      <Link to="/admin/connexion" className="mt-6 block text-sm text-ink-muted underline">Retour à la connexion</Link>
    </Shell>
  );
}

function ExpiredLink({ detail }: { detail?: string }) {
  return (
    <div role="alert" className="space-y-4">
      <p className="text-sm text-ink-soft">
        Ce lien de réinitialisation a expiré ou a déjà été utilisé{detail ? ` (${detail})` : ""}. Par sécurité, chaque lien
        n'est valable qu'une heure et une seule fois.
      </p>
      <Link to="/admin/mot-de-passe-oublie" className="btn-primary w-full">Recevoir un nouveau lien</Link>
    </div>
  );
}

export function ResetPassword() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [expired, setExpired] = useState(() => isExpiredLinkError(INITIAL_AUTH_PARAMS));
  const invite = INITIAL_AUTH_PARAMS.type === "invite";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (pwd.length < 12) return setError("Le mot de passe doit contenir au moins 12 caractères.");
    if (pwd !== pwd2) return setError("Les deux mots de passe ne correspondent pas.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (!error) {
      setRecoveryPending(false);
      setDone(true);
      return;
    }
    if (/session|jwt|expired|not authenticated|missing/i.test(error.message)) setExpired(true);
    else if (/different from the old|same_password|same password/i.test(error.message)) setError("Choisissez un mot de passe différent de l'ancien.");
    else if (/weak|at least|characters/i.test(error.message)) setError("Mot de passe trop faible : allongez-le ou variez les caractères.");
    else setError(translateError(error.message));
  }

  if (done) {
    return (
      <Shell title="Mot de passe mis à jour">
        <div role="status" className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-ink-soft">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-800" />
            Votre nouveau mot de passe est enregistré. Utilisez-le désormais pour vous connecter.
          </p>
          <button className="btn-primary w-full" onClick={() => nav("/admin", { replace: true })}>Accéder à l'espace de gestion</button>
        </div>
      </Shell>
    );
  }

  if (expired) {
    return <Shell title="Lien expiré"><ExpiredLink /></Shell>;
  }

  if (loading) {
    return <Shell title="Nouveau mot de passe"><p role="status" className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" /> Vérification du lien…</p></Shell>;
  }

  if (!session) {
    return <Shell title="Lien expiré"><ExpiredLink /></Shell>;
  }

  return (
    <Shell title={invite ? "Choisissez votre mot de passe" : "Nouveau mot de passe"}>
      <p className="mb-5 text-sm text-ink-muted">Compte : {session.user.email}</p>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="field-label" htmlFor="p1">Nouveau mot de passe</label>
          <input id="p1" type="password" autoComplete="new-password" className="input" value={pwd} onChange={(e) => setPwd(e.target.value)} />
          <p className="field-hint">12 caractères minimum.</p>
        </div>
        <div>
          <label className="field-label" htmlFor="p2">Confirmation</label>
          <input id="p2" type="password" autoComplete="new-password" className="input" value={pwd2} onChange={(e) => setPwd2(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer le mot de passe</button>
      </form>
    </Shell>
  );
}
