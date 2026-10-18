const spots = [
  { id: "spot-one", name: "Sunny side driveway", address: "Mapleton Hill · 0.4 mi to CU", nearbyBuilding: "Norlin Library", city: "Boulder, CO", distance: "4 min walk", price: 8, unit: "day", rating: "4.98", reviews: 34, duration: ["day", "week"], badge: "Guest favorite", host: "Maya", initials: "M", color: "#dbe8ff", art: "house" },
  { id: "spot-two", name: "Quiet spot by the garden", address: "University Hill · 0.6 mi to CU", nearbyBuilding: "Ketchum Arts & Sciences", city: "Boulder, CO", distance: "6 min walk", price: 6, unit: "day", rating: "4.91", reviews: 21, duration: ["day", "game"], badge: "Great value", host: "Eli", initials: "E", color: "#e8effb", art: "tree" },
  { id: "spot-three", name: "Covered & close to campus", address: "The Hill · 0.3 mi to CU", nearbyBuilding: "Engineering Center", city: "Boulder, CO", distance: "3 min walk", price: 10, unit: "day", rating: "5.0", reviews: 18, duration: ["day", "month"], badge: "Covered", host: "Sam", initials: "S", color: "#d3e4ff", art: "garage" },
  { id: "spot-four", name: "A spot for the whole week", address: "Goss Grove · 0.8 mi to CU", nearbyBuilding: "Norlin Library", city: "Boulder, CO", distance: "9 min walk", price: 38, unit: "week", rating: "4.87", reviews: 16, duration: ["week", "month"], badge: "Weekly deal", host: "Tess", initials: "T", color: "#e9eff9", art: "house" },
  { id: "spot-five", name: "Game day, minus the chaos", address: "University Hill · 0.5 mi to Folsom", nearbyBuilding: "Folsom Field", city: "Boulder, CO", distance: "5 min walk", price: 24, unit: "game", rating: "4.96", reviews: 42, duration: ["game", "day"], badge: "Game day", host: "Jules", initials: "J", color: "#d8e6ff", art: "tree" },
  { id: "spot-six", name: "Your month, made easier", address: "Whittier · 0.7 mi to CU", nearbyBuilding: "Ketchum Arts & Sciences", city: "Boulder, CO", distance: "8 min walk", price: 120, unit: "month", rating: "4.93", reviews: 12, duration: ["month", "week"], badge: "Monthly", host: "Nico", initials: "N", color: "#e7edfa", art: "garage" },
];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const demoSpots = spots.map((spot) => ({ ...spot, isDemo: true }));
let supabaseConfig = null;
let authSession = null;
let authUser = null;
let pendingAction = null;
let chatRefreshTimer = null;

function readStoredSession() {
  try {
    return JSON.parse(sessionStorage.getItem("spotted.session") || "null");
  } catch {
    return null;
  }
}

function storeSession(session) {
  authSession = session;
  authUser = session?.user || null;
  try {
    if (session) sessionStorage.setItem("spotted.session", JSON.stringify(session));
    else sessionStorage.removeItem("spotted.session");
  } catch {
    showToast("This browser can’t keep your sign-in for this session.");
  }
  updateAccountButton();
}

function updateAccountButton() {
  const account = document.querySelector("#account-button");
  const mobileAccount = document.querySelector("#mobile-account-button");
  if (account) {
    const name = authUser?.user_metadata?.full_name || authUser?.email || "";
    account.textContent = authUser ? name.slice(0, 1).toUpperCase() : "J";
    account.setAttribute("aria-label", authUser ? `Signed in as ${name}. Open account options` : "Sign in");
  }
  if (mobileAccount) mobileAccount.textContent = authUser ? "Sign out" : "Sign in";
}

async function loadBackendConfig() {
  if (!["http:", "https:"].includes(window.location.protocol)) return;
  try {
    const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Could not load the marketplace service configuration.");
    const config = await response.json();
    if (config.configured) supabaseConfig = config;
  } catch (error) {
    console.warn("Marketplace services are unavailable; showing preview listings.", error);
  }
}

async function authRequest(path, body) {
  if (!supabaseConfig) throw new Error("Account services are not connected yet. Deploy the site with its Supabase settings to continue.");
  const response = await fetch(`${supabaseConfig.supabaseUrl}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: supabaseConfig.supabasePublishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.msg || result.message || result.error_description || result.error || "Sign-in could not be completed.");
  return result;
}

async function supabaseRequest(path, { method = "GET", body, prefer, token = authSession?.access_token } = {}) {
  if (!supabaseConfig) throw new Error("Database services are not connected. Preview data is read-only.");
  if (token) {
    await refreshAuthSession();
    token = authSession?.access_token || token;
  }
  const headers = {
    apikey: supabaseConfig.supabasePublishableKey,
    Accept: "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${supabaseConfig.supabaseUrl}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const result = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(result?.message || result?.details || result?.error || "The database request could not be completed.");
  return result;
}

async function restoreSession() {
  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fragmentToken = fragment.get("access_token");
  if (fragmentToken && supabaseConfig) {
    try {
      const response = await fetch(`${supabaseConfig.supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseConfig.supabasePublishableKey, Authorization: `Bearer ${fragmentToken}` },
      });
      if (response.ok) {
        storeSession({
          access_token: fragmentToken,
          refresh_token: fragment.get("refresh_token"),
          expires_at: Math.floor(Date.now() / 1000) + Number(fragment.get("expires_in") || 3600),
          user: await response.json(),
        });
        window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
        return;
      }
    } catch (error) {
      console.error("Could not finish email verification.", error);
    }
  }
  const stored = readStoredSession();
  if (!stored?.access_token || !supabaseConfig) return;
  try {
    let session = stored;
    if (stored.expires_at && stored.expires_at * 1000 < Date.now() + 60000 && stored.refresh_token) {
      session = await authRequest("token?grant_type=refresh_token", { refresh_token: stored.refresh_token });
      session.expires_at = Math.floor(Date.now() / 1000) + (session.expires_in || 3600);
    } else {
      const response = await fetch(`${supabaseConfig.supabaseUrl}/auth/v1/user`, {
        headers: { apikey: supabaseConfig.supabasePublishableKey, Authorization: `Bearer ${stored.access_token}` },
      });
      if (!response.ok) throw new Error("Sign in again to continue.");
      session.user = await response.json();
    }
    storeSession(session);
  } catch {
    storeSession(null);
  }
}

async function refreshAuthSession() {
  if (!authSession?.expires_at || authSession.expires_at * 1000 >= Date.now() + 60000) return;
  if (!authSession.refresh_token) {
    storeSession(null);
    throw new Error("Your sign-in expired. Sign in again to continue.");
  }
  try {
    const refreshed = await authRequest("token?grant_type=refresh_token", { refresh_token: authSession.refresh_token });
    refreshed.expires_at = Math.floor(Date.now() / 1000) + (refreshed.expires_in || 3600);
    storeSession(refreshed);
  } catch {
    storeSession(null);
    throw new Error("Your sign-in expired. Sign in again to continue.");
  }
}

function setConnectionStatus(message, state = "preview") {
  const status = document.querySelector("#connection-status");
  status.hidden = !message;
  status.textContent = message || "";
  status.dataset.state = state;
}

function mapDatabaseSpot(spot) {
  return {
    id: spot.id,
    name: spot.title,
    address: [spot.neighborhood, spot.city].filter(Boolean).join(" · "),
    nearbyBuilding: spot.nearby_building || "",
    city: spot.city,
    distance: spot.covered ? "Covered parking" : "Private parking",
    price: spot.price_cents / 100,
    unit: spot.price_period,
    rating: "New",
    reviews: 0,
    duration: [spot.price_period],
    badge: spot.covered ? "Covered" : "Local host",
    host: spot.host_name || "Spotted host",
    initials: (spot.host_name || "S").slice(0, 1).toUpperCase(),
    color: "#eaf2ff",
    art: spot.spot_type === "garage" ? "garage" : spot.spot_type === "private lot" ? "tree" : "house",
    isDemo: false,
    availableFrom: spot.available_from,
    availableUntil: spot.available_until,
  };
}

async function loadMarketplace() {
  await loadBackendConfig();
  await restoreSession();
  if (!supabaseConfig) {
    setConnectionStatus("Preview mode · Example spots only. Live listings, accounts and payments connect when you deploy the backend.", "preview");
    renderCards();
    return;
  }
  try {
    const listings = await supabaseRequest("public_spots?select=*&order=created_at.desc");
    spots.splice(0, spots.length, ...listings.map(mapDatabaseSpot), ...demoSpots);
    setConnectionStatus("Live marketplace · Example spots are shown after member listings.", "live");
    renderCards();
  } catch (error) {
    setConnectionStatus("We couldn’t load live spots. Example listings are shown while we reconnect.", "error");
    spots.splice(0, spots.length, ...demoSpots);
    renderCards();
    console.error(error);
  }
}

async function netlifyRequest(path, { method = "GET", body } = {}) {
  if (authSession?.access_token) await refreshAuthSession();
  const response = await fetch(path, {
    method,
    headers: {
      Accept: "application/json",
      ...(authSession?.access_token ? { Authorization: `Bearer ${authSession.access_token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The marketplace service could not complete this request.");
  return result;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}
const grid = document.querySelector("#listing-grid");
const modalBackdrop = document.querySelector("#modal-backdrop");
const modalContent = document.querySelector("#modal-content");
const modal = document.querySelector(".modal");
const buildingList = document.querySelector("#campus-buildings");
(window.campusBuildings || []).forEach((building) => {
  const option = document.createElement("option");
  option.value = building;
  buildingList.append(option);
});
let activeFilter = "all";
let currentSpot = null;
let favorites = new Set();
let toastTimer;

function artSvg(art, color) {
  const roof = art === "garage"
    ? '<rect x="24" y="34" width="112" height="56" rx="2" fill="#f0ddc4"/><path d="M19 37 80 7l61 30" fill="#b97d61"/><rect x="62" y="53" width="37" height="37" fill="#91b8ff"/><path d="M73 90V62h15v28" fill="#8d6a55"/>'
    : art === "tree"
      ? '<rect x="52" y="38" width="96" height="51" rx="2" fill="#edd7bd"/><path d="m46 42 54-31 56 31" fill="#ba8065"/><rect x="86" y="59" width="19" height="30" fill="#91b8ff"/><path d="M41 85h115" stroke="#be977a" stroke-width="4"/><circle cx="37" cy="43" r="22" fill="#4e86ff"/><path d="M37 58v32" stroke="#9b765a" stroke-width="5"/>'
      : '<rect x="26" y="35" width="110" height="55" rx="2" fill="#f1dcc1"/><path d="m19 39 62-31 62 31" fill="#bd8064"/><rect x="41" y="51" width="20" height="20" fill="#91b8ff"/><rect x="104" y="51" width="20" height="20" fill="#91b8ff"/><rect x="77" y="58" width="24" height="32" fill="#9e755b"/>';
  return `<svg viewBox="0 0 180 120" role="img" aria-label="Illustration of a parking space near a home"><rect width="180" height="120" fill="${color || "#dbe8ff"}"/><circle cx="151" cy="20" r="14" fill="#ffe1cd"/><path d="M0 96h180v24H0z" fill="#9db8e9"/><path d="M0 107h180" stroke="#efe9d9" stroke-width="2" stroke-dasharray="10 8"/>${roof}<rect x="113" y="86" width="43" height="16" rx="7" fill="#0866ff"/><path d="M121 87h24l7 7h-38z" fill="#c9dcff"/><circle cx="122" cy="103" r="5" fill="#46524b"/><circle cx="148" cy="103" r="5" fill="#46524b"/></svg>`;
}

function renderCards() {
  const city = document.querySelector("#city-input").value.trim();
  const cityName = city.split(",")[0].trim().toLowerCase();
  const building = document.querySelector("#area-input").value.trim();
  const searchDate = document.querySelector("#search-date").value;
  const duration = document.querySelector("#duration-input").value;
  const matchesLocation = (spot) => {
    const query = `${spot.name} ${spot.address} ${spot.nearbyBuilding || ""} ${spot.city} ${spot.host} Boulder CU`.toLowerCase();
    const matchesCity = !cityName || spot.city.toLowerCase().includes(cityName);
    const matchesBuilding = !building || query.includes(building.toLowerCase()) || building.toLowerCase().split(/\s+/).some((word) => word.length > 3 && query.includes(word));
    const matchesDate = !searchDate || ((!spot.availableFrom || searchDate >= spot.availableFrom) && (!spot.availableUntil || searchDate <= spot.availableUntil));
    return matchesCity && matchesBuilding && matchesDate;
  };
  let filtered = spots.filter((spot) => {
    const matchesDuration = activeFilter === "all" || spot.duration.includes(activeFilter);
    const matchesSearchDuration = duration === "all" || spot.duration.includes(duration);
    return matchesLocation(spot) && matchesDuration && matchesSearchDuration;
  });
  if (document.querySelector("#sort-select").value === "price") filtered.sort((a, b) => a.price - b.price);
  grid.innerHTML = filtered.map((spot) => `
    <article class="spot-card" id="${escapeHtml(spot.id)}">
      <div class="spot-photo" style="background:${escapeHtml(spot.color)}">
        <div class="photo-fallback">${artSvg(spot.art, spot.color)}</div>
        <span class="spot-badge">${escapeHtml(spot.badge)}</span>
        <button class="favorite-button ${favorites.has(spot.id) ? "favorited" : ""}" type="button" aria-label="${favorites.has(spot.id) ? "Remove from" : "Add to"} favorites" data-favorite="${escapeHtml(spot.id)}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.4-8.8 11-8.8 11s-8.8-5.6-8.8-11a4.7 4.7 0 0 1 8.8-2.3 4.7 4.7 0 0 1 8.8 2.3Z"/></svg>
        </button>
      </div>
      <div class="spot-body">
        <div class="spot-topline"><span class="spot-distance">${escapeHtml(spot.distance)}</span><span class="spot-rating"><i>★</i><b>${escapeHtml(spot.rating)}</b> (${escapeHtml(spot.reviews)})</span></div>
        <h3>${escapeHtml(spot.name)}</h3>
        <p class="spot-address">${escapeHtml(spot.address)}${spot.nearbyBuilding ? ` · Near ${escapeHtml(spot.nearbyBuilding)}` : ""}</p>
        <div class="spot-meta"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2"/></svg>${escapeHtml(spot.distance)}</span><span><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>${spot.unit === "game" ? "Game day" : `Per ${escapeHtml(spot.unit)}`}</span></div>
        <div class="spot-bottom"><span class="spot-price">${money.format(spot.price)}<small> / ${spot.unit === "game" ? "game" : escapeHtml(spot.unit)}</small></span><div class="spot-actions"><button class="contact-host" type="button" data-message="${escapeHtml(spot.id)}">Message</button><button class="quick-book" type="button" data-book="${escapeHtml(spot.id)}">Book spot</button></div></div>
      </div>
    </article>
  `).join("");
  document.querySelector("#empty-state").hidden = filtered.length > 0;
  grid.hidden = filtered.length === 0;
  document.querySelector("#result-title").textContent = building ? `Spots near ${building}` : `Spots near ${city || "campus"}`;
  document.querySelector("#result-count").textContent = `· ${filtered.length} spots`;
  document.querySelectorAll("[data-filter-count]").forEach((count) => {
    const filter = count.dataset.filterCount;
    count.textContent = spots.filter((spot) => matchesLocation(spot) && (filter === "all" || spot.duration.includes(filter))).length;
  });
}

function openModal(content) {
  modalContent.innerHTML = content;
  modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  modal.scrollTop = 0;
  window.setTimeout(() => modal.querySelector("input,button,select")?.focus(), 40);
}
function closeModal() {
  modalBackdrop.hidden = true;
  document.body.style.overflow = "";
}
function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}
function showSuccess(title, message, action = "Done") {
  openModal(`<div class="success-state"><span class="success-mark">✓</span><h2 id="modal-title">${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p><button class="button-primary" type="button" data-close>${escapeHtml(action)}</button></div>`);
}

function localDateString(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function requireAuth(action) {
  if (authSession?.access_token && authUser) {
    action();
    return;
  }
  pendingAction = action;
  authDialog();
}

function authDialog(mode = "signin") {
  const creating = mode === "signup";
  openModal(`
    <span class="modal-kicker">WELCOME TO SPOTTED</span>
    <h2 id="modal-title">${creating ? "Create your account" : "Good to see you."}</h2>
    <p class="modal-lead">${creating ? "Save spots, chat with local hosts, and manage your bookings." : "Sign in to message a host, book a spot, or list your space."}</p>
    <form id="auth-form" data-mode="${mode}">
      <div class="form-grid">
        ${creating ? '<div class="form-field full"><label for="auth-name">Your name</label><input id="auth-name" name="full-name" autocomplete="name" minlength="2" maxlength="80" required></div>' : ""}
        <div class="form-field full"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" required></div>
        <div class="form-field full"><label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="${creating ? "new-password" : "current-password"}" minlength="8" required></div>
      </div>
      <p class="form-status" id="auth-status" role="status" hidden></p>
      <div class="modal-actions"><button class="button-primary" type="submit">${creating ? "Create account" : "Sign in"} <span>→</span></button></div>
    </form>
    <p class="auth-switch">${creating ? "Already have an account?" : "New to Spotted?"} <button type="button" data-auth-mode="${creating ? "signin" : "signup"}">${creating ? "Sign in" : "Create an account"}</button></p>
  `);
  document.querySelector("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const fields = new FormData(form);
    const status = document.querySelector("#auth-status");
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    status.hidden = false;
    status.textContent = "Connecting securely…";
    try {
      const response = await authRequest(
        creating ? "signup" : "token?grant_type=password",
        creating
          ? { email: fields.get("email"), password: fields.get("password"), data: { full_name: fields.get("full-name") } }
          : { email: fields.get("email"), password: fields.get("password") },
      );
      if (!response.access_token) {
        status.textContent = "Check your email for a verification link, then come back to sign in.";
        return;
      }
      response.expires_at = Math.floor(Date.now() / 1000) + (response.expires_in || 3600);
      storeSession(response);
      closeModal();
      const nextAction = pendingAction;
      pendingAction = null;
      if (nextAction) nextAction();
      else showToast(`Welcome${authUser?.user_metadata?.full_name ? `, ${authUser.user_metadata.full_name}` : ""}!`);
    } catch (error) {
      status.textContent = error.message;
      status.dataset.state = "error";
    } finally {
      submit.disabled = false;
    }
  });
}

function bookingForm(spot) {
  if (spot.isDemo) {
    showToast("This is a preview spot. Live bookings open when a host lists a real space.");
    return;
  }
  requireAuth(() => {
    currentSpot = spot;
    const today = localDateString(new Date());
    const minimumDate = spot.availableFrom && spot.availableFrom > today ? spot.availableFrom : today;
    const selectedDate = document.querySelector("#search-date").value;
    const initialDate = selectedDate && selectedDate >= minimumDate ? selectedDate : minimumDate;
    const durationOptions = spot.unit === "game"
      ? '<option value="1">1 game</option>'
      : `<option value="1">1 ${spot.unit}</option><option value="2">2 ${spot.unit}s</option><option value="4">4 ${spot.unit}s</option>`;
    openModal(`
      <span class="modal-kicker">A BETTER PARKING DAY STARTS HERE</span><h2 id="modal-title">Book ${escapeHtml(spot.name)}</h2>
      <p class="modal-lead">Pay your host directly with Venmo. Your exact address appears after the host confirms your payment.</p>
      <div class="receipt-spot"><div class="photo-fallback">${artSvg(spot.art, spot.color)}</div><div><b>${escapeHtml(spot.name)}</b><span>${escapeHtml(spot.address)} · Hosted by ${escapeHtml(spot.host)}</span></div></div>
      <form id="booking-form">
        <div class="form-grid" style="margin-top:15px">
          <div class="form-field"><label for="book-date">Start date</label><input id="book-date" name="date" type="date" value="${initialDate}" min="${minimumDate}" ${spot.availableUntil ? `max="${spot.availableUntil}"` : ""} required></div>
          <div class="form-field"><label for="book-duration">Duration</label><select id="book-duration" name="duration" required>${durationOptions}</select></div>
        </div>
        <p class="secure-payment-note">You’ll review a Venmo QR code before paying. Spotted does not collect payment details or verify Venmo payments automatically.</p>
        <div class="spot-bottom booking-total" style="margin-top:13px"><span class="spot-price">${money.format(spot.price)}<small> / ${spot.unit === "game" ? "game" : escapeHtml(spot.unit)}</small></span><span class="booking-estimate">Total due on Venmo</span></div>
        <p class="form-status" id="booking-status" role="status" hidden></p>
        <div class="modal-actions"><button class="button-primary" type="submit">Continue to Venmo payment <span>→</span></button></div>
      </form>
    `);
    document.querySelector("#book-duration").addEventListener("change", (event) => {
      const total = spot.price * Number(event.target.value);
      document.querySelector(".booking-total .spot-price").innerHTML = `${money.format(total)} <small>estimated total</small>`;
    });
  });
}

function renderMessages(messages) {
  const box = document.querySelector("#chat-box");
  if (!box) return;
  const otherParty = currentSpot?.owner_id === authUser?.id ? "Driver" : currentSpot?.host || "Host";
  box.innerHTML = messages.map((message) => `
    <div class="chat-message ${message.sender_id === authUser.id ? "mine" : ""}">${escapeHtml(message.body)}
      <small>${message.sender_id === authUser.id ? "You" : escapeHtml(otherParty)} · ${new Date(message.created_at).toLocaleString()}</small>
    </div>
  `).join("");
  box.scrollTop = box.scrollHeight;
}

async function fetchConversationMessages(conversationId) {
  const messages = await supabaseRequest(`messages?conversation_id=eq.${encodeURIComponent(conversationId)}&select=id,sender_id,body,created_at&order=created_at.asc`);
  renderMessages(messages);
}

async function getOrCreateConversation(spot) {
  const existing = await supabaseRequest(`conversations?spot_id=eq.${encodeURIComponent(spot.id)}&or=(renter_id.eq.${encodeURIComponent(authUser.id)},owner_id.eq.${encodeURIComponent(authUser.id)})&select=id&limit=1`);
  if (existing.length) return existing[0];
  if (spot.owner_id === authUser.id) throw new Error("Choose a conversation from your inbox to reply to a driver.");
  const response = await fetch(`${supabaseConfig.supabaseUrl}/rest/v1/conversations`, {
    method: "POST",
    headers: {
      apikey: supabaseConfig.supabasePublishableKey,
      Authorization: `Bearer ${authSession.access_token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ spot_id: spot.id, renter_id: authUser.id, owner_id: spot.owner_id }),
  });
  const text = await response.text();
  if (response.ok) return JSON.parse(text)[0];
  if (response.status === 409) {
    const retry = await supabaseRequest(`conversations?spot_id=eq.${encodeURIComponent(spot.id)}&renter_id=eq.${encodeURIComponent(authUser.id)}&select=id&limit=1`);
    if (retry.length) return retry[0];
  }
  const error = text ? JSON.parse(text) : {};
  throw new Error(error.message || "This conversation could not be opened.");
}

async function chatDialog(spot, existingConversationId = null) {
  if (!spot || spot.isDemo) {
    showToast("Preview spots don’t have a real host yet. Try messaging a live listing.");
    return;
  }
  requireAuth(async () => {
    currentSpot = spot;
    try {
      const conversation = existingConversationId
        ? { id: existingConversationId }
        : await getOrCreateConversation(spot);
      openModal(`
        <span class="modal-kicker">YOUR SPOT OWNER</span><h2 id="modal-title">Message ${escapeHtml(spot.host)}</h2>
        <p class="modal-lead">${escapeHtml(spot.name)} · Messages stay between you and your host.</p>
        <div class="chat-box" id="chat-box" aria-live="polite"><p class="chat-loading">Loading your conversation…</p></div>
        <form class="chat-input-row" id="chat-form"><input id="chat-input" name="message" placeholder="Write a message…" aria-label="Write a message" maxlength="2000" required><button type="submit" aria-label="Send message"><svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13"/></svg></button></form>
        <p class="form-status" id="chat-status" role="status" hidden></p>
      `);
      await fetchConversationMessages(conversation.id);
      window.clearInterval(chatRefreshTimer);
      chatRefreshTimer = window.setInterval(() => {
        if (!modalBackdrop.hidden) fetchConversationMessages(conversation.id).catch((error) => console.error(error));
      }, 6000);
      document.querySelector("#chat-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = document.querySelector("#chat-input");
        const body = input.value.trim();
        if (!body) return;
        const sendButton = event.currentTarget.querySelector("button");
        const status = document.querySelector("#chat-status");
        sendButton.disabled = true;
        try {
          await supabaseRequest("messages", {
            method: "POST",
            prefer: "return=minimal",
            body: { conversation_id: conversation.id, sender_id: authUser.id, body },
          });
          input.value = "";
          await fetchConversationMessages(conversation.id);
        } catch (error) {
          status.hidden = false;
          status.textContent = error.message;
        } finally {
          sendButton.disabled = false;
          input.focus();
        }
      });
    } catch (error) {
      showToast(error.message);
    }
  });
}

function messagesDialog() {
  requireAuth(async () => {
    try {
      const conversations = await supabaseRequest("my_conversations?select=id,spot_id,owner_id,renter_id,spot_title,host_name,renter_name,created_at&order=created_at.desc");
      if (!conversations.length) {
        openModal('<span class="modal-kicker">YOUR INBOX</span><h2 id="modal-title">It’s quiet in here.</h2><p class="modal-lead">When you message a spot owner, your conversation will show up here.</p>');
        return;
      }
      const entries = conversations.map((conversation) => {
        const otherParty = conversation.owner_id === authUser.id ? conversation.renter_name : conversation.host_name;
        return `<button class="inbox-entry" type="button" data-conversation-id="${escapeHtml(conversation.id)}" data-conversation-spot="${escapeHtml(conversation.spot_id)}" data-conversation-owner="${escapeHtml(conversation.owner_id)}" data-conversation-name="${escapeHtml(conversation.spot_title)}" data-conversation-host="${escapeHtml(otherParty)}"><span class="inbox-avatar">${escapeHtml((otherParty || "S").slice(0, 1).toUpperCase())}</span><span><strong>${escapeHtml(otherParty)}</strong><small>${escapeHtml(conversation.spot_title)}</small></span><span aria-hidden="true">→</span></button>`;
      });
      openModal(`<span class="modal-kicker">YOUR INBOX</span><h2 id="modal-title">Messages</h2><p class="modal-lead">Pick a spot to open your conversation.</p><div class="inbox-list">${entries.join("")}</div>`);
    } catch (error) {
      showToast(error.message);
    }
  });
}

function paymentQrDialog(booking) {
  const username = String(booking.venmoUsername || "").replace(/^@/, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{4,29}$/.test(username)
    || !Number.isSafeInteger(booking.totalCents)
    || booking.totalCents < 100
    || !/^[0-9a-f-]{36}$/i.test(booking.id)) {
    showToast("The Venmo payment details for this booking are invalid.");
    return;
  }
  const paymentParams = new URLSearchParams({
    txn: "pay",
    recipients: username,
    amount: (booking.totalCents / 100).toFixed(2),
    note: `Spotted ${booking.id.slice(0, 8)}`,
  });
  const venmoUri = `venmo://paycharge?${paymentParams}`;
  const profileUrl = `https://venmo.com/u/${encodeURIComponent(username)}`;
  const qrImage = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&format=svg&data=${encodeURIComponent(venmoUri)}`;
  openModal(`
    <span class="modal-kicker">PAY YOUR HOST DIRECTLY</span><h2 id="modal-title">Scan with Venmo</h2>
    <p class="modal-lead">Send <strong>${money.format(booking.totalCents / 100)}</strong> to <strong>@${escapeHtml(username)}</strong>. Include the booking reference so your host can match your payment.</p>
    <div class="venmo-payment-card">
      <img class="venmo-qr" src="${escapeHtml(qrImage)}" alt="Venmo payment QR code for @${escapeHtml(username)}" width="240" height="240">
      <a class="button-primary venmo-open" href="${escapeHtml(venmoUri)}">Open Venmo <span aria-hidden="true">→</span></a>
      <a class="venmo-profile" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">Open @${escapeHtml(username)}’s Venmo profile</a>
      <p>Reference: <strong>${escapeHtml(booking.id.slice(0, 8))}</strong></p>
    </div>
    <p class="secure-payment-note">Spotted can’t verify Venmo payments. Only mark it sent after you complete the payment. Your host must confirm receipt before the parking address is shared.</p>
    <div class="modal-actions"><button class="button-primary" type="button" data-booking-action="payment_sent" data-booking-id="${escapeHtml(booking.id)}">I sent the payment</button></div>
  `);
}

async function updateBookingPayment(bookingId, action) {
  await supabaseRequest("rpc/update_booking_payment", {
    method: "POST",
    body: { p_booking_id: bookingId, p_action: action },
  });
  closeModal();
  const messages = {
    payment_sent: "Payment marked as sent. Your host will confirm it in My bookings.",
    confirm: "Payment confirmed. The renter can now see the parking address.",
    reject: "Payment not confirmed. The reservation was released.",
    cancel: "Reservation cancelled.",
  };
  showToast(messages[action]);
}

async function bookingHistoryDialog() {
  requireAuth(async () => {
    try {
      const bookings = await supabaseRequest("my_bookings?select=*&order=created_at.desc");
      const rows = bookings.map((booking) => {
        const lastDay = new Date(`${booking.end_date}T12:00:00`);
        lastDay.setDate(lastDay.getDate() - 1);
        const isRenter = booking.renter_id === authUser.id;
        const statusLabels = {
          payment_pending: "Payment pending",
          payment_submitted: "Payment sent · awaiting host",
          confirmed: "Confirmed",
          cancelled: "Cancelled",
        };
        let actions = "";
        let paymentNote = "";
        if (isRenter && booking.status === "payment_pending") {
          paymentNote = "Pay the host with Venmo. Your dates are held while payment is pending. If you already paid, contact the host before cancelling.";
          actions = `<button class="button-secondary" type="button" data-payment-qr data-booking-id="${escapeHtml(booking.id)}" data-venmo-username="${escapeHtml(booking.venmo_username || "")}" data-total-cents="${booking.total_cents}">Show Venmo QR</button> <button class="button-secondary" type="button" data-booking-action="cancel" data-booking-id="${escapeHtml(booking.id)}">Cancel unpaid reservation</button>`;
        } else if (isRenter && booking.status === "payment_submitted") {
          paymentNote = "Waiting for the host to confirm your Venmo payment.";
        } else if (!isRenter && booking.status === "payment_submitted") {
          paymentNote = "Check your Venmo account before confirming the renter’s payment.";
          actions = `<button class="button-primary" type="button" data-booking-action="confirm" data-booking-id="${escapeHtml(booking.id)}">Confirm payment</button> <button class="button-secondary" type="button" data-booking-action="reject" data-booking-id="${escapeHtml(booking.id)}">Payment not received</button>`;
        } else if (!isRenter && booking.status === "payment_pending") {
          paymentNote = "Waiting for the renter to send payment.";
        }
        return `
          <article class="booking-entry">
            <div><span class="booking-state state-${escapeHtml(booking.status)}">${escapeHtml(statusLabels[booking.status] || booking.status)}</span><h3>${escapeHtml(booking.spot_title)}</h3>
              <p>${escapeHtml(booking.neighborhood || booking.city)} · ${new Date(`${booking.start_date}T12:00:00`).toLocaleDateString()} – ${lastDay.toLocaleDateString()}</p>
              ${booking.street_address ? `<p class="booking-address">${escapeHtml(booking.street_address)}</p>` : ""}
              ${paymentNote ? `<p>${escapeHtml(paymentNote)}</p>` : ""}
              ${actions ? `<div class="booking-actions">${actions}</div>` : ""}
            </div><strong>${money.format(booking.total_cents / 100)}</strong>
          </article>`;
      }).join("");
      openModal(`<span class="modal-kicker">YOUR PARKING PLANS</span><h2 id="modal-title">My bookings</h2><p class="modal-lead">${bookings.length ? "Venmo payments are sent directly to hosts. Hosts confirm receipt before a booking is complete." : "No bookings yet. Find a spot close to your next class."}</p><div class="booking-list">${rows || '<a class="button-secondary booking-find" href="#explore" data-view="browse">Explore parking</a>'}</div>`);
    } catch (error) {
      showToast(error.message);
    }
  });
}

function listingDialog() {
  requireAuth(() => {
    openModal(`
    <span class="modal-kicker">A LITTLE EXTRA ROOM. A LITTLE EXTRA INCOME.</span><h2 id="modal-title">Put your parking spot to work.</h2>
    <p class="modal-lead">List one space or a few, set your own price, and choose when it’s available. Renters pay you directly through Venmo.</p>
    <form id="listing-form">
      <div class="form-field full" style="margin-bottom:15px"><label>How many spots are you listing?</label><div class="spot-choice"><input type="radio" name="spot-count" id="one-spot" value="1" checked><div><b>One spot</b><span>Start with your driveway, garage, or parking space</span></div></div><div class="spot-choice"><input type="radio" name="spot-count" id="multiple-spots" value="multiple"><div><b>Multiple spots</b><span>List two or more spaces at the same address</span></div></div></div>
      <div id="extra-spots" class="form-field full" hidden style="margin-bottom:14px"><label for="spot-quantity">Number of spots</label><input id="spot-quantity" name="spot-quantity" type="number" min="2" max="20" value="2"></div>
      <div class="form-grid">
        <div class="form-field full"><label for="listing-address">Street address (only shared after booking)</label><input id="listing-address" name="address" placeholder="Street address" autocomplete="street-address" maxlength="200" required></div>
        <div class="form-field"><label for="listing-city">City</label><input id="listing-city" name="city" value="${escapeHtml(document.querySelector("#city-input").value || "Boulder, CO")}" maxlength="100" required></div>
        <div class="form-field"><label for="listing-neighborhood">Area / neighborhood</label><input id="listing-neighborhood" name="neighborhood" placeholder="e.g. University Hill" maxlength="100"></div>
        <div class="form-field full"><label for="listing-building">Closest campus building</label><input id="listing-building" name="building" type="text" placeholder="Start typing a CU building" list="campus-buildings" autocomplete="off" maxlength="150"></div>
        <div class="form-field"><label for="listing-available-from">Available from</label><input id="listing-available-from" name="available-from" type="date" min="${localDateString(new Date())}" value="${localDateString(new Date())}" required></div>
        <div class="form-field"><label for="listing-available-until">Available through <span class="optional">(optional)</span></label><input id="listing-available-until" name="available-until" type="date"></div>
        <div class="form-field"><label for="listing-type">Spot type</label><select id="listing-type" name="type"><option>Driveway</option><option>Garage</option><option>Private lot</option><option>Covered space</option></select></div>
        <div class="form-field"><label for="listing-use">Price per</label><select id="listing-use" name="use"><option value="day">Day</option><option value="week">Week</option><option value="game">CU football game</option><option value="month">Month</option></select></div>
        <div class="form-field full"><label for="listing-venmo">Your Venmo username</label><input id="listing-venmo" name="venmo" placeholder="@your-username" minlength="5" maxlength="31" pattern="@?[A-Za-z0-9][A-Za-z0-9_.-]{4,29}" autocomplete="off" required><small class="field-help">Renters use this to pay you after they reserve. Enter your username, with or without @.</small></div>
      </div>
      <div class="price-panel"><div class="price-panel-head"><span>Suggested price near campus<br>Slide to set your own asking price</span><strong id="asking-price">$8 <small>/ day</small></strong></div><input id="price-slider" type="range" min="4" max="40" step="1" value="8" aria-label="Set asking price"><div class="range-labels"><span>More bookings · $4</span><span>Higher earnings · $40</span></div></div>
      <p class="secure-payment-note">Venmo payments go directly to you. Spotted does not hold funds or automatically verify payment; use an account type Venmo allows for payments for goods or services.</p>
      <p class="form-status" id="listing-status" role="status" hidden></p>
      <div class="modal-actions"><button class="button-primary" type="submit">Publish your spot <span>→</span></button></div>
    </form>
  `);
  const ranges = { day: [4, 40, 8], week: [25, 180, 38], game: [10, 100, 24], month: [80, 400, 120] };
  const use = document.querySelector("#listing-use");
  const slider = document.querySelector("#price-slider");
  const price = document.querySelector("#asking-price");
  const updatePrice = () => {
    const [min, max, suggested] = ranges[use.value];
    slider.min = min;
    slider.max = max;
    slider.value = suggested;
    price.innerHTML = `${money.format(Number(slider.value))} <small>/ ${use.value === "game" ? "game" : use.value}</small>`;
    const labels = document.querySelectorAll(".range-labels span");
    labels[0].textContent = `More bookings · ${money.format(min)}`;
    labels[1].textContent = `Higher earnings · ${money.format(max)}`;
  };
  use.addEventListener("change", updatePrice);
  slider.addEventListener("input", () => {
    price.innerHTML = `${money.format(Number(slider.value))} <small>/ ${use.value === "game" ? "game" : use.value}</small>`;
  });
  document.querySelectorAll('input[name="spot-count"]').forEach((input) => input.addEventListener("change", () => {
    document.querySelector("#extra-spots").hidden = document.querySelector("#multiple-spots").checked === false;
  }));
    const availabilityStart = document.querySelector("#listing-available-from");
    const availabilityEnd = document.querySelector("#listing-available-until");
    availabilityStart.addEventListener("change", () => {
      availabilityEnd.min = availabilityStart.value;
      if (availabilityEnd.value && availabilityEnd.value < availabilityStart.value) availabilityEnd.value = "";
    });
    document.querySelector("#listing-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.reportValidity()) return;
      const fields = new FormData(form);
      const venmoUsername = String(fields.get("venmo")).trim().replace(/^@/, "");
      const count = fields.get("spot-count") === "multiple" ? Number(fields.get("spot-quantity")) : 1;
      const spotType = String(fields.get("type")).toLowerCase();
      const start = String(fields.get("available-from"));
      const until = String(fields.get("available-until") || "");
      if (until && until < start) {
        availabilityEnd.setCustomValidity("Choose an end date on or after the start date.");
        availabilityEnd.reportValidity();
        availabilityEnd.setCustomValidity("");
        return;
      }
      const price = Number(document.querySelector("#price-slider").value);
      const draft = Array.from({ length: count }, (_, index) => ({
        title: count > 1 ? `${fields.get("type")} · space ${index + 1} of ${count}` : `${fields.get("type")} parking near campus`,
        description: "",
        street_address: String(fields.get("address")).trim(),
        city: String(fields.get("city")).trim(),
        neighborhood: String(fields.get("neighborhood") || "").trim(),
        nearby_building: String(fields.get("building") || "").trim(),
        available_from: start,
        available_until: until || null,
        spot_type: spotType,
        covered: spotType === "garage" || spotType === "covered space",
        price_cents: Math.round(price * 100),
        price_period: String(fields.get("use")),
        status: "active",
      }));
      const status = document.querySelector("#listing-status");
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      status.hidden = false;
      status.textContent = "Publishing your spot…";
      try {
        if (!supabaseConfig) throw new Error("Listings are read-only in preview mode. Deploy with your Supabase settings to publish a real spot.");
        await supabaseRequest(`profiles?id=eq.${encodeURIComponent(authUser.id)}`, {
          method: "PATCH",
          prefer: "return=minimal",
          body: { venmo_username: venmoUsername },
        });
        await supabaseRequest("spots", {
          method: "POST",
          prefer: "return=minimal",
          body: draft.map((spot) => ({ ...spot, owner_id: authUser.id })),
        });
        document.querySelector("#city-input").value = draft[0].city;
        document.querySelector("#area-input").value = "";
        document.querySelector("#search-date").value = "";
        document.querySelector("#duration-input").value = "all";
        activeFilter = "all";
        document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("selected", chip.dataset.filter === "all"));
        const listings = await supabaseRequest("public_spots?select=*&order=created_at.desc");
        spots.splice(0, spots.length, ...listings.map(mapDatabaseSpot), ...demoSpots);
        renderCards();
        closeModal();
        showToast("Your spot is live. Renters can pay you directly through Venmo.");
      } catch (error) {
        status.textContent = error.message;
        status.dataset.state = "error";
        submit.disabled = false;
      }
    });
  });
}

function closeMobileMenu() {
  document.querySelector("#mobile-menu").hidden = true;
  const button = document.querySelector(".mobile-menu-button");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "Open menu");
}

function switchView(view) {
  closeMobileMenu();
  if (view === "list") {
    listingDialog();
    return;
  }
  closeModal();
  document.querySelector("#explore").scrollIntoView({ behavior: "smooth", block: "start" });
}

grid.addEventListener("click", (event) => {
  const book = event.target.closest("[data-book]");
  const message = event.target.closest("[data-message]");
  const favorite = event.target.closest("[data-favorite]");
  if (book) bookingForm(spots.find((spot) => spot.id === book.dataset.book));
  if (message) chatDialog(spots.find((spot) => spot.id === message.dataset.message));
  if (favorite) {
    const id = favorite.dataset.favorite;
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    favorite.classList.toggle("favorited", favorites.has(id));
    favorite.setAttribute("aria-label", `${favorites.has(id) ? "Remove from" : "Add to"} favorites`);
    showToast(favorites.has(id) ? "Saved to your favorites" : "Removed from favorites");
  }
});
document.querySelector("#search-form").addEventListener("submit", (event) => {
  event.preventDefault();
  activeFilter = document.querySelector("#duration-input").value;
  document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("selected", chip.dataset.filter === activeFilter));
  renderCards();
  document.querySelector("#results").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#sort-select").addEventListener("change", renderCards);
document.querySelector("#search-date").addEventListener("change", renderCards);
document.querySelector("#duration-input").addEventListener("change", () => {
  const chosen = document.querySelector("#duration-input").value;
  if (chosen !== "all") {
    activeFilter = chosen;
    document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("selected", chip.dataset.filter === chosen));
  } else activeFilter = "all";
  renderCards();
});
document.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  document.querySelector("#duration-input").value = "all";
  document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("selected", chip === button));
  renderCards();
}));
document.querySelector("#map-toggle").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const panel = document.querySelector("#map-panel");
  panel.hidden = !panel.hidden;
  button.setAttribute("aria-pressed", String(!panel.hidden));
  button.querySelector("span").textContent = panel.hidden ? "Show map" : "Hide map";
});
document.querySelector("#map-panel").addEventListener("click", (event) => {
  const pin = event.target.closest("[data-map-spot]");
  if (pin) bookingForm(spots.find((spot) => spot.id === pin.dataset.mapSpot));
});
document.querySelector("#reset-search").addEventListener("click", () => {
  document.querySelector("#area-input").value = "";
  document.querySelector("#search-date").value = "";
  document.querySelector("#duration-input").value = "all";
  activeFilter = "all";
  document.querySelectorAll(".filter-chip").forEach((chip) => chip.classList.toggle("selected", chip.dataset.filter === "all"));
  renderCards();
});
document.querySelector("#load-more").addEventListener("click", () => showToast("You’re all caught up — more spots are coming soon!"));
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", (event) => {
  if (button.tagName === "A") event.preventDefault();
  switchView(button.dataset.view);
}));
document.querySelectorAll("[data-open-chat]").forEach((button) => button.addEventListener("click", (event) => {
  event.preventDefault();
  closeMobileMenu();
  messagesDialog();
}));
document.querySelectorAll("[data-bookings]").forEach((button) => button.addEventListener("click", (event) => {
  event.preventDefault();
  closeMobileMenu();
  bookingHistoryDialog();
}));
document.querySelectorAll("[data-auth]").forEach((button) => button.addEventListener("click", (event) => {
  event.preventDefault();
  closeMobileMenu();
  if (!authUser) authDialog();
  else openModal(`
    <span class="modal-kicker">YOUR SPOTTED ACCOUNT</span>
    <h2 id="modal-title">${escapeHtml(authUser.user_metadata?.full_name || authUser.email)}</h2>
    <p class="modal-lead">${escapeHtml(authUser.email)}</p>
    <div class="modal-actions"><button class="button-secondary" type="button" data-signout>Sign out</button><button class="button-primary" type="button" data-close>Done</button></div>
  `);
}));
document.querySelector(".mobile-menu-button").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const menu = document.querySelector("#mobile-menu");
  menu.hidden = !menu.hidden;
  button.setAttribute("aria-expanded", String(!menu.hidden));
  button.setAttribute("aria-label", menu.hidden ? "Open menu" : "Close menu");
});
document.querySelector("#mobile-menu").addEventListener("click", (event) => {
  if (event.target.closest("a") && !event.target.closest("[data-view]")) closeMobileMenu();
});
document.querySelector(".modal-close").addEventListener("click", () => {
  window.clearInterval(chatRefreshTimer);
  closeModal();
});
modalBackdrop.addEventListener("click", (event) => {
  if (event.target === modalBackdrop) {
    window.clearInterval(chatRefreshTimer);
    closeModal();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !modalBackdrop.hidden) {
    window.clearInterval(chatRefreshTimer);
    closeModal();
  }
});
modalContent.addEventListener("submit", async (event) => {
  const form = event.target;
  if (form.id !== "booking-form") return;
  event.preventDefault();
  if (!form.reportValidity()) return;
  const submit = form.querySelector('button[type="submit"]');
  const status = document.querySelector("#booking-status");
  submit.disabled = true;
  status.hidden = false;
  status.textContent = "Preparing your Venmo payment…";
  try {
    const result = await netlifyRequest("/api/create-booking", {
      method: "POST",
      body: {
        spotId: currentSpot.id,
        startDate: document.querySelector("#book-date").value,
        quantity: Number(document.querySelector("#book-duration").value),
      },
    });
    paymentQrDialog({
      id: result.bookingId,
      totalCents: result.totalCents,
      venmoUsername: result.venmoUsername,
    });
  } catch (error) {
    status.textContent = error.message;
    status.dataset.state = "error";
    submit.disabled = false;
  }
});
modalContent.addEventListener("click", (event) => {
  if (event.target.closest("[data-close]")) closeModal();
  if (event.target.closest("[data-signout]")) {
    storeSession(null);
    closeModal();
    showToast("You’re signed out.");
  }
  const paymentAction = event.target.closest("[data-booking-action]");
  if (paymentAction) {
    paymentAction.disabled = true;
    updateBookingPayment(paymentAction.dataset.bookingId, paymentAction.dataset.bookingAction).catch((error) => {
      paymentAction.disabled = false;
      showToast(error.message);
    });
    return;
  }
  const paymentQr = event.target.closest("[data-payment-qr]");
  if (paymentQr) {
    paymentQrDialog({
      id: paymentQr.dataset.bookingId,
      venmoUsername: paymentQr.dataset.venmoUsername,
      totalCents: Number(paymentQr.dataset.totalCents),
    });
    return;
  }
  if (event.target.closest("[data-auth-mode]")) authDialog(event.target.closest("[data-auth-mode]").dataset.authMode);
  const conversation = event.target.closest("[data-conversation-spot]");
  if (conversation) {
    const spot = {
      id: conversation.dataset.conversationSpot,
      owner_id: conversation.dataset.conversationOwner,
      name: conversation.dataset.conversationName,
      host: conversation.dataset.conversationHost,
      isDemo: false,
    };
    chatDialog(spot, conversation.dataset.conversationId);
  }
});
const searchDate = document.querySelector("#search-date");
searchDate.min = localDateString(new Date());
loadMarketplace();
