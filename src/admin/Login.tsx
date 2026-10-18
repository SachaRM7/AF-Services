import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Logo } from "../components/Logo";
import { supabase, translateError } from "../lib/supabase";
import { useAuth } from "./auth";

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
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/admin/reinitialiser` });
    setBusy(false);
    setSent(true); // même réponse que le compte existe ou non
  }
  return (
    <Shell title="Mot de passe oublié">
      {sent ? (
        <p className="text-sm text-ink-soft">Si un compte correspond à cette adresse, un lien de réinitialisation vient d'être envoyé.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="email">E-mail</label>
            <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <button className="btn-primary w-full" disabled={busy}>Envoyer le lien</button>
        </form>
      )}
      <Link to="/admin/connexion" className="mt-6 block text-sm text-ink-muted underline">Retour à la connexion</Link>
    </Shell>
  );
}

export function ResetPassword() {
  const nav = useNavigate();
  const { session } = useAuth();
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pwd.length < 12) return setError("12 caractères minimum.");
    if (pwd !== pwd2) return setError("Les mots de passe ne correspondent pas.");
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) setError(translateError(error.message));
    else nav("/admin", { replace: true });
  }
  return (
    <Shell title="Nouveau mot de passe">
      {!session ? (
        <p className="text-sm text-ink-soft">Lien invalide ou expiré. <Link to="/admin/mot-de-passe-oublie" className="underline">Demander un nouveau lien</Link>.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
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
          <button className="btn-primary w-full">Enregistrer</button>
        </form>
      )}
    </Shell>
  );
}
