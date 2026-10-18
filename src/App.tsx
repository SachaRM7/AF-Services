import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import PublicLayout from "./public/PublicLayout";
import Home from "./public/Home";

const Services = lazy(() => import("./public/Services"));
const Zone = lazy(() => import("./public/Zone"));
const QuoteRequest = lazy(() => import("./public/QuoteRequest"));
const Contact = lazy(() => import("./public/Contact"));
const LegalNotice = lazy(() => import("./public/Legal").then((m) => ({ default: m.LegalNotice })));
const Privacy = lazy(() => import("./public/Legal").then((m) => ({ default: m.Privacy })));
const NotFound = lazy(() => import("./public/Legal").then((m) => ({ default: m.NotFound })));
const AdminApp = lazy(() => import("./admin/AdminApp"));

const fallback = <div className="min-h-[50vh]" aria-busy="true" />;

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={fallback}>
        <Routes>
          <Route path="/admin/*" element={<AdminApp />} />
          <Route element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="prestations" element={<Services />} />
            <Route path="zone-intervention" element={<Zone />} />
            <Route path="devis" element={<QuoteRequest />} />
            <Route path="contact" element={<Contact />} />
            <Route path="mentions-legales" element={<LegalNotice />} />
            <Route path="confidentialite" element={<Privacy />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
