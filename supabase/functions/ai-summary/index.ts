import { admin, json, preflight, requireUser } from "../_shared/common.ts";
Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const user = await requireUser(req); const db = admin();
    const { data: order } = await db.from("orders").select("status,carrier,estimated_delivery,prediction_confidence,last_carrier_scan,last_sync_at").eq("user_id", user.id).eq("order_number", Deno.env.get("TARGET_ORDER_NUMBER") || "").maybeSingle();
    if (!order) return json({ error: "Sync your order first." }, 409);
    const key = Deno.env.get("OPENAI_API_KEY"); if (!key) return json({ summary: `Your order is ${String(order.status).replaceAll("_", " ")}. ${order.estimated_delivery ? `The carrier estimate is ${order.estimated_delivery}.` : "A dependable delivery estimate is not available yet."} This summary uses only normalized shipment fields.` });
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: `Summarize this shipment status in two concise sentences. Never invent an ETA. If no ETA, say so. Status: ${order.status}; carrier: ${order.carrier || "unknown"}; carrier ETA: ${order.estimated_delivery || "not available"}; last carrier scan: ${order.last_carrier_scan || "none"}; last email sync: ${order.last_sync_at || "none"}.` }) });
    const data = await response.json(); if (!response.ok) return json({ error: "AI summary provider request failed." }, 502);
    const summary = data.output_text || (data.output || []).flatMap((x: any) => x.content || []).map((x: any) => x.text || "").join(" ") || "No summary was returned.";
    return json({ summary });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Summary failed." }, 400); }
});
