import { useEffect } from "react";

const SITE = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

function setMeta(selector: string, attr: string, value: string, create: () => HTMLElement) {
  let el = document.head.querySelector(selector) as HTMLElement | null;
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

export function useSeo({ title, description, path, jsonLd }: { title: string; description: string; path: string; jsonLd?: object }) {
  useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', "content", description, () => Object.assign(document.createElement("meta"), { name: "description" }));
    setMeta('meta[property="og:title"]', "content", title, () => {
      const m = document.createElement("meta");
      m.setAttribute("property", "og:title");
      return m;
    });
    setMeta('meta[property="og:description"]', "content", description, () => {
      const m = document.createElement("meta");
      m.setAttribute("property", "og:description");
      return m;
    });
    if (SITE) {
      setMeta('link[rel="canonical"]', "href", `${SITE}${path}`, () => Object.assign(document.createElement("link"), { rel: "canonical" }));
    }
    let script: HTMLScriptElement | null = null;
    if (jsonLd) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.text = JSON.stringify(jsonLd);
      document.head.appendChild(script);
    }
    return () => script?.remove();
  }, [title, description, path, jsonLd]);
}
