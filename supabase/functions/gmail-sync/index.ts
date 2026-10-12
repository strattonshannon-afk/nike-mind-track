import { admin, decryptToken, json, normalizeStatus, preflight, requireUser, safeOrderLink } from "../_shared/common.ts";
function decodePart(data: string) { const s = data.replace(/-/g, "+").replace(/_/g, "/"); const padded = s + "=".repeat((4 - s.length % 4) % 4); return atob(padded).split("").map(c => String.fromCharCode(c.charCodeAt(0))).join(""); }
function b64utf8(data: string) { const bin = decodePart(data); const bytes = Uint8Array.from(bin, c => c.charCodeAt(0)); return new TextDecoder().decode(bytes); }
function walk(part: any, out: string[]) { if (!part || typeof part !== "object") return; if ((part.mimeType === "text/plain" || part.mimeType === "text/html") && part.body?.data) { try { out.push(b64utf8(part.body.data)); } catch {} } for (const p of part.parts || []) walk(p, out); }
function decodeHtml(s: string) { return s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " "); }
function extractTracking(text: string) { const patterns = [/(?:tracking(?:\s*(?:number|no\.?|#))?\s*[:#-]?\s*)([A-Z0-9][A-Z0-9-]{7,32})/ig, /\b(1Z[A-Z0-9]{16})\b/ig, /\b(\d{12,22})\b/g]; const all = new Set<string>(); for (const re of patterns) { let m; while ((m = re.exec(text)) !== null) { const v = (m[1] || m[0]).trim(); if (/^(KS\d+|\d{4,8})$/i.test(v)) continue; if (v.length >= 8 && v.length <= 34) all.add(v); } } return [...all].slice(0, 10); }
Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const user = await requireUser(req); const db = admin();
    const orderNo = Deno.env.get("TARGET_ORDER_NUMBER"); if (!orderNo) return json({ error: "Set TARGET_ORDER_NUMBER in Supabase secrets before syncing." }, 503);
    const { data: settings } = await db.from("user_settings").select("safe_mode").eq("user_id", user.id).maybeSingle();
    const body = await req.json().catch(() => ({}));
    if (body.automatic === true && settings?.safe_mode !== false) return json({ error: "Safe Mode blocks automatic sync. Turn it off with confirmation first." }, 403);
    const { data: connection } = await db.from("gmail_connections").select("google_email,encrypted_refresh_token").eq("user_id", user.id).maybeSingle();
    if (!connection) return json({ error: "Connect Gmail first." }, 409);
    const refreshToken = await decryptToken(connection.encrypted_refresh_token);
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "", client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "", refresh_token: refreshToken, grant_type: "refresh_token" }) });
    const token = await tokenRes.json(); if (!tokenRes.ok || !token.access_token) return json({ error: "Could not refresh Gmail access. Reconnect Gmail in Settings." }, 401);
    const q = encodeURIComponent(`from:(kickscrew.com) "${orderNo}"`);
    const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${q}&maxResults=20`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    const listed = await listRes.json(); if (!listRes.ok) return json({ error: "Gmail search failed. Check that Gmail read-only permission was granted." }, 502);
    const ids: string[] = (listed.messages || []).map((m: any) => m.id).filter(Boolean);
    let status = "order_received", orderUrl: string | null = null, carrier: string | null = null;
    const tracking = new Set<string>(); const events: any[] = []; const sourceIds: string[] = []; let latestStatusDate = "";
    for (const id of ids) {
      const mRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, { headers: { Authorization: `Bearer ${token.access_token}` } });
      if (!mRes.ok) continue; const m = await mRes.json(); const headers = m.payload?.headers || [];
      const subject = headers.find((h: any) => h.name?.toLowerCase() === "subject")?.value || "Order update";
      const from = headers.find((h: any) => h.name?.toLowerCase() === "from")?.value || "";
      const date = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : new Date().toISOString();
      if (!/kickscrew\.com/i.test(from)) continue;
      const parts: string[] = []; walk(m.payload, parts); const text = parts.map(p => /<[^>]+>/.test(p) ? decodeHtml(p) : p).join(" ").slice(0, 60000);
      if (!text.includes(orderNo) && !subject.includes(orderNo)) continue;
      sourceIds.push(id); const detected = normalizeStatus(`${subject} ${text.slice(0, 5000)}`); if (detected !== "unknown" && date >= latestStatusDate) { status = detected; latestStatusDate = date; }
      const urls = [...text.matchAll(/https:\/\/[^\s"'<>]+/g)].map(x => x[0].replace(/[),.;]+$/, ""));
      for (const u of urls) { const safe = safeOrderLink(u); if (safe && /order|track|status/i.test(u)) { orderUrl = safe; break; } }
      for (const n of extractTracking(text)) tracking.add(n);
      if (/dhl/i.test(text)) carrier = "DHL"; else if (/ups/i.test(text)) carrier = "UPS"; else if (/fedex/i.test(text)) carrier = "FedEx"; else if (/usps/i.test(text)) carrier = "USPS";
      events.push({ title: subject.slice(0, 180), description: "Matched KICKS CREW order update.", status: detected, occurred_at: date, source: "email", source_message_id: id });
    }
    const numbers = [...tracking]; const first = numbers[0] || null;
    const record = { user_id: user.id, order_number: orderNo, product_name: Deno.env.get("TARGET_PRODUCT_NAME") || "Nike Mind 001", status, order_placed_at: Deno.env.get("TARGET_ORDER_PLACED_AT") || null, order_url: orderUrl, carrier, tracking_number: first, last_sync_at: new Date().toISOString(), source_message_ids: sourceIds, updated_at: new Date().toISOString() };
    const { data: order, error: saveErr } = await db.from("orders").upsert(record, { onConflict: "user_id,order_number" }).select().single(); if (saveErr) throw saveErr;
    for (const e of events) await db.from("order_events").upsert({ ...e, user_id: user.id, order_id: order.id }, { onConflict: "user_id,order_id,source,source_message_id,title,occurred_at", ignoreDuplicates: true });
    for (const n of numbers) await db.from("shipments").upsert({ user_id: user.id, order_id: order.id, carrier, tracking_number: n, status: n === first ? status : "unknown", tracking_url: null, updated_at: new Date().toISOString() }, { onConflict: "user_id,order_id,tracking_number" });
    const { data: shipmentRows } = await db.from("shipments").select("carrier,tracking_number,status,estimated_delivery,last_scan_at,tracking_url").eq("user_id", user.id).eq("order_id", order.id);
    const { data: eventRows } = await db.from("order_events").select("title,description,status,occurred_at").eq("user_id", user.id).eq("order_id", order.id).order("occurred_at", { ascending: false }).limit(25);
    return json({ order: { ...order, shipments: shipmentRows || [], events: eventRows || [] }, gmail_email: connection.google_email, messages_processed: sourceIds.length, updated: events.length > 0, summary: events.length ? `Found ${events.length} matching order update(s).` : "No matching order email found." });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Sync failed." }, 400); }
});
