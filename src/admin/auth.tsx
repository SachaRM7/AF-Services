import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

interface AuthState {
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  recovery: boolean;
  profileName: string;
}

const Ctx = createContext<AuthState>({ session: null, isAdmin: false, loading: true, recovery: false, profileName: "" });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, isAdmin: false, loading: true, recovery: false, profileName: "" });

  useEffect(() => {
    let alive = true;
    async function resolve(session: Session | null, recovery = false) {
      if (!session) {
        if (alive) setState({ session: null, isAdmin: false, loading: false, recovery, profileName: "" });
        return;
      }
      // Le statut admin est vérifié côté base (RLS) ; ici uniquement pour adapter l'interface.
      const { data } = await supabase.from("profiles").select("full_name, active").eq("id", session.user.id).maybeSingle();
      if (alive) setState({ session, isAdmin: Boolean(data?.active), loading: false, recovery, profileName: data?.full_name ?? "" });
    }
    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Différé pour éviter un appel Supabase dans le callback (verrou interne).
      setTimeout(() => resolve(session, event === "PASSWORD_RECOVERY"), 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
