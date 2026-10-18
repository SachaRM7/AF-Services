// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://afnettoyage.netlify.app/"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

type Listener = (event: string, session: unknown) => void;

const auth = {
  session: null as unknown,
  listeners: [] as Listener[],
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("../lib/supabase", () => ({
  isSupabaseConfigured: true,
  translateError: (m: string) => m,
  must: async () => null,
  supabase: {
    auth,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { full_name: "Adel Ferchichi", active: true } }) }),
      }),
    }),
  },
}));

const SESSION = { user: { id: "u1", email: "adel@example.fr" }, access_token: "t" };

/** Charge les modules comme au premier affichage d'une URL donnée (les paramètres sont lus au chargement). */
async function renderAt(path: string, hash = "") {
  window.history.replaceState(null, "", `${path}${hash}`);
  vi.resetModules();
  const { AuthProvider } = await import("./auth");
  const { ForgotPassword, ResetPassword } = await import("./Login");
  const { Navigate } = await import("react-router-dom");
  const { useAuth } = await import("./auth");
  function GuardStub() {
    const { recovery, session, loading } = useAuth();
    if (loading) return null;
    if (recovery) return <Navigate to="/admin/reinitialiser" replace />;
    return <p>{session ? "Tableau de bord" : "Connexion"}</p>;
  }
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <Routes>
          <Route path="/admin/mot-de-passe-oublie" element={<ForgotPassword />} />
          <Route path="/admin/reinitialiser" element={<ResetPassword />} />
          <Route path="/admin/*" element={<GuardStub />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  auth.session = null;
  auth.listeners = [];
  auth.getSession.mockImplementation(async () => ({ data: { session: auth.session } }));
  auth.onAuthStateChange.mockImplementation((cb: Listener) => {
    auth.listeners.push(cb);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  auth.updateUser.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("Mot de passe oublié", () => {
  it("envoie le lien avec l'adresse de retour de la page de réinitialisation", async () => {
    await renderAt("/admin/mot-de-passe-oublie");
    fill("E-mail", " adel@example.fr ");
    fireEvent.click(screen.getByRole("button", { name: /Envoyer le lien/ }));
    await screen.findByText(/un lien de réinitialisation vient d'être envoyé/);
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("adel@example.fr", {
      redirectTo: "https://afnettoyage.netlify.app/admin/reinitialiser",
    });
  });

  it("signale la limite d'envoi", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: "email rate limit exceeded" } });
    await renderAt("/admin/mot-de-passe-oublie");
    fill("E-mail", "adel@example.fr");
    fireEvent.click(screen.getByRole("button", { name: /Envoyer le lien/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Patientez une minute/);
  });
});

describe("Réinitialisation", () => {
  it("affiche le formulaire après l'événement PASSWORD_RECOVERY puis enregistre le mot de passe", async () => {
    await renderAt("/admin/reinitialiser", "#access_token=t&refresh_token=r&expires_in=3600&token_type=bearer&type=recovery");
    auth.session = SESSION;
    auth.listeners.forEach((cb) => cb("PASSWORD_RECOVERY", SESSION));

    expect(await screen.findByText("Compte : adel@example.fr")).toBeTruthy();
    expect(sessionStorage.getItem("af-password-recovery")).toBe("1");

    fill("Nouveau mot de passe", "court");
    fill("Confirmation", "court");
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le mot de passe/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/au moins 12 caractères/);

    fill("Nouveau mot de passe", "un-mot-de-passe-solide");
    fill("Confirmation", "un-mot-de-passe-different");
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le mot de passe/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/ne correspondent pas/);
    expect(auth.updateUser).not.toHaveBeenCalled();

    fill("Confirmation", "un-mot-de-passe-solide");
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le mot de passe/ }));
    expect(await screen.findByText("Mot de passe mis à jour")).toBeTruthy();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "un-mot-de-passe-solide" });
    expect(sessionStorage.getItem("af-password-recovery")).toBeNull();
  });

  it("conserve le formulaire après un rafraîchissement (session persistée, URL nettoyée)", async () => {
    sessionStorage.setItem("af-password-recovery", "1");
    auth.session = SESSION;
    await renderAt("/admin/reinitialiser");
    expect(await screen.findByLabelText("Nouveau mot de passe")).toBeTruthy();
  });

  it("ramène vers la page de réinitialisation tant que le mot de passe n'est pas défini", async () => {
    sessionStorage.setItem("af-password-recovery", "1");
    auth.session = SESSION;
    await renderAt("/admin");
    expect(await screen.findByLabelText("Nouveau mot de passe")).toBeTruthy();
  });

  it("explique qu'un lien expiré doit être redemandé", async () => {
    await renderAt("/admin/reinitialiser", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    expect(await screen.findByText("Lien expiré")).toBeTruthy();
    expect((screen.getByRole("alert")).textContent).toMatch(/expiré ou a déjà été utilisé/);
    expect(screen.getByRole("link", { name: "Recevoir un nouveau lien" }).getAttribute("href")).toBe("/admin/mot-de-passe-oublie");
  });

  it("traite l'absence de session comme un lien invalide", async () => {
    await renderAt("/admin/reinitialiser");
    expect(await screen.findByText("Lien expiré")).toBeTruthy();
  });

  it("bascule sur le message d'expiration si la session a expiré pendant la saisie", async () => {
    auth.session = SESSION;
    auth.updateUser.mockResolvedValue({ data: {}, error: { message: "Auth session missing!" } });
    await renderAt("/admin/reinitialiser");
    await screen.findByLabelText("Nouveau mot de passe");
    fill("Nouveau mot de passe", "un-mot-de-passe-solide");
    fill("Confirmation", "un-mot-de-passe-solide");
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le mot de passe/ }));
    await waitFor(() => expect(screen.getByText("Lien expiré")).toBeTruthy());
  });

  it("refuse explicitement la réutilisation de l'ancien mot de passe", async () => {
    auth.session = SESSION;
    auth.updateUser.mockResolvedValue({ data: {}, error: { message: "New password should be different from the old password." } });
    await renderAt("/admin/reinitialiser");
    await screen.findByLabelText("Nouveau mot de passe");
    fill("Nouveau mot de passe", "un-mot-de-passe-solide");
    fill("Confirmation", "un-mot-de-passe-solide");
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer le mot de passe/ }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/différent de l'ancien/);
  });
});
