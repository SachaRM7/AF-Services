import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { isRecoveryPending, setRecoveryPending } from "../lib/authRedirect";

interface AuthState {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  /** Session ouverte par un lien de réinitialisation/invitation : un nouveau mot de passe doit être défini. */
  recovery: boolean;
  profileName: string;
}

const Ctx = createContext<AuthState>({ session: null, isAdmin: false, loading: true, recovery: false, profileName: "" });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, isAdmin: false, loading: true, recovery: false, profileName: "" });

  useEffect(() => {
    let alive = true;
    async function resolve(session: Session | null) {
      if (!session) {
        setRecoveryPending(false);
        if (alive) setState({ session: null, isAdmin: false, loading: false, recovery: false, profileName: "" });
        return;
      }
      // Le statut admin est vérifié côté base (RLS) ; ici uniquement pour adapter l'interface.
      const { data } = await supabase.from("profiles").select("full_name, active").eq("id", session.user.id).maybeSingle();
      if (alive) {
        setState({ session, isAdmin: Boolean(data?.active), loading: false, recovery: isRecoveryPending(), profileName: data?.full_name ?? "" });
      }
    }
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Mémorisé en sessionStorage : le mode réinitialisation survit au rafraîchissement de la page.
      if (event === "PASSWORD_RECOVERY") setRecoveryPending(true);
      // Différé pour éviter un appel Supabase dans le callback (verrou interne).
      setTimeout(() => resolve(session), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
