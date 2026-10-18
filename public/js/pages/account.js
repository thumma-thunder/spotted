import { esc, icon, initials, toast } from '../ui.js';
import { venmoDialog } from './host.js';

export default async function account(view, { store, requireAuth, rerender, go }) {
  const u = await store.getUser();
  const demoInfo = store.mode === 'demo' ? `
    <div class="card card-pad">
      <h3>Demo mode</h3>
      <p class="muted" style="font-size:.9rem">This copy of Spotted isn't connected to a database yet, so accounts, listings, bookings and messages are saved only in this browser. The sample host confirms payments and replies to messages on its own so you can try the whole flow. Venmo QR codes here don't send money anywhere.</p>
      <button class="btn btn-ghost btn-sm" id="reset">Reset demo data</button>
    </div>` : '';
  if (!u) {
    view.innerHTML = `<section class="page narrow"><div class="page-head"><h1>Account</h1></div><div class="account-grid">
      <div class="card empty">${icon('user')}<h3>You're not signed in</h3><p>Sign in to book parking, list your spot and chat.</p><button class="btn btn-primary" id="si">Sign in</button></div>${demoInfo}</div></section>`;
    view.querySelector('#si').onclick = async () => { if (await requireAuth('Welcome to Spotted.')) rerender(); };
  } else {
    view.innerHTML = `<section class="page narrow">
      <div class="hello"><span class="avatar">${esc(initials(u.full_name))}</span><div><h1>${esc(u.full_name)}</h1><p>${esc(u.email)}</p></div></div>
      <div class="account-grid">
        <div class="card card-pad">
          <form class="form" id="pf">
            <label class="field"><span>Name</span><input name="full_name" value="${esc(u.full_name)}" maxlength="80" autocomplete="name" /></label>
            <div class="field"><span>Venmo (for getting paid as a host)</span>
              <div class="row"><b style="color:var(--ink)">${u.venmo_username ? `@${esc(u.venmo_username)}` : '<span class="muted">Not added</span>'}</b><span class="spacer"></span><button type="button" class="btn btn-ghost btn-xs" id="venmo">${u.venmo_username ? 'Edit' : 'Add'}</button></div></div>
            <button class="btn btn-primary">Save</button>
          </form>
        </div>
        <div class="card card-pad row" style="flex-wrap:wrap">
          <a class="btn btn-ghost btn-sm" href="#/bookings">${icon('calendar')} My bookings</a>
          <a class="btn btn-ghost btn-sm" href="#/host">${icon('list')} Host dashboard</a>
          <span class="spacer"></span>
          <button class="btn btn-outline btn-sm" id="so">Sign out</button>
        </div>
        ${demoInfo}
      </div></section>`;
    view.querySelector('#pf').onsubmit = async (e) => {
      e.preventDefault();
      try { await store.updateProfile({ full_name: e.target.full_name.value }); toast('Saved'); rerender(); } catch (ex) { toast(ex.message, 'err'); }
    };
    view.querySelector('#venmo').onclick = () => venmoDialog(store, u, rerender);
    view.querySelector('#so').onclick = async () => { await store.signOut(); toast('Signed out'); go('/'); };
  }
  view.querySelector('#reset')?.addEventListener('click', async () => {
    if (!confirm('Erase all demo accounts, listings, bookings and messages in this browser?')) return;
    await store.resetDemo(); toast('Demo reset'); go('/');
  });
}
