export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(body, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function jsonError(error) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : "The request could not be completed.";
  if (status === 500) console.error(error);
  return jsonResponse({ error: message }, status);
}

export function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new HttpError(503, `The ${name} environment variable is not configured.`);
  return value;
}

export async function getAuthenticatedUser(request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw new HttpError(401, "Sign in to continue.");

  const response = await fetch(`${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: requiredEnv("SUPABASE_PUBLISHABLE_KEY"),
      Authorization: authorization,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new HttpError(401, "Your sign-in expired. Sign in again to continue.");
  return response.json();
}

export async function databaseRequest(path, init = {}) {
  const response = await fetch(`${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: requiredEnv("SUPABASE_SECRET_KEY"),
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  if (!response.ok) {
    const detail = text ? JSON.parse(text).message || text : "Database request failed.";
    throw new HttpError(response.status === 409 ? 409 : 502, detail);
  }
  return text ? JSON.parse(text) : null;
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Send a valid JSON request.");
  }
}
