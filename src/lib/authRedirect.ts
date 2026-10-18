// Liens d'authentification envoyés par Supabase (réinitialisation, invitation) :
// lecture des paramètres de l'URL et redirection vers la page de nouveau mot de passe.

export const PRODUCTION_SITE_URL = "https://afnettoyage.netlify.app";
export const RESET_PATH = "/admin/reinitialiser";

/** Adresse de retour des e-mails de réinitialisation. En local, on reste sur le serveur de développement. */
export function passwordResetRedirectUrl(origin: string): string {
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return `${local ? origin : PRODUCTION_SITE_URL}${RESET_PATH}`;
}

export interface AuthUrlParams {
  /** "recovery", "invite", "signup", "magiclink"… */
  type: string | null;
  /** Jetons de session présents (flux implicite) ou code d'échange (flux PKCE). */
  hasCredentials: boolean;
  errorCode: string | null;
  errorDescription: string | null;
}

export function parseAuthParams(hash: string, search: string): AuthUrlParams {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const s = new URLSearchParams(search.replace(/^\?/, ""));
  const get = (k: string) => h.get(k) ?? s.get(k);
  const errorCode = get("error_code") ?? get("error");
  return {
    type: get("type"),
    hasCredentials: Boolean(h.get("access_token") || s.get("code") || get("token_hash")),
    errorCode,
    errorDescription: get("error_description"),
  };
}

/** Le lien a-t-il expiré ou déjà servi ? */
export function isExpiredLinkError(p: AuthUrlParams): boolean {
  return Boolean(p.errorCode) && /otp_expired|expired|invalid|access_denied|flow_state/i.test(`${p.errorCode} ${p.errorDescription ?? ""}`);
}

const SET_PASSWORD_TYPES = ["recovery", "invite"];

/**
 * Si Supabase a renvoyé l'utilisateur ailleurs que sur la page de réinitialisation (par ex. l'URL du site
 * lorsque l'adresse de retour n'est pas autorisée), renvoie le chemin à utiliser en conservant les paramètres.
 */
export function authRedirectTarget(pathname: string, search: string, hash: string): string | null {
  if (pathname === RESET_PATH) return null;
  const p = parseAuthParams(hash, search);
  const isSetPassword = p.type != null && SET_PASSWORD_TYPES.includes(p.type) && p.hasCredentials;
  const isAuthError = p.errorCode != null && Boolean(p.errorDescription);
  if (!isSetPassword && !isAuthError) return null;
  return `${RESET_PATH}${search}${hash}`;
}

// --- Mémorisation du mode « réinitialisation » (survit au rafraîchissement de la page) ---------------

const RECOVERY_KEY = "af-password-recovery";

export function setRecoveryPending(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(RECOVERY_KEY, "1");
    else sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    /* stockage indisponible : le formulaire reste accessible tant que la session existe */
  }
}

export function isRecoveryPending(): boolean {
  try {
    return sessionStorage.getItem(RECOVERY_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Paramètres de l'URL au chargement, lus avant l'initialisation du client Supabase
 * (qui nettoie ensuite l'URL).
 */
export const INITIAL_AUTH_PARAMS: AuthUrlParams =
  typeof window === "undefined"
    ? { type: null, hasCredentials: false, errorCode: null, errorDescription: null }
    : parseAuthParams(window.location.hash, window.location.search);

if (typeof window !== "undefined" && INITIAL_AUTH_PARAMS.hasCredentials && INITIAL_AUTH_PARAMS.type && SET_PASSWORD_TYPES.includes(INITIAL_AUTH_PARAMS.type)) {
  setRecoveryPending(true);
}
