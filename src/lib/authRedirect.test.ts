import { describe, expect, it } from "vitest";
import { authRedirectTarget, isExpiredLinkError, parseAuthParams, passwordResetRedirectUrl, RESET_PATH } from "./authRedirect";

const RECOVERY_HASH = "#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=recovery";
const EXPIRED_HASH = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

describe("passwordResetRedirectUrl", () => {
  it("pointe vers la page de nouveau mot de passe du site en production", () => {
    expect(passwordResetRedirectUrl("https://afnettoyage.netlify.app")).toBe("https://afnettoyage.netlify.app/admin/reinitialiser");
    // prévisualisations Netlify : toujours l'adresse de production, seule autorisée dans Supabase
    expect(passwordResetRedirectUrl("https://deploy-preview-3--afnettoyage.netlify.app")).toBe("https://afnettoyage.netlify.app/admin/reinitialiser");
  });
  it("reste en local pendant le développement", () => {
    expect(passwordResetRedirectUrl("http://localhost:5173")).toBe("http://localhost:5173/admin/reinitialiser");
  });
});

describe("parseAuthParams", () => {
  it("lit un lien de réinitialisation (flux implicite)", () => {
    expect(parseAuthParams(RECOVERY_HASH, "")).toEqual({ type: "recovery", hasCredentials: true, errorCode: null, errorDescription: null });
  });
  it("lit un code PKCE en paramètre", () => {
    expect(parseAuthParams("", "?code=xyz&type=recovery").hasCredentials).toBe(true);
  });
  it("détecte un lien expiré", () => {
    const p = parseAuthParams(EXPIRED_HASH, "");
    expect(p.errorCode).toBe("otp_expired");
    expect(isExpiredLinkError(p)).toBe(true);
    expect(isExpiredLinkError(parseAuthParams(RECOVERY_HASH, ""))).toBe(false);
  });
});

describe("authRedirectTarget", () => {
  it("renvoie un lien de réinitialisation arrivé sur l'accueil vers la bonne page, jetons compris", () => {
    expect(authRedirectTarget("/", "", RECOVERY_HASH)).toBe(`${RESET_PATH}${RECOVERY_HASH}`);
  });
  it("renvoie aussi les invitations et les liens expirés", () => {
    expect(authRedirectTarget("/", "", RECOVERY_HASH.replace("recovery", "invite"))).toBe(`${RESET_PATH}${RECOVERY_HASH.replace("recovery", "invite")}`);
    expect(authRedirectTarget("/", "", EXPIRED_HASH)).toBe(`${RESET_PATH}${EXPIRED_HASH}`);
  });
  it("ne touche ni à la page de réinitialisation ni aux pages normales", () => {
    expect(authRedirectTarget(RESET_PATH, "", RECOVERY_HASH)).toBeNull();
    expect(authRedirectTarget("/prestations", "", "#bureaux")).toBeNull();
    expect(authRedirectTarget("/devis", "?prestation=bureaux", "")).toBeNull();
  });
});
