import { admin, json, preflight, requireUser } from "../_shared/common.ts";
Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const user = await requireUser(req);
    const clientId = Deno.env.get("GOOGLE_CLIENT_ID"); const redirectUri = Deno.env.get("GOOGLE_REDIRECT_URI");
    if (!clientId || !redirectUri) return json({ error: "Google OAuth is not configured yet." }, 503);
    const state = crypto.randomUUID() + "." + crypto.randomUUID();
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
    const stateHash = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
    const db = admin();
    const { error } = await db.from("oauth_states").insert({ state_hash: stateHash, user_id: user.id, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    if (error) throw error;
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.searchParams.set("client_id", clientId); u.searchParams.set("redirect_uri", redirectUri); u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", "openid email https://www.googleapis.com/auth/gmail.readonly"); u.searchParams.set("access_type", "offline"); u.searchParams.set("prompt", "consent"); u.searchParams.set("include_granted_scopes", "true"); u.searchParams.set("state", state);
    return json({ url: u.toString() });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "OAuth could not start." }, 400); }
});
