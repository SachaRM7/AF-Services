import { createElement } from "react";
import type { DocView } from "./model";

/** Génère le PDF (chargement différé de la bibliothèque PDF). */
export async function renderPdf(v: DocView): Promise<Blob> {
  const [{ pdf }, { DocumentPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./DocumentPdf")]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pdf(createElement(DocumentPdf, { v }) as any).toBlob();
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function openBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
