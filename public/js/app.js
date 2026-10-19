// App shell: picks the data store, routes between pages, handles sign-in.
import { CONFIG } from './config.js';
import { esc, icon, modal, toast, initials } from './ui.js';

const routes = [
  [/^\/?$/, () => import('./pages/home.js')],
  [/^\/find$/, () => import('./pages/find.js')],
  [/^\/spot\/([^/]+)$/, () => import('./pages/spot.js')],
  [/^\/pay\/([^/]+)$/, () => import('./pages/pay.js')],
  [/^\/bookings$/, () => import('./pages/bookings.js')],
  [/^\/messages(?:\/([^/]+))?$/, () => import('./pages/messages.js')],
  [/^\/host$/, () => import('./pages/host.js')],
  [/^\/list$/, () => import('./pages/list.js')],
  [/^\/account$/, () => import('./pages/account.js')],
  [/^\/demo-qr$/, () => import('./pages/demo-qr.js')],
  [/^\/team$/, () => import('./pages/admin.js')],
];

let store;
let cleanup = null;
let currentLive = null;
const view = document.getElementById('view');

async function loadStore() {
  if (CONFIG.supabaseUrl && CONFIG.supabaseKey) {
    try {
      const { createLiveStore } = await import('./store-live.js');
      return await createLiveStore(CONFIG);
    } catch (e) {
      console.error(e);
      view.innerHTML = `<section class="page narrow"><div class="empty"><h2>We can't reach the database</h2><p>Check your internet connection and refresh. If this keeps happening, the Supabase keys in <code>js/config.js</code> may be wrong.</p></div></section>`;
      throw e;
    }
  }
  return (await import('./store-demo.js')).store;
}

export function go(path) {
  if (location.hash === `#${path}`) render();
  else location.hash = path;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  return { path, query: Object.fromEntries(new URLSearchParams(qs)) };
}

// Ask for sign-in in a dialog so the current page (and anything typed) stays put.
export function requireAuth(reason = 'Sign in to continue') {
  return new Promise(async (resolve) => {
    const existing = await store.getUser();
    if (existing) return resolve(existing);
    let done = false;
    const finish = (u) => { if (!done) { done = true; resolve(u); } };
    const close = authDialog(reason, finish);
    // Resolve null if the dialog is dismissed.
    const root = document.getElementById('modal-root');
    const obs = new MutationObserver(() => { if (root.hidden) { obs.disconnect(); finish(null); } });
    obs.observe(root, { attributes: true, attributeFilter: ['hidden'] });
    return close;
  });
}

function authDialog(reason, onDone, startMode = 'signin') {
  return modal(`
    <h2 class="modal-title" id="auth-title"></h2>
    <p class="muted modal-sub">${esc(reason)}</p>
    <div class="seg" role="tablist">
      <button type="button" role="tab" data-mode="signin">Sign in</button>
      <button type="button" role="tab" data-mode="signup">Create account</button>
    </div>
    <form class="form" id="auth-form" novalidate>
      <label class="field" data-only="signup"><span>Full name</span><input name="name" autocomplete="name" placeholder="Kendra Nelson" /></label>
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="email" required placeholder="you@email.com" /></label>
      <label class="field"><span>Password</span><input name="password" type="password" minlength="6" required autocomplete="current-password" placeholder="At least 6 characters" /></label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-primary btn-block" type="submit"></button>
    </form>
    ${store.mode === 'demo' ? '<p class="fine">Demo mode: accounts are saved only in this browser.</p>' : ''}
  `, {
    label: 'Sign in',
    onMount(el, close) {
      let mode = startMode;
      const form = el.querySelector('#auth-form');
      const err = form.querySelector('.form-error');
      const setMode = (m) => {
        mode = m;
        el.querySelector('#auth-title').textContent = m === 'signin' ? 'Welcome back' : 'Create your account';
        el.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
        el.querySelectorAll('[data-only="signup"]').forEach((x) => { x.hidden = m !== 'signup'; });
        form.password.autocomplete = m === 'signin' ? 'current-password' : 'new-password';
        form.querySelector('button[type=submit]').textContent = m === 'signin' ? 'Sign in' : 'Create account';
        err.hidden = true;
      };
      el.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
      setMode(mode);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        const fd = Object.fromEntries(new FormData(form));
        if (!fd.email || !fd.password) { err.textContent = 'Enter your email and password.'; err.hidden = false; return; }
        if (mode === 'signup' && !fd.name.trim()) { err.textContent = 'Enter your name so hosts know who\'s parking.'; err.hidden = false; return; }
        btn.disabled = true; err.hidden = true;
        try {
          if (mode === 'signin') await store.signIn(fd);
          else {
            const r = await store.signUp(fd);
            if (r.needsConfirmation) {
              el.querySelector('#auth-form').outerHTML = `<div class="notice">${icon('check')} <div><strong>Check your email</strong><p>We sent a confirmation link to ${esc(fd.email)}. Open it, then sign in here.</p></div></div>`;
              return;
            }
          }
          const u = await store.getUser();
          onDone?.(u);
          close(); toast(`Signed in as ${u.full_name}`);
        } catch (ex) {
          err.textContent = ex.message; err.hidden = false;
        } finally { btn.disabled = false; }
      });
    },
  });
}

async function renderChrome() {
  const user = await store.getUser();
  const actions = document.getElementById('topbar-actions');
  actions.innerHTML = user
    ? `${user.is_admin ? '<a class="btn btn-ghost btn-xs team-link" href="#/team">Team</a>' : ''}
       <a class="icon-btn" href="#/messages" aria-label="Messages">${icon('chat')}</a>
       <a class="avatar" href="#/account" aria-label="Your account" title="${esc(user.full_name)}">${esc(initials(user.full_name))}</a>`
    : `<button class="link-btn" type="button" data-signin>Sign in</button>
       <button class="btn btn-primary btn-sm" type="button" data-signup>Get Started</button>`;
  actions.querySelector('[data-signin]')?.addEventListener('click', () => authDialog('Book parking, list your spot and chat with hosts.', () => render()));
  actions.querySelector('[data-signup]')?.addEventListener('click', () => authDialog('Book parking, list your spot and chat with hosts.', () => render(), 'signup'));

  const strip = document.getElementById('demo-strip');
  if (store.mode === 'demo' && !sessionStorage.getItem('spotted.hideDemo')) {
    strip.hidden = false;
    strip.innerHTML = `<span>${icon('info')} <span class="long">Demo mode: bookings and messages are saved in this browser only.</span><span class="short">Demo mode: data stays on this device.</span> <a href="#/account">Learn more</a></span><button class="icon-btn" aria-label="Hide" data-hide>${icon('close')}</button>`;
    strip.querySelector('[data-hide]').onclick = () => { sessionStorage.setItem('spotted.hideDemo', '1'); strip.hidden = true; };
  } else strip.hidden = true;
}

function markNav(path) {
  const key = path === '/' ? 'home'
    : path.startsWith('/find') || path.startsWith('/spot') ? 'find'
    : path.startsWith('/bookings') || path.startsWith('/pay') ? 'bookings'
    : path.startsWith('/messages') ? 'messages'
    : path.startsWith('/host') || path.startsWith('/list') ? 'host'
    : path.startsWith('/account') ? 'account' : path.startsWith('/team') ? 'team' : '';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === key));
  document.querySelectorAll('[data-tab]').forEach((a) => {
    const on = a.dataset.tab === key;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.body.dataset.page = key || 'other';
}

async function render() {
  const { path, query } = parseHash();
  cleanup?.(); cleanup = null; currentLive = null;
  const match = routes.find(([re]) => re.test(path));
  if (!match) { go('/'); return; }
  const params = path.match(match[0]).slice(1);
  markNav(path);
  renderChrome();
  try {
    const mod = await match[1]();
    const ctx = { store, go, requireAuth, query, params, user: await store.getUser(), rerender: render };
    const result = await mod.default(view, ctx);
    if (typeof result === 'function') cleanup = result;
    currentLive = mod.live ? mod : null;
  } catch (e) {
    console.error(e);
    view.innerHTML = `<section class="page narrow"><div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><a class="btn btn-primary" href="#/">Back home</a></div></section>`;
  }
}

let lastHash = null;
window.addEventListener('hashchange', () => {
  const h = location.hash;
  const pathOnly = (x) => (x || '').split('?')[0];
  const samePage = pathOnly(h) === pathOnly(lastHash);
  lastHash = h;
  render().then(() => { if (!samePage) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); } });
});

(async () => {
  document.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  store = await loadStore();
  lastHash = location.hash;
  // Pages that show live state re-render when the data changes (new message, payment confirmed).
  let pending = false;
  store.onChange(() => {
    renderChrome();
    if (currentLive && !pending) { pending = true; setTimeout(() => { pending = false; if (currentLive) render(); }, 50); }
  });
  render();
})();
