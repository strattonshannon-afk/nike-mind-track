import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_ORIGIN") || "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
export function preflight(req: Request) { return req.method === "OPTIONS" ? new Response("ok", { headers: corsHeaders }) : null; }
export function admin() {
  const url = Deno.env.get("SUPABASE_URL"); const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase server configuration is incomplete.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Sign in required.");
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Your sign-in session is invalid. Please sign in again.");
  const allowed = (Deno.env.get("ALLOWED_OWNER_EMAIL") || "").trim().toLowerCase();
  if (!allowed || (data.user.email || "").toLowerCase() !== allowed) throw new Error("This tracker is private to its configured owner.");
  return data.user;
}
export async function encryptToken(token: string) {
  const raw = Deno.env.get("TOKEN_ENCRYPTION_KEY"); if (!raw) throw new Error("Token encryption is not configured.");
  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  if (keyBytes.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(token)));
  const out = new Uint8Array(iv.length + cipher.length); out.set(iv); out.set(cipher, iv.length);
  return btoa(String.fromCharCode(...out));
}
export async function decryptToken(value: string) {
  const raw = Deno.env.get("TOKEN_ENCRYPTION_KEY"); if (!raw) throw new Error("Token encryption is not configured.");
  const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const all = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, key, all.slice(12));
  return new TextDecoder().decode(clear);
}
export function safeOrderLink(input: string | undefined) {
  if (!input) return null;
  try { const u = new URL(input); if (u.protocol !== "https:" || !(u.hostname === "kickscrew.com" || u.hostname.endsWith(".kickscrew.com"))) return null; return u.toString(); } catch { return null; }
}
export function normalizeStatus(text: string) {
  const s = text.toLowerCase();
  if (/delivered|delivery completed/.test(s)) return "delivered";
  if (/out for delivery/.test(s)) return "out_for_delivery";
  if (/in transit|transit scan|arrived at.*facility|departed.*facility/.test(s)) return "in_transit";
  if (/shipped|dispatched|tracking number|shipment confirmation/.test(s)) return "shipped";
  if (/processing|verification|quality control|inspection/.test(s)) return "processing";
  if (/order.*received|order.*confirmed|order.*placed|order.*has been received/.test(s)) return "order_received";
  return "unknown";
}
