import { handleSubmission } from "../functions/api/submit-request";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  IP_HASH_SALT: string;
  TURNSTILE_SECRET_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/submit-request") {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
      return handleSubmission(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
