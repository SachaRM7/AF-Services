# Migration Cloudflare Pages (Workers runtime)

This branch preserves Supabase and the existing React/Vite application. Deploy as **Cloudflare Pages**, which runs `functions/` on the Workers runtime.

1. Create a Pages project connected to this GitHub branch. Build command: `npm run build`; output directory: `dist`.
2. Configure build variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SITE_URL`, `VITE_TURNSTILE_SITE_KEY`.
3. Configure runtime secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT`, `TURNSTILE_SECRET_KEY`. Never prefix service role with `VITE_`.
4. Set Supabase Auth Site URL and allowed recovery redirects to the Cloudflare deployment URL.
5. Test `/admin`, password recovery, public quote requests and image uploads before switching domains.
6. Keep Netlify live until acceptance tests pass.

Cloudflare Pages uses a `functions/api/submit-request.ts` endpoint and does not require a Netlify runtime. Turnstile is required for public submissions in this deployment.
