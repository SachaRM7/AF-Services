import { useEffect, useRef } from "react";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove: (id: string) => void };
  }
}

export const turnstileEnabled = Boolean(SITE_KEY);

/** Widget anti-robot Cloudflare Turnstile, chargé uniquement s'il est configuré. */
export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    let id: string | undefined;
    const render = () => {
      if (window.turnstile && ref.current) {
        id = window.turnstile.render(ref.current, { sitekey: SITE_KEY, callback: onToken, language: "fr" });
      }
    };
    if (window.turnstile) render();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
    return () => {
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [onToken]);
  if (!SITE_KEY) return null;
  return <div ref={ref} className="mt-4" />;
}
