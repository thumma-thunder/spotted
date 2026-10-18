import {
  databaseRequest,
  getAuthenticatedUser,
  HttpError,
  jsonError,
  jsonResponse,
  readJson,
} from "./_shared.mjs";

const quantityLimits = { day: 30, week: 12, game: 1, month: 6 };

function bookingEndDate(startDate, period, quantity) {
  const end = new Date(`${startDate}T00:00:00.000Z`);
  if (period === "week") end.setUTCDate(end.getUTCDate() + quantity * 7);
  else if (period === "month") {
    const originalDay = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + quantity);
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(originalDay, lastDay));
  } else end.setUTCDate(end.getUTCDate() + quantity);
  return end.toISOString().slice(0, 10);
}

export default async (request) => {
  try {
    if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);
    const user = await getAuthenticatedUser(request);
    const { spotId, startDate, quantity } = await readJson(request);
    if (typeof spotId !== "string" || !/^[0-9a-f-]{36}$/i.test(spotId)) throw new HttpError(400, "Choose a valid parking spot.");
    const parsedStartDate = typeof startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
      ? new Date(`${startDate}T00:00:00.000Z`)
      : null;
    if (!parsedStartDate || Number.isNaN(parsedStartDate.getTime()) || parsedStartDate.toISOString().slice(0, 10) !== startDate) {
      throw new HttpError(400, "Choose a valid start date.");
    }
    if (startDate < new Date().toISOString().slice(0, 10)) throw new HttpError(400, "Choose today or a future date.");
    if (!Number.isInteger(quantity) || quantity < 1) throw new HttpError(400, "Choose a valid booking duration.");

    const spot = (await databaseRequest(`spots?id=eq.${encodeURIComponent(spotId)}&status=eq.active&select=id,title,owner_id,price_cents,price_period,available_from,available_until`))[0];
    if (!spot) throw new HttpError(404, "That parking spot is no longer available.");
    if (spot.owner_id === user.id) throw new HttpError(400, "You cannot book your own parking spot.");
    if (!quantityLimits[spot.price_period] || quantity > quantityLimits[spot.price_period]) {
      throw new HttpError(400, "That booking duration is not available for this spot.");
    }
    if (startDate < spot.available_from) throw new HttpError(400, "This spot isn’t available on the selected start date.");
    const endDate = bookingEndDate(startDate, spot.price_period, quantity);
    if (spot.available_until) {
      const finalAvailableDate = new Date(`${spot.available_until}T00:00:00.000Z`);
      finalAvailableDate.setUTCDate(finalAvailableDate.getUTCDate() + 1);
      if (endDate > finalAvailableDate.toISOString().slice(0, 10)) {
        throw new HttpError(400, "This booking extends beyond the spot’s available dates.");
      }
    }

    const owner = (await databaseRequest(`profiles?id=eq.${encodeURIComponent(spot.owner_id)}&select=venmo_username`))[0];
    if (!owner?.venmo_username || !/^[A-Za-z0-9][A-Za-z0-9_.-]{4,29}$/.test(owner.venmo_username)) {
      throw new HttpError(409, "The host has not added a valid Venmo username yet.");
    }

    const totalCents = spot.price_cents * quantity;
    if (!Number.isSafeInteger(totalCents) || totalCents < 100 || totalCents > 1000000) {
      throw new HttpError(400, "This booking total is outside the supported range.");
    }
    const staleBefore = encodeURIComponent(new Date(Date.now() - 30 * 60 * 1000).toISOString());
    await databaseRequest(
      `bookings?spot_id=eq.${encodeURIComponent(spot.id)}&status=eq.payment_pending&created_at=lt.${staleBefore}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "cancelled" }),
      },
    );
    const booking = await databaseRequest("bookings", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        spot_id: spot.id,
        renter_id: user.id,
        start_date: startDate,
        end_date: endDate,
        quantity,
        total_cents: totalCents,
        status: "payment_pending",
      }),
    });
    if (!booking[0]?.id) throw new HttpError(502, "The reservation could not be started.");

    return jsonResponse({
      bookingId: booking[0].id,
      totalCents,
      venmoUsername: owner.venmo_username,
    });
  } catch (error) {
    return jsonError(error);
  }
};
