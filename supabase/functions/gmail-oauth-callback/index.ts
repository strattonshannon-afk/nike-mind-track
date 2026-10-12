import { admin, encryptToken, json } from "../_shared/common.ts";
Deno.serve(async (req) => {
  const url = new URL(req.url); const site = Deno.env.get("SITE_URL") || "/";
  const fail = (why: string) => Response.redirect(`${site}${site.includes("?") ? "&" : "?"}gmail=error&reason=${encodeURIComponent(why)}`, 302);
  try {
    if (url.searchParams.has("error")) return fail("Google authorization was declined.");
    const code = url.searchParams.get("code"); const state = url.searchParams.get("state");
    if (!code || !state) return fail("Missing authorization response.");
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state));
    const stateHash = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
    const db = admin();
    const { data: saved, error: stateErr } = await db.from("oauth_states").select("user_id,expires_at").eq("state_hash", stateHash).maybeSingle();
    if (stateErr || !saved || new Date(saved.expires_at).getTime() < Date.now()) return fail("Authorization state expired. Please try again.");
    await db.from("oauth_states").delete().eq("state_hash", stateHash);
    const params = new URLSearchParams({ code, client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "", client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "", redirect_uri: Deno.env.get("GOOGLE_REDIRECT_URI") || "", grant_type: "authorization_code" });
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params });
    const token = await tokenRes.json(); if (!tokenRes.ok) return fail("Google token exchange failed.");
    if (!token.refresh_token) return fail("Google did not return a refresh token. Revoke the old grant and reconnect.");
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` } });
    const profile = profileRes.ok ? await profileRes.json() : {};
    const encrypted = await encryptToken(token.refresh_token);
    const { error } = await db.from("gmail_connections").upsert({ user_id: saved.user_id, google_email: profile.email || null, encrypted_refresh_token: encrypted, scopes: ["https://www.googleapis.com/auth/gmail.readonly"], updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) throw error;
    return Response.redirect(`${site}${site.includes("?") ? "&" : "?"}gmail=connected`, 302);
  } catch { return fail("Callback setup failed. Check the Supabase function secrets."); }
});
