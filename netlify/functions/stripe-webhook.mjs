import { createHmac, timingSafeEqual } from "node:crypto";
import { databaseRequest, jsonError, jsonResponse, requiredEnv } from "./_shared.mjs";

function validStripeSignature(body, header, secret) {
  const parts = header.split(",").map((part) => {
    const separator = part.indexOf("=");
    return [part.slice(0, separator), part.slice(separator + 1)];
  });
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  return parts.filter(([key]) => key === "v1").some(([, signature]) => {
    if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
    return timingSafeEqual(expected, Buffer.from(signature, "hex"));
  });
}

export default async (request) => {
  try {
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
    const body = await request.text();
    const signature = request.headers.get("stripe-signature") || "";
    if (!validStripeSignature(body, signature, requiredEnv("STRIPE_WEBHOOK_SECRET"))) {
      return jsonResponse({ error: "Invalid Stripe signature." }, 400);
    }
    const event = JSON.parse(body);
    const session = event.data?.object;
    const bookingId = session?.metadata?.booking_id;
    const status = event.type === "checkout.session.expired"
      ? "cancelled"
      : ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)
        && session.payment_status === "paid"
        ? "confirmed"
        : null;

    if (status && bookingId) {
      await databaseRequest("rpc/apply_stripe_event", {
        method: "POST",
        body: JSON.stringify({
          p_event_id: event.id,
          p_booking_id: bookingId,
          p_status: status,
          p_checkout_session_id: session.id,
          p_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
          p_amount_total: session.amount_total,
          p_currency: session.currency,
        }),
      });
    }
    return jsonResponse({ received: true });
  } catch (error) {
    return jsonError(error);
  }
};
