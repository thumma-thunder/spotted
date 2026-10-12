import {
  databaseRequest,
  getAuthenticatedUser,
  jsonError,
  jsonResponse,
  readJson,
  stripeRequest,
} from "./_shared.mjs";

export default async (request) => {
  try {
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
    const user = await getAuthenticatedUser(request);
    const profile = (await databaseRequest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=stripe_account_id`))[0];
    if (!profile) return jsonResponse({ error: "Your profile is still being set up. Try again shortly." }, 409);

    let accountId = profile.stripe_account_id;
    if (!accountId) {
      const account = await stripeRequest("accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": `spotted-connect-${user.id}`,
        },
        body: new URLSearchParams({
          type: "express",
          country: "US",
          email: user.email,
          "capabilities[card_payments][requested]": "true",
          "capabilities[transfers][requested]": "true",
          "metadata[spotted_user_id]": user.id,
        }),
      });
      accountId = account.id;
      await databaseRequest(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ stripe_account_id: accountId }),
      });
    }

    const origin = new URL(request.url).origin;
    const link = await stripeRequest("account_links", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        account: accountId,
        type: "account_onboarding",
        return_url: `${origin}/?payout=complete`,
        refresh_url: `${origin}/?payout=refresh`,
      }),
    });
    return jsonResponse({ url: link.url });
  } catch (error) {
    return jsonError(error);
  }
};
