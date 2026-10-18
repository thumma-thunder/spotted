import test from "node:test";
import assert from "node:assert/strict";
import createBooking from "../netlify/functions/create-booking.mjs";

const bookingRequest = (body, authorization = "Bearer test-user-token") => new Request(
  "https://spotted.example/api/create-booking",
  {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(body),
  },
);

test("creates a pending reservation with server-calculated Venmo details", async () => {
  const originalFetch = globalThis.fetch;
  Object.assign(process.env, {
    SUPABASE_URL: "https://database.example",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    SUPABASE_SECRET_KEY: "sb_secret_test",
  });
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, init });
    if (url.pathname === "/auth/v1/user") {
      return Response.json({ id: "11111111-1111-4111-8111-111111111111" });
    }
    if (url.pathname.endsWith("/spots")) {
      return Response.json([{
        id: "33333333-3333-4333-8333-333333333333",
        title: "Driveway",
        owner_id: "44444444-4444-4444-8444-444444444444",
        price_cents: 12000,
        price_period: "month",
        available_from: "2026-01-01",
        available_until: "2027-12-31",
      }]);
    }
    if (url.pathname.endsWith("/profiles")) return Response.json([{ venmo_username: "CampusHost-1" }]);
    if (url.pathname.endsWith("/bookings") && init.method === "PATCH") return new Response(null, { status: 204 });
    if (url.pathname.endsWith("/bookings") && init.method === "POST") {
      return Response.json([{ id: "22222222-2222-4222-8222-222222222222" }], { status: 201 });
    }
    throw new Error(`Unexpected request: ${init.method || "GET"} ${url}`);
  };

  try {
    const response = await createBooking(bookingRequest({
      spotId: "33333333-3333-4333-8333-333333333333",
      startDate: "2027-01-31",
      quantity: 1,
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      bookingId: "22222222-2222-4222-8222-222222222222",
      totalCents: 12000,
      venmoUsername: "CampusHost-1",
    });
    const booking = JSON.parse(calls.find((call) => call.init.method === "POST" && call.url.pathname.endsWith("/bookings")).init.body);
    assert.equal(booking.end_date, "2027-02-28");
    assert.equal(booking.total_cents, 12000);
    assert.equal(booking.status, "payment_pending");
    const databaseCalls = calls.filter((call) => call.url.pathname.startsWith("/rest/v1/"));
    assert(databaseCalls.every((call) => call.init.headers.apikey === "sb_secret_test"));
    assert(databaseCalls.every((call) => !call.init.headers.Authorization));
    assert(databaseCalls.some((call) => call.init.method === "PATCH" && call.url.searchParams.get("status") === "eq.payment_pending"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects unauthenticated booking requests without contacting Supabase", async () => {
  const originalFetch = globalThis.fetch;
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    throw new Error("Unauthenticated requests should not reach Supabase.");
  };
  try {
    const response = await createBooking(bookingRequest({
      spotId: "33333333-3333-4333-8333-333333333333",
      startDate: "2027-01-31",
      quantity: 1,
    }, ""));
    assert.equal(response.status, 401);
    assert.equal(requestCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
