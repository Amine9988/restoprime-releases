'use strict';

/* =========================================================
   RestoPrime — نظام تسيير المطاعم (بدون تسجيل دخول)
   كل البيانات محفوظة محلياً في المتصفح (localStorage)
   ========================================================= */

/* ---------- أدوات عامة ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
const round2 = n => Math.round(n * 100) / 100;
const round3 = n => Math.round(n * 1000) / 1000;
const sum = (arr, f) => arr.reduce((s, x) => s + (+f(x) || 0), 0);
const fmtNum = (n, d = 2) => (+n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money = n => `${fmtNum(n)} ${esc(S.settings.currency)}`;
const qtyFmt = n => (+n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
const pad = n => String(n).padStart(2, '0');
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const todayKey = () => dayKey(Date.now());
const parseDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtTime = t => new Date(t).toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });
const fmtDate = t => new Date(t).toLocaleDateString('ar-DZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtDateTime = t => `${fmtDate(t)} ${fmtTime(t)}`;

const TYPE_LABELS = { dine: 'داخل المطعم', takeaway: 'سفري', delivery: 'توصيل' };
const TYPE_ICONS = { dine: '🪑', takeaway: '🥡', delivery: '🛵' };
const STATUS_LABELS = { open: 'مفتوح', paid: 'مدفوع', cancelled: 'ملغى' };
const KITCHEN_LABELS = { pending: 'جديد', preparing: 'قيد التحضير', ready: 'جاهز', served: 'تم التسليم' };
const PAY_LABELS = { cash: 'نقداً', card: 'بطاقة' };
const EXPENSE_CATS = ['مشتريات', 'رواتب', 'إيجار', 'كهرباء وماء وغاز', 'صيانة', 'نقل', 'تسويق', 'أخرى'];

/* ---------- الحالة والتخزين ---------- */
const STORE_KEY = 'restoprime.data.v1';

function blankState() {
  return {
    version: 1,
    settings: {
      name: 'RestoPrime', phone: '', address: '', currency: 'د.ج',
      taxRate: 0, deliveryFee: 200, footer: 'شكراً لزيارتكم! بالهناء والشفاء',
    },
    categories: [], items: [], tables: [], ingredients: [],
    orders: [], expenses: [], stockMoves: [],
    counters: { order: 0 },
  };
}

function seedState() {
  const s = blankState();
  const cat = (name, icon) => ({ id: uid(), name, icon });
  s.categories = [cat('المقبلات', '🥗'), cat('الأطباق الرئيسية', '🍽️'), cat('البيتزا', '🍕'), cat('المشروبات', '🥤'), cat('الحلويات', '🍰')];
  const ing = (name, unit, qty, min, cost) => ({ id: uid(), name, unit, qty, min, cost });
  s.ingredients = [
    ing('دقيق', 'كغ', 25, 5, 90), ing('جبن موزاريلا', 'كغ', 8, 2, 1200), ing('صلصة طماطم', 'لتر', 10, 2, 250),
    ing('دجاج', 'كغ', 12, 3, 650), ing('لحم مفروم', 'كغ', 6, 2, 1800), ing('بطاطا', 'كغ', 30, 5, 80),
    ing('خبز', 'قطعة', 60, 20, 15), ing('مشروبات غازية', 'علبة', 48, 12, 60), ing('قهوة', 'كغ', 3, 1, 2400),
    ing('حليب', 'لتر', 12, 4, 110),
  ];
  const I = n => s.ingredients.find(x => x.name === n).id;
  const r = (n, q) => ({ ingredientId: I(n), qty: q });
  const item = (name, ci, price, cost, emoji, recipe = []) =>
    ({ id: uid(), name, categoryId: s.categories[ci].id, price, cost, emoji, available: true, recipe });
  s.items = [
    item('شوربة فريك', 0, 250, 90, '🍲'),
    item('سلطة مشكلة', 0, 300, 110, '🥗'),
    item('بوراك', 0, 200, 70, '🥟'),
    item('طاجين زيتون', 1, 900, 380, '🍛'),
    item('كسكس باللحم', 1, 1200, 520, '🍲'),
    item('دجاج مشوي مع بطاطا', 1, 1000, 420, '🍗', [r('دجاج', 0.35), r('بطاطا', 0.25)]),
    item('شاورما دجاج', 1, 450, 190, '🌯', [r('دجاج', 0.15), r('خبز', 1)]),
    item('برغر لحم', 1, 600, 260, '🍔', [r('لحم مفروم', 0.15), r('خبز', 1), r('بطاطا', 0.15)]),
    item('بيتزا مارغريتا', 2, 700, 260, '🍕', [r('دقيق', 0.25), r('جبن موزاريلا', 0.15), r('صلصة طماطم', 0.1)]),
    item('بيتزا بالدجاج', 2, 900, 360, '🍕', [r('دقيق', 0.25), r('جبن موزاريلا', 0.15), r('صلصة طماطم', 0.1), r('دجاج', 0.1)]),
    item('مشروب غازي', 3, 120, 60, '🥤', [r('مشروبات غازية', 1)]),
    item('عصير برتقال', 3, 250, 90, '🍊'),
    item('قهوة إسبريسو', 3, 150, 40, '☕', [r('قهوة', 0.01)]),
    item('كابتشينو', 3, 250, 70, '☕', [r('قهوة', 0.01), r('حليب', 0.15)]),
    item('ماء معدني', 3, 60, 25, '💧'),
    item('تيراميسو', 4, 450, 170, '🍰'),
    item('بقلاوة', 4, 300, 110, '🍯'),
  ];
  const seats = [2, 2, 4, 4, 4, 4, 6, 6, 8, 4];
  s.tables = seats.map((n, i) => ({ id: uid(), name: String(i + 1), seats: n }));
  return s;
}

function normalize(d) {
  const b = blankState();
  const out = { ...b, ...d, settings: { ...b.settings, ...(d.settings || {}) }, counters: { ...b.counters, ...(d.counters || {}) } };
  for (const k of ['categories', 'items', 'tables', 'ingredients', 'orders', 'expenses', 'stockMoves']) {
    if (!Array.isArray(out[k])) out[k] = [];
  }
  return out;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { console.error(e); }
  const s = seedState();
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  return s;
}

function save() {
  if (S.stockMoves.length > 3000) S.stockMoves = S.stockMoves.slice(-3000);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { toast('تعذّر حفظ البيانات: ' + e.message, 'err'); }
  updateBadges();
}

let S = loadState();

const itemById = id => S.items.find(x => x.id === id);
const catById = id => S.categories.find(x => x.id === id);
const tableById = id => S.tables.find(x => x.id === id);
const ingById = id => S.ingredients.find(x => x.id === id);
const orderById = id => S.orders.find(x => x.id === id);
const openOrders = () => S.orders.filter(o => o.status === 'open');
const lowStock = () => S.ingredients.filter(g => g.qty <= g.min);
const tableOrder = tid => S.orders.find(o => o.status === 'open' && o.type === 'dine' && o.tableId === tid);

function orderTotals(o) {
  const sub = sum(o.lines, l => l.price * l.qty);
  let disc = o.discountType === '%' ? sub * num(o.discount) / 100 : num(o.discount);
  disc = Math.min(Math.max(disc, 0), sub);
  const fee = o.type === 'delivery' ? num(o.deliveryFee ?? S.settings.deliveryFee) : 0;
  const tax = (sub - disc) * num(o.taxRate ?? S.settings.taxRate) / 100;
  return {
    sub: round2(sub), disc: round2(disc), fee: round2(fee), tax: round2(tax),
    total: round2(sub - disc + tax + fee), count: sum(o.lines, l => l.qty),
  };
}
const orderCost = o => sum(o.lines, l => (l.cost || 0) * l.qty);

function orderLabel(o) {
  if (o.type === 'dine') { const t = tableById(o.tableId); return `طاولة ${t ? esc(t.name) : '—'}`; }
  return `${TYPE_LABELS[o.type]}${o.customer ? ' — ' + esc(o.customer) : ''}`;
}

function aggregateItems(orders) {
  const map = new Map();
  orders.forEach(o => o.lines.forEach(l => {
    const k = l.itemId || l.name;
    const e = map.get(k) || { name: l.name, itemId: l.itemId, qty: 0, revenue: 0, cost: 0 };
    e.qty += l.qty; e.revenue += l.price * l.qty; e.cost += (l.cost || 0) * l.qty;
    map.set(k, e);
  }));
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}

/* ---------- واجهة: نوافذ وتنبيهات ---------- */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast' + (type === 'err' ? ' err' : '');
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function openModal(title, body, footer = '', cls = '') {
  $('#modal-root').innerHTML = `
    <div class="modal-backdrop" onmousedown="if(event.target===this)closeModal()">
      <div class="modal ${cls}">
        <div class="modal-head"><h3>${title}</h3><button class="icon-btn" onclick="closeModal()">✕</button></div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
      </div>
    </div>`;
  const f = $('#modal-root .modal-body input:not([type=checkbox]), #modal-root .modal-body select, #modal-root .modal-body textarea');
  if (f) { f.focus(); if (f.select) f.select(); }
}
function closeModal() { $('#modal-root').innerHTML = ''; }

let _confirmCb = null;
function confirmBox(msg, onYes, label = 'تأكيد', danger = true) {
  _confirmCb = onYes;
  openModal('تأكيد', `<p style="margin:0">${msg}</p>`,
    `<button class="btn ${danger ? 'danger' : 'primary'}" onclick="const cb=_confirmCb;closeModal();cb&&cb()">${label}</button>
     <button class="btn" onclick="closeModal()">رجوع</button>`);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('#modal-root').innerHTML) closeModal();
  if (e.key === 'Enter' && e.target.matches('.modal input:not([type=checkbox])')) {
    const btn = $('#modal-root .modal-foot .btn');
    if (btn) { e.preventDefault(); btn.click(); }
  }
});

function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function barChart(data, fmt = v => fmtNum(v, 0)) {
  const max = Math.max(1, ...data.map(d => d.value));
  return `<div class="bars">${data.map(d => `
    <div class="bar-col" title="${esc(d.label)}: ${fmt(d.value)}">
      <div class="bar-val">${d.value ? fmt(d.value) : ''}</div>
      <div class="bar-track"><div class="bar" style="height:${(d.value / max) * 100}%"></div></div>
      <div class="bar-label">${esc(d.label)}</div>
    </div>`).join('')}</div>`;
}

function hbars(rows) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return '<div class="empty small">لا توجد بيانات</div>';
  return rows.map(r => `
    <div class="hbar"><div class="name" title="${esc(r.label)}">${esc(r.label)}</div>
      <div class="track"><div class="fill" style="width:${(r.value / max) * 100}%"></div></div>
      <div class="v num">${r.text ?? fmtNum(r.value)}</div></div>`).join('');
}

const emptyHTML = (icon, text) => `<div class="empty"><div class="big">${icon}</div>${text}</div>`;

/* ---------- التنقل ---------- */
const VIEWS = {
  dashboard: { title: 'لوحة التحكم', icon: '📊', render: renderDashboard },
  pos: { title: 'نقطة البيع', icon: '🧾', render: renderPOS, fill: true },
  tables: { title: 'الطاولات', icon: '🪑', render: renderTables },
  kitchen: { title: 'شاشة المطبخ', icon: '👨‍🍳', render: renderKitchen },
  orders: { title: 'الطلبات', icon: '📋', render: renderOrders },
  menu: { title: 'قائمة الطعام', icon: '📖', render: renderMenu },
  inventory: { title: 'المخزون', icon: '📦', render: renderInventory },
  cashbox: { title: 'الصندوق', icon: '🏦', render: renderCashbox },
  reports: { title: 'التقارير', icon: '📈', render: renderReports },
  settings: { title: 'الإعدادات', icon: '⚙️', render: renderSettings },
};
let current = 'dashboard';

function buildNav() {
  $('#nav').innerHTML = Object.entries(VIEWS).map(([k, v]) =>
    `<a href="#${k}" data-view="${k}"><span class="ic">${v.icon}</span><span>${v.title}</span><span class="badge" id="badge-${k}"></span></a>`).join('');
}
function go(v) { if (current === v && location.hash === '#' + v) render(); else location.hash = v; }
function route() {
  const v = location.hash.slice(1);
  current = VIEWS[v] ? v : 'dashboard';
  $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.view === current));
  render();
}
function render() {
  const v = VIEWS[current];
  $('#page-title').textContent = v.title;
  document.title = `${v.title} — ${S.settings.name}`;
  const view = $('#view');
  view.classList.toggle('fill', !!v.fill);
  view.innerHTML = v.render();
  $('#brand-name').textContent = S.settings.name;
  updateBadges();
}
function updateBadges() {
  const set = (k, n) => { const el = $('#badge-' + k); if (el) el.textContent = n > 0 ? n : ''; };
  set('pos', openOrders().length);
  set('kitchen', S.orders.filter(o => o.status !== 'cancelled' && (o.kitchen === 'pending' || o.kitchen === 'preparing')).length);
  set('inventory', lowStock().length);
}

/* =========================================================
   لوحة التحكم
   ========================================================= */
function renderDashboard() {
  const today = todayKey();
  const paidToday = S.orders.filter(o => o.status === 'paid' && dayKey(o.paidAt) === today);
  const sales = sum(paidToday, o => orderTotals(o).total);
  const open = openOrders();
  const busyTables = new Set(open.filter(o => o.type === 'dine').map(o => o.tableId)).size;
  const low = lowStock();
  const expToday = sum(S.expenses.filter(e => e.date === today), e => e.amount);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const k = dayKey(d);
    days.push({
      label: i === 0 ? 'اليوم' : d.toLocaleDateString('ar-DZ', { weekday: 'short' }),
      value: sum(S.orders.filter(o => o.status === 'paid' && dayKey(o.paidAt) === k), o => orderTotals(o).total),
    });
  }
  const top = aggregateItems(paidToday).slice(0, 6);
  const recent = [...S.orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);

  return `
  <div class="grid stats mb">
    ${statCard('💰', 'g', 'مبيعات اليوم', money(sales))}
    ${statCard('🧾', '', 'طلبات مدفوعة اليوم', paidToday.length)}
    ${statCard('📐', 'b', 'متوسط قيمة الطلب', money(paidToday.length ? sales / paidToday.length : 0))}
    ${statCard('⏳', 'y', 'طلبات مفتوحة', open.length)}
    ${statCard('🪑', 'b', 'طاولات مشغولة', `${busyTables} / ${S.tables.length}`)}
    ${statCard('🏦', 'y', 'صافي الصندوق اليوم', money(sales - expToday))}
    ${statCard('💸', 'r', 'مصاريف اليوم', money(expToday))}
  </div>
  <div class="grid cols-2 mb">
    <div class="card">
      <div class="card-head"><h2>المبيعات — آخر 7 أيام</h2></div>
      ${barChart(days)}
    </div>
    <div class="card">
      <div class="card-head"><h2>الأكثر مبيعاً اليوم</h2></div>
      ${top.length ? hbars(top.map(t => ({ label: t.name, value: t.qty, text: `${qtyFmt(t.qty)} × — ${money(t.revenue)}` }))) : emptyHTML('🍽️', 'لم تُسجَّل مبيعات اليوم بعد')}
    </div>
  </div>
  <div class="grid cols-2">
    <div class="card">
      <div class="card-head"><h2>آخر الطلبات</h2><a class="btn sm" href="#orders">عرض الكل</a></div>
      ${recent.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>#</th><th>الطلب</th><th>الوقت</th><th>المبلغ</th><th>الحالة</th></tr></thead>
        <tbody>${recent.map(o => `<tr style="cursor:pointer" onclick="showOrder('${o.id}')">
          <td><b>${o.number}</b></td><td>${TYPE_ICONS[o.type]} ${orderLabel(o)}</td>
          <td class="muted small">${fmtTime(o.createdAt)}</td><td class="num">${money(orderTotals(o).total)}</td>
          <td><span class="pill ${o.status}">${STATUS_LABELS[o.status]}</span></td></tr>`).join('')}</tbody>
      </table></div>` : emptyHTML('🧾', 'لا توجد طلبات بعد — ابدأ من نقطة البيع')}
    </div>
    <div class="card">
      <div class="card-head"><h2>تنبيهات المخزون</h2><a class="btn sm" href="#inventory">المخزون</a></div>
      ${low.length ? `<table class="tbl"><thead><tr><th>المادة</th><th>المتوفر</th><th>الحد الأدنى</th></tr></thead><tbody>
        ${low.map(g => `<tr><td>${esc(g.name)}</td><td class="text-danger num"><b>${qtyFmt(g.qty)} ${esc(g.unit)}</b></td><td class="num">${qtyFmt(g.min)} ${esc(g.unit)}</td></tr>`).join('')}
      </tbody></table>` : emptyHTML('✅', 'كل المواد متوفرة بكميات كافية')}
    </div>
  </div>`;
}
function statCard(icon, cls, label, value) {
  return `<div class="card stat"><div class="ico ${cls}">${icon}</div><div><div class="label">${label}</div><div class="value num">${value}</div></div></div>`;
}

/* =========================================================
   نقطة البيع
   ========================================================= */
const newDraft = (type = 'dine', tableId = null) =>
  ({ id: null, type, tableId, lines: [], discount: 0, discountType: 'amount', customer: '', phone: '', address: '', note: '' });
let pos = newDraft();
let posCat = 'all';
let posSearch = '';

function isPosDirty() {
  if (!pos.id) return pos.lines.length > 0;
  const saved = orderById(pos.id);
  return saved && saved.status === 'open' && JSON.stringify(pos) !== JSON.stringify(saved);
}
function posGuard(fn) {
  if (isPosDirty()) confirmBox('لديك تغييرات غير محفوظة على الطلب الحالي. هل تريد تجاهلها؟', fn, 'تجاهل التغييرات');
  else fn();
}
function quickNewOrder() { posGuard(() => { pos = newDraft(pos.type === 'dine' ? 'dine' : pos.type); go('pos'); }); }
function posNew() { posGuard(() => { pos = newDraft(); render(); }); }
function posLoad(id) {
  const o = orderById(id);
  if (!o) return;
  posGuard(() => { pos = clone(o); go('pos'); });
}
function openTable(tid) {
  posGuard(() => {
    const o = tableOrder(tid);
    pos = o ? clone(o) : newDraft('dine', tid);
    go('pos');
  });
}

function renderPOS() {
  if (pos.id) {
    const saved = orderById(pos.id);
    if (!saved || saved.status !== 'open') pos = newDraft();
  }
  const open = openOrders().sort((a, b) => a.createdAt - b.createdAt);
  return `
  <div class="pos">
    <div class="pos-menu">
      <div class="open-orders">
        <button class="chip new ${!pos.id ? 'active' : ''}" onclick="posNew()">＋ طلب جديد</button>
        ${open.map(o => `<button class="chip ${pos.id === o.id ? 'active' : ''}" onclick="posLoad('${o.id}')">
          <b>#${o.number} ${TYPE_ICONS[o.type]} ${orderLabel(o)}</b><span class="muted num">${money(orderTotals(o).total)}</span></button>`).join('')}
      </div>
      <div class="row">
        <input type="search" placeholder="🔍 ابحث عن صنف..." value="${esc(posSearch)}" oninput="posSearch=this.value;refreshPosItems()">
      </div>
      <div class="cat-tabs">
        <button class="cat-tab ${posCat === 'all' ? 'active' : ''}" onclick="setPosCat('all')">الكل</button>
        ${S.categories.map(c => `<button class="cat-tab ${posCat === c.id ? 'active' : ''}" onclick="setPosCat('${c.id}')">${esc(c.icon || '')} ${esc(c.name)}</button>`).join('')}
      </div>
      <div class="items-grid" id="pos-items">${posItemsHTML()}</div>
    </div>
    <div class="pos-cart" id="pos-cart">${posCartHTML()}</div>
  </div>`;
}

function posItemsHTML() {
  const q = posSearch.trim().toLowerCase();
  const list = S.items.filter(i => (posCat === 'all' || i.categoryId === posCat) && (!q || i.name.toLowerCase().includes(q)));
  if (!list.length) return `<div style="grid-column:1/-1">${emptyHTML('🔎', S.items.length ? 'لا توجد أصناف مطابقة' : 'أضف أصنافاً من صفحة قائمة الطعام')}</div>`;
  return list.map(i => `
    <button class="item-btn ${i.available ? '' : 'off'}" onclick="posAdd('${i.id}')" ${i.available ? '' : 'title="غير متوفر"'}>
      <span class="emoji">${esc(i.emoji || '🍽️')}</span>
      <span class="name">${esc(i.name)}</span>
      <span class="price num">${money(i.price)}</span>
      ${i.available ? '' : '<span class="pill cancelled">غير متوفر</span>'}
    </button>`).join('');
}
function refreshPosItems() { const el = $('#pos-items'); if (el) el.innerHTML = posItemsHTML(); }
function refreshCart() { const el = $('#pos-cart'); if (el) el.innerHTML = posCartHTML(); }
function setPosCat(c) { posCat = c; $$('.cat-tab').forEach((b, i) => b.classList.toggle('active', (i === 0 && c === 'all') || b.getAttribute('onclick').includes(`'${c}'`))); refreshPosItems(); }

function posCartHTML() {
  const t = orderTotals(pos);
  const busy = new Set(openOrders().filter(o => o.type === 'dine' && o.id !== pos.id).map(o => o.tableId));
  const typeBtn = k => `<button class="${pos.type === k ? 'active' : ''}" onclick="posSetType('${k}')">${TYPE_ICONS[k]} ${TYPE_LABELS[k]}</button>`;
  let details = '';
  if (pos.type === 'dine') {
    details = `<select onchange="pos.tableId=this.value||null;refreshCart()">
      <option value="">— اختر الطاولة —</option>
      ${S.tables.map(tb => `<option value="${tb.id}" ${pos.tableId === tb.id ? 'selected' : ''} ${busy.has(tb.id) ? 'disabled' : ''}>
        طاولة ${esc(tb.name)} (${tb.seats} مقاعد)${busy.has(tb.id) ? ' — مشغولة' : ''}</option>`).join('')}
    </select>`;
  } else {
    details = `<input placeholder="اسم الزبون (اختياري)" value="${esc(pos.customer)}" oninput="pos.customer=this.value">`;
    if (pos.type === 'delivery') {
      details += `<div class="row"><input placeholder="رقم الهاتف" value="${esc(pos.phone)}" oninput="pos.phone=this.value">
        </div><input placeholder="العنوان" value="${esc(pos.address)}" oninput="pos.address=this.value">`;
    }
  }
  const lines = pos.lines.length ? pos.lines.map((l, i) => `
    <div class="line">
      <div class="info">
        <div class="lname">${esc(l.name)}</div>
        <div class="lsub num">${money(l.price)} ${l.sent ? '<span class="sent">· ✓ أُرسل للمطبخ</span>' : ''}</div>
        ${l.note ? `<div class="lnote">📝 ${esc(l.note)}</div>` : ''}
      </div>
      <div class="qty">
        <button onclick="posQty(${i},1)">+</button><span>${l.qty}</span><button onclick="posQty(${i},-1)">−</button>
      </div>
      <div class="ltotal num">${money(l.price * l.qty)}</div>
      <button class="icon-btn" title="ملاحظة" onclick="posLineNote(${i})">📝</button>
    </div>`).join('') : emptyHTML('🛒', 'اضغط على الأصناف لإضافتها للطلب');

  return `
    <div class="cart-head">
      <div class="cart-title"><h2>${pos.id ? `طلب #${pos.number}` : 'طلب جديد'}</h2>
        ${pos.id ? `<span class="pill ${pos.kitchen || 'open'}">${pos.kitchen ? KITCHEN_LABELS[pos.kitchen] : 'لم يُرسل للمطبخ'}</span>` : ''}</div>
      <div class="seg full">${typeBtn('dine')}${typeBtn('takeaway')}${typeBtn('delivery')}</div>
      ${details}
    </div>
    <div class="cart-lines">${lines}</div>
    <div class="cart-foot">
      <div class="row">
        <label style="flex:1">تخفيض<input type="number" min="0" step="any" value="${pos.discount || ''}" placeholder="0" onchange="pos.discount=num(this.value);refreshCart()"></label>
        <label style="width:110px">النوع<select onchange="pos.discountType=this.value;refreshCart()">
          <option value="amount" ${pos.discountType !== '%' ? 'selected' : ''}>مبلغ</option>
          <option value="%" ${pos.discountType === '%' ? 'selected' : ''}>نسبة %</option></select></label>
      </div>
      <input placeholder="ملاحظة على الطلب (اختياري)" value="${esc(pos.note)}" oninput="pos.note=this.value">
      <div class="totals num">
        <div><span>المجموع الفرعي (${qtyFmt(t.count)} صنف)</span><span>${money(t.sub)}</span></div>
        ${t.disc ? `<div class="text-danger"><span>التخفيض</span><span>− ${money(t.disc)}</span></div>` : ''}
        ${t.tax ? `<div><span>الضريبة (${num(S.settings.taxRate)}%)</span><span>${money(t.tax)}</span></div>` : ''}
        ${t.fee ? `<div><span>رسوم التوصيل</span><span>${money(t.fee)}</span></div>` : ''}
        <div class="grand"><span>الإجمالي</span><span>${money(t.total)}</span></div>
      </div>
      <div class="cart-actions">
        <button class="btn outline-primary" onclick="posSave(true)" ${pos.lines.length ? '' : 'disabled'}>👨‍🍳 إرسال للمطبخ</button>
        <button class="btn" onclick="posSave(false)" ${pos.lines.length ? '' : 'disabled'}>💾 حفظ</button>
        <button class="btn" onclick="printPosBill()" ${pos.lines.length ? '' : 'disabled'}>🖨️ طباعة الحساب</button>
        <button class="btn outline-danger" onclick="posCancel()" ${pos.lines.length || pos.id ? '' : 'disabled'}>${pos.id ? '✕ إلغاء الطلب' : '🗑️ مسح'}</button>
        <button class="btn success lg pay" onclick="posPay()" ${pos.lines.length ? '' : 'disabled'}>💵 دفع ${money(t.total)}</button>
      </div>
    </div>`;
}

function posSetType(t) { pos.type = t; if (t !== 'dine') pos.tableId = null; refreshCart(); }
function posAdd(id) {
  const it = itemById(id);
  if (!it || !it.available) return;
  const ex = pos.lines.find(l => l.itemId === id && !l.sent && !l.note);
  if (ex) ex.qty++;
  else pos.lines.push({ id: uid(), itemId: id, name: it.name, price: it.price, cost: it.cost || 0, qty: 1, note: '', sent: false });
  refreshCart();
  const box = $('.cart-lines'); if (box) box.scrollTop = box.scrollHeight;
}
function posQty(i, d) {
  const l = pos.lines[i];
  if (!l) return;
  l.qty += d;
  if (l.qty <= 0) pos.lines.splice(i, 1);
  refreshCart();
}
function posLineNote(i) {
  const l = pos.lines[i];
  openModal(`ملاحظة — ${esc(l.name)}`,
    `<label>الملاحظة (مثال: بدون بصل، حار...)<input id="f-note" value="${esc(l.note)}"></label>`,
    `<button class="btn primary" onclick="saveLineNote(${i})">حفظ</button>
     <button class="btn outline-danger" onclick="pos.lines.splice(${i},1);closeModal();refreshCart()">🗑️ حذف الصنف</button>
     <button class="btn" onclick="closeModal()">إلغاء</button>`);
}
function saveLineNote(i) { pos.lines[i].note = $('#f-note').value.trim(); closeModal(); refreshCart(); }

function validatePos() {
  if (!pos.lines.length) { toast('الطلب فارغ', 'err'); return false; }
  if (pos.type === 'dine' && !pos.tableId) { toast('اختر الطاولة أولاً', 'err'); return false; }
  if (pos.type === 'dine') {
    const other = tableOrder(pos.tableId);
    if (other && other.id !== pos.id) { toast('هذه الطاولة مشغولة بطلب آخر', 'err'); return false; }
  }
  return true;
}

function commitPos(send) {
  const now = Date.now();
  const idx = pos.id ? S.orders.findIndex(o => o.id === pos.id) : -1;
  if (pos.id && (idx < 0 || S.orders[idx].status !== 'open')) throw new Error('هذا الطلب لم يعد مفتوحاً');
  if (!pos.id) {
    pos.id = uid(); pos.number = ++S.counters.order; pos.createdAt = now; pos.status = 'open'; pos.kitchen = null;
  } else {
    // المطبخ قد يكون غيّر الحالة من شاشة أخرى
    pos.kitchen = S.orders[idx].kitchen; pos.kitchenAt = S.orders[idx].kitchenAt;
  }
  if (send) {
    const unsent = pos.lines.filter(l => !l.sent);
    if (unsent.length) {
      unsent.forEach(l => { l.sent = true; l.sentAt = now; });
      pos.kitchen = 'pending'; pos.kitchenAt = now;
    }
  }
  pos.updatedAt = now;
  const copy = clone(pos);
  if (idx >= 0) S.orders[idx] = copy; else S.orders.push(copy);
  save();
  return copy;
}

function posSave(send) {
  if (!validatePos()) return;
  const hadUnsent = pos.lines.some(l => !l.sent);
  try { commitPos(send); } catch (e) { toast(e.message, 'err'); pos = newDraft(); render(); return; }
  toast(send ? (hadUnsent ? `تم إرسال الطلب #${pos.number} للمطبخ` : 'لا توجد أصناف جديدة لإرسالها') : `تم حفظ الطلب #${pos.number}`);
  render();
}

function posCancel() {
  if (!pos.id) { pos = newDraft(pos.type); refreshCart(); return; }
  confirmBox(`هل تريد إلغاء الطلب #${pos.number}؟`, () => {
    const o = orderById(pos.id);
    if (o && o.status === 'open') { o.status = 'cancelled'; o.cancelledAt = Date.now(); o.kitchen = null; save(); }
    toast('تم إلغاء الطلب');
    pos = newDraft(); render();
  }, 'إلغاء الطلب');
}

function quickCash(total) {
  const vals = [total, Math.ceil(total / 100) * 100, Math.ceil(total / 500) * 500, Math.ceil(total / 1000) * 1000, Math.ceil(total / 2000) * 2000];
  return [...new Set(vals.map(round2))].filter(v => v >= total).slice(0, 5);
}

let _pay = { method: 'cash', total: 0 };
function posPay() {
  if (!validatePos()) return;
  const t = orderTotals(pos);
  _pay = { method: 'cash', total: t.total };
  const unsent = pos.lines.some(l => !l.sent);
  openModal(`دفع ${pos.id ? 'الطلب #' + pos.number : 'الطلب'}`, `
    <div class="pay-total num">${money(t.total)}</div>
    <div class="seg full mb" id="pay-method">
      <button class="active" data-m="cash" onclick="setPayMethod('cash')">💵 نقداً</button>
      <button data-m="card" onclick="setPayMethod('card')">💳 بطاقة</button>
    </div>
    <div id="cash-box">
      <label>المبلغ المستلم<input id="f-received" type="number" step="any" min="0" value="${t.total}" oninput="updChange()"></label>
      <div class="quick-cash">${quickCash(t.total).map(v => `<button class="btn sm" onclick="$('#f-received').value=${v};updChange()">${fmtNum(v, v % 1 ? 2 : 0)}</button>`).join('')}</div>
      <div class="change-row">الباقي للزبون: <b id="f-change" class="num">0.00</b></div>
    </div>
    <div class="mt" style="display:flex;flex-direction:column;gap:8px">
      ${unsent ? '<label class="check"><input type="checkbox" id="f-sendk" checked> إرسال الأصناف الجديدة للمطبخ</label>' : ''}
      <label class="check"><input type="checkbox" id="f-print" checked> طباعة الفاتورة</label>
    </div>`,
    `<button class="btn success lg" onclick="confirmPay()">✔ تأكيد الدفع</button><button class="btn" onclick="closeModal()">إلغاء</button>`);
  updChange();
}
function setPayMethod(m) {
  _pay.method = m;
  $$('#pay-method button').forEach(b => b.classList.toggle('active', b.dataset.m === m));
  $('#cash-box').style.display = m === 'cash' ? '' : 'none';
}
function updChange() {
  const ch = num($('#f-received').value) - _pay.total;
  const el = $('#f-change');
  el.textContent = ch >= 0 ? `${fmtNum(ch)} ${S.settings.currency}` : `ناقص ${fmtNum(-ch)}`;
  el.className = 'num ' + (ch >= 0 ? 'text-success' : 'text-danger');
}
function confirmPay() {
  const received = _pay.method === 'cash' ? num($('#f-received').value) : _pay.total;
  if (_pay.method === 'cash' && received + 0.001 < _pay.total) { toast('المبلغ المستلم أقل من الإجمالي', 'err'); return; }
  const send = $('#f-sendk') ? $('#f-sendk').checked : false;
  const doPrint = $('#f-print').checked;
  let saved;
  try { saved = commitPos(send); } catch (e) { closeModal(); toast(e.message, 'err'); pos = newDraft(); render(); return; }
  const o = orderById(saved.id);
  o.taxRate = num(S.settings.taxRate);
  o.deliveryFee = o.type === 'delivery' ? num(S.settings.deliveryFee) : 0;
  const total = orderTotals(o).total;
  o.status = 'paid';
  o.paidAt = Date.now();
  o.payment = { method: _pay.method, received: round2(received), change: round2(received - total) };
  deductStock(o);
  save();
  closeModal();
  toast(`تم دفع الطلب #${o.number}` + (o.payment.change > 0 ? ` — الباقي ${fmtNum(o.payment.change)}` : ''));
  pos = newDraft(o.type === 'dine' ? 'dine' : o.type);
  render();
  if (doPrint) printReceipt(o);
}

function deductStock(o) {
  const now = Date.now();
  const totals = new Map();
  o.lines.forEach(l => {
    const it = itemById(l.itemId);
    (it?.recipe || []).forEach(r => totals.set(r.ingredientId, (totals.get(r.ingredientId) || 0) + r.qty * l.qty));
  });
  totals.forEach((q, gid) => {
    const g = ingById(gid);
    if (!g || !q) return;
    g.qty = round3(g.qty - q);
    S.stockMoves.push({ id: uid(), ingredientId: gid, delta: -round3(q), reason: `بيع — طلب #${o.number}`, at: now });
  });
}

function printPosBill() {
  if (!pos.lines.length) return;
  printReceipt({ ...pos, number: pos.number || '—', createdAt: pos.createdAt || Date.now() }, true);
}

/* =========================================================
   الطاولات
   ========================================================= */
function renderTables() {
  const cards = S.tables.map(t => {
    const o = tableOrder(t.id);
    const tt = o ? orderTotals(o) : null;
    return `
      <div class="table-card ${o ? 'busy' : ''}" onclick="openTable('${t.id}')">
        <button class="icon-btn tedit" title="تعديل" onclick="event.stopPropagation();tableModal('${t.id}')">✎</button>
        <div class="muted small">طاولة</div>
        <div class="tname">${esc(t.name)}</div>
        <div class="muted small">👥 ${t.seats} مقاعد</div>
        ${o ? `<div class="spacer"></div><div class="num"><b>${money(tt.total)}</b></div>
          <div class="small muted">#${o.number} · منذ ${fmtTime(o.createdAt)} · ${o.kitchen ? KITCHEN_LABELS[o.kitchen] : 'لم يُرسل'}</div>`
        : '<div class="spacer"></div><span class="pill ok" style="align-self:flex-start">متاحة</span>'}
      </div>`;
  }).join('');
  const busy = S.tables.filter(t => tableOrder(t.id)).length;
  return `
    <div class="row wrap mb">
      <div class="legend small"><span><span class="dot" style="background:#fff;border:1px solid var(--line)"></span>متاحة (${S.tables.length - busy})</span>
        <span><span class="dot" style="background:var(--primary-soft);border:1px solid #fbc9a5"></span>مشغولة (${busy})</span></div>
      <div class="spacer"></div>
      <button class="btn primary" onclick="tableModal()">＋ إضافة طاولة</button>
    </div>
    ${S.tables.length ? `<div class="tables-grid">${cards}</div>` : `<div class="card">${emptyHTML('🪑', 'لا توجد طاولات — أضف أول طاولة')}</div>`}`;
}
function tableModal(id) {
  const t = id ? tableById(id) : { name: String(S.tables.length + 1), seats: 4 };
  openModal(id ? 'تعديل الطاولة' : 'طاولة جديدة', `
    <div class="form-grid">
      <label>اسم / رقم الطاولة<input id="f-name" value="${esc(t.name)}"></label>
      <label>عدد المقاعد<input id="f-seats" type="number" min="1" value="${t.seats}"></label>
    </div>`,
    `<button class="btn primary" onclick="saveTable('${id || ''}')">حفظ</button>
     ${id ? `<button class="btn outline-danger" onclick="deleteTable('${id}')">حذف</button>` : ''}
     <button class="btn" onclick="closeModal()">إلغاء</button>`);
}
function saveTable(id) {
  const name = $('#f-name').value.trim();
  if (!name) return toast('أدخل اسم الطاولة', 'err');
  const seats = Math.max(1, Math.round(num($('#f-seats').value)) || 1);
  if (id) Object.assign(tableById(id), { name, seats });
  else S.tables.push({ id: uid(), name, seats });
  save(); closeModal(); render(); toast('تم الحفظ');
}
function deleteTable(id) {
  if (tableOrder(id)) return toast('لا يمكن حذف طاولة عليها طلب مفتوح', 'err');
  confirmBox('حذف هذه الطاولة؟', () => { S.tables = S.tables.filter(t => t.id !== id); save(); render(); toast('تم الحذف'); }, 'حذف');
}

/* =========================================================
   المطبخ
   ========================================================= */
function renderKitchen() {
  const list = S.orders.filter(o => o.status !== 'cancelled' && ['pending', 'preparing', 'ready'].includes(o.kitchen))
    .sort((a, b) => (a.kitchenAt || 0) - (b.kitchenAt || 0));
  const col = (st, title, next, nextLabel) => {
    const items = list.filter(o => o.kitchen === st);
    return `<div class="k-col"><h3><span>${title}</span><span class="pill ${st}">${items.length}</span></h3>
      ${items.map(o => kitchenCard(o, next, nextLabel)).join('') || '<div class="empty small">لا شيء</div>'}</div>`;
  };
  return `
    <div class="row mb"><span class="muted small">تتحدّث الشاشة تلقائياً كل 20 ثانية · يمكن فتحها في نافذة منفصلة على شاشة المطبخ</span>
      <div class="spacer"></div><button class="btn sm" onclick="window.open(location.pathname+'#kitchen','_blank')">↗ فتح في نافذة جديدة</button></div>
    <div class="kitchen">
      ${col('pending', '🆕 جديد', 'preparing', '▶ بدء التحضير')}
      ${col('preparing', '🔥 قيد التحضير', 'ready', '✔ جاهز')}
      ${col('ready', '✅ جاهز للتسليم', 'served', '🍽️ تم التسليم')}
    </div>`;
}
function kitchenCard(o, next, nextLabel) {
  const mins = Math.floor((Date.now() - (o.kitchenAt || o.createdAt)) / 60000);
  const hasOld = o.lines.some(l => l.sentAt && l.sentAt < o.kitchenAt);
  const lines = o.lines.filter(l => l.sent);
  return `<div class="k-card ${o.kitchen}">
    <div class="k-head"><span class="k-num">#${o.number}</span><span class="elapsed ${mins >= 15 && o.kitchen !== 'ready' ? 'late' : ''}">⏱ ${mins} د</span></div>
    <div class="small">${TYPE_ICONS[o.type]} ${orderLabel(o)} ${o.status === 'paid' ? '<span class="pill paid">مدفوع</span>' : ''}</div>
    <ul>${lines.map(l => `<li class="${hasOld && l.sentAt === o.kitchenAt ? 'newline' : ''}">${l.qty} × ${esc(l.name)}${hasOld && l.sentAt === o.kitchenAt ? ' (إضافة)' : ''}${l.note ? `<span class="kn">📝 ${esc(l.note)}</span>` : ''}</li>`).join('')}</ul>
    ${o.note ? `<div class="small" style="color:var(--warn);margin-bottom:8px">📝 ${esc(o.note)}</div>` : ''}
    <div class="row">
      <button class="btn primary sm" style="flex:1" onclick="setKitchen('${o.id}','${next}')">${nextLabel}</button>
      <button class="icon-btn" title="طباعة تذكرة المطبخ" onclick="printKitchenTicket('${o.id}')">🖨️</button>
    </div>
  </div>`;
}
function setKitchen(id, st) {
  const o = orderById(id);
  if (!o) return;
  o.kitchen = st;
  if (pos.id === id) pos.kitchen = st;
  save(); render();
}

/* =========================================================
   الطلبات
   ========================================================= */
const ordersFilter = { status: 'all', date: todayKey(), q: '', type: 'all' };
function renderOrders() {
  const f = ordersFilter;
  const q = f.q.trim();
  const list = S.orders.filter(o =>
    (f.status === 'all' || o.status === f.status) &&
    (f.type === 'all' || o.type === f.type) &&
    (!f.date || dayKey(o.createdAt) === f.date) &&
    (!q || String(o.number) === q.replace('#', '') || (o.customer || '').includes(q) || (o.phone || '').includes(q))
  ).sort((a, b) => b.createdAt - a.createdAt);
  const paid = list.filter(o => o.status === 'paid');
  return `
    <div class="filters">
      <label>التاريخ<input type="date" value="${f.date}" onchange="ordersFilter.date=this.value;render()"></label>
      <label>الحالة<select onchange="ordersFilter.status=this.value;render()">
        ${['all', 'open', 'paid', 'cancelled'].map(s => `<option value="${s}" ${f.status === s ? 'selected' : ''}>${s === 'all' ? 'الكل' : STATUS_LABELS[s]}</option>`).join('')}
      </select></label>
      <label>النوع<select onchange="ordersFilter.type=this.value;render()">
        ${['all', 'dine', 'takeaway', 'delivery'].map(s => `<option value="${s}" ${f.type === s ? 'selected' : ''}>${s === 'all' ? 'الكل' : TYPE_LABELS[s]}</option>`).join('')}
      </select></label>
      <label>بحث<input type="search" placeholder="رقم الطلب، الزبون، الهاتف" value="${esc(f.q)}" onchange="ordersFilter.q=this.value;render()"></label>
      <button class="btn" onclick="ordersFilter.date='';render()">كل التواريخ</button>
      <div class="spacer"></div>
      <div class="muted small">${list.length} طلب · المدفوع: <b class="num">${money(sum(paid, o => orderTotals(o).total))}</b></div>
    </div>
    <div class="card">
      ${list.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>#</th><th>التاريخ</th><th>الطلب</th><th>الأصناف</th><th>الإجمالي</th><th>الدفع</th><th>الحالة</th><th>المطبخ</th><th></th></tr></thead>
        <tbody>${list.map(o => {
          const t = orderTotals(o);
          return `<tr>
            <td><b>${o.number}</b></td>
            <td class="small muted">${fmtDateTime(o.createdAt)}</td>
            <td>${TYPE_ICONS[o.type]} ${orderLabel(o)}</td>
            <td class="num">${qtyFmt(t.count)}</td>
            <td class="num"><b>${money(t.total)}</b></td>
            <td class="small">${o.payment ? PAY_LABELS[o.payment.method] : '—'}</td>
            <td><span class="pill ${o.status}">${STATUS_LABELS[o.status]}</span></td>
            <td class="small">${o.kitchen ? KITCHEN_LABELS[o.kitchen] : '—'}</td>
            <td class="actions">
              <button class="icon-btn" title="التفاصيل" onclick="showOrder('${o.id}')">👁</button>
              <button class="icon-btn" title="طباعة" onclick="printReceipt(orderById('${o.id}'))">🖨️</button>
              ${o.status === 'open' ? `<button class="icon-btn" title="فتح في نقطة البيع" onclick="posLoad('${o.id}')">✎</button>` : ''}
            </td></tr>`;
        }).join('')}</tbody></table></div>` : emptyHTML('📋', 'لا توجد طلبات مطابقة')}
    </div>`;
}

function showOrder(id) {
  const o = orderById(id);
  if (!o) return;
  const t = orderTotals(o);
  openModal(`الطلب #${o.number}`, `
    <div class="row wrap mb">
      <span class="pill ${o.status}">${STATUS_LABELS[o.status]}</span>
      ${o.kitchen ? `<span class="pill ${o.kitchen}">المطبخ: ${KITCHEN_LABELS[o.kitchen]}</span>` : ''}
      <span class="muted small">${fmtDateTime(o.createdAt)}</span>
    </div>
    <div class="mb">${TYPE_ICONS[o.type]} <b>${orderLabel(o)}</b>
      ${o.phone ? `<div class="small">📞 ${esc(o.phone)}</div>` : ''}${o.address ? `<div class="small">📍 ${esc(o.address)}</div>` : ''}
      ${o.note ? `<div class="small" style="color:var(--warn)">📝 ${esc(o.note)}</div>` : ''}</div>
    <table class="tbl">
      <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead>
      <tbody>${o.lines.map(l => `<tr><td>${esc(l.name)}${l.note ? `<div class="small" style="color:var(--warn)">${esc(l.note)}</div>` : ''}</td>
        <td class="num">${l.qty}</td><td class="num">${money(l.price)}</td><td class="num">${money(l.price * l.qty)}</td></tr>`).join('')}</tbody>
    </table>
    <div class="totals num mt">
      <div><span>المجموع الفرعي</span><span>${money(t.sub)}</span></div>
      ${t.disc ? `<div class="text-danger"><span>التخفيض</span><span>− ${money(t.disc)}</span></div>` : ''}
      ${t.tax ? `<div><span>الضريبة</span><span>${money(t.tax)}</span></div>` : ''}
      ${t.fee ? `<div><span>رسوم التوصيل</span><span>${money(t.fee)}</span></div>` : ''}
      <div class="grand"><span>الإجمالي</span><span>${money(t.total)}</span></div>
      ${o.payment ? `<div class="muted"><span>الدفع: ${PAY_LABELS[o.payment.method]} · ${fmtDateTime(o.paidAt)}</span>
        <span>${o.payment.method === 'cash' ? `المستلم ${fmtNum(o.payment.received)} · الباقي ${fmtNum(o.payment.change)}` : ''}</span></div>` : ''}
    </div>`,
    `<button class="btn primary" onclick="printReceipt(orderById('${o.id}'))">🖨️ طباعة الفاتورة</button>
     ${o.status === 'open' ? `<button class="btn" onclick="closeModal();posLoad('${o.id}')">✎ فتح في نقطة البيع</button>
       <button class="btn outline-danger" onclick="cancelOrder('${o.id}')">✕ إلغاء الطلب</button>` : ''}
     <button class="btn" onclick="closeModal()">إغلاق</button>`, 'wide');
}
function cancelOrder(id) {
  const o = orderById(id);
  confirmBox(`إلغاء الطلب #${o.number}؟`, () => {
    o.status = 'cancelled'; o.cancelledAt = Date.now(); o.kitchen = null;
    if (pos.id === id) pos = newDraft();
    save(); render(); toast('تم إلغاء الطلب');
  }, 'إلغاء الطلب');
}

/* =========================================================
   قائمة الطعام
   ========================================================= */
let menuCat = 'all';
function renderMenu() {
  const items = S.items.filter(i => menuCat === 'all' || i.categoryId === menuCat);
  return `
  <div class="side-layout">
    <div class="card">
      <div class="card-head"><h2>التصنيفات</h2><button class="btn sm primary" onclick="catModal()">＋</button></div>
      <div class="nav-list">
        <div class="row" style="padding:6px 0"><button class="cat-tab ${menuCat === 'all' ? 'active' : ''}" style="flex:1;text-align:start" onclick="menuCat='all';render()">الكل (${S.items.length})</button></div>
        ${S.categories.map(c => `<div class="row" style="padding:3px 0">
          <button class="cat-tab ${menuCat === c.id ? 'active' : ''}" style="flex:1;text-align:start" onclick="menuCat='${c.id}';render()">
            ${esc(c.icon || '')} ${esc(c.name)} (${S.items.filter(i => i.categoryId === c.id).length})</button>
          <button class="icon-btn" onclick="catModal('${c.id}')">✎</button></div>`).join('')}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>الأصناف</h2><button class="btn primary" onclick="itemModal()">＋ صنف جديد</button></div>
      ${items.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th></th><th>الصنف</th><th>التصنيف</th><th>السعر</th><th>التكلفة</th><th>هامش الربح</th><th>الوصفة</th><th>متوفر</th><th></th></tr></thead>
        <tbody>${items.map(i => {
          const margin = i.price ? ((i.price - (i.cost || 0)) / i.price) * 100 : 0;
          return `<tr>
            <td style="font-size:22px">${esc(i.emoji || '🍽️')}</td>
            <td><b>${esc(i.name)}</b></td>
            <td class="small">${esc(catById(i.categoryId)?.name || '—')}</td>
            <td class="num">${money(i.price)}</td>
            <td class="num muted">${money(i.cost || 0)}</td>
            <td class="num ${margin < 30 ? 'text-danger' : 'text-success'}">${fmtNum(margin, 0)}%</td>
            <td class="small muted">${(i.recipe || []).length ? `${i.recipe.length} مادة` : '—'}</td>
            <td><label class="check"><input type="checkbox" ${i.available ? 'checked' : ''} onchange="toggleAvail('${i.id}',this.checked)"></label></td>
            <td class="actions"><button class="icon-btn" onclick="itemModal('${i.id}')">✎</button>
              <button class="icon-btn danger" onclick="deleteItem('${i.id}')">🗑️</button></td></tr>`;
        }).join('')}</tbody></table></div>` : emptyHTML('📖', 'لا توجد أصناف في هذا التصنيف')}
    </div>
  </div>`;
}
function toggleAvail(id, v) { itemById(id).available = v; save(); }

function catModal(id) {
  const c = id ? catById(id) : { name: '', icon: '🍽️' };
  openModal(id ? 'تعديل التصنيف' : 'تصنيف جديد', `
    <div class="form-grid">
      <label class="full">الاسم<input id="f-name" value="${esc(c.name)}"></label>
      <label>أيقونة (رمز تعبيري)<input id="f-icon" value="${esc(c.icon || '')}" maxlength="4"></label>
    </div>`,
    `<button class="btn primary" onclick="saveCat('${id || ''}')">حفظ</button>
     ${id ? `<button class="btn outline-danger" onclick="deleteCat('${id}')">حذف</button>` : ''}
     <button class="btn" onclick="closeModal()">إلغاء</button>`);
}
function saveCat(id) {
  const name = $('#f-name').value.trim();
  if (!name) return toast('أدخل اسم التصنيف', 'err');
  const icon = $('#f-icon').value.trim();
  if (id) Object.assign(catById(id), { name, icon });
  else S.categories.push({ id: uid(), name, icon });
  save(); closeModal(); render(); toast('تم الحفظ');
}
function deleteCat(id) {
  if (S.items.some(i => i.categoryId === id)) return toast('لا يمكن حذف تصنيف يحتوي على أصناف', 'err');
  confirmBox('حذف هذا التصنيف؟', () => {
    S.categories = S.categories.filter(c => c.id !== id);
    if (menuCat === id) menuCat = 'all';
    if (posCat === id) posCat = 'all';
    save(); render();
  }, 'حذف');
}

function recipeRowHTML(r = {}) {
  return `<div class="recipe-row">
    <select class="r-ing">${S.ingredients.map(g => `<option value="${g.id}" ${g.id === r.ingredientId ? 'selected' : ''}>${esc(g.name)} (${esc(g.unit)})</option>`).join('')}</select>
    <input class="r-qty" type="number" step="any" min="0" value="${r.qty ?? ''}" placeholder="الكمية">
    <button class="icon-btn danger" onclick="this.parentElement.remove()">✕</button></div>`;
}
function addRecipeRow() {
  if (!S.ingredients.length) return toast('أضف مواداً في صفحة المخزون أولاً', 'err');
  $('#recipe-rows').insertAdjacentHTML('beforeend', recipeRowHTML());
}
function readRecipe() {
  return $$('#recipe-rows .recipe-row').map(r => ({ ingredientId: $('.r-ing', r).value, qty: num($('.r-qty', r).value) })).filter(r => r.qty > 0);
}
function calcCostFromRecipe() {
  const rec = readRecipe();
  if (!rec.length) return toast('الوصفة فارغة', 'err');
  $('#f-cost').value = round2(sum(rec, r => (ingById(r.ingredientId)?.cost || 0) * r.qty));
}
function itemModal(id) {
  if (!S.categories.length) return toast('أضف تصنيفاً أولاً', 'err');
  const i = id ? itemById(id) : { name: '', categoryId: menuCat !== 'all' ? menuCat : S.categories[0].id, price: '', cost: '', emoji: '🍽️', available: true, recipe: [] };
  openModal(id ? 'تعديل الصنف' : 'صنف جديد', `
    <div class="form-grid">
      <label>الاسم<input id="f-name" value="${esc(i.name)}"></label>
      <label>التصنيف<select id="f-cat">${S.categories.map(c => `<option value="${c.id}" ${c.id === i.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>سعر البيع (${esc(S.settings.currency)})<input id="f-price" type="number" step="any" min="0" value="${i.price}"></label>
      <label>التكلفة (${esc(S.settings.currency)})<input id="f-cost" type="number" step="any" min="0" value="${i.cost}"></label>
      <label>أيقونة (رمز تعبيري)<input id="f-emoji" value="${esc(i.emoji || '')}" maxlength="4"></label>
      <label class="check" style="align-self:end;padding-bottom:8px"><input type="checkbox" id="f-avail" ${i.available ? 'checked' : ''}> متوفر للبيع</label>
    </div>
    <div class="card-head mt"><div><h3>الوصفة (اختياري)</h3><div class="small muted">تُخصم هذه الكميات من المخزون تلقائياً عند بيع الصنف</div></div>
      <div class="row"><button class="btn sm" onclick="calcCostFromRecipe()">حساب التكلفة</button><button class="btn sm" onclick="addRecipeRow()">＋ مادة</button></div></div>
    <div id="recipe-rows">${(i.recipe || []).map(r => recipeRowHTML(r)).join('')}</div>`,
    `<button class="btn primary" onclick="saveItem('${id || ''}')">حفظ</button><button class="btn" onclick="closeModal()">إلغاء</button>`, 'wide');
}
function saveItem(id) {
  const name = $('#f-name').value.trim();
  if (!name) return toast('أدخل اسم الصنف', 'err');
  const price = num($('#f-price').value);
  if (price <= 0) return toast('أدخل سعراً صحيحاً', 'err');
  const data = {
    name, categoryId: $('#f-cat').value, price, cost: num($('#f-cost').value),
    emoji: $('#f-emoji').value.trim(), available: $('#f-avail').checked, recipe: readRecipe(),
  };
  if (id) Object.assign(itemById(id), data);
  else S.items.push({ id: uid(), ...data });
  save(); closeModal(); render(); toast('تم الحفظ');
}
function deleteItem(id) {
  confirmBox(`حذف الصنف "${esc(itemById(id).name)}"؟ (الطلبات السابقة لن تتأثر)`, () => {
    S.items = S.items.filter(i => i.id !== id); save(); render(); toast('تم الحذف');
  }, 'حذف');
}

/* =========================================================
   المخزون
   ========================================================= */
let invShowMoves = false;
function renderInventory() {
  const low = lowStock();
  const value = sum(S.ingredients, g => Math.max(0, g.qty) * (g.cost || 0));
  const moves = [...S.stockMoves].reverse().slice(0, 100);
  return `
    <div class="grid stats mb">
      ${statCard('📦', 'b', 'عدد المواد', S.ingredients.length)}
      ${statCard('⚠️', 'r', 'مواد تحت الحد الأدنى', low.length)}
      ${statCard('💰', 'g', 'قيمة المخزون', money(value))}
    </div>
    <div class="card mb">
      <div class="card-head"><h2>المواد الأولية</h2><button class="btn primary" onclick="ingModal()">＋ مادة جديدة</button></div>
      ${S.ingredients.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>المادة</th><th>الكمية المتوفرة</th><th>الحد الأدنى</th><th>تكلفة الوحدة</th><th>القيمة</th><th>الحالة</th><th></th></tr></thead>
        <tbody>${S.ingredients.map(g => `<tr>
          <td><b>${esc(g.name)}</b></td>
          <td class="num"><b>${qtyFmt(g.qty)}</b> ${esc(g.unit)}</td>
          <td class="num muted">${qtyFmt(g.min)} ${esc(g.unit)}</td>
          <td class="num">${money(g.cost || 0)}</td>
          <td class="num">${money(Math.max(0, g.qty) * (g.cost || 0))}</td>
          <td>${g.qty <= g.min ? '<span class="pill low">منخفض</span>' : '<span class="pill ok">متوفر</span>'}</td>
          <td class="actions">
            <button class="btn sm" onclick="adjustModal('${g.id}')">± تعديل الكمية</button>
            <button class="icon-btn" onclick="ingModal('${g.id}')">✎</button>
            <button class="icon-btn danger" onclick="deleteIng('${g.id}')">🗑️</button></td></tr>`).join('')}
        </tbody></table></div>` : emptyHTML('📦', 'لا توجد مواد في المخزون')}
    </div>
    <div class="card">
      <div class="card-head"><h2>سجل حركة المخزون</h2><button class="btn sm" onclick="invShowMoves=!invShowMoves;render()">${invShowMoves ? 'إخفاء' : 'عرض'}</button></div>
      ${invShowMoves ? (moves.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>التاريخ</th><th>المادة</th><th>الكمية</th><th>السبب</th></tr></thead>
        <tbody>${moves.map(m => { const g = ingById(m.ingredientId); return `<tr>
          <td class="small muted">${fmtDateTime(m.at)}</td><td>${esc(g?.name || 'محذوفة')}</td>
          <td class="num ${m.delta < 0 ? 'text-danger' : 'text-success'}"><b>${m.delta > 0 ? '+' : ''}${qtyFmt(m.delta)}</b> ${esc(g?.unit || '')}</td>
          <td class="small">${esc(m.reason)}</td></tr>`; }).join('')}</tbody></table></div>` : emptyHTML('📜', 'لا توجد حركات بعد')) : '<div class="muted small">آخر 100 حركة (مبيعات، مشتريات، تعديلات يدوية)</div>'}
    </div>`;
}
function ingModal(id) {
  const g = id ? ingById(id) : { name: '', unit: 'كغ', qty: 0, min: 0, cost: 0 };
  openModal(id ? 'تعديل المادة' : 'مادة جديدة', `
    <div class="form-grid">
      <label>الاسم<input id="f-name" value="${esc(g.name)}"></label>
      <label>وحدة القياس<input id="f-unit" value="${esc(g.unit)}" list="units"><datalist id="units"><option>كغ</option><option>غ</option><option>لتر</option><option>قطعة</option><option>علبة</option><option>كيس</option></datalist></label>
      ${id ? '' : `<label>الكمية الحالية<input id="f-qty" type="number" step="any" min="0" value="${g.qty}"></label>`}
      <label>الحد الأدنى للتنبيه<input id="f-min" type="number" step="any" min="0" value="${g.min}"></label>
      <label>تكلفة الوحدة (${esc(S.settings.currency)})<input id="f-cost" type="number" step="any" min="0" value="${g.cost}"></label>
    </div>`,
    `<button class="btn primary" onclick="saveIng('${id || ''}')">حفظ</button><button class="btn" onclick="closeModal()">إلغاء</button>`);
}
function saveIng(id) {
  const name = $('#f-name').value.trim();
  if (!name) return toast('أدخل اسم المادة', 'err');
  const data = { name, unit: $('#f-unit').value.trim() || 'وحدة', min: num($('#f-min').value), cost: num($('#f-cost').value) };
  if (id) Object.assign(ingById(id), data);
  else {
    const g = { id: uid(), ...data, qty: num($('#f-qty').value) };
    S.ingredients.push(g);
    if (g.qty) S.stockMoves.push({ id: uid(), ingredientId: g.id, delta: g.qty, reason: 'رصيد افتتاحي', at: Date.now() });
  }
  save(); closeModal(); render(); toast('تم الحفظ');
}
function deleteIng(id) {
  const used = S.items.filter(i => (i.recipe || []).some(r => r.ingredientId === id));
  const msg = used.length ? `هذه المادة مستخدمة في وصفات: ${used.map(i => esc(i.name)).join('، ')}. سيتم حذفها من الوصفات أيضاً. متابعة؟` : 'حذف هذه المادة؟';
  confirmBox(msg, () => {
    S.ingredients = S.ingredients.filter(g => g.id !== id);
    S.items.forEach(i => { i.recipe = (i.recipe || []).filter(r => r.ingredientId !== id); });
    save(); render(); toast('تم الحذف');
  }, 'حذف');
}
function adjustModal(id) {
  const g = ingById(id);
  openModal(`تعديل كمية: ${esc(g.name)}`, `
    <p class="muted" style="margin-top:0">الكمية الحالية: <b class="num">${qtyFmt(g.qty)} ${esc(g.unit)}</b></p>
    <div class="seg full mb" id="adj-type">
      <button class="active" data-t="add" onclick="setAdjType('add')">＋ إضافة (شراء)</button>
      <button data-t="remove" onclick="setAdjType('remove')">− سحب (تالف/هدر)</button>
      <button data-t="set" onclick="setAdjType('set')">= جرد (تعيين)</button>
    </div>
    <div class="form-grid">
      <label>الكمية (${esc(g.unit)})<input id="f-qty" type="number" step="any" min="0"></label>
      <label>السبب / ملاحظة<input id="f-reason" placeholder="اختياري"></label>
      <label class="full" id="adj-cost-box">سعر الوحدة للشراء (${esc(S.settings.currency)})<input id="f-ucost" type="number" step="any" min="0" value="${g.cost || 0}"></label>
      <label class="check full" id="adj-exp-box"><input type="checkbox" id="f-asexp" checked> تسجيل قيمة الشراء في المصاريف</label>
    </div>`,
    `<button class="btn primary" onclick="saveAdjust('${id}')">حفظ</button><button class="btn" onclick="closeModal()">إلغاء</button>`);
  window._adjType = 'add';
}
function setAdjType(t) {
  window._adjType = t;
  $$('#adj-type button').forEach(b => b.classList.toggle('active', b.dataset.t === t));
  $('#adj-cost-box').style.display = $('#adj-exp-box').style.display = t === 'add' ? '' : 'none';
}
function saveAdjust(id) {
  const g = ingById(id);
  const q = num($('#f-qty').value);
  const t = window._adjType;
  if (q < 0 || (!q && t !== 'set')) return toast('أدخل كمية صحيحة', 'err');
  const reasonIn = $('#f-reason').value.trim();
  let delta, reason;
  if (t === 'add') {
    delta = q; reason = reasonIn || 'شراء / إضافة';
    const ucost = num($('#f-ucost').value);
    if (ucost > 0) g.cost = ucost;
    if ($('#f-asexp').checked && ucost > 0) {
      S.expenses.push({ id: uid(), date: todayKey(), category: 'مشتريات', description: `شراء ${qtyFmt(q)} ${g.unit} ${g.name}`, amount: round2(q * ucost) });
    }
  } else if (t === 'remove') { delta = -q; reason = reasonIn || 'سحب / هدر'; }
  else { delta = round3(q - g.qty); reason = reasonIn || 'جرد'; }
  g.qty = round3(g.qty + delta);
  if (delta) S.stockMoves.push({ id: uid(), ingredientId: id, delta: round3(delta), reason, at: Date.now() });
  save(); closeModal(); render(); toast('تم تحديث المخزون');
}

/* =========================================================
   المصاريف
   ========================================================= */
let expMonth = todayKey().slice(0, 7);
function cashboxData(month) {
  const inMonth = k => !month || k.startsWith(month);
  const paid = S.orders.filter(o => o.status === 'paid' && inMonth(dayKey(o.paidAt)));
  const exps = S.expenses.filter(e => inMonth(e.date));
  let cash = 0, card = 0;
  paid.forEach(o => { const t = orderTotals(o).total; if ((o.payment?.method || 'cash') === 'card') card += t; else cash += t; });
  const income = cash + card;
  const expenses = sum(exps, e => e.amount);
  // تجميع يومي
  const days = {};
  const day = k => days[k] || (days[k] = { date: k, income: 0, orders: 0, expenses: 0 });
  paid.forEach(o => { const d = day(dayKey(o.paidAt)); d.income += orderTotals(o).total; d.orders++; });
  exps.forEach(e => { day(e.date).expenses += e.amount; });
  const daily = Object.values(days).sort((a, b) => b.date.localeCompare(a.date));
  return { paid, exps, cash, card, income, expenses, net: income - expenses, cashNet: cash - expenses, daily };
}
function renderCashbox() {
  const d = cashboxData(expMonth);
  const list = [...d.exps].sort((a, b) => b.date.localeCompare(a.date));
  const periodLabel = expMonth ? `شهر ${expMonth}` : 'كل الفترات';
  return `
  <div class="card mb">
    <div class="card-head"><h2>🏦 الصندوق — ${periodLabel}</h2>
      <div class="row"><input type="month" value="${expMonth}" onchange="expMonth=this.value;render()" style="width:auto">
      <button class="btn sm" onclick="expMonth='';render()">الكل</button></div></div>
    <div class="grid stats">
      ${statCard('💰', 'g', 'إجمالي المداخيل', money(d.income))}
      ${statCard('💵', 'g', 'منها نقداً', money(d.cash))}
      ${statCard('💳', 'b', 'منها بطاقة', money(d.card))}
      ${statCard('💸', 'r', 'إجمالي المصاريف', money(d.expenses))}
      ${statCard('🧮', d.net >= 0 ? 'g' : 'r', 'الإجمالي (الصافي)', money(d.net))}
      ${statCard('🏦', d.cashNet >= 0 ? 'y' : 'r', 'النقد في الصندوق', money(d.cashNet))}
    </div>
  </div>
  <div class="card mb">
    <div class="card-head"><h2>تسجيل مصروف (خروج من الصندوق)</h2></div>
    <div class="filters" style="margin:0">
      <label>التاريخ<input type="date" id="e-date" value="${todayKey()}"></label>
      <label>الفئة<select id="e-cat">${EXPENSE_CATS.map(c => `<option>${c}</option>`).join('')}</select></label>
      <label style="flex:1">الوصف<input id="e-desc" placeholder="مثال: فاتورة الكهرباء" style="width:100%"></label>
      <label>المبلغ<input id="e-amount" type="number" step="any" min="0" onkeydown="if(event.key==='Enter')addExpense()"></label>
      <button class="btn primary" onclick="addExpense()">＋ إضافة</button>
    </div>
  </div>
  <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)">
    <div class="card">
      <div class="card-head"><h2>حركة الصندوق اليومية</h2></div>
      ${d.daily.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>التاريخ</th><th>الطلبات</th><th>المداخيل</th><th>المصاريف</th><th>الصافي</th></tr></thead>
        <tbody>${d.daily.map(r => `<tr><td class="small">${r.date}</td><td class="num">${r.orders}</td>
          <td class="num" style="color:var(--success)">+ ${money(r.income)}</td>
          <td class="num" style="color:var(--danger)">− ${money(r.expenses)}</td>
          <td class="num"><b>${money(r.income - r.expenses)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>الإجمالي</td><td class="num">${d.paid.length}</td><td class="num">${money(d.income)}</td><td class="num">${money(d.expenses)}</td><td class="num"><b>${money(d.net)}</b></td></tr></tfoot>
      </table></div>` : emptyHTML('🏦', 'لا توجد حركات في هذه الفترة')}
    </div>
    <div class="card">
      <div class="card-head"><h2>المصاريف</h2></div>
      ${list.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>التاريخ</th><th>الفئة</th><th>الوصف</th><th>المبلغ</th><th></th></tr></thead>
        <tbody>${list.map(e => `<tr><td class="small">${e.date}</td><td><span class="pill">${esc(e.category)}</span></td>
          <td>${esc(e.description)}</td><td class="num"><b>${money(e.amount)}</b></td>
          <td class="actions"><button class="icon-btn danger" onclick="deleteExpense('${e.id}')">🗑️</button></td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="3">المجموع</td><td class="num">${money(d.expenses)}</td><td></td></tr></tfoot>
      </table></div>` : emptyHTML('💸', 'لا توجد مصاريف في هذه الفترة')}
    </div>
  </div>`;
}
function addExpense() {
  const amount = num($('#e-amount').value);
  if (amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'err');
  const date = $('#e-date').value || todayKey();
  S.expenses.push({ id: uid(), date, category: $('#e-cat').value, description: $('#e-desc').value.trim(), amount: round2(amount) });
  save(); render(); toast('تمت إضافة المصروف');
}
function deleteExpense(id) {
  confirmBox('حذف هذا المصروف؟', () => { S.expenses = S.expenses.filter(e => e.id !== id); save(); render(); }, 'حذف');
}

/* =========================================================
   التقارير
   ========================================================= */
const rep = { from: todayKey().slice(0, 8) + '01', to: todayKey() };
function setRange(k) {
  const d = new Date();
  const today = todayKey();
  if (k === 'today') { rep.from = rep.to = today; }
  else if (k === 'yesterday') { d.setDate(d.getDate() - 1); rep.from = rep.to = dayKey(d); }
  else if (k === 'week') { d.setDate(d.getDate() - 6); rep.from = dayKey(d); rep.to = today; }
  else if (k === 'month') { rep.from = today.slice(0, 8) + '01'; rep.to = today; }
  else if (k === 'lastmonth') {
    const a = new Date(d.getFullYear(), d.getMonth() - 1, 1), b = new Date(d.getFullYear(), d.getMonth(), 0);
    rep.from = dayKey(a); rep.to = dayKey(b);
  } else if (k === 'year') { rep.from = today.slice(0, 4) + '-01-01'; rep.to = today; }
  render();
}
function reportData() {
  const inRange = k => k >= rep.from && k <= rep.to;
  const orders = S.orders.filter(o => o.status === 'paid' && inRange(dayKey(o.paidAt)));
  const cancelled = S.orders.filter(o => o.status === 'cancelled' && inRange(dayKey(o.createdAt))).length;
  let revenue = 0, tax = 0, disc = 0, fees = 0, cogs = 0;
  const byPay = { cash: 0, card: 0 }, byType = { dine: 0, takeaway: 0, delivery: 0 }, byHour = Array(24).fill(0);
  orders.forEach(o => {
    const t = orderTotals(o);
    revenue += t.total; tax += t.tax; disc += t.disc; fees += t.fee; cogs += orderCost(o);
    byPay[o.payment?.method || 'cash'] += t.total;
    byType[o.type] += t.total;
    byHour[new Date(o.createdAt).getHours()] += t.total;
  });
  const expensesList = S.expenses.filter(e => inRange(e.date));
  const expenses = sum(expensesList, e => e.amount);
  const items = aggregateItems(orders);
  const byCat = {};
  orders.forEach(o => o.lines.forEach(l => {
    const c = catById(itemById(l.itemId)?.categoryId)?.name || 'أخرى';
    byCat[c] = (byCat[c] || 0) + l.price * l.qty;
  }));
  // المبيعات حسب اليوم (أو الشهر إذا كانت الفترة طويلة)
  const start = parseDay(rep.from), end = parseDay(rep.to);
  const spanDays = Math.round((end - start) / 86400000) + 1;
  const series = [];
  if (spanDays <= 45) {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const k = dayKey(d);
      series.push({ label: spanDays > 14 ? String(d.getDate()) : k.slice(5), value: sum(orders.filter(o => dayKey(o.paidAt) === k), o => orderTotals(o).total) });
    }
  } else {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d.setMonth(d.getMonth() + 1)) {
      const k = dayKey(d).slice(0, 7);
      series.push({ label: k, value: sum(orders.filter(o => dayKey(o.paidAt).startsWith(k)), o => orderTotals(o).total) });
    }
  }
  const net = revenue - tax - cogs - expenses;
  return { orders, cancelled, revenue, tax, disc, fees, cogs, expenses, net, byPay, byType, byHour, items, byCat, series, expensesList };
}
function renderReports() {
  const r = reportData();
  const hours = r.byHour.map((v, h) => ({ label: String(h), value: v })).filter((x, h) => r.byHour.slice(h).some(Boolean) && r.byHour.slice(0, h + 1).some(Boolean));
  return `
  <div class="filters">
    <label>من<input type="date" value="${rep.from}" onchange="rep.from=this.value||rep.from;render()"></label>
    <label>إلى<input type="date" value="${rep.to}" onchange="rep.to=this.value||rep.to;render()"></label>
    <div class="seg">
      <button onclick="setRange('today')">اليوم</button><button onclick="setRange('yesterday')">أمس</button>
      <button onclick="setRange('week')">7 أيام</button><button onclick="setRange('month')">هذا الشهر</button>
      <button onclick="setRange('lastmonth')">الشهر الماضي</button><button onclick="setRange('year')">هذه السنة</button>
    </div>
    <div class="spacer"></div>
    <button class="btn" onclick="exportOrdersCSV()">⬇ تصدير CSV</button>
    <button class="btn" onclick="printReport()">🖨️ طباعة التقرير</button>
  </div>
  <div class="grid stats mb">
    ${statCard('💰', 'g', 'إجمالي المبيعات', money(r.revenue))}
    ${statCard('🧾', '', 'عدد الطلبات', `${r.orders.length}${r.cancelled ? ` <span class="small muted">(${r.cancelled} ملغى)</span>` : ''}`)}
    ${statCard('📐', 'b', 'متوسط الطلب', money(r.orders.length ? r.revenue / r.orders.length : 0))}
    ${statCard('🥩', 'y', 'تكلفة المبيعات', money(r.cogs))}
    ${statCard('💸', 'r', 'المصاريف', money(r.expenses))}
    ${statCard(r.net >= 0 ? '📈' : '📉', r.net >= 0 ? 'g' : 'r', 'صافي الربح', `<span class="${r.net >= 0 ? 'text-success' : 'text-danger'}">${money(r.net)}</span>`)}
  </div>
  <div class="card mb">
    <div class="card-head"><h2>المبيعات عبر الفترة</h2>
      <span class="small muted">التخفيضات: ${money(r.disc)} · الضرائب: ${money(r.tax)} · رسوم التوصيل: ${money(r.fees)}</span></div>
    ${barChart(r.series)}
  </div>
  <div class="grid cols-3 mb">
    <div class="card"><div class="card-head"><h2>حسب طريقة الدفع</h2></div>
      ${hbars(Object.entries(r.byPay).map(([k, v]) => ({ label: PAY_LABELS[k], value: v, text: money(v) })))}</div>
    <div class="card"><div class="card-head"><h2>حسب نوع الطلب</h2></div>
      ${hbars(Object.entries(r.byType).map(([k, v]) => ({ label: TYPE_LABELS[k], value: v, text: money(v) })))}</div>
    <div class="card"><div class="card-head"><h2>حسب التصنيف</h2></div>
      ${hbars(Object.entries(r.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: k, value: v, text: money(v) })))}</div>
  </div>
  <div class="grid cols-2">
    <div class="card"><div class="card-head"><h2>مبيعات الأصناف</h2></div>
      ${r.items.length ? `<div class="table-wrap"><table class="tbl">
        <thead><tr><th>الصنف</th><th>الكمية</th><th>المبيعات</th><th>التكلفة</th><th>الربح الإجمالي</th></tr></thead>
        <tbody>${r.items.map(i => `<tr><td>${esc(i.name)}</td><td class="num">${qtyFmt(i.qty)}</td><td class="num">${money(i.revenue)}</td>
          <td class="num muted">${money(i.cost)}</td><td class="num text-success">${money(i.revenue - i.cost)}</td></tr>`).join('')}</tbody>
      </table></div>` : emptyHTML('📊', 'لا توجد مبيعات في هذه الفترة')}
    </div>
    <div class="card"><div class="card-head"><h2>ساعات الذروة</h2></div>
      ${hours.length ? barChart(hours) : emptyHTML('🕐', 'لا توجد بيانات')}</div>
  </div>`;
}
function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function exportOrdersCSV() {
  const r = reportData();
  const rows = [['رقم الطلب', 'تاريخ الدفع', 'النوع', 'الطاولة/الزبون', 'عدد الأصناف', 'المجموع الفرعي', 'التخفيض', 'الضريبة', 'رسوم التوصيل', 'الإجمالي', 'التكلفة', 'طريقة الدفع']];
  r.orders.forEach(o => {
    const t = orderTotals(o);
    rows.push([o.number, fmtDateTime(o.paidAt), TYPE_LABELS[o.type], o.type === 'dine' ? (tableById(o.tableId)?.name || '') : (o.customer || ''),
      t.count, t.sub, t.disc, t.tax, t.fee, t.total, round2(orderCost(o)), PAY_LABELS[o.payment?.method] || '']);
  });
  const csv = '﻿' + rows.map(row => row.map(csvCell).join(',')).join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `orders_${rep.from}_${rep.to}.csv`);
}
function printReport() {
  const r = reportData();
  const cur = S.settings.currency;
  const m = v => `${fmtNum(v)} ${esc(cur)}`;
  $('#print-area').innerHTML = `
    <div class="print-report" dir="rtl">
      <h2>${esc(S.settings.name)} — تقرير من ${rep.from} إلى ${rep.to}</h2>
      <table><tbody>
        <tr><th>إجمالي المبيعات</th><td>${m(r.revenue)}</td><th>عدد الطلبات</th><td>${r.orders.length}</td></tr>
        <tr><th>التخفيضات</th><td>${m(r.disc)}</td><th>الضرائب</th><td>${m(r.tax)}</td></tr>
        <tr><th>تكلفة المبيعات</th><td>${m(r.cogs)}</td><th>المصاريف</th><td>${m(r.expenses)}</td></tr>
        <tr><th>صافي الربح</th><td colspan="3"><b>${m(r.net)}</b></td></tr>
      </tbody></table>
      <h3>مبيعات الأصناف</h3>
      <table><thead><tr><th>الصنف</th><th>الكمية</th><th>المبيعات</th><th>التكلفة</th><th>الربح</th></tr></thead>
        <tbody>${r.items.map(i => `<tr><td>${esc(i.name)}</td><td>${qtyFmt(i.qty)}</td><td>${m(i.revenue)}</td><td>${m(i.cost)}</td><td>${m(i.revenue - i.cost)}</td></tr>`).join('')}</tbody></table>
      <h3>المصاريف</h3>
      <table><thead><tr><th>التاريخ</th><th>الفئة</th><th>الوصف</th><th>المبلغ</th></tr></thead>
        <tbody>${r.expensesList.map(e => `<tr><td>${e.date}</td><td>${esc(e.category)}</td><td>${esc(e.description)}</td><td>${m(e.amount)}</td></tr>`).join('')}</tbody></table>
      <p style="font-size:11px">طُبع في ${fmtDateTime(Date.now())}</p>
    </div>`;
  window.print();
}

/* =========================================================
   الطباعة: الفاتورة وتذكرة المطبخ
   ========================================================= */
function printReceipt(o, isBill = false) {
  if (!o) return;
  const st = S.settings;
  const t = orderTotals(o);
  const m = v => fmtNum(v);
  $('#print-area').innerHTML = `
    <div class="receipt" dir="rtl">
      <div class="c"><h2>${esc(st.name)}</h2>
        ${st.address ? `<div>${esc(st.address)}</div>` : ''}${st.phone ? `<div>هاتف: ${esc(st.phone)}</div>` : ''}</div>
      <hr>
      <div class="c big">${isBill || o.status !== 'paid' ? 'الحساب' : 'فاتورة'} ${o.number !== '—' ? '#' + o.number : ''}</div>
      <div>${fmtDateTime(o.paidAt || o.createdAt)}</div>
      <div>${TYPE_LABELS[o.type]}${o.type === 'dine' ? ' — طاولة ' + esc(tableById(o.tableId)?.name || '') : ''}</div>
      ${o.customer ? `<div>الزبون: ${esc(o.customer)}</div>` : ''}${o.phone ? `<div>الهاتف: ${esc(o.phone)}</div>` : ''}
      ${o.address ? `<div>العنوان: ${esc(o.address)}</div>` : ''}
      <hr>
      <table>${o.lines.map(l => `<tr><td>${l.qty} × ${esc(l.name)}</td><td class="r">${m(l.price * l.qty)}</td></tr>`).join('')}</table>
      <hr>
      <table>
        <tr><td>المجموع الفرعي</td><td class="r">${m(t.sub)}</td></tr>
        ${t.disc ? `<tr><td>التخفيض</td><td class="r">- ${m(t.disc)}</td></tr>` : ''}
        ${t.tax ? `<tr><td>الضريبة</td><td class="r">${m(t.tax)}</td></tr>` : ''}
        ${t.fee ? `<tr><td>رسوم التوصيل</td><td class="r">${m(t.fee)}</td></tr>` : ''}
        <tr class="big"><td>الإجمالي</td><td class="r">${m(t.total)} ${esc(st.currency)}</td></tr>
        ${o.payment ? `<tr><td>الدفع: ${PAY_LABELS[o.payment.method]}</td><td class="r">${m(o.payment.received)}</td></tr>
          ${o.payment.change > 0 ? `<tr><td>الباقي</td><td class="r">${m(o.payment.change)}</td></tr>` : ''}` : ''}
      </table>
      <hr>
      <div class="c">${esc(st.footer)}</div>
    </div>`;
  window.print();
}
function printKitchenTicket(id) {
  const o = orderById(id);
  if (!o) return;
  $('#print-area').innerHTML = `
    <div class="receipt kitchen-ticket" dir="rtl">
      <div class="c big" style="font-size:22px">طلب #${o.number}</div>
      <div class="c">${TYPE_LABELS[o.type]}${o.type === 'dine' ? ' — طاولة ' + esc(tableById(o.tableId)?.name || '') : ''}</div>
      <div class="c">${fmtTime(o.kitchenAt || o.createdAt)}</div><hr>
      ${o.lines.filter(l => l.sent).map(l => `<div class="big">${l.qty} × ${esc(l.name)}</div>${l.note ? `<div>  ← ${esc(l.note)}</div>` : ''}`).join('')}
      ${o.note ? `<hr><div>ملاحظة: ${esc(o.note)}</div>` : ''}
    </div>`;
  window.print();
}

/* =========================================================
   الإعدادات
   ========================================================= */
function renderSettings() {
  const st = S.settings;
  const usage = (() => { try { return (localStorage.getItem(STORE_KEY) || '').length * 2 / 1024; } catch (e) { return 0; } })();
  return `
  <div class="grid cols-2">
    <div class="card">
      <div class="card-head"><h2>معلومات المطعم</h2></div>
      <div class="form-grid">
        <label class="full">اسم المطعم<input id="s-name" value="${esc(st.name)}"></label>
        <label>الهاتف<input id="s-phone" value="${esc(st.phone)}"></label>
        <label>العملة<input id="s-currency" value="${esc(st.currency)}"></label>
        <label class="full">العنوان<input id="s-address" value="${esc(st.address)}"></label>
        <label>نسبة الضريبة %<input id="s-tax" type="number" step="any" min="0" value="${st.taxRate}"></label>
        <label>رسوم التوصيل<input id="s-fee" type="number" step="any" min="0" value="${st.deliveryFee}"></label>
        <label class="full">نص أسفل الفاتورة<textarea id="s-footer">${esc(st.footer)}</textarea></label>
      </div>
      <div class="mt"><button class="btn primary" onclick="saveSettings()">💾 حفظ الإعدادات</button></div>
    </div>
    <div class="grid" style="align-content:start">
      <div class="card">
        <div class="card-head"><h2>النسخ الاحتياطي</h2></div>
        <p class="muted small" style="margin-top:0">البيانات محفوظة في هذا المتصفح على هذا الجهاز فقط (الحجم الحالي ≈ ${fmtNum(usage, 0)} ك.ب).
          احفظ نسخة احتياطية بانتظام، خاصة قبل مسح بيانات المتصفح.</p>
        <div class="row wrap">
          <button class="btn primary" onclick="exportBackup()">⬇ تنزيل نسخة احتياطية</button>
          <label class="btn" style="color:var(--text);font-size:14px">⬆ استرجاع نسخة<input type="file" accept=".json,application/json" style="display:none" onchange="importBackup(this)"></label>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h2>إدارة البيانات</h2></div>
        <div style="display:flex;flex-direction:column;gap:10px;align-items:flex-start">
          <button class="btn outline-danger" onclick="clearTransactions()">🧹 حذف الطلبات والمصاريف وسجل المخزون فقط</button>
          <button class="btn outline-danger" onclick="loadDemo()">🔄 إعادة تحميل البيانات التجريبية</button>
          <button class="btn danger" onclick="wipeAll()">⚠ حذف كل البيانات والبدء من الصفر</button>
        </div>
      </div>
    </div>
  </div>`;
}
function saveSettings() {
  const name = $('#s-name').value.trim();
  if (!name) return toast('أدخل اسم المطعم', 'err');
  Object.assign(S.settings, {
    name, phone: $('#s-phone').value.trim(), address: $('#s-address').value.trim(),
    currency: $('#s-currency').value.trim() || 'د.ج', taxRate: num($('#s-tax').value),
    deliveryFee: num($('#s-fee').value), footer: $('#s-footer').value.trim(),
  });
  save(); render(); toast('تم حفظ الإعدادات');
}
function exportBackup() {
  download(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }), `restoprime-backup-${todayKey()}.json`);
}
function importBackup(input) {
  const f = input.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    input.value = '';
    let d;
    try {
      d = JSON.parse(reader.result);
      if (!d || !Array.isArray(d.orders) || !Array.isArray(d.items)) throw new Error('الملف ليس نسخة احتياطية صالحة');
    } catch (e) { return toast('تعذّر قراءة الملف: ' + e.message, 'err'); }
    confirmBox('سيتم استبدال كل البيانات الحالية بمحتوى النسخة الاحتياطية. متابعة؟', () => {
      S = normalize(d); pos = newDraft(); save(); render(); toast('تم استرجاع النسخة الاحتياطية');
    }, 'استرجاع');
  };
  reader.readAsText(f);
}
function clearTransactions() {
  confirmBox('سيتم حذف كل الطلبات والمصاريف وسجل حركة المخزون (تبقى قائمة الطعام والطاولات والمخزون). متابعة؟', () => {
    S.orders = []; S.expenses = []; S.stockMoves = []; S.counters.order = 0; pos = newDraft();
    save(); render(); toast('تم الحذف');
  }, 'حذف');
}
function loadDemo() {
  confirmBox('سيتم استبدال كل البيانات بالبيانات التجريبية. متابعة؟', () => {
    const settings = S.settings;
    S = seedState(); S.settings = settings; pos = newDraft(); save(); render(); toast('تم تحميل البيانات التجريبية');
  }, 'متابعة');
}
function wipeAll() {
  confirmBox('سيتم حذف <b>كل</b> البيانات نهائياً (القائمة، الطاولات، المخزون، الطلبات، المصاريف). هل أنت متأكد؟', () => {
    const settings = S.settings;
    S = blankState(); S.settings = settings; pos = newDraft(); save(); render(); toast('تم حذف كل البيانات');
  }, 'حذف الكل');
}

/* =========================================================
   التشغيل
   ========================================================= */
function tickClock() {
  const d = new Date();
  $('#clock').textContent = d.toLocaleDateString('ar-DZ', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · ' + fmtTime(d);
}

// مزامنة بين النوافذ المفتوحة (مثلاً شاشة المطبخ في نافذة أخرى)
window.addEventListener('storage', e => {
  if (e.key !== STORE_KEY) return;
  S = loadState();
  if (!$('#modal-root').innerHTML && !(current === 'pos' && document.activeElement?.matches('input,textarea,select'))) render();
  else updateBadges();
});

buildNav();
window.addEventListener('hashchange', route);
route();
tickClock();
setInterval(tickClock, 30000);
setInterval(() => { if (current === 'kitchen' && !$('#modal-root').innerHTML) render(); }, 20000);
