import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { AuthProvider, useAuth } from "./auth";
import { ConfirmProvider, Loading, ToastProvider } from "./ui";
import { SettingsProvider } from "./settingsStore";
import { ForgotPassword, Login, ResetPassword } from "./Login";
import AdminLayout from "./Layout";
import Dashboard from "./Dashboard";
import { RequestDetail, RequestList } from "./Requests";
import { ClientDetail, ClientList, ClientNew } from "./Clients";
import { DiagnosticEditor, DiagnosticList } from "./Diagnostics";
import { InvoiceList, InvoicePage, QuoteList, QuotePage } from "./Documents";
import { InterventionEditor, PlanningPage } from "./Planning";
import Catalog from "./Catalog";
import Finance from "./Finance";
import Settings from "./Settings";
import Journal from "./Journal";

function Guard() {
  const { session, isAdmin, loading, recovery } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-8"><Loading /></div>;
  if (recovery) return <Navigate to="/admin/reinitialiser" replace />;
  if (!session) return <Navigate to="/admin/connexion" replace state={{ from: loc.pathname }} />;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md p-8">
        <h1 className="text-xl font-bold">Accès refusé</h1>
        <p className="mt-2 text-sm text-ink-muted">Ce compte n'est pas autorisé à accéder à l'espace de gestion.</p>
        <button className="btn-secondary mt-4" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
      </div>
    );
  }
  return (
    <SettingsProvider>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="demandes" element={<RequestList />} />
          <Route path="demandes/:id" element={<RequestDetail />} />
          <Route path="clients" element={<ClientList />} />
          <Route path="clients/nouveau" element={<ClientNew />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="diagnostics" element={<DiagnosticList />} />
          <Route path="diagnostics/:id" element={<DiagnosticEditor />} />
          <Route path="devis" element={<QuoteList />} />
          <Route path="devis/:id" element={<QuotePage />} />
          <Route path="factures" element={<InvoiceList />} />
          <Route path="factures/:id" element={<InvoicePage />} />
          <Route path="planning" element={<PlanningPage />} />
          <Route path="interventions/:id" element={<InterventionEditor />} />
          <Route path="prestations" element={<Catalog />} />
          <Route path="finances" element={<Finance />} />
          <Route path="parametres" element={<Settings />} />
          <Route path="journal" element={<Journal />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Route>
      </Routes>
    </SettingsProvider>
  );
}

export default function AdminApp() {
  if (!isSupabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-bold">Configuration manquante</h1>
        <p className="mt-2 text-sm text-ink-muted">Renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (voir docs/DEPLOIEMENT.md).</p>
      </div>
    );
  }
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="connexion" element={<Login />} />
            <Route path="mot-de-passe-oublie" element={<ForgotPassword />} />
            <Route path="reinitialiser" element={<ResetPassword />} />
            <Route path="*" element={<Guard />} />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
