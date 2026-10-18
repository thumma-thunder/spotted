import { esc, icon, initials, timeAgo, clockTime, toast } from '../ui.js';

export default async function messages(view, { store, params, requireAuth, rerender, go }) {
  const u = await store.getUser();
  if (!u) {
    view.innerHTML = `<section class="page narrow"><div class="page-head"><h1>Messages</h1></div>
      <div class="card empty">${icon('chat')}<h3>Sign in to chat with hosts</h3><p>Ask about the spot, where to pull in, or anything that comes up.</p><button class="btn btn-primary" id="si">Sign in</button></div></section>`;
    view.querySelector('#si').onclick = async () => { if (await requireAuth('Sign in to see your messages.')) rerender(); };
    return;
  }
  const activeId = params[0] || null;

  view.innerHTML = `
  <div class="chat-layout ${activeId ? 'has-thread' : ''}">
    <aside class="conv-list"><h1>Messages</h1><div id="convs"></div></aside>
    <section class="thread" id="thread">
      ${activeId ? `
        <header class="thread-head">
          <a class="icon-btn back-btn" href="#/messages" aria-label="Back to messages">${icon('back')}</a>
          <span class="avatar" id="t-avatar"></span>
          <div class="spacer"><strong id="t-name"></strong><small id="t-sub"></small></div>
          <a class="btn btn-ghost btn-xs" id="t-spot" href="#/find">View spot</a>
        </header>
        <div class="thread-body" id="t-body" aria-live="polite"></div>
        <form class="composer" id="composer"><input name="body" placeholder="Type a message…" autocomplete="off" maxlength="2000" aria-label="Message" /><button class="send" aria-label="Send">${icon('send')}</button></form>`
    : `<div class="chat-empty"><div>${icon('chat')}<p>Pick a conversation to read it.</p></div></div>`}
    </section>
  </div>`;

  const convsEl = view.querySelector('#convs');
  let lastCount = -1;

  async function refresh() {
    const convs = await store.myConversations();
    convsEl.innerHTML = convs.length ? convs.map((c) => `
      <a class="conv ${c.id === activeId ? 'active' : ''}" href="#/messages/${c.id}">
        <span class="avatar">${esc(initials(c.other?.full_name))}</span>
        <div style="min-width:0"><strong>${esc(c.other?.full_name || 'Spotted member')} <span class="muted" style="font-weight:500;font-size:.78rem">· ${c.role === 'host' ? 'Renter' : 'Spot owner'}</span></strong>
          <div class="sub">${esc(c.spot?.title || '')}${c.last ? ` · ${esc(c.last.body)}` : ''}</div></div>
        <time>${c.last ? timeAgo(c.last.created_at) : ''}</time>
      </a>`).join('')
      : `<div class="empty" style="padding:30px 16px">${icon('chat')}<p>No conversations yet. Message a host from any spot page.</p><a class="btn btn-primary btn-sm" href="#/find">Find a spot</a></div>`;

    if (!activeId) return;
    const c = convs.find((x) => x.id === activeId);
    if (!c) { view.querySelector('#thread').innerHTML = '<div class="chat-empty"><p>Conversation not found.</p></div>'; return; }
    view.querySelector('#t-avatar').textContent = initials(c.other?.full_name);
    view.querySelector('#t-name').textContent = `${c.other?.full_name || 'Spotted member'} (${c.role === 'host' ? 'Renter' : 'Spot Owner'})`;
    view.querySelector('#t-sub').textContent = c.spot?.title || '';
    view.querySelector('#t-spot').href = `#/spot/${c.spot_id}`;
    const msgs = await store.getMessages(activeId);
    if (msgs.length === lastCount) return;
    lastCount = msgs.length;
    const body = view.querySelector('#t-body');
    body.innerHTML = msgs.length ? msgs.map((m, i) => {
      const mine = m.sender_id === u.id;
      const next = msgs[i + 1];
      const showTime = !next || next.sender_id !== m.sender_id || new Date(next.created_at) - new Date(m.created_at) > 5 * 60 * 1000;
      return `<div class="bubble ${mine ? 'me' : 'them'}">${esc(m.body)}</div>${showTime ? `<div class="bubble-time ${mine ? 'me' : ''}">${clockTime(m.created_at)}</div>` : ''}`;
    }).join('') : `<div class="chat-empty"><p>Say hi to ${esc(c.other?.full_name?.split(' ')[0] || 'them')}. Ask about the spot, timing or where to park.</p></div>`;
    body.scrollTop = body.scrollHeight;
  }

  await refresh();

  const form = view.querySelector('#composer');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = form.body.value.trim();
    if (!text) return;
    const btn = form.querySelector('.send');
    btn.disabled = true;
    try { await store.sendMessage(activeId, text); form.body.value = ''; await refresh(); } catch (ex) { toast(ex.message, 'err'); } finally { btn.disabled = false; form.body.focus(); }
  });
  if (activeId && matchMedia('(min-width: 860px)').matches) form?.body.focus();

  const off = store.onChange(() => refresh().catch(() => {}));
  const timer = store.mode === 'live' ? setInterval(() => refresh().catch(() => {}), 4000) : null;
  return () => { off(); if (timer) clearInterval(timer); };
}
