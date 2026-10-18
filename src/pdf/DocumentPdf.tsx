import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatEurosPdf } from "../lib/money";
import { UNIT_LABELS } from "../lib/pricing";
import type { DocView } from "./model";

const INK = "#292C2B";
const GRAY = "#A5AAA6";
const MUTED = "#5E6361";
const PAPER = "#F5F4F1";

const s = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 70, paddingHorizontal: 42, fontFamily: "Helvetica", fontSize: 9, color: INK }, // pas de lineHeight ici : il empêche le rendu des textes dynamiques (react-pdf)
  row: { flexDirection: "row" },
  brand: { fontSize: 16, lineHeight: 1.1, fontFamily: "Helvetica-Bold", letterSpacing: -0.3 },
  tagline: { fontSize: 7, lineHeight: 1.2, letterSpacing: 1.6, color: MUTED, marginTop: 4, textTransform: "uppercase" },
  docTitle: { fontSize: 22, lineHeight: 1.1, fontFamily: "Helvetica-Bold", textAlign: "right", marginBottom: 6 },
  meta: { textAlign: "right", color: MUTED, marginTop: 2 },
  label: { fontSize: 7, letterSpacing: 1.2, color: MUTED, textTransform: "uppercase", marginBottom: 3 },
  box: { flex: 1, padding: 10, backgroundColor: PAPER, borderRadius: 4 },
  th: { fontSize: 7, letterSpacing: 0.8, color: MUTED, textTransform: "uppercase", paddingVertical: 5 },
  td: { paddingVertical: 6 },
  rule: { borderBottomWidth: 0.6, borderBottomColor: GRAY },
  strong: { fontFamily: "Helvetica-Bold" },
  small: { fontSize: 7.5, color: MUTED },
  banner: { padding: 6, marginBottom: 14, borderWidth: 1, borderColor: INK, textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 8.5, letterSpacing: 0.6 },
  watermark: { position: "absolute", top: 330, lineHeight: 1, left: 0, right: 0, textAlign: "center", fontSize: 72, color: "#E4E4E1", fontFamily: "Helvetica-Bold", transform: "rotate(-30deg)" },
  pageNumber: { position: "absolute", bottom: 16, left: 42, right: 42, fontSize: 7, color: MUTED, textAlign: "center" },
  footer: { position: "absolute", bottom: 30, left: 42, right: 42, fontSize: 7, color: MUTED, textAlign: "center", borderTopWidth: 0.6, borderTopColor: GRAY, paddingTop: 6 },
});

const col = { label: 0.46, qty: 0.12, pu: 0.15, disc: 0.09, total: 0.18 };

function date(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

function qty(q: number) {
  return q.toLocaleString("fr-FR", { maximumFractionDigits: 3 }).replace(/[  ]/g, " ");
}

function TotalRow({ label, value, bold, sub }: { label: string; value: string; bold?: boolean; sub?: string }) {
  return (
    <View style={[s.row, { paddingVertical: 3 }]}>
      <View style={{ flex: 1 }}>
        <Text style={bold ? s.strong : undefined}>{label}</Text>
        {sub && <Text style={s.small}>{sub}</Text>}
      </View>
      <Text style={[{ width: 90, textAlign: "right" }, bold ? s.strong : {}]}>{value}</Text>
    </View>
  );
}

export function DocumentPdf({ v }: { v: DocView }) {
  const seller = v.seller;
  const c = v.client;
  const isQuote = v.type === "devis";
  const title = isQuote ? "Devis" : v.type === "avoir" ? "Avoir" : "Facture";
  const pro = c?.kind === "professionnel";
  const sellerAddress = [seller.address_line1, seller.address_line2, `${seller.postal_code ?? ""} ${seller.city ?? ""}`.trim()].filter(Boolean);
  const clientAddress = c ? [c.billing_address_line1, c.billing_address_line2, `${c.billing_postal_code ?? ""} ${c.billing_city ?? ""}`.trim()].filter(Boolean) : [];
  const siteAddress = v.site ? [v.site.label, v.site.address_line1, v.site.address_line2, `${v.site.postal_code ?? ""} ${v.site.city ?? ""}`.trim()].filter(Boolean) : [];
  const sign = v.type === "avoir" ? -1 : 1;
  const money = (c: number) => formatEurosPdf(sign * c);
  const vatPct = (v.vatRateBps / 100).toLocaleString("fr-FR");
  const remaining = v.type === "facture" && v.totals.paid != null ? v.totals.ttc - (v.totals.paid ?? 0) - (v.totals.credited ?? 0) : null;
  const bannerText = v.simulation
    ? "SIMULATION — document établi dans le cadre de la préparation de l'entreprise, sans valeur commerciale ni fiscale"
    : null;

  return (
    <Document title={`${title} ${v.number ?? ""}`.trim()} author={seller.trade_name ?? "AF Nettoyage"} language="fr-FR">
      <Page size="A4" style={s.page}>
        {(v.draft || v.simulation) && <Text style={s.watermark} fixed>{v.draft ? "BROUILLON" : "SIMULATION"}</Text>}
        {bannerText && <Text style={s.banner}>{bannerText}</Text>}

        {/* En-tête */}
        <View style={[s.row, { justifyContent: "space-between", marginBottom: 22 }]}>
          <View>
            <Text style={s.brand}>{seller.trade_name ?? "AF Nettoyage"}</Text>
            <Text style={s.tagline}>{seller.tagline ?? "Vitrerie & Entretien"}</Text>
            <View style={{ marginTop: 10 }}>
              {seller.legal_name ? <Text>{seller.legal_name}{seller.legal_form ? ` — ${seller.legal_form}` : ""}</Text> : null}
              {sellerAddress.map((l) => <Text key={l}>{l}</Text>)}
              {seller.phone ? <Text>{seller.phone}</Text> : null}
              {seller.email ? <Text>{seller.email}</Text> : null}
            </View>
          </View>
          <View>
            <Text style={s.docTitle}>{title}</Text>
            <Text style={[s.meta, s.strong, { color: INK }]}>{v.number ?? "Non émis"}</Text>
            <Text style={s.meta}>Date : {date(v.issueDate)}</Text>
            {isQuote && <Text style={s.meta}>Valable jusqu'au : {date(v.validUntil)}</Text>}
            {!isQuote && v.serviceDate && (
              <Text style={s.meta}>
                {v.servicePeriodEnd ? `Prestations du ${date(v.serviceDate)} au ${date(v.servicePeriodEnd)}` : `Date de prestation : ${date(v.serviceDate)}`}
              </Text>
            )}
            {v.type === "facture" && <Text style={s.meta}>Échéance : {date(v.dueDate)}</Text>}
            {v.type === "avoir" && v.creditedNumber && <Text style={s.meta}>Sur facture n° {v.creditedNumber}</Text>}
          </View>
        </View>

        {/* Parties */}
        <View style={[s.row, { gap: 10, marginBottom: 18 }]}>
          <View style={s.box}>
            <Text style={s.label}>{isQuote ? "Client" : "Facturé à"}</Text>
            <Text style={s.strong}>{c?.display_name ?? "—"}</Text>
            {pro && c?.first_name ? <Text>À l'attention de {`${c.first_name} ${c.last_name ?? ""}`.trim()}</Text> : null}
            {clientAddress.map((l) => <Text key={l}>{l}</Text>)}
            {pro && c?.siren ? <Text>SIREN : {c.siren}</Text> : null}
            {pro && c?.vat_number ? <Text>TVA : {c.vat_number}</Text> : null}
          </View>
          <View style={s.box}>
            <Text style={s.label}>Lieu d'intervention</Text>
            {siteAddress.length ? siteAddress.map((l) => <Text key={l}>{l}</Text>) : <Text>Identique à l'adresse du client</Text>}
            {v.travelKm != null && <Text style={[s.small, { marginTop: 4 }]}>{qty(v.travelKm)} km à vol d'oiseau du point de départ</Text>}
          </View>
        </View>

        {v.title ? <Text style={[s.strong, { fontSize: 11, marginBottom: 8 }]}>{v.title}</Text> : null}

        {/* Lignes */}
        <View style={[s.row, s.rule, { borderBottomColor: INK, borderBottomWidth: 1 }]}>
          <Text style={[s.th, { flex: col.label }]}>Désignation</Text>
          <Text style={[s.th, { flex: col.qty, textAlign: "right" }]}>Qté</Text>
          <Text style={[s.th, { flex: col.pu, textAlign: "right" }]}>PU HT</Text>
          <Text style={[s.th, { flex: col.disc, textAlign: "right" }]}>Remise</Text>
          <Text style={[s.th, { flex: col.total, textAlign: "right" }]}>Total HT</Text>
        </View>
        {v.lines.map((l) => (
          <View key={l.id} style={[s.row, s.rule]} wrap={false}>
            <View style={[s.td, { flex: l.kind === "note" ? 1 : col.label, paddingRight: 6 }]}>
              <Text style={l.kind === "note" ? { fontFamily: "Helvetica-Oblique" } : s.strong}>{l.label}</Text>
              {l.description ? <Text style={s.small}>{l.description}</Text> : null}
              {l.kind === "adjustment" && l.percent_bps != null ? (
                <Text style={s.small}>{l.percent_bps < 0 ? "Remise" : "Majoration"} de {(Math.abs(l.percent_bps) / 100).toLocaleString("fr-FR")} % sur les prestations</Text>
              ) : null}
            </View>
            {l.kind !== "note" && (
              <>
                <Text style={[s.td, { flex: col.qty, textAlign: "right" }]}>{l.kind === "service" ? `${qty(l.quantity)} ${UNIT_LABELS[l.unit].short}` : ""}</Text>
                <Text style={[s.td, { flex: col.pu, textAlign: "right" }]}>{l.kind === "service" ? formatEurosPdf(l.unit_price_cents) : ""}</Text>
                <Text style={[s.td, { flex: col.disc, textAlign: "right" }]}>{l.discount_bps ? `${(l.discount_bps / 100).toLocaleString("fr-FR")} %` : ""}</Text>
                <Text style={[s.td, { flex: col.total, textAlign: "right" }]}>{money(l.total_ht_cents)}</Text>
              </>
            )}
          </View>
        ))}
        {v.totals.minimumAdjustment > 0 && (
          <View style={[s.row, s.rule]} wrap={false}>
            <View style={[s.td, { flex: col.label + col.qty + col.pu + col.disc }]}>
              <Text style={s.strong}>Complément minimum d'intervention</Text>
              <Text style={s.small}>Minimum de prestation de {formatEurosPdf(v.totals.minimum)} HT par intervention, hors déplacement</Text>
            </View>
            <Text style={[s.td, { flex: col.total, textAlign: "right" }]}>{money(v.totals.minimumAdjustment)}</Text>
          </View>
        )}
        {v.totals.travel > 0 || v.travelOverrideReason ? (
          <View style={[s.row, s.rule]} wrap={false}>
            <View style={[s.td, { flex: col.label + col.qty + col.pu + col.disc }]}>
              <Text style={s.strong}>Frais de déplacement</Text>
              <Text style={s.small}>
                {v.travelKm != null ? `Forfait selon distance (${qty(v.travelKm)} km)` : "Forfait"}
                {v.travelOverrideReason ? ` — ${v.travelOverrideReason}` : ""}
              </Text>
            </View>
            <Text style={[s.td, { flex: col.total, textAlign: "right" }]}>{money(v.totals.travel)}</Text>
          </View>
        ) : null}

        {/* Totaux */}
        <View style={[s.row, { marginTop: 14 }]} wrap={false}>
          <View style={{ flex: 1, paddingRight: 20 }}>
            {v.recurrenceText ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={s.label}>Récurrence</Text>
                <Text>{v.recurrenceText}</Text>
              </View>
            ) : null}
            {v.notes ? (
              <View>
                <Text style={s.label}>Remarques</Text>
                <Text>{v.notes}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ width: 230 }}>
            <TotalRow label="Total HT" value={money(v.totals.ht)} bold />
            {v.vatExempt ? (
              <TotalRow label="TVA" value={formatEurosPdf(0)} sub={seller.vat_regime === "franchise" ? seller.franchise_mention : "TVA non applicable"} />
            ) : (
              <TotalRow label={`TVA ${vatPct} %`} value={money(v.totals.vat)} />
            )}
            <View style={{ borderTopWidth: 1, borderTopColor: INK, marginTop: 3, paddingTop: 3 }}>
              <TotalRow label={v.type === "avoir" ? "Total de l'avoir TTC" : "Total TTC"} value={money(v.totals.ttc)} bold />
            </View>
            {remaining != null && !v.draft && (v.totals.paid ?? 0) + (v.totals.credited ?? 0) > 0 && (
              <>
                {(v.totals.paid ?? 0) > 0 && <TotalRow label="Déjà réglé" value={formatEurosPdf(-(v.totals.paid ?? 0))} />}
                {(v.totals.credited ?? 0) > 0 && <TotalRow label="Avoirs" value={formatEurosPdf(-(v.totals.credited ?? 0))} />}
                <TotalRow label="Reste à payer" value={formatEurosPdf(remaining)} bold />
              </>
            )}
          </View>
        </View>

        {/* Conditions */}
        <View style={{ marginTop: 22 }} wrap={false}>
          {isQuote ? (
            <>
              <Text style={s.label}>Conditions</Text>
              <Text>{v.conditions}</Text>
              {seller.payment_terms_days != null && <Text style={{ marginTop: 4 }}>Paiement à {seller.payment_terms_days} jours à réception de facture. {seller.payment_methods}.</Text>}
              <View style={[s.row, { marginTop: 14, gap: 10 }]}>
                <View style={[s.box, { backgroundColor: "#FFFFFF", borderWidth: 0.6, borderColor: GRAY, height: 70 }]}>
                  <Text style={s.label}>Bon pour accord — date et signature du client</Text>
                </View>
              </View>
            </>
          ) : v.type === "facture" ? (
            <>
              <Text style={s.label}>Règlement</Text>
              <Text>Échéance : {date(v.dueDate)}. {seller.payment_methods}.</Text>
              {seller.iban ? <Text>IBAN : {seller.iban}{seller.bic ? ` — BIC : ${seller.bic}` : ""}{seller.bank_name ? ` — ${seller.bank_name}` : ""}</Text> : null}
              <Text style={[s.small, { marginTop: 4 }]}>{seller.early_payment_text}</Text>
              <Text style={s.small}>{seller.late_penalty_text}</Text>
              {pro && <Text style={s.small}>{seller.recovery_fee_text}</Text>}
              {seller.vat_on_debits && <Text style={s.small}>Option pour le paiement de la taxe d'après les débits.</Text>}
              <Text style={s.small}>Catégorie de l'opération : prestation de services.</Text>
            </>
          ) : (
            <Text style={s.small}>Avoir à déduire de la facture n° {v.creditedNumber ?? "—"} ou à rembourser.</Text>
          )}
          {seller.insurance_text ? <Text style={[s.small, { marginTop: 4 }]}>{seller.insurance_text}</Text> : null}
        </View>

        <View style={s.footer} fixed>
          <Text>
            {[
              seller.legal_name || seller.trade_name,
              seller.legal_form,
              seller.siret ? `SIRET ${seller.siret}` : null,
              seller.registration,
              seller.ape_code ? `APE ${seller.ape_code}` : null,
              seller.vat_regime === "assujetti" && seller.vat_number ? `TVA ${seller.vat_number}` : null,
              seller.share_capital ? `Capital ${seller.share_capital}` : null,
            ].filter(Boolean).join(" · ")}
          </Text>
          {seller.invoice_footer ? <Text>{seller.invoice_footer}</Text> : null}
        </View>
        {/* Numérotation hors du pied de page : un Text dynamique y empêche le rendu de la View (react-pdf). */}
        <Text style={s.pageNumber} fixed render={({ pageNumber, totalPages }) => `${v.number ?? ""} — page ${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
}
