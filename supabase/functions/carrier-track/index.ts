import { admin, json, preflight, requireUser } from "../_shared/common.ts";
Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const user = await requireUser(req); const db = admin(); const body = await req.json();
    const tracking = String(body.tracking_number || "").trim(); if (!tracking || tracking.length > 80) return json({ error: "A valid tracking number is required." }, 400);
    const { data: settings } = await db.from("user_settings").select("carrier_tracking_enabled").eq("user_id", user.id).maybeSingle();
    if (!settings?.carrier_tracking_enabled) return json({ error: "Carrier tracking has not been enabled with your permission." }, 403);
    const key = Deno.env.get("AFTERSHIP_API_KEY"); if (!key) return json({ message: "Carrier integration is consented but not configured. Add AFTERSHIP_API_KEY to Supabase secrets." }, 200);
    const { data: shipment } = await db.from("shipments").select("id,order_id,carrier,tracking_number").eq("user_id", user.id).eq("tracking_number", tracking).maybeSingle();
    if (!shipment) return json({ error: "This tracking number is not associated with your configured order." }, 404);
    let result = await fetch("https://api.aftership.com/tracking/2026-07/trackings", { method: "POST", headers: { "Content-Type": "application/json", "as-api-key": key }, body: JSON.stringify({ tracking: { tracking_number: tracking, slug: body.slug || undefined } }) });
    if (result.status === 400 || result.status === 409) result = await fetch(`https://api.aftership.com/tracking/2026-07/trackings/${encodeURIComponent(body.slug || "")}/${encodeURIComponent(tracking)}`, { headers: { "as-api-key": key } });
    const data = await result.json().catch(() => ({})); if (!result.ok) return json({ message: "Carrier provider has not returned a trackable shipment yet.", provider_status: result.status }, 200);
    const t = data.data?.tracking || data.data || {}; const checkpoints = t.checkpoints || []; const last = checkpoints[checkpoints.length - 1];
    const eta = t.expected_delivery || t.estimated_delivery_date || null; const status = String(t.tag || t.subtag || "unknown").toLowerCase();
    await db.from("shipments").update({ carrier: t.slug || shipment.carrier, status, estimated_delivery: eta ? String(eta).slice(0,10) : null, last_scan_at: last?.checkpoint_time || null, updated_at: new Date().toISOString() }).eq("id", shipment.id).eq("user_id", user.id);
    const { data: order } = await db.from("orders").select("*").eq("id", shipment.order_id).eq("user_id", user.id).single();
    const { data: shipments } = await db.from("shipments").select("carrier,tracking_number,status,estimated_delivery,last_scan_at,tracking_url").eq("order_id", shipment.order_id).eq("user_id", user.id);
    return json({ order: { ...order, shipments: shipments || [], carrier: t.slug || shipment.carrier, estimated_delivery: eta ? String(eta).slice(0,10) : order?.estimated_delivery, prediction_confidence: eta ? "carrier" : order?.prediction_confidence, last_carrier_scan: last?.checkpoint_time || order?.last_carrier_scan }, message: "Carrier tracking refreshed using read-only shipment data." });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Carrier lookup failed." }, 400); }
});
