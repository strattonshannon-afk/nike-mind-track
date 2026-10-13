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

type Result = { data: any; error: any };
class RestQuery implements PromiseLike<Result> {
  private method = "GET";
  private payload: any = undefined;
  private params = new URLSearchParams();
  private prefer: string[] = [];
  private cardinality: "many" | "single" | "maybe" = "many";
  private selected = false;
  constructor(private table: string, private base: string, private key: string) {}
  select(columns = "*") {
    this.params.set("select", columns);
    this.selected = true;
    if (this.method !== "GET") this.prefer.push("return=representation");
    return this;
  }
  eq(column: string, value: string | number | boolean) { this.params.append(column, "eq." + String(value)); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.params.set("order", column + "." + (options?.ascending === false ? "desc" : "asc")); return this; }
  limit(count: number) { this.params.set("limit", String(count)); return this; }
  insert(value: any) { this.method = "POST"; this.payload = value; return this; }
  upsert(value: any, options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.method = "POST"; this.payload = value;
    if (options?.onConflict) this.params.set("on_conflict", options.onConflict);
    this.prefer.push(options?.ignoreDuplicates ? "resolution=ignore-duplicates" : "resolution=merge-duplicates");
    return this;
  }
  update(value: any) { this.method = "PATCH"; this.payload = value; return this; }
  delete() { this.method = "DELETE"; return this; }
  single() { this.cardinality = "single"; return this; }
  maybeSingle() { this.cardinality = "maybe"; return this; }
  then<TResult1 = Result, TResult2 = never>(onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
  private async execute(): Promise<Result> {
    const url = this.base.replace(/\/$/, "") + "/rest/v1/" + encodeURIComponent(this.table) + (this.params.size ? "?" + this.params.toString() : "");
    const headers: Record<string,string> = { apikey: this.key, Authorization: "Bearer " + this.key };
    if (this.payload !== undefined) headers["Content-Type"] = "application/json";
    if (this.prefer.length) headers["Prefer"] = [...new Set(this.prefer)].join(",");
    if (this.cardinality === "single" || this.cardinality === "maybe") headers["Accept"] = "application/json";
    let response: Response;
    try {
      response = await fetch(url, { method: this.method, headers, body: this.payload === undefined ? undefined : JSON.stringify(this.payload) });
    } catch { return { data: null, error: { message: "Database request failed." } }; }
    const raw = await response.text();
    let parsed: any = null;
    if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = raw; } }
    if (!response.ok) return { data: null, error: parsed || { message: "Database request failed." } };
    if (this.cardinality === "single" || this.cardinality === "maybe") {
      const rows = Array.isArray(parsed) ? parsed : (parsed == null ? [] : [parsed]);
      if (rows.length === 0 && this.cardinality === "maybe") return { data: null, error: null };
      if (rows.length !== 1) return { data: null, error: { message: rows.length ? "Expected one row." : "No row found." } };
      return { data: rows[0], error: null };
    }
    return { data: parsed, error: null };
  }
}
export function admin() {
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) throw new Error("Supabase server configuration is incomplete.");
  return { from: (table: string) => new RestQuery(table, base, key) };
}
export async function requireUser(req: Request) {
  const auth = req.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Sign in required.");
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!base || !key) throw new Error("Supabase authentication is not configured.");
  const response = await fetch(base.replace(/\/$/, "") + "/auth/v1/user", { headers: { apikey: key, Authorization: auth } });
  if (!response.ok) throw new Error("Your sign-in session is invalid. Please sign in again.");
  const user = await response.json();
  if (!user?.id || !user?.email) throw new Error("Your sign-in session is invalid. Please sign in again.");
  const allowed = (Deno.env.get("ALLOWED_OWNER_EMAIL") || "").trim().toLowerCase();
  if (!allowed || String(user.email).toLowerCase() !== allowed) throw new Error("This tracker is private to its configured owner.");
  return user;
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
  if (keyBytes.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
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
