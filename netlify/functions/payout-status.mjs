import {
  databaseRequest,
  getAuthenticatedUser,
  jsonError,
  jsonResponse,
  stripeRequest,
} from "./_shared.mjs";

export default async (request) => {
  try {
    if (request.method !== "GET") return jsonResponse({ error: "Method not allowed." }, 405);
    const user = await getAuthenticatedUser(request);
    const profile = (await databaseRequest(`profiles?id=eq.${encodeURIComponent(user.id)}&select=stripe_account_id`))[0];
    if (!profile?.stripe_account_id) return jsonResponse({ connected: false });

    const account = await stripeRequest(`accounts/${encodeURIComponent(profile.stripe_account_id)}`);
    const connected = Boolean(account.details_submitted && account.charges_enabled && account.payouts_enabled);
    await databaseRequest(`profiles?id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ payouts_enabled: connected }),
    });
    return jsonResponse({ connected });
  } catch (error) {
    return jsonError(error);
  }
};
