// Type-ahead picker for CU buildings. Shows a short list that narrows as you type.
import { BUILDINGS } from './buildings.js';
import { esc, icon } from './ui.js';

const POPULAR = ['LIBR', 'UMC', 'EC', 'KOBL', 'REC', 'STAD'];
const byCode = new Map(BUILDINGS.filter((b) => b.code).map((b) => [b.code, b]));
export const buildingByCode = (code) => byCode.get(code) || BUILDINGS.find((b) => b.name === code) || null;
export const buildingKey = (b) => b.code || b.name;

// Straight-line distance in miles.
export function milesBetween(a, b) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const INDEX = BUILDINGS.map((b) => ({ b, name: norm(b.name), code: b.code.toLowerCase(), aka: (b.aka || []).map(norm) }));

export function searchBuildings(q, limit = 6) {
  const t = norm(q);
  if (!t) return [];
  const words = t.split(' ');
  const scored = [];
  for (const e of INDEX) {
    let s = Infinity;
    if (e.code && e.code === t) s = 0;
    else if (e.name.startsWith(t)) s = 1;
    else if (e.aka.some((a) => a.startsWith(t))) s = 1.5;
    else if (words.every((w) => e.name.split(' ').some((nw) => nw.startsWith(w)))) s = 2;
    else if (e.code && e.code.startsWith(t)) s = 2.5;
    else if (e.name.includes(t)) s = 3;
    else if (e.aka.some((a) => a.includes(t))) s = 3.5;
    if (s < Infinity) scored.push([s + e.name.length / 1000, e.b]);
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map((x) => x[1]);
}

function highlight(name, q) {
  const t = q.trim();
  if (!t) return esc(name);
  const i = name.toLowerCase().indexOf(t.toLowerCase());
  return i < 0 ? esc(name) : `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + t.length))}</mark>${esc(name.slice(i + t.length))}`;
}

/**
 * Turns a text input into a building combobox.
 * The chosen building's key goes into `hidden` (an <input type=hidden>).
 */
export function mountBuildingPicker(input, hidden, { onChange } = {}) {
  const wrap = input.closest('.picker');
  const list = document.createElement('ul');
  list.className = 'picker-list';
  list.id = `${input.id || 'bld'}-list`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  wrap.appendChild(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', list.id);
  input.autocomplete = 'off';
  const clearBtn = wrap.querySelector('.picker-clear');

  let items = [], active = -1;
  const current = buildingByCode(hidden.value);
  if (current) input.value = current.name;
  const syncClear = () => { if (clearBtn) clearBtn.hidden = !input.value; };
  syncClear();

  function render() {
    const q = input.value;
    const popular = !q.trim();
    items = popular ? POPULAR.map((c) => byCode.get(c)).filter(Boolean) : searchBuildings(q);
    if (!items.length) {
      list.innerHTML = `<li class="picker-empty">No CU building matches "${esc(q)}"</li>`;
    } else {
      list.innerHTML = (popular ? '<li class="picker-head" role="presentation">Popular buildings</li>' : '')
        + items.map((b, i) => `<li role="option" id="${list.id}-${i}" data-i="${i}" aria-selected="${i === active}">
          ${icon('pin')}<span class="picker-name">${highlight(b.name, q)}</span>${b.code ? `<span class="picker-code">${esc(b.code)}</span>` : ''}</li>`).join('');
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-activedescendant', active >= 0 ? `${list.id}-${active}` : '');
  }
  function close() { list.hidden = true; active = -1; input.setAttribute('aria-expanded', 'false'); }
  function choose(b) {
    input.value = b ? b.name : '';
    hidden.value = b ? buildingKey(b) : '';
    syncClear(); close();
    onChange?.(b);
  }

  input.addEventListener('focus', () => { active = -1; render(); });
  input.addEventListener('input', () => { active = input.value.trim() ? 0 : -1; hidden.value = ''; syncClear(); render(); });
  input.addEventListener('keydown', (e) => {
    if (list.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { render(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(items.length - 1, active + 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); }
    else if (e.key === 'Enter' && !list.hidden && items[active]) { e.preventDefault(); choose(items[active]); }
    else if (e.key === 'Escape') close();
  });
  // pointerdown fires before blur, so the pick lands before the list closes.
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) { e.preventDefault(); choose(items[+li.dataset.i]); }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      // Typed a name but didn't pick: take the best match, or clear.
      if (input.value.trim() && !hidden.value) {
        const best = searchBuildings(input.value, 1)[0];
        if (best) choose(best); else { input.value = ''; syncClear(); }
      }
      close();
    }, 120);
  });
  clearBtn?.addEventListener('click', () => { choose(null); input.focus(); });

  return {
    commit() { if (input.value.trim() && !hidden.value) { const best = searchBuildings(input.value, 1)[0]; if (best) choose(best); } },
  };
}
