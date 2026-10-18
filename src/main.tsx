import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/manrope";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./index.css";
import App from "./App";
import { authRedirectTarget } from "./lib/authRedirect";

// Un lien de réinitialisation ou d'invitation arrivé sur une autre page (ex. l'accueil, si l'adresse de retour
// n'est pas autorisée dans Supabase) est renvoyé vers la page de nouveau mot de passe, paramètres compris.
const authTarget = authRedirectTarget(window.location.pathname, window.location.search, window.location.hash);
if (authTarget) window.history.replaceState(null, "", authTarget);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
