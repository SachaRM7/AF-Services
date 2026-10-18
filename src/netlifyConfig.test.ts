import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "smol-toml";

interface NetlifyConfig {
  build: { publish: string };
  redirects: { from: string; to: string; status: number; force?: boolean }[];
  headers: { for: string; values: Record<string, string> }[];
}

const config = parse(readFileSync(new URL("../netlify.toml", import.meta.url), "utf8")) as unknown as NetlifyConfig;

function matches(pattern: string, path: string) {
  return new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`).test(path);
}

describe("netlify.toml", () => {
  it("sert l'application pour un accès direct à /admin/reinitialiser (réécriture SPA en 200)", () => {
    const rule = config.redirects.find((r) => matches(r.from, "/admin/reinitialiser"));
    expect(rule).toMatchObject({ to: "/index.html", status: 200 });
    expect(rule?.force).not.toBe(true); // les fichiers réels (assets) restent servis
  });
  it("ne renvoie pas la page de réinitialisation ailleurs (pas de redirection 301/302 qui perdrait les jetons)", () => {
    const redirects = config.redirects.filter((r) => matches(r.from, "/admin/reinitialiser") && r.status !== 200);
    expect(redirects).toEqual([]);
  });
  it("n'empêche pas la page de fonctionner et ne la met pas en cache", () => {
    const headers = Object.assign({}, ...config.headers.filter((h) => matches(h.for, "/admin/reinitialiser")).map((h) => h.values));
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["Content-Security-Policy"]).toBeUndefined();
    // Referrer-Policy ne doit pas transmettre l'URL complète (jetons) à des tiers
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
  it("publie le dossier de build Vite", () => {
    expect(config.build.publish).toBe("dist");
  });
});
