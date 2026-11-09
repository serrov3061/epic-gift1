'use strict';
/* ═══════════════ Epic Gift · Mini App для StaticGram ═══════════════ */

const tg = window.Telegram?.WebApp;
const qs = new URLSearchParams(location.search);
const INIT = tg?.initData || (qs.has('dev') ? `dev:${qs.get('dev') || 1}` : '');
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.floor(n).toLocaleString('ru-RU');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const K = 0.00006;
const multAt = (ms) => Math.max(1, Math.floor(100 * Math.exp(K * Math.max(0, ms))) / 100);
// Слабое устройство или «уменьшить движение» → без Lottie, меньше частиц
const LOW_END = (navigator.hardwareConcurrency || 8) <= 2 || (navigator.deviceMemory || 8) <= 2;
if (LOW_END) document.documentElement.classList.add('low-end');
const MAX_LOTTIE = LOW_END ? 0 : 10;
const ic = (name, cls = '') => `<svg class="ic ${cls}"><use href="#i-${name}"/></svg>`;
const STAR = ic('star', 'star');

if (tg) {
  tg.ready(); tg.expand();
  try { tg.setHeaderColor('#05040a'); tg.setBackgroundColor('#05040a'); tg.disableVerticalSwipes?.(); } catch {}
}
const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred('light'),
  mid: () => tg?.HapticFeedback?.impactOccurred('medium'),
  heavy: () => tg?.HapticFeedback?.impactOccurred('heavy'),
  ok: () => tg?.HapticFeedback?.notificationOccurred('success'),
  err: () => tg?.HapticFeedback?.notificationOccurred('error'),
  sel: () => tg?.HapticFeedback?.selectionChanged(),
};

// ═══════════════ API ═══════════════
async function api(path, body) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 20000);
  let r;
  try {
    r = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-init-data': INIT },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
  } catch (e) {
    throw new Error(e?.name === 'AbortError' ? 'Сервер не отвечает, попробуйте ещё раз' : 'Нет соединения с интернетом');
  } finally { clearTimeout(to); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Ошибка сети');
  return j;
}

// ═══════════════ Dynamic Island ═══════════════
let islT;
function island(text, kind = '', icon) {
  const el = $('#island');
  icon = icon || (kind === 'ok' ? 'check' : kind === 'err' ? 'x' : 'spark');
  $('.isl-ic', el).innerHTML = ic(icon);
  $('.isl-txt', el).textContent = text;
  el.className = `${kind}`;
  el.style.transform = ''; el.style.transition = '';
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(islT); islT = setTimeout(hideIsland, 2800);
}
function hideIsland() { clearTimeout(islT); $('#island').classList.remove('show'); }
// свайп вверх закрывает уведомление (как тосты в fastgram)
(() => {
  const el = $('#island'); let y0 = null, dy = 0;
  el.addEventListener('pointerdown', (e) => { y0 = e.clientY; dy = 0; clearTimeout(islT); el.style.transition = 'none'; el.setPointerCapture?.(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (y0 === null) return; dy = Math.min(0, e.clientY - y0); el.style.transform = `translate(-50%, ${dy}px)`; });
  const end = () => {
    if (y0 === null) return; y0 = null;
    el.style.transition = ''; el.style.transform = '';
    if (dy < -18 || dy === 0) hideIsland(); else islT = setTimeout(hideIsland, 1800);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
})();
const fail = (e) => { haptic.err(); island(e.message || String(e), 'err'); };

// ═══════════════ FX: частицы / конфетти ═══════════════
const fx = { c: $('#fx'), parts: [], run: false };
fx.ctx = fx.c.getContext('2d');
function fxResize() { const d = Math.min(2, devicePixelRatio || 1); fx.c.width = innerWidth * d; fx.c.height = innerHeight * d; fx.ctx.setTransform(d, 0, 0, d, 0, 0); }
fxResize(); addEventListener('resize', fxResize);
function burst(x, y, { n: n0 = 90, colors = ['#c4b5fd', '#a855f7', '#e879f9', '#ffc53d', '#fff'], power = 9, gravity = .28 } = {}) {
  const n = LOW_END ? Math.ceil(n0 / 3) : n0;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (.35 + Math.random()) * power;
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * .45, g: gravity, life: 1, d: .008 + Math.random() * .01,
      w: 4 + Math.random() * 6, h: 3 + Math.random() * 4, r: Math.random() * 6, vr: (Math.random() - .5) * .4, c: colors[i % colors.length], star: Math.random() < .25 });
  }
  if (!fx.run) { fx.run = true; requestAnimationFrame(fxLoop); }
}
function drawStar(ctx, r) { ctx.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * .45 : r, a = (i * Math.PI) / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill(); }
function fxLoop() {
  const { ctx } = fx;
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  fx.parts = fx.parts.filter((p) => p.life > 0);
  for (const p of fx.parts) {
    p.vx *= .985; p.vy = p.vy * .985 + p.g; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= p.d;
    ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
    if (p.star) drawStar(ctx, p.w * .8); else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1);
    ctx.restore();
  }
  if (fx.parts.length) requestAnimationFrame(fxLoop); else { fx.run = false; ctx.clearRect(0, 0, innerWidth, innerHeight); }
}
const centerOf = (el) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

// ═══════════════ Числа с анимацией ═══════════════
const tweens = new WeakMap();
function tweenNum(el, to, dur = 700) {
  to = Number.isFinite(Number(to)) ? Number(to) : 0;
  const prev = Number(el.dataset.v ?? String(el.textContent).replace(/\D/g, ''));
  const from = Number.isFinite(prev) ? prev : 0;
  el.dataset.v = to;
  cancelAnimationFrame(tweens.get(el));
  if (from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) tweens.set(el, requestAnimationFrame(step));
  };
  tweens.set(el, requestAnimationFrame(step));
}

// ═══════════════ NFT: реальные картинки + Lottie ═══════════════
const GIFT_COLORS = ['#7c3aed', '#9333ea', '#6d28d9', '#a21caf', '#4338ca'];
const giftBg = (it) => `radial-gradient(circle at 50% 32%, ${it?.color1 || GIFT_COLORS[(it?.id || 0) % 5]} 0%, ${it?.color2 || '#140a26'} 100%)`;
const initials = (t = '') => t.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
function nftMedia(it, { anim = false, cls = '' } = {}) {
  if (!it) return `<div class="nft-media ${cls}"><div class="nft-fallback">${ic('gift')}</div></div>`;
  return `<div class="nft-media ${cls}" ${anim && it.anim ? `data-anim="${it.anim}"` : ''} data-fb="${esc(initials(it.title))}" data-bg="${giftBg(it)}">
    ${it.image ? `<img src="${it.image}" alt="${esc(it.title)}" loading="lazy" decoding="async">` : `<div class="nft-fallback" style="background:${giftBg(it)}">${esc(initials(it.title))}</div>`}
  </div>`;
}
// картинка не загрузилась → монограмма коллекции
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.parentElement?.classList.contains('nft-media')) return;
  const box = img.parentElement;
  img.remove();
  if (!$('.nft-fallback', box)) box.insertAdjacentHTML('afterbegin', `<div class="nft-fallback" style="background:${box.dataset.bg || ''}">${esc(box.dataset.fb || '')}</div>`);
}, true);

const lottieData = new Map();
const lottieLive = new Set();
const lotObs = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => {
  for (const e of ents) { const a = e.target._anim; if (a) e.isIntersecting ? a.play() : a.pause(); }
}) : null;
function hydrate(root = document) {
  for (const a of lottieLive) if (!a.wrapper?.isConnected) { a.destroy(); lottieLive.delete(a); }
  if (!window.lottie || !MAX_LOTTIE) return;
  $$('.nft-media[data-anim]:not([data-hyd])', root).forEach(async (box) => {
    if (lottieLive.size >= MAX_LOTTIE) return; // остальные остаются статичной картинкой
    box.dataset.hyd = 1;
    const url = box.dataset.anim;
    try {
      if (!lottieData.has(url)) lottieData.set(url, fetch(url).then((r) => { if (!r.ok) throw 0; return r.json(); }));
      const data = await lottieData.get(url);
      if (!box.isConnected) return;
      const holder = document.createElement('div'); holder.className = 'lot'; box.appendChild(holder);
      const anim = lottie.loadAnimation({ container: holder, renderer: 'svg', loop: true, autoplay: true, animationData: structuredClone(data), rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: true, hideOnTransparent: true } });
      anim.setSubframe(false); // 30 fps вместо 60 — вдвое меньше нагрузки, на глаз не видно
      anim.addEventListener('DOMLoaded', () => box.classList.add('has-lottie'));
      lottieLive.add(anim); holder._anim = anim; lotObs?.observe(holder);
    } catch { lottieData.delete(url); }
  });
}
window.addEventListener('load', () => hydrate());

// ═══════════════ State ═══════════════
const S = {
  cfg: {}, me: null, items: [], shop: [], showcase: [], refLink: '', live: [], online: 0,
  shopLoaded: false, crash: null, offset: 0, upTarget: null, upSeg: 'items', spinning: false,
};
const orbit = (list, n, cls = () => '') => Array.from({ length: n }, (_, i) => (list[i] ? nftMedia(list[i], { anim: true, cls: cls(i) }) : `<div class="nft-media ${cls(i)}"><div class="hc-placeholder">${ic('gift')}</div></div>`)).join('');
const itemById = (id) => S.items.find((i) => i.id === id);
const avatarHtml = (name, photo, cls = '') => (photo
  ? `<div class="avatar ${cls}" style="background-image:url('${esc(photo)}')"></div>`
  : `<div class="avatar ${cls}">${esc((name || '?')[0].toUpperCase())}</div>`);

function nftCard(it, { sel = false, dim = false, chance = null, anim = false, i = 0 } = {}) {
  return `<button class="nft reveal ${sel ? 'sel' : ''} ${dim ? 'dim' : ''}" style="--i:${i};background:${giftBg(it)}" data-id="${it.id}">
    ${chance !== null ? `<span class="n-ch">${chance}</span>` : ''}${it.number ? `<span class="n-num">#${it.number}</span>` : ''}
    ${nftMedia(it, { anim: anim || sel })}
    <div class="n-name">${esc(it.title)}</div>
    <div class="n-val">${STAR}${fmt(it.value)}</div>
  </button>`;
}

// ═══════════════ Навигация ═══════════════
const ORDER = ['inventory', 'friends', 'home', 'rating', 'fair', 'rocket', 'upgrade', 'pickaxe'];
const GAME = ['rocket', 'upgrade', 'pickaxe'];
let current = 'home';
function moveInd(container, ind, active) {
  if (!active) { ind.style.opacity = 0; return; }
  ind.style.opacity = 1;
  ind.style.width = `${active.offsetWidth}px`;
  ind.style.transform = `translateX(${active.offsetLeft}px)`;
}
const REDUCED = false; // переходы включены всегда
// каскадное появление блоков экрана (из fastgram: part-in) — заходит и во вложенные списки
const STAGGER_INTO = '.steps, .grid, .hscroll, .ref-stats, .io, .podium, #invContent, .list, .actions, .fr-acc';
function stagger(root, { y = 22, dur = 560, step = 45, max = 14 } = {}) {
  if (!root.animate) return;
  const targets = [];
  [...root.children].forEach((el) => {
    if (el.hidden) return;
    if (el.matches(STAGGER_INTO) && el.children.length) targets.push(...el.children); else targets.push(el);
  });
  targets.forEach((el, i) => {
    if (el.classList?.contains('skel')) return;
    el.animate([{ opacity: 0, transform: `translateY(${y}px) scale(.96)` }, { opacity: 1, transform: 'none' }],
      { duration: dur, delay: Math.min(i, max) * step, easing: 'cubic-bezier(.16,.84,.24,1)', fill: 'backwards' });
  });
}
function go(name) {
  if (name === current || !$(`#s-${name}`)) return;
  closeSheet(true);
  haptic.tap();
  const from = $(`#s-${current}`);
  const back = ORDER.indexOf(name) < ORDER.indexOf(current);
  current = name;
  $$('.screen.leaving').forEach((s) => { s.classList.remove('leaving', 'to-right'); });
  $$('.screen').forEach((s) => {
    const on = s.id === `s-${name}`;
    s.classList.toggle('active', on); s.classList.toggle('back-anim', on && back);
  });
  // уходящий экран не исчезает мгновенно, а уезжает в сторону
  if (from && !REDUCED) {
    from.classList.add('leaving'); from.classList.toggle('to-right', back);
    setTimeout(() => from.classList.remove('leaving', 'to-right'), 300);
  }
  stagger($(`#s-${name}`));
  const tb = $(`.tabbar [data-tab="${name}"] .ic`); tb?.animate?.([{ transform: 'scale(.7) translateY(4px)' }, { transform: 'translateY(-1px) scale(1.18)', offset: .55 }, { transform: 'translateY(-1px) scale(1.08)' }], { duration: 480, easing: 'cubic-bezier(.34,1.56,.64,1)' });
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  moveInd($('#tabbar'), $('#tabInd'), $(`.tabbar [data-tab="${name}"]`));
  const isGame = GAME.includes(name);
  $('#navBack').hidden = !isGame;
  if (tg) isGame ? tg.BackButton.show() : tg.BackButton.hide();
  scrollTo(0, 0);
  if (name === 'rating') loadRating();
  if (name === 'upgrade') { loadShop(); requestAnimationFrame(() => moveInd($('#upSeg'), $('#upSeg .seg-ind'), $('#upSeg .active'))); }
  if (name === 'inventory') renderInventory();
  if (name === 'fair') { renderFairLive(); if (F.loaded) renderFair(); loadFair(F.loaded); }
  if (name === 'rocket') { resizeCanvas(); renderBets(); }
  if (name === 'pickaxe') pkResize();
  if (name === 'fair') renderPkFair();
  hydrate();
}
$$('.tabbar button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
const goBack = () => { if ($('#sheetRoot').firstChild) closeSheet(); else go('home'); };
$('#navBack').addEventListener('click', goBack);
tg?.BackButton.onClick(goBack);
addEventListener('resize', () => { moveInd($('#tabbar'), $('#tabInd'), $('.tabbar .active')); moveInd($('#upSeg'), $('#upSeg .seg-ind'), $('#upSeg .active')); });

// ═══════════════ Профиль / баланс ═══════════════
function renderMe() {
  const u = S.me; if (!u) return;
  tweenNum($('#meBalance'), u.balance);
  const av = $('#meAvatar');
  if (u.photo) { av.style.backgroundImage = `url('${u.photo}')`; av.textContent = ''; } else av.textContent = (u.name || '?')[0].toUpperCase();
  tweenNum($('#refCount'), u.refs); tweenNum($('#refEarned'), u.refEarned);
  $('#refLinkText').textContent = S.refLink;
}
function setBalance(b) {
  if (!S.me) return;
  if (b > S.me.balance) { const el = $('.me-value'); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  S.me.balance = b; tweenNum($('#meBalance'), b);
}
async function loadMe() {
  const r = await api('/api/me');
  S.me = r.user; S.items = r.items; S.refLink = r.refLink;
  renderMe(); renderInventory(); renderUpgrade();
}
async function loadShop() {
  try { S.shop = await api('/api/shop'); S.shopLoaded = true; renderUpgrade(); renderShowcase(); } catch (e) { fail(e); }
}

// ═══════════════ Bottom sheet ═══════════════
let sheetGen = 0;
function openSheet(html, onMount) {
  closeSheet(true);
  sheetGen++;
  const root = $('#sheetRoot');
  root.innerHTML = `<div class="backdrop"></div><div class="sheet"><div class="grabber"></div>${html}</div>`;
  $('.backdrop', root).addEventListener('click', () => closeSheet());
  const sheet = $('.sheet', root);
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', (e) => { if (sheet.scrollTop <= 0 && !e.target.closest('input')) { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; } }, { passive: true });
  sheet.addEventListener('touchmove', (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translate(-50%, ${dy}px)`; }, { passive: true });
  const endDrag = () => {
    if (y0 === null) return; y0 = null; sheet.style.transition = 'transform .4s cubic-bezier(.2,1.25,.35,1)';
    if (dy > 110) closeSheet(); else sheet.style.transform = ''; dy = 0;
  };
  sheet.addEventListener('touchend', endDrag); sheet.addEventListener('touchcancel', endDrag);
  onMount?.(sheet);
  stagger(sheet, { y: 16, dur: 480, step: 40, max: 8 });
  hydrate(sheet);
  return sheet;
}
function closeSheet(instant) {
  const root = $('#sheetRoot');
  if (!root.firstChild) return;
  if (instant) { sheetGen++; root.innerHTML = ''; hydrate(); return; }
  const gen = ++sheetGen;
  $$('.sheet, .backdrop', root).forEach((el) => { el.style.transform = ''; el.style.transition = ''; el.classList.add('closing'); });
  // если за это время открыли новую шторку — её не трогаем
  setTimeout(() => { if (gen !== sheetGen) return; root.innerHTML = ''; hydrate(); }, 280);
}
function segmented(sheet, sel, onPick, initial) {
  const box = $(sel, sheet);
  const pick = (v) => {
    $$('button', box).forEach((b) => b.classList.toggle('active', b.dataset.v === v));
    moveInd(box, $('.seg-ind', box), $('.active', box)); onPick(v);
  };
  $$('button', box).forEach((b) => b.addEventListener('click', () => { haptic.sel(); pick(b.dataset.v); }));
  requestAnimationFrame(() => pick(initial));
}

// ═══════════════ Кошелёк ═══════════════
function openWallet(tab = 'stars') {
  haptic.tap();
  const presets = [50, 100, 250, 500, 1000, 2500];
  openSheet(`
    <h3>Кошелёк</h3>
    <div class="segmented" id="wSeg" style="margin-top:14px"><i class="seg-ind"></i>
      <button data-v="stars">Звёзды</button><button data-v="nft">NFT</button><button data-v="out">Вывод</button>
    </div>
    <div id="wBody"></div>`, (sheet) => {
    const body = $('#wBody', sheet);
    segmented(sheet, '#wSeg', (w) => {
      body.innerHTML = '';
      body.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'ease-out' });
      if (w === 'stars') {
        body.innerHTML = `
          <p class="sub">Оплата звёздами StaticGram · зачисление мгновенно</p>
          <div class="presets">${presets.map((p) => `<button data-p="${p}">${STAR}${fmt(p)}</button>`).join('')}</div>
          <label class="amount-input">${STAR}<input id="wAmount" type="number" inputmode="numeric" value="100"></label>
          <button class="btn-main" id="wPay">${ic('wallet')}<span>Пополнить</span><i class="shine"></i></button>`;
        const inp = $('#wAmount', body);
        $$('.presets button', body).forEach((b) => b.addEventListener('click', () => {
          haptic.sel(); inp.value = b.dataset.p;
          $$('.presets button', body).forEach((x) => x.classList.toggle('active', x === b));
        }));
        $('#wPay', body).addEventListener('click', async (e) => {
          const btn = e.currentTarget; btn.disabled = true;
          try {
            const { link } = await api('/api/deposit', { amount: Number(inp.value) });
            if (tg?.openInvoice) {
              tg.openInvoice(link, (status) => {
                if (status === 'paid') { haptic.ok(); burst(innerWidth / 2, innerHeight * .4); island('Звёзды зачислены', 'ok'); closeSheet(); setTimeout(() => loadMe().catch(() => {}), 1200); }
                else if (status === 'failed') island('Оплата не прошла', 'err');
              });
            } else open(link, '_blank');
          } catch (err) { fail(err); } finally { btn.disabled = false; }
        });
      } else if (w === 'nft') {
        const r = S.cfg.relayer;
        body.innerHTML = `
          <div class="empty" style="background:none;border:0;padding:10px 4px 0">
            <div class="empty-orbit">${orbit(S.showcase, 3)}</div>
            <h3>Закиньте NFT-подарок</h3>
            <p>Отправьте улучшенный подарок на ${r ? `<span class="accent">@${esc(r)}</span>` : 'аккаунт-ретранслятор'} — он появится в инвентаре автоматически за ~20 секунд.</p>
            ${r ? `<button class="btn-main" id="wRelayer">${ic('send')}<span>Отправить подарок</span><i class="shine"></i></button>` : ''}
          </div>`;
        $('#wRelayer', body)?.addEventListener('click', () => openLink(`https://staticgram.top/${r}`));
        hydrate(body);
      } else {
        api('/api/me').then((r) => { S.me = r.user; if ($('#wOut', body) && r.user.wagerLeft > 0 && !$('.wager-note', body)) $('.sub', body).insertAdjacentHTML('afterend', `<div class="wager-note">${ic('clock')}<div><b>Отыграйте ещё ${fmt(r.user.wagerLeft)} ⭐</b><small>Пополнения и бонусы нужно один раз прокрутить в ставках — так мы защищаемся от отмыва</small></div></div>`); }).catch(() => {});
        body.innerHTML = `
          <p class="sub">Вывод на ваш аккаунт StaticGram · от ${fmt(S.cfg.minWithdraw)} ⭐${S.cfg.withdrawDaily > 0 ? ` · до ${fmt(S.cfg.withdrawDaily)} ⭐ в сутки` : ''}</p>
          ${S.me?.wagerLeft > 0 ? `<div class="wager-note">${ic('clock')}<div><b>Отыграйте ещё ${fmt(S.me.wagerLeft)} ⭐</b><small>Пополнения и бонусы нужно один раз прокрутить в ставках — так мы защищаемся от отмыва</small></div></div>` : ''}
          <label class="amount-input">${STAR}<input id="wOut" type="number" inputmode="numeric" value="${S.cfg.minWithdraw}"></label>
          <div class="quick"><button id="wMax">Весь баланс · ${fmt(S.me?.balance || 0)}</button></div>
          <button class="btn-main" id="wOutGo">${ic('out')}<span>Вывести</span><i class="shine"></i></button>
          <p class="sub" style="margin-top:14px">NFT выводятся из инвентаря — нажмите на подарок</p>`;
        $('#wMax', body).addEventListener('click', () => { haptic.sel(); $('#wOut', body).value = S.me?.balance || 0; });
        $('#wOutGo', body).addEventListener('click', async (e) => {
          const btn = e.currentTarget; btn.disabled = true;
          try {
            const r = await api('/api/withdraw', { amount: Number($('#wOut', body).value) });
            setBalance(r.balance); loadMe().catch(() => {}); haptic.ok();
            island(r.pending ? 'Заявка отправлена — ждите подтверждения' : 'Звёзды отправлены', 'ok', r.pending ? 'clock' : 'send'); closeSheet();
          } catch (err) { fail(err); } finally { btn.disabled = false; }
        });
      }
    }, tab);
  });
}
$('#btnDeposit').addEventListener('click', () => openWallet('stars'));
function openLink(url) { tg?.openTelegramLink ? tg.openTelegramLink(url) : open(url, '_blank'); }

// ═══════════════ Главная ═══════════════
function renderLive() {
  const el = $('#liveList');
  if (!S.live.length) { el.innerHTML = `<div class="live-empty">${ic('spark')}Здесь появятся крупные выигрыши</div>`; return; }
  el.innerHTML = S.live.map((e) => {
    if (e.kind === 'pickaxe') return `<div class="live-item rk" style="background:radial-gradient(circle at 50% 30%,#10b981,#1e1036)">${ic('pick')}<span>x${e.m}</span></div>`;
    if (e.kind === 'upgrade' && e.item) return `<div class="live-item" style="background:${giftBg(e.item)}">${nftMedia(e.item)}<span>${Math.round(e.chance * 100)}%</span></div>`;
    if (e.kind === 'upgrade') return `<div class="live-item rk">${ic('up')}<span>+${fmt(e.stars)}</span></div>`;
    return `<div class="live-item rk">${ic('rocket')}<span>x${e.m.toFixed(2)}</span></div>`;
  }).join('');
}
function renderShowcase() {
  const top = [...S.shop].sort((a, b) => b.value - a.value);
  if (top.length) S.showcase = top;
  const box = $('#homeShowcase');
  box.innerHTML = S.showcase.length
    ? S.showcase.slice(0, 10).map((it, i) => nftCard(it, { anim: i < 6, i })).join('')
    : S.shopLoaded
      ? `<div class="shop-empty reveal">${ic('gift')}<div><b>Призы скоро появятся</b><small>Пока можно улучшать звёзды через множитель</small></div></div>`
      : Array.from({ length: 4 }, () => '<div class="skel" style="flex:none;width:128px;height:168px"></div>').join('');
  const hero = S.showcase[0];
  const hc = $('#hcNft');
  if (!hero && !hc.innerHTML.trim()) hc.innerHTML = `<div class="hc-placeholder">${ic('gift')}</div>`;
  if (hero && hc.dataset.id !== String(hero.id)) { hc.outerHTML = nftMedia(hero, { anim: true, cls: 'hc-nft' }).replace('class="nft-media', 'id="hcNft" data-id="' + hero.id + '" class="nft-media'); }
  hydrate();
}
$('#homeShowcase').addEventListener('click', (e) => {
  const el = e.target.closest('[data-id]'); if (!el) return;
  e.stopPropagation();
  S.upSeg = 'items'; S.upTarget = { type: 'item', id: Number(el.dataset.id) };
  $$('#upSeg button').forEach((b) => b.classList.toggle('active', b.dataset.seg === 'items'));
  go('upgrade');
});

// ═══════════════ РАКЕТКА ═══════════════
const canvas = $('#rkCanvas');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
const layers = [0.25, 0.55, 1].map((depth) => Array.from({ length: LOW_END ? 14 : 40 }, () => ({ x: Math.random(), y: Math.random(), r: (Math.random() * 1.1 + .3) * depth + .2, d: depth, tw: Math.random() * 6 })));
const smoke = [];
function resizeCanvas() {
  DPR = Math.min(LOW_END ? 1.25 : 2, devicePixelRatio || 1);
  W = canvas.clientWidth; H = canvas.clientHeight;
  canvas.width = W * DPR; canvas.height = H * DPR;
}
addEventListener('resize', resizeCanvas);
const sNow = () => Date.now() + S.offset;
const myBet = () => S.crash?.bets.find((b) => b.uid === S.me?.id);
const hClass = (m) => (m < 1.5 ? 'h-low' : m < 3 ? 'h-mid' : m < 10 ? 'h-high' : 'h-top');
const multColor = (m) => (m < 2 ? '#ffffff' : m < 5 ? '#c4b5fd' : m < 10 ? '#f0abfc' : '#fde68a');
let seenBets = new Set(), seenRound = 0, lastHist = '';

function onCrashState(st) {
  const prev = S.crash;
  S.offset = st.serverNow - Date.now();
  S.crash = st;
  if (prev && prev.phase !== st.phase) {
    if (st.phase === 'crashed' && current === 'rocket') {
      haptic.heavy();
      const stage = $('#rkStage'); stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
      const b = myBet(); if (b && !b.cashout) haptic.err();
    }
    if (st.phase === 'flying' && current === 'rocket') haptic.mid();
  }
  const h = st.history.join(',');
  if (h !== lastHist) {
    const isNew = lastHist !== '';
    lastHist = h;
    $('#rkHistory').innerHTML = st.history.map((m, i) => `<span class="hchip ${hClass(m)} ${i === 0 && isNew ? 'new' : ''}">${m.toFixed(2)}x</span>`).join('');
  }
  if (st.roundId !== seenRound) { seenRound = st.roundId; seenBets = new Set(); }
  scheduleBets();
  if (current === 'fair') { renderFairLive(); if (prev && prev.phase !== 'crashed' && st.phase === 'crashed') setTimeout(() => loadFair(true), 400); }
  $('#rkFair').textContent = st.phase === 'crashed'
    ? `Раунд #${st.roundId} · seed ${st.seed} · краш = HMAC_SHA256(seed, "epic-gift-rocket")`
    : `Раунд #${st.roundId} · hash ${st.hash}`;
}
function onCrashDelta(m) {
  const st = S.crash; if (!st || m.roundId !== st.roundId) return;
  for (const b of m.bets) if (!st.bets.some((x) => x.uid === b.uid)) st.bets.push(b);
  for (const c of m.cash) { const b = st.bets.find((x) => x.uid === c.uid); if (b) { b.cashout = c.cashout; b.payout = c.payout; } }
  st.bets.sort((a, b) => b.value - a.value);
  st.betsTotal = Math.max(m.betsTotal || 0, st.bets.length);
  scheduleBets();
}
let betsRaf = 0;
const scheduleBets = () => { if (!betsRaf) betsRaf = requestAnimationFrame(() => { betsRaf = 0; renderBets(); }); };
const BETS_SHOWN = 40;
function renderBets() {
  const st = S.crash; if (!st || current !== 'rocket') return;
  const live = st.phase === 'flying' ? multAt(sNow() - st.startAt) : 0;
  tweenNum($('#rkBetsCount'), st.betsTotal || st.bets.length, 300);
  const mine = myBet();
  const shown = st.bets.slice(0, BETS_SHOWN);
  if (mine && !shown.includes(mine)) shown.unshift(mine); // свою ставку видно всегда
  const more = (st.betsTotal || st.bets.length) - shown.length;
  $('#rkBets').innerHTML = shown.length ? shown.map((b) => {
    const won = !!b.cashout, lost = st.phase === 'crashed' && !b.cashout;
    const fresh = !seenBets.has(b.uid); seenBets.add(b.uid);
    const right = won ? `<small>x${b.cashout.toFixed(2)} · +${fmt(b.payout)}</small>`
      : lost ? '<small>сгорело</small>' : st.phase === 'flying' ? `<small>${fmt(b.value * live)}</small>` : '<small>в игре</small>';
    return `<div class="bet ${fresh ? 'enter' : ''} ${won ? 'won' : ''} ${lost ? 'lost' : ''}">
      ${avatarHtml(b.name, b.photo)}
      <div class="b-mid"><b>${esc(b.name)}${b.uid === S.me?.id ? '<span class="you">ВЫ</span>' : ''}</b><small>ставка ${STAR}${fmt(b.value)}</small></div>
      <div class="b-right"><b>${STAR}${fmt(won ? b.payout : b.value)}</b>${right}</div></div>`;
  }).join('') + (more > 0 ? `<div class="empty-row">и ещё ${fmt(more)} ставок</div>` : '') : '<div class="empty-row">Пока никто не поставил — будь первым</div>';
}
const betInput = $('#betAmount');
const cleanInt = (el) => { el.value = String(Math.max(0, Math.floor(Number(el.value) || 0))); };
betInput.addEventListener('blur', () => cleanInt(betInput));
$('#upAmount').addEventListener('blur', () => { const v = $('#upAmount').value; cleanInt($('#upAmount')); if ($('#upAmount').value !== v) renderUpgrade(); });
$$('#s-rocket .round-btn').forEach((b) => b.addEventListener('click', () => { haptic.sel(); betInput.value = Math.max(0, (Number(betInput.value) || 0) + Number(b.dataset.step)); }));
$$('#s-rocket .quick [data-q]').forEach((b) => b.addEventListener('click', () => {
  haptic.sel(); const v = Number(betInput.value) || 0, q = b.dataset.q, bal = S.me?.balance || 0;
  betInput.value = q === 'half' ? Math.floor(v / 2) : q === 'x2' ? Math.min(bal, v * 2) : q === 'max' ? bal : Math.min(bal, v + Number(q));
}));
$('#rkAction').addEventListener('click', async (e) => {
  const st = S.crash; if (!st) return;
  const b = myBet(), btn = e.currentTarget;
  try {
    if (st.phase === 'betting' && !b) {
      btn.disabled = true;
      await api('/api/crash/bet', { amount: Number(betInput.value) || 0, auto: $('#autoOn').checked ? Number($('#autoValue').value) : null });
      haptic.ok();
    } else if (st.phase === 'flying' && b && !b.cashout) {
      btn.disabled = true;
      const r = await api('/api/crash/cashout', {});
      haptic.ok(); burst(...centerOf(btn), { n: 60, colors: ['#34d399', '#6ee7b7', '#ffc53d', '#fff'] });
      island(`+${fmt(r.payout)} на x${r.cashout.toFixed(2)}`, 'ok', 'star');
    }
  } catch (err) { fail(err); } finally { btn.disabled = false; }
});
function updateAction() {
  const st = S.crash, btn = $('#rkAction'); if (!st) return;
  const b = myBet(); let text, cls = '';
  if (st.phase === 'betting') { if (b) { text = `Ставка ${fmt(b.value)} принята`; cls = 'wait'; } else text = 'Сделать ставку'; }
  else if (st.phase === 'flying') {
    const mNow = multAt(sNow() - st.startAt), mMin = st.crashMin || 1;
    if (b && !b.cashout && mNow <= mMin) { text = `Забрать можно после ${mMin.toFixed(2)}x`; cls = 'wait'; }
    else if (b && !b.cashout) { text = `Забрать ${fmt(b.value * mNow)}`; cls = 'green'; }
    else if (b) { text = `Выведено x${b.cashout.toFixed(2)} · +${fmt(b.payout)}`; cls = 'wait'; }
    else { text = 'Раунд идёт — ждите следующий'; cls = 'wait'; }
  } else text = 'Следующий раунд…', cls = 'wait';
  const span = $('span', btn);
  if (span.textContent !== text) span.textContent = text;
  const want = `btn-main ${cls}`; if (btn.className !== want) btn.className = want;
}

function drawRocket(x, y, angle, s = 1, t = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(s, s);
  const fl = 16 + Math.sin(t / 40) * 4 + Math.random() * 6;
  let g = ctx.createLinearGradient(-20 - fl * 1.6, 0, -14, 0);
  g.addColorStop(0, 'rgba(232,121,249,0)'); g.addColorStop(.45, 'rgba(255,182,39,.95)'); g.addColorStop(1, '#fff8d6');
  ctx.fillStyle = g; ctx.shadowColor = '#ffb627'; ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.moveTo(-14, -6.5); ctx.quadraticCurveTo(-22 - fl * 1.6, 0, -14, 6.5); ctx.fill(); ctx.shadowBlur = 0;
  const body = ctx.createLinearGradient(0, -11, 0, 11);
  body.addColorStop(0, '#ffffff'); body.addColorStop(1, '#c9bfe6');
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(24, 0); ctx.bezierCurveTo(17, -11, -4, -11, -15, -8.5); ctx.lineTo(-15, 8.5); ctx.bezierCurveTo(-4, 11, 17, 11, 24, 0); ctx.fill();
  ctx.fillStyle = '#a855f7';
  ctx.beginPath(); ctx.moveTo(24, 0); ctx.bezierCurveTo(21, -6, 16, -8.6, 13, -9.2); ctx.lineTo(13, 9.2); ctx.bezierCurveTo(16, 8.6, 21, 6, 24, 0); ctx.fill();
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath(); ctx.moveTo(-6, -8.5); ctx.lineTo(-17, -19); ctx.lineTo(-15, -7.5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-6, 8.5); ctx.lineTo(-17, 19); ctx.lineTo(-15, 7.5); ctx.fill();
  ctx.fillStyle = '#1e1236'; ctx.strokeStyle = '#c4b5fd'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(5, 0, 4.8, 0, 6.28); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(3.6, -1.6, 1.4, 0, 6.28); ctx.fill();
  ctx.restore();
}

let boom = null, lastInt = 1;
function frame(t) {
  requestAnimationFrame(frame);
  const st = S.crash;
  if (!st || current !== 'rocket' || document.hidden) return;
  if (!W) resizeCanvas();
  const now = sNow();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const flying = st.phase === 'flying', crashed = st.phase === 'crashed';
  const elapsed = flying ? now - st.startAt : crashed ? Math.log(st.crash) / K : 0;
  const m = flying ? multAt(elapsed) : crashed ? st.crash : 1;
  const speed = flying ? Math.min(5, .8 + Math.log(m) * 1.3) : .08;

  // звёзды (3 слоя параллакса) + линии скорости
  for (const L of layers) for (const s of L) {
    s.x -= .0012 * s.d * speed; s.y += .0007 * s.d * speed;
    if (s.x < 0) { s.x += 1; s.y = Math.random(); } if (s.y > 1) s.y -= 1;
    const a = .35 + .4 * Math.sin(t / 500 + s.tw);
    ctx.fillStyle = `rgba(230,220,255,${a * s.d + .1})`;
    if (flying && speed > 2 && s.d === 1) {
      ctx.strokeStyle = `rgba(196,181,253,${a * .5})`; ctx.lineWidth = s.r;
      ctx.beginPath(); ctx.moveTo(s.x * W, s.y * H); ctx.lineTo(s.x * W + speed * 6, s.y * H - speed * 3.5); ctx.stroke();
    } else { ctx.beginPath(); ctx.arc(s.x * W, s.y * H, s.r, 0, 6.28); ctx.fill(); }
  }
  // сетка
  const pad = 26, gw = W - pad * 2 - 34, gh = H - pad * 2 - 40;
  ctx.strokeStyle = 'rgba(196,181,253,.06)'; ctx.lineWidth = 1;
  const gOff = flying ? (elapsed / 30) % 40 : 0;
  for (let x = pad - gOff; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = H - pad; y > 0; y -= 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

  const xMax = Math.max(elapsed, 8000) * 1.06, yMax = Math.max(m, 2) * 1.1;
  const P = (tt) => [pad + (tt / xMax) * gw, H - pad - ((multAt(tt) - 1) / (yMax - 1)) * gh];
  let tip = [pad + 10, H - pad - 4], ang = -.5;
  if (elapsed > 0) {
    const pts = []; for (let i = 0; i <= 70; i++) pts.push(P((elapsed * i) / 70));
    tip = pts[pts.length - 1];
    const pv = pts[pts.length - 5] || pts[0];
    ang = Math.atan2(tip[1] - pv[1], tip[0] - pv[0]);
    const fill = ctx.createLinearGradient(0, tip[1], 0, H - pad);
    fill.addColorStop(0, crashed ? 'rgba(251,113,133,.18)' : 'rgba(168,85,247,.42)'); fill.addColorStop(1, 'rgba(124,58,237,0)');
    ctx.beginPath(); ctx.moveTo(pad, H - pad); pts.forEach(([x, y]) => ctx.lineTo(x, y)); ctx.lineTo(tip[0], H - pad); ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    const lg = ctx.createLinearGradient(pad, 0, tip[0], 0);
    lg.addColorStop(0, crashed ? 'rgba(251,113,133,.3)' : '#6366f1'); lg.addColorStop(1, crashed ? '#fb7185' : '#e879f9');
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = lg; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.shadowColor = crashed ? '#fb7185' : '#a855f7'; ctx.shadowBlur = crashed ? 4 : 18; ctx.stroke(); ctx.shadowBlur = 0;
  }
  // дым за ракетой
  if (flying && smoke.length < (LOW_END ? 25 : 80) && Math.random() < .9) smoke.push({ x: tip[0] - Math.cos(ang) * 18, y: tip[1] - Math.sin(ang) * 18, r: 3 + Math.random() * 3, a: .5, vx: -Math.cos(ang) * 1.2 + (Math.random() - .5), vy: -Math.sin(ang) * 1.2 + (Math.random() - .5) });
  for (let i = smoke.length - 1; i >= 0; i--) {
    const p = smoke[i]; p.x += p.vx - speed * .5; p.y += p.vy + speed * .2; p.r += .35; p.a -= .012;
    if (p.a <= 0) { smoke.splice(i, 1); continue; }
    ctx.fillStyle = `rgba(196,181,253,${p.a * .45})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.fill();
  }
  if (crashed) {
    if (!boom || boom.round !== st.roundId) {
      boom = { round: st.roundId, t0: t, parts: Array.from({ length: 60 }, () => ({ a: Math.random() * 6.28, v: .6 + Math.random() * 4, c: ['#fb7185', '#ffb627', '#e879f9', '#fff', '#a855f7'][Math.random() * 5 | 0], s: 1 + Math.random() * 3 })) };
    }
    const k = Math.min(1, (t - boom.t0) / 1100);
    if (k < .25) { ctx.fillStyle = `rgba(255,240,255,${(.25 - k) * 1.6})`; ctx.fillRect(0, 0, W, H); }
    const rg = ctx.createRadialGradient(tip[0], tip[1], 0, tip[0], tip[1], 70 * k + 10);
    rg.addColorStop(0, `rgba(255,200,120,${.8 * (1 - k)})`); rg.addColorStop(1, 'rgba(251,113,133,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(tip[0], tip[1], 70 * k + 10, 0, 6.28); ctx.fill();
    for (const p of boom.parts) {
      ctx.globalAlpha = 1 - k; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(tip[0] + Math.cos(p.a) * p.v * k * 46, tip[1] + Math.sin(p.a) * p.v * k * 46 + k * k * 30, p.s * (1 - k) + .5, 0, 6.28); ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    const bob = st.phase === 'betting' ? Math.sin(t / 280) * 3 : Math.sin(t / 60) * .8;
    drawRocket(tip[0] + 8, tip[1] - 8 + bob, flying ? ang : -.55, 1.3, t);
  }
  // HUD
  const hud = $('#rkHud'); hud.classList.toggle('flying', flying); hud.classList.toggle('crashed', crashed);
  const mEl = $('#rkMult');
  if (st.phase === 'betting') {
    const left = Math.max(0, st.betEndsAt - now);
    mEl.textContent = Math.ceil(left / 1000); mEl.style.color = '#fff';
    $('#rkSub').textContent = 'Старт через';
    $('#rkRing').style.strokeDashoffset = 276.5 * (1 - left / (st.betMs || 8000));
    lastInt = 1;
  } else if (flying) {
    mEl.textContent = `${m.toFixed(2)}x`; mEl.style.color = multColor(m);
    if (Math.floor(m) > lastInt) { lastInt = Math.floor(m); mEl.classList.remove('pop'); void mEl.offsetWidth; mEl.classList.add('pop'); haptic.sel(); }
  } else { mEl.textContent = `${st.crash.toFixed(2)}x`; mEl.style.color = ''; $('#rkSub').textContent = 'Улетела'; }
  updateAction();
  if (flying && Math.floor(now / 400) !== frame.tick) { frame.tick = Math.floor(now / 400); renderBets(); }
}
requestAnimationFrame(frame);

// ═══════════════ УЛУЧШЕНИЕ ═══════════════
const C = 2 * Math.PI * 104;
$('#upTicks').innerHTML = Array.from({ length: 72 }, (_, i) => {
  const a = (i / 72) * Math.PI * 2, major = i % 6 === 0, r1 = 118, r2 = major ? 127 : 123;
  return `<line class="${major ? 'major' : ''}" x1="${130 + Math.sin(a) * r1}" y1="${130 - Math.cos(a) * r1}" x2="${130 + Math.sin(a) * r2}" y2="${130 - Math.cos(a) * r2}"/>`;
}).join('');
const upInputValue = () => Number($('#upAmount').value) || 0;
// та же формула, что на сервере (upgradeEdge в src/upgrade.js): для крупных выплат шанс ниже
const upEdge = (input, target) => {
  const c = S.cfg, base = c.upgradeEdge ?? .10;
  if (!(input > 0) || !(target > input)) return base;
  const big = Math.min(c.bigMax ?? .25, .05 * Math.log2(1 + (target - input) / (c.bigStep ?? 20000)));
  const m = target / input;
  const mult = m > 5 ? Math.min(c.multMax ?? .1, .03 * (Math.log2(m / 5) + 1)) : 0;
  return Math.min(.6, base + big + mult);
};
const chanceFor = (input, target) => (!(input > 0) || !(target > input) ? 0 : (input / target) * (1 - upEdge(input, target)));
const overPayout = (v) => (S.cfg.maxPayout > 0 && v > S.cfg.maxPayout);
const pct = (c) => (!c ? '0%' : (c * 100 >= 10 ? Math.round(c * 100) : (c * 100).toFixed(1)) + '%');
function targetValue() {
  const t = S.upTarget, input = upInputValue(); if (!t) return 0;
  return t.type === 'mult' ? Math.floor(input * t.mult) : S.shop.find((i) => i.id === t.id)?.value || 0;
}
let coreKey = '';
function renderUpgrade(gridToo = true) {
  const input = upInputValue();
  tweenNum($('#upInputValue'), input, 400);
  const maxC = S.cfg.maxChance ?? .80, minC = S.cfg.minChance ?? .01, ok = (c) => c >= minC && c <= maxC;
  if (gridToo) {
    const grid = $('#upTargets');
    if (S.upSeg === 'items') {
      if (S.upTarget?.type === 'item' && S.shop.length && !S.shop.some((i) => i.id === S.upTarget.id)) S.upTarget = null;
      grid.innerHTML = S.shop.length ? S.shop.map((it, i) => {
        const c = chanceFor(input, it.value);
        return nftCard(it, { sel: S.upTarget?.type === 'item' && S.upTarget.id === it.id, dim: input > 0 && !ok(c), chance: input > 0 && c > 0 ? pct(Math.min(c, maxC)) : null, i });
      }).join('') : S.shopLoaded
        ? `<div class="shop-empty" style="grid-column:1/-1">${ic('gift')}<div><b>На складе пока нет NFT</b><small>Выбери вкладку «Множитель» — выигрыш звёздами</small></div></div>`
        : Array.from({ length: 6 }, () => '<div class="skel" style="aspect-ratio:.8"></div>').join('');
    } else {
      grid.innerHTML = (S.cfg.multipliers || []).map((mu, i) => {
        const c = input > 0 ? chanceFor(input, input * mu) : (1 - (S.cfg.upgradeEdge ?? .10)) / mu;
        return `<button class="nft mult reveal ${S.upTarget?.type === 'mult' && S.upTarget.mult === mu ? 'sel' : ''} ${ok(c) && !overPayout(input * mu) ? '' : 'dim'}" style="--i:${i}" data-mult="${mu}">
          <b>x${mu}</b><small>${pct(c)} · ${STAR}${fmt(input * mu)}</small></button>`;
      }).join('');
    }
    hydrate($('#upTargets'));
  }
  if (S.spinning) return;
  const tv = targetValue(), c = S.upTarget ? chanceFor(input, tv) : 0;
  $('#upArc').style.strokeDasharray = `${C * Math.min(c, 1)} ${C}`;
  $('#upChance').textContent = pct(Math.min(c, maxC));
  tweenNum($('#upTargetValue'), tv, 400);
  const t = S.upTarget, key = t ? `${t.type}:${t.id || t.mult}` : '';
  if (key !== coreKey) {
    coreKey = key;
    const core = $('#upTargetImg');
    if (t?.type === 'item') {
      const it = S.shop.find((i) => i.id === t.id);
      core.outerHTML = nftMedia(it, { anim: true, cls: 'core-nft swap' }).replace('class="nft-media', 'id="upTargetImg" class="nft-media');
      $('#upTargetName').textContent = it ? `${it.title} #${it.number || ''}` : '—';
    } else if (t?.type === 'mult') {
      core.outerHTML = `<div class="nft-media core-nft swap" id="upTargetImg"><span class="core-mult grad-text">x${t.mult}</span></div>`;
    } else {
      core.outerHTML = `<div class="nft-media core-nft" id="upTargetImg"><div class="core-empty">${ic('gift')}</div></div>`;
      $('#upTargetName').textContent = '—';
    }
    hydrate($('.wheel'));
  }
  if (t?.type === 'mult') $('#upTargetName').innerHTML = `${fmt(tv)} ${STAR}`;
  $('#upSub').textContent = !t ? 'Выберите цель внизу' : !input ? 'Введите ставку в звёздах' : c > maxC ? `Максимальный шанс ${pct(maxC)}` : c < minC ? 'Шанс слишком мал' : 'шанс улучшения';
  const tooBig = t?.type === 'mult' && overPayout(tv);
  if (tooBig) $('#upSub').textContent = `Максимальный выигрыш ${fmt(S.cfg.maxPayout)} ⭐`;
  $('#upGo').disabled = !(t && input > 0 && ok(c)) || tooBig;
}
$('#upAmount').addEventListener('input', () => renderUpgrade());
$$('#upSeg button').forEach((b) => b.addEventListener('click', () => {
  if (S.spinning) return;
  haptic.sel(); S.upSeg = b.dataset.seg; S.upTarget = null;
  $$('#upSeg button').forEach((x) => x.classList.toggle('active', x === b));
  moveInd($('#upSeg'), $('#upSeg .seg-ind'), b);
  renderUpgrade();
}));
$('#upTargets').addEventListener('click', (e) => {
  if (S.spinning) return;
  const el = e.target.closest('[data-id],[data-mult]'); if (!el) return;
  haptic.sel();
  S.upTarget = el.dataset.mult ? { type: 'mult', mult: Number(el.dataset.mult) } : { type: 'item', id: Number(el.dataset.id) };
  $$('#upTargets .sel').forEach((x) => x.classList.remove('sel')); el.classList.add('sel');
  renderUpgrade(false);
  scrollTo({ top: 0, behavior: 'smooth' });
});
$('#upGo').addEventListener('click', async () => {
  if (S.spinning) return;
  const btn = $('#upGo'); btn.disabled = true; S.spinning = true;
  const wheel = $('#upWheel'); wheel.classList.remove('win', 'lose');
  const ptr = $('#upPointer');
  ptr.style.transition = 'none'; ptr.style.transform = 'rotate(0deg)'; ptr.getBoundingClientRect();
  try {
    S.heldBalance = null;
    const r = await api('/api/upgrade', { amount: Number($('#upAmount').value) || 0, target: S.upTarget });
    // пока крутится — показываем только списание ставки, выигрыш раскрываем в конце
    if (S.me) { S.me.balance -= r.inputValue; tweenNum($('#meBalance'), S.me.balance, 400); }
    haptic.heavy(); wheel.classList.add('spinning');
    $('#upArc').style.strokeDasharray = `${C * r.chance} ${C}`;
    $('#upChance').textContent = pct(r.chance);
    $('#upSub').textContent = 'Крутим…';
    ptr.style.transition = 'transform 4.6s cubic-bezier(.1,.7,.12,1)';
    ptr.style.transform = `rotate(${360 * 7 + r.roll * 360}deg)`;
    const ticker = setInterval(haptic.sel, 110); setTimeout(() => clearInterval(ticker), 3400);
    await sleep(4750);
    clearInterval(ticker);
    wheel.classList.remove('spinning'); wheel.classList.add(r.win ? 'win' : 'lose');
    $('#upSub').textContent = r.win ? 'Успех!' : 'Не повезло';
    if (r.win) { haptic.ok(); burst(...centerOf(wheel), { n: 140, power: 12 }); } else haptic.err();
    setBalance(S.heldBalance ?? r.balance); S.heldBalance = null;
    await sleep(700);
    showUpgradeResult(r);
    $('#upAmount').value = 0; S.upTarget = null; coreKey = '-';
    S.spinning = false;
    loadMe().catch(() => {}); loadShop();
  } catch (e) {
    S.spinning = false; wheel.classList.remove('spinning');
    if (S.heldBalance != null) { setBalance(S.heldBalance); S.heldBalance = null; }
    fail(e); renderUpgrade();
  }
});
function showUpgradeResult(r) {
  const art = r.item
    ? `<div class="preview" style="background:${giftBg(r.item)}">${nftMedia(r.item, { anim: true })}</div>`
    : `<div class="result-ic ${r.win ? 'ok' : 'bad'}">${ic(r.win ? 'star' : 'x', r.win ? 'star' : '')}</div>`;
  openSheet(`${art}
    <h3>${r.win ? 'Улучшение успешно!' : 'В этот раз мимо'}</h3>
    <p class="sub">${r.win ? (r.item ? `${esc(r.item.title)} #${r.item.number} теперь в вашем инвентаре` : `+${fmt(r.stars)} звёзд на баланс`) : `Шанс был ${pct(r.chance)} · выпало ${(r.roll * 100).toFixed(2)}`}</p>
    <button class="btn-main" id="resOk"><span>${r.win ? 'Забрать' : 'Попробовать ещё'}</span><i class="shine"></i></button>`,
  (s) => { $('#resOk', s).addEventListener('click', () => closeSheet()); if (r.win) setTimeout(() => burst(innerWidth / 2, innerHeight * .55, { n: 80 }), 300); });
}

// ═══════════════ ИНВЕНТАРЬ ═══════════════
function renderInventory() {
  const box = $('#invContent');
  if (!S.items.length) {
    const r = S.cfg.relayer;
    box.innerHTML = `<div class="empty reveal">
      <div class="empty-orbit">${orbit(S.showcase, 3)}</div>
      <h3>Инвентарь пуст</h3>
      <p>Отправьте NFT-подарки ${r ? `на <span class="accent">@${esc(r)}</span>` : 'на аккаунт-ретранслятор'}, — их можно продать за звёзды или вывести обратно.</p>
      <button class="btn-main" id="invSend">${ic('send')}<span>Отправить подарок</span><i class="shine"></i></button>
      <div class="or">или</div>
      <button class="btn-ghost" id="invUp">${ic('up')}Выиграть в улучшении</button></div>`;
    $('#invSend').addEventListener('click', () => openWallet('nft'));
    $('#invUp').addEventListener('click', () => go('upgrade'));
    hydrate(box); return;
  }
  const total = S.items.reduce((s, i) => s + i.value, 0);
  box.innerHTML = `<div class="inv-sum reveal"><div><small>${S.items.length} подарков на сумму</small><b>${STAR}<span id="invTotal">0</span></b></div>
    <button class="chip-btn" id="invAdd">${ic('plus')}Добавить</button></div>
    <div class="grid" id="invGrid">${S.items.map((it, i) => nftCard(it, { i, anim: i < 9 })).join('')}</div>`;
  tweenNum($('#invTotal'), total, 900);
  $('#invAdd').addEventListener('click', () => openWallet('nft'));
  $('#invGrid').addEventListener('click', (e) => { const el = e.target.closest('[data-id]'); if (el) itemActions(itemById(Number(el.dataset.id))); });
  hydrate(box);
}
function itemActions(it) {
  haptic.tap();
  const sell = Math.floor(it.value * (S.cfg.sellRate ?? .9));
  const attrs = [it.model && `Модель <b>${esc(it.model)}</b>`, it.backdrop && `Фон <b>${esc(it.backdrop)}</b>`, it.rarity && `Редкость <b>${(it.rarity / 10).toFixed(1)}%</b>`].filter(Boolean);
  openSheet(`
    <div class="preview" style="background:${giftBg(it)}">${nftMedia(it, { anim: true })}</div>
    <h3>${esc(it.title)} ${it.number ? `<span class="grad-text">#${it.number}</span>` : ''}</h3>
    ${attrs.length ? `<div class="attrs">${attrs.map((a) => `<span>${a}</span>`).join('')}</div>` : ''}
    <p class="sub">${it.value > 0 ? `Оценка ${fmt(it.value)} звёзд` : 'Оценивается — цену скоро установит админ'}</p>
    <div class="actions">
      ${sell > 0 ? `<button id="iaSell">${ic('sell')}Продать<small>${STAR}${fmt(sell)}</small></button>` : `<button disabled style="opacity:.5">${ic('clock')}Цена коллекции ещё не установлена</button>`}
      ${it.canTransfer ? `<button id="iaOut">${ic('out')}Вывести в StaticGram</button>` : ''}
    </div>
    <button class="btn-ghost" id="iaCancel">Закрыть</button>`, (s) => {
    $('#iaCancel', s).addEventListener('click', () => closeSheet());
    $('#iaSell', s)?.addEventListener('click', async () => {
      try { const r = await api(`/api/items/${it.id}/sell`, {}); haptic.ok(); setBalance(r.balance); island(`Продано за ${fmt(r.price)}`, 'ok', 'sell'); closeSheet(); loadMe().catch(() => {}); } catch (e) { fail(e); }
    });
    $('#iaOut', s)?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await api(`/api/items/${it.id}/withdraw`, {}); haptic.ok(); island('Подарок отправлен в StaticGram', 'ok', 'send'); closeSheet(); loadMe().catch(() => {}); } catch (err) { fail(err); }
    });
  });
}

// ═══════════════ ДРУЗЬЯ ═══════════════
$('#refShare').addEventListener('click', () => {
  haptic.tap();
  const text = 'Залетай в Epic Gift — ракетка и улучшение NFT-подарков';
  if (tg) openLink(`https://t.me/share/url?url=${encodeURIComponent(S.refLink)}&text=${encodeURIComponent(text)}`);
  else if (navigator.share) navigator.share({ text, url: S.refLink }).catch(() => {});
  else copyRef();
});
async function copyRef() {
  try { await navigator.clipboard.writeText(S.refLink); haptic.ok(); island('Ссылка скопирована', 'ok', 'copy'); } catch { island(S.refLink); }
}
$('#refCopy').addEventListener('click', copyRef);

// ═══════════════ РЕЙТИНГ ═══════════════
let rtEnds = 0;
async function loadRating() {
  try {
    const r = await api('/api/rating');
    rtEnds = r.endsAt; tickTimer();
    tweenNum($('#rtCount'), r.participants);
    const [p1, p2, p3] = r.top;
    const pd = (p, n) => (p ? `<div class="pd p${n}">${n === 1 ? ic('crown', 'crown') : ''}${avatarHtml(p.name, p.photo)}<b>${esc(p.name)}</b><small>${STAR}${fmt(p.score)}</small><div class="pd-base">${n}</div></div>` : `<div class="pd p${n}"><div class="avatar">—</div><b>—</b><small>&nbsp;</small><div class="pd-base">${n}</div></div>`);
    $('#rtPodium').innerHTML = pd(p2, 2) + pd(p1, 1) + pd(p3, 3);
    const rest = r.top.slice(3);
    $('#rtList').innerHTML = rest.length ? rest.map((p, i) => `<div class="bet reveal" style="--i:${i}"><span class="rk">${p.rank}</span>${avatarHtml(p.name, p.photo)}
      <div class="b-mid"><b>${esc(p.name)}</b>${p.prize ? `<small><span class="prize">${STAR}${fmt(p.prize)}</span></small>` : ''}</div>
      <div class="b-right"><b>${fmt(p.score)}</b></div></div>`).join('') : (r.top.length ? '' : '<div class="empty-row">На этой неделе ещё никто не играл</div>');
    $('#rtMe').innerHTML = `<div class="bet"><span class="rk">${r.me.rank || '—'}</span>${avatarHtml(S.me?.name, S.me?.photo)}
      <div class="b-mid"><b>${esc(S.me?.name || '')}<span class="you">ВЫ</span></b></div><div class="b-right"><b>${fmt(r.me.score)}</b></div></div>`;
  } catch (e) { fail(e); }
}
function tickTimer() {
  if (!rtEnds) return;
  const s = Math.max(0, Math.floor((rtEnds - Date.now()) / 1000));
  const v = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60];
  $$('#rtTimer span').forEach((el, i) => { if (el.textContent !== String(v[i])) { el.textContent = v[i]; el.animate([{ transform: 'translateY(-5px)', opacity: .3 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' }); } });
}
setInterval(tickTimer, 1000);


// ═══════════════ ЧЕСТНОСТЬ ═══════════════
const F = { loaded: false, rounds: [], edge: .05, salt: 'epic-gift-rocket', crashMax: 100, crashMin: 1, open: new Set(), shown: new Set(), busy: false };
const hexOf = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const utf8 = (t) => new TextEncoder().encode(t);
const sha256Hex = async (t) => hexOf(await crypto.subtle.digest('SHA-256', utf8(t)));
// ровно та же формула, что в src/crash.js → crashFromSeed
async function crashOf(seed) {
  const key = await crypto.subtle.importKey('raw', utf8(seed), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const h = hexOf(await crypto.subtle.sign('HMAC', key, utf8(F.salt)));
  const r = parseInt(h.slice(0, 13), 16) / 2 ** 52;
  return Math.min(F.crashMax, Math.max(F.crashMin || 1, Math.floor((100 * (1 - F.edge)) / (1 - r)) / 100));
}
const shortHash = (h = '') => (h.length > 22 ? `${h.slice(0, 12)}…${h.slice(-8)}` : h);
const pctNum = (n) => (Number.isInteger(+n.toFixed(2)) ? String(Math.round(n)) : n.toFixed(1));
// обновляет текст только если он изменился, и мягко подсвечивает смену
function setTxt(sel, text) {
  const el = $(sel); if (!el || el.textContent === text) return;
  el.textContent = text;
  el.animate?.([{ opacity: .15, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.16,.84,.24,1)' });
}
let autoFor = '';
async function renderFairLive() {
  const st = S.crash; if (!st) return;
  setTxt('#frRound', `#${st.roundId}`);
  setTxt('#frHash', st.hash);
  const crashed = st.phase === 'crashed';
  setTxt('#frSeed', crashed ? st.seed : '🔒 скрыт до конца раунда');
  $('#frLive').classList.toggle('open', crashed);
  const ph = $('#frPhase');
  const label = st.phase === 'betting' ? 'Приём ставок' : st.phase === 'flying' ? 'Полёт' : `Краш x${(st.crash ?? 0).toFixed(2)}`;
  if (ph.textContent !== label) { ph.textContent = label; ph.className = `fr-phase ${st.phase}`; }
  const auto = $('#frAuto');
  if (!crashed) { autoFor = ''; if (!auto.hidden) { auto.hidden = true; } return; }
  if (autoFor === st.seed || !crypto?.subtle) return;
  autoFor = st.seed;
  try {
    const [h, c] = await Promise.all([sha256Hex(st.seed), crashOf(st.seed)]);
    if (autoFor !== st.seed) return;
    const ok = h === st.hash && Math.abs(c - st.crash) < 0.005;
    auto.className = `fr-auto ${ok ? '' : 'bad'}`;
    auto.innerHTML = `${ic(ok ? 'check' : 'x')}<span>${ok ? `Проверено в твоём браузере: хэш совпал, краш x${c.toFixed(2)}` : 'Не совпало — сообщи админу'}</span>`;
    auto.hidden = false;
  } catch {}
}
async function loadFair(silent) {
  try {
    const r = await api('/api/fair');
    F.edge = r.edge; F.salt = r.salt; F.crashMax = r.crashMax; F.crashMin = r.crashMin || 1; F.rounds = r.rounds; F.loaded = true;
    renderFair();
  } catch (e) { if (!silent) fail(e); }
}
const roundHtml = (r, enter) => {
  const t = new Date(r.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `<div class="fr-r ${F.open.has(r.id) ? 'open' : ''} ${enter ? 'enter' : ''}" data-rid="${r.id}">
    <button class="fr-r-h"><span class="hchip ${hClass(r.crash)}">${r.crash.toFixed(2)}x</span>
      <span class="fr-r-mid"><b>Раунд #${r.id} · ${t}</b><small>${shortHash(r.hash)}</small></span>${ic('chev')}</button>
    <div class="fr-r-body"><div><div class="fr-r-in">
      <small>Хэш (был опубликован до раунда)</small><code>${esc(r.hash)}</code>
      <small>Seed (открыт после краша)</small><code>${esc(r.seed)}</code>
      <div class="fr-r-btns"><button data-act="check">Проверить</button><button data-act="copy">Копировать seed</button></div>
    </div></div></div></div>`;
};
let upTblDone = '';
function renderFair() {
  const e = F.edge * 100;
  if (Number.isInteger(+e.toFixed(2))) { tweenNum($('#frEdge'), Math.round(e), 900); tweenNum($('#frRtp'), Math.round(100 - e), 900); }
  else { $('#frEdge').textContent = pctNum(e); $('#frRtp').textContent = pctNum(100 - e); }
  tweenNum($('#frCount'), F.rounds.length, 500);
  // список раундов: при обновлении добавляем только новые сверху — без мигания остальных
  const box = $('#frRounds');
  if (!F.rounds.length) { box.innerHTML = '<div class="empty-row">Раундов пока нет — сыграй в ракетку</div>'; F.shown.clear(); }
  else if (!F.shown.size || !$('.fr-r', box)) {
    box.innerHTML = F.rounds.map((r) => roundHtml(r)).join('');
    F.rounds.forEach((r) => F.shown.add(r.id));
  } else {
    const fresh = F.rounds.filter((r) => !F.shown.has(r.id));
    if (fresh.length) {
      box.insertAdjacentHTML('afterbegin', fresh.map((r) => roundHtml(r, true)).join(''));
      fresh.forEach((r) => F.shown.add(r.id));
      const keep = new Set(F.rounds.map((r) => String(r.id)));
      $$('.fr-r', box).forEach((el) => { if (!keep.has(el.dataset.rid)) { el.remove(); } });
    }
  }
  // таблица шансов апгрейда считается тем же кодом, что и колесо
  const bets = [100, 1000, 10000, 25000], mults = [2, 5, 10];
  const key = JSON.stringify([S.cfg.upgradeEdge, S.cfg.bigStep, S.cfg.bigMax, S.cfg.multMax, S.cfg.maxPayout, S.cfg.maxBet]);
  if (key !== upTblDone) {
    upTblDone = key;
    $('#frUpTbl').innerHTML = '<span class="h">Ставка</span>' + mults.map((m) => `<span class="h">x${m}</span>`).join('')
      + bets.map((b) => `<span class="r">${fmt(b)} ⭐</span>` + mults.map((m) => (b > (S.cfg.maxBet || Infinity) || overPayout(b * m) ? '<span class="na">—</span>' : `<span>${pct(chanceFor(b, b * m))}</span>`)).join('')).join('');
  }
  const lim = [];
  if (S.cfg.maxBet) lim.push(`максимальная ставка — ${fmt(S.cfg.maxBet)} ⭐`);
  lim.push(S.cfg.maxPayout > 0 ? `максимальный выигрыш за одну игру — ${fmt(S.cfg.maxPayout)} ⭐` : 'потолка выигрыша нет');
  lim.push(`ракетка летит не выше x${fmt(F.crashMax)}`);
  if (F.crashMin > 1) lim.push(`ракетка всегда долетает до x${F.crashMin.toFixed(2)}, забрать выигрыш можно после этого икса`);
  if (S.cfg.withdrawDaily > 0) lim.push(`вывод — до ${fmt(S.cfg.withdrawDaily)} ⭐ в сутки`);
  $('#frLimits').textContent = lim.join(' · ').replace(/^./, (c) => c.toUpperCase()) + '.';
}
// раскрытие раундов и аккордеона
$('#frRounds').addEventListener('click', async (ev) => {
  const row = ev.target.closest('.fr-r'); if (!row) return;
  const id = Number(row.dataset.rid), r = F.rounds.find((x) => x.id === id); if (!r) return;
  const act = ev.target.closest('[data-act]')?.dataset.act;
  if (act === 'copy') {
    haptic.ok();
    try { await navigator.clipboard.writeText(r.seed); } catch { const t = document.createElement('textarea'); t.value = r.seed; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    return island('Seed скопирован', 'ok');
  }
  if (act === 'check') {
    haptic.tap(); $('#frSeedIn').value = r.seed;
    $('.fr-verify').scrollIntoView({ behavior: 'smooth', block: 'center' });
    return setTimeout(() => $('#frCheck').click(), 450);
  }
  if (!ev.target.closest('.fr-r-h')) return;
  haptic.sel();
  const open = row.classList.toggle('open');
  open ? F.open.add(id) : F.open.delete(id);
});
$('#frAcc').addEventListener('click', (ev) => {
  const q = ev.target.closest('.fr-q'); if (!q) return;
  haptic.sel(); q.parentElement.classList.toggle('open');
});
$('#rkFair').addEventListener('click', () => go('fair'));
$('#frCheck').addEventListener('click', async () => {
  if (F.busy) return;
  const inp = $('#frSeedIn'), seed = inp.value.trim(), box = $('#frResult');
  if (!seed) { haptic.err(); inp.classList.remove('nope'); void inp.offsetWidth; inp.classList.add('nope'); inp.focus(); return; }
  if (!crypto?.subtle) return fail(new Error('Проверка работает только по HTTPS'));
  F.busy = true;
  const btn = $('#frCheck'); btn.classList.add('wait'); $('span', btn).textContent = 'Считаем…';
  try {
    if (!box.hidden) { await box.animate?.([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-6px)' }], { duration: 180, fill: 'forwards' }).finished; }
    const [h, c] = await Promise.all([sha256Hex(seed), crashOf(seed), sleep(500)]);
    const cur = S.crash?.seed === seed ? { id: S.crash.roundId, hash: S.crash.hash, crash: S.crash.crash } : null;
    const known = F.rounds.find((r) => r.seed === seed) || cur;
    const calc = `<small>sha256(seed)</small><code>${esc(h)}</code>`;
    let cls, head, body;
    if (known) {
      const okH = known.hash === h, okC = Math.abs(known.crash - c) < 0.005;
      cls = okH && okC ? 'ok' : 'bad';
      head = okH && okC ? `${ic('check')}Раунд #${known.id} подтверждён` : `${ic('x')}Раунд #${known.id}: не совпало`;
      body = `<div class="fr-res-big grad-text">${c.toFixed(2)}x</div><small>${okH ? 'Хэш совпал с опубликованным до раунда.' : 'Хэш НЕ совпал с опубликованным.'} Краш ${okC ? 'пересчитан верно' : 'не совпал'}: на сервере ${known.crash.toFixed(2)}x.</small>${calc}`;
    } else {
      cls = 'info'; head = `${ic('shield')}Расчёт готов`;
      body = `<div class="fr-res-big grad-text">${c.toFixed(2)}x</div><small>Такого раунда нет среди последних 30. Сравни хэш ниже с тем, что показывался до старта раунда — если совпал, краш честный.</small>${calc}`;
    }
    box.className = `fr-result ${cls}`; box.innerHTML = `<div class="fr-res-h">${head}</div>${body}`; box.hidden = false;
    box.animate?.([{ opacity: 0, transform: 'translateY(14px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.16,.84,.24,1)' });
    cls === 'bad' ? haptic.err() : haptic.ok();
    if (cls === 'ok') burst(...centerOf(box), { n: 40, power: 7, colors: ['#34d399', '#6ee7b7', '#c4b5fd', '#fff'] });
  } catch (e) { fail(e); }
  finally { F.busy = false; btn.classList.remove('wait'); $('span', btn).textContent = 'Проверить'; }
});


// ═══════════════ КИРКА ═══════════════
const PK = { cv: $('#pkCanvas'), tex: {}, world: null, playing: false, speed: 1, hist: [], W: 0, H: 0, DPR: 1, cs: 0, camY: -4, parts: [], pops: [], shake: 0 };
PK.ctx = PK.cv.getContext('2d');
const PK_COLS = 7;
const PK_NAMES = { stone: 'Камень', coal: 'Уголь', gold: 'Золотая руда', ruby: 'Рубин', sapphire: 'Сапфир', emerald: 'Изумруд', goldblock: 'Слиток', diamond: 'Алмаз', amethyst: 'Аметист', chest: 'Сундук', tnt: 'Динамит' };
const PK_VALUES = { coal: 10, gold: 20, ruby: 30, sapphire: 50, emerald: 100, goldblock: 200, diamond: 500, amethyst: 1000, chest: 2500 };
const PK_COLORS = { stone: '#6a6e7c', deep: '#4a4d59', coal: '#26262e', gold: '#f5c542', ruby: '#f43f5e', sapphire: '#3b82f6', emerald: '#22c55e', goldblock: '#fbbf24', diamond: '#67e8f9', amethyst: '#a855f7', chest: '#a16207', tnt: '#dc2626', moss: '#8b5cf6', dirt: '#6b4a33' };
const HARDC = { stone: 1, coal: 1, gold: 2, ruby: 2, sapphire: 2, emerald: 2, goldblock: 2, diamond: 3, amethyst: 3, chest: 2, tnt: 1 };

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const strSeed = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

// ── пиксельные текстуры 16×16 (оригинальные, рисуются кодом) ──
function makeTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d'); const r = mulberry(strSeed(kind));
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  const noise = (pal, w) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { let k = r() * w.reduce((a, b) => a + b), i = 0; while ((k -= w[i]) > 0) i++; px(x, y, pal[i]); } };
  const stone = (dark) => noise(dark ? ['#3f424d', '#4a4d59', '#353842', '#565a67'] : ['#5f6371', '#6a6e7c', '#535664', '#787c8b'], [5, 4, 2, 2]);
  const ore = (main, light, dark, n = 5) => {
    stone(false);
    for (let k = 0; k < n; k++) {
      const x0 = 1 + Math.floor(r() * 12), y0 = 1 + Math.floor(r() * 12);
      [[0, 0, main], [1, 0, light], [0, 1, dark], [1, 1, main], [2, 1, r() < .5 ? main : dark]].forEach(([dx, dy, col]) => px(x0 + dx, y0 + dy, col));
    }
  };
  const gem = (main, light, dark, deep) => {
    g.fillStyle = main; g.fillRect(0, 0, 16, 16);
    g.fillStyle = dark; g.fillRect(0, 15, 16, 1); g.fillRect(15, 0, 1, 16);
    g.fillStyle = light; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16);
    g.fillStyle = deep; g.fillRect(3, 3, 10, 10);
    g.fillStyle = main; g.fillRect(4, 4, 8, 8);
    for (let i = 0; i < 5; i++) px(5 + i, 9 - i, light);
    px(11, 5, '#ffffff'); px(10, 4, light);
  };
  switch (kind) {
    case 'stone': stone(false); break;
    case 'deep': stone(true); break;
    case 'dirt': noise(['#5a3d2b', '#6b4a33', '#4b3223', '#7a5539'], [4, 4, 2, 1]); break;
    case 'moss': noise(['#5a3d2b', '#6b4a33', '#4b3223'], [4, 3, 2]); for (let x = 0; x < 16; x++) { const h = 3 + Math.floor(r() * 3); for (let y = 0; y < h; y++) px(x, y, ['#8b5cf6', '#7c3aed', '#a78bfa', '#6d28d9'][Math.floor(r() * 4)]); } break;
    case 'cave': noise(['#1b1726', '#221d31', '#17131f', '#2a2440'], [5, 3, 3, 1]); break;
    case 'coal': ore('#1c1c22', '#3a3a44', '#0e0e12', 6); break;
    case 'gold': ore('#f5c542', '#fde68a', '#b7791f'); break;
    case 'ruby': ore('#f43f5e', '#fda4af', '#9f1239'); break;
    case 'sapphire': ore('#3b82f6', '#93c5fd', '#1e3a8a'); break;
    case 'emerald': gem('#22c55e', '#86efac', '#14532d', '#16a34a'); break;
    case 'goldblock': gem('#fbbf24', '#fef08a', '#92400e', '#f59e0b'); break;
    case 'diamond': gem('#67e8f9', '#cffafe', '#0e7490', '#22d3ee'); break;
    case 'amethyst': {
      noise(['#2e1065', '#3b0764', '#4c1d95'], [3, 2, 2]);
      [[3, 13, 7], [7, 14, 10], [11, 13, 6], [5, 12, 5], [13, 14, 4]].forEach(([x, y, h]) => { for (let i = 0; i < h; i++) { px(x, y - i, i > h - 3 ? '#e9d5ff' : '#a855f7'); if (i < h - 2) px(x + 1, y - i, '#7e22ce'); } });
      break;
    }
    case 'chest': {
      g.fillStyle = '#8a5a2b'; g.fillRect(0, 0, 16, 16);
      g.fillStyle = '#a16b36'; for (let y = 1; y < 16; y += 3) g.fillRect(1, y, 14, 1);
      g.fillStyle = '#4a2d12'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16); g.fillRect(0, 6, 16, 1);
      g.fillStyle = '#fbbf24'; g.fillRect(6, 5, 4, 4); g.fillStyle = '#92400e'; g.fillRect(7, 7, 2, 1);
      g.fillStyle = '#fde68a'; g.fillRect(1, 1, 2, 1); g.fillRect(13, 1, 2, 1);
      break;
    }
    case 'tnt': {
      g.fillStyle = '#7f1d1d'; g.fillRect(0, 0, 16, 16);
      for (let x = 1; x < 15; x += 3) { g.fillStyle = '#dc2626'; g.fillRect(x, 2, 2, 13); g.fillStyle = '#f87171'; g.fillRect(x, 2, 1, 13); }
      g.fillStyle = '#fde68a'; g.fillRect(0, 7, 16, 3); g.fillStyle = '#1f2937'; [2, 6, 10, 13].forEach((x) => g.fillRect(x, 8, 1, 1));
      g.fillStyle = '#1f2937'; g.fillRect(7, 0, 1, 2); g.fillStyle = '#fb923c'; g.fillRect(8, 0, 1, 1);
      break;
    }
    case 'crack1': case 'crack2': case 'crack3': {
      const lv = Number(kind.slice(-1)); g.fillStyle = 'rgba(0,0,0,.55)';
      const lines = [[[8, 8], [5, 4], [3, 2]], [[8, 8], [12, 11], [14, 14]], [[8, 8], [11, 4], [13, 1]], [[8, 8], [4, 12], [1, 14]]];
      lines.slice(0, lv + 1).forEach((pts) => { for (let i = 0; i < pts.length - 1; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let k = 0; k <= n; k++) px(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), 'rgba(0,0,0,.6)'); } });
      break;
    }
  }
  return c;
}
function makePick() {
  const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  g.imageSmoothingEnabled = false; g.lineCap = 'square';
  // рукоять
  g.strokeStyle = '#3b2412'; g.lineWidth = 5; g.beginPath(); g.moveTo(5, 28); g.lineTo(19, 14); g.stroke();
  g.strokeStyle = '#a16b36'; g.lineWidth = 3; g.beginPath(); g.moveTo(5, 28); g.lineTo(19, 14); g.stroke();
  g.strokeStyle = '#d4a373'; g.lineWidth = 1; g.beginPath(); g.moveTo(5, 27); g.lineTo(18, 14); g.stroke();
  // навершие-кристалл
  const head = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(8, 5); g.quadraticCurveTo(29, 2, 27, 24); g.stroke(); };
  head(7, '#2e1065'); head(5, '#7c3aed'); head(2.5, '#c4b5fd');
  g.fillStyle = '#ffffff'; g.fillRect(19, 5, 2, 2);
  const out = document.createElement('canvas'); out.width = out.height = 16; const o = out.getContext('2d');
  o.imageSmoothingEnabled = false; o.drawImage(c, 0, 0, 16, 16); // пикселизация
  return out;
}
function pkTex(k) { return PK.tex[k] || (PK.tex[k] = k === 'pick' ? makePick() : makeTex(k)); }

// ── мир: шахта под результат с сервера ──
function buildWorld(events, seed) {
  const r = mulberry(seed);
  const grid = new Map(); const key = (c, y) => `${c},${y}`;
  let y = 2, col = 3; const path = [];
  events.forEach((e, i) => {
    y += 1 + e.gap + (i > 0 && events[i - 1].k === 'tnt' ? 1 : 0);
    path.push({ ...e, c: e.col, y });
  });
  const maxY = (path.at(-1)?.y || 10) + 10;
  for (let yy = 0; yy <= maxY; yy++) for (let c = 0; c < PK_COLS; c++) {
    let k = yy === 0 ? 'moss' : yy < 3 ? 'dirt' : yy > 26 ? 'deep' : 'stone';
    if (yy >= 3) { const q = r(); if (q < .07) k = 'cave'; else if (q < .13) k = ['coal', 'coal', 'gold', 'ruby'][Math.floor(r() * 4)]; }
    grid.set(key(c, yy), k);
  }
  // проход кирки: из клетки предыдущего блока вбок, затем вниз
  let pc = 3, py = -4;
  path.forEach((p) => {
    for (let c = Math.min(pc, p.c); c <= Math.max(pc, p.c); c++) if (py >= 0) grid.set(key(c, py), 'cave');
    for (let yy = Math.max(0, py + 1); yy < p.y; yy++) grid.set(key(p.c, yy), 'cave');
    grid.set(key(p.c, p.y), p.k);
    if (p.k === 'tnt') {
      const spots = [[-1, 0], [1, 0], [-1, 1], [1, 1]].sort(() => r() - .5);
      p.cells = p.parts.map((k, i) => { const [dx, dy] = spots[i % 4]; const cell = [p.c + dx, p.y + dy, k]; grid.set(key(cell[0], cell[1]), k); return cell; });
    }
    pc = p.c; py = p.y;
  });
  return { grid, key, path, maxY };
}

// ── рендер ──
function pkResize() {
  PK.DPR = Math.min(LOW_END ? 1.25 : 2, devicePixelRatio || 1);
  PK.W = PK.cv.clientWidth; PK.H = PK.cv.clientHeight;
  PK.cv.width = PK.W * PK.DPR; PK.cv.height = PK.H * PK.DPR; PK.cs = PK.W / PK_COLS;
}
addEventListener('resize', () => current === 'pickaxe' && pkResize());
const pick = { x: 3, y: -3, rot: -.5, show: true, crack: 0, target: null };
function pkFrame(t) {
  requestAnimationFrame(pkFrame);
  if (current !== 'pickaxe' || document.hidden) return;
  if (!PK.W) pkResize();
  const { ctx, cs, W, H } = PK; const w = PK.world;
  ctx.setTransform(PK.DPR, 0, 0, PK.DPR, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  // камера
  const want = (w ? pick.y : -3) - (H / cs) * 0.38;
  PK.camY += (want - PK.camY) * 0.12;
  const sx = PK.shake ? (Math.random() - .5) * PK.shake : 0, sy = PK.shake ? (Math.random() - .5) * PK.shake : 0;
  PK.shake *= 0.86; if (PK.shake < .3) PK.shake = 0;
  ctx.save(); ctx.translate(sx, sy);
  const y0 = Math.floor(PK.camY), y1 = Math.ceil(PK.camY + H / cs) + 1;
  // небо
  const skyBottom = (0 - PK.camY) * cs;
  if (skyBottom > 0) {
    const sg = ctx.createLinearGradient(0, 0, 0, skyBottom);
    sg.addColorStop(0, '#1a0b3a'); sg.addColorStop(1, '#4c1d95'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, skyBottom);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 0; i < 18; i++) { const x = (i * 97) % W, yy = ((i * 53) % Math.max(1, skyBottom)); ctx.fillRect(x, yy, 2, 2); }
  }
  for (let yy = Math.max(0, y0); yy <= y1; yy++) for (let c = 0; c < PK_COLS; c++) {
    const k = (w?.grid.get(w.key(c, yy))) || (yy === 0 ? 'moss' : yy < 3 ? 'dirt' : 'stone');
    const px = c * cs, py = (yy - PK.camY) * cs;
    ctx.drawImage(pkTex(k === 'air' ? 'cave' : k), px, py, cs + .5, cs + .5);
    if (k !== 'cave' && k !== 'air' && yy > 2) { ctx.fillStyle = `rgba(5,4,10,${Math.min(.45, (yy - 3) * .012)})`; ctx.fillRect(px, py, cs + .5, cs + .5); }
    if (pick.target && pick.target[0] === c && pick.target[1] === yy && pick.crack > 0) ctx.drawImage(pkTex(`crack${Math.min(3, pick.crack)}`), px, py, cs, cs);
  }
  // частицы
  PK.parts = PK.parts.filter((p) => p.life > 0);
  for (const p of PK.parts) { p.vy += .35; p.x += p.vx; p.y += p.vy; p.life -= .025; ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y - PK.camY * cs, p.s, p.s); }
  ctx.globalAlpha = 1;
  // кирка
  if (pick.show) {
    const px = (pick.x + .5) * cs, py = (pick.y + .5 - PK.camY) * cs;
    ctx.save(); ctx.translate(px, py); ctx.rotate(pick.rot);
    ctx.shadowColor = 'rgba(168,85,247,.8)'; ctx.shadowBlur = 14;
    ctx.drawImage(pkTex('pick'), -cs * .55, -cs * .55, cs * 1.1, cs * 1.1); ctx.restore();
  }
  // всплывающие иксы
  PK.pops = PK.pops.filter((p) => p.life > 0);
  ctx.textAlign = 'center'; ctx.font = `900 ${Math.round(cs * .36)}px -apple-system, system-ui, sans-serif`;
  for (const p of PK.pops) {
    p.y -= .6; p.life -= .016; ctx.globalAlpha = Math.min(1, p.life * 2);
    const yy = p.y - PK.camY * cs; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,4,10,.9)'; ctx.strokeText(p.text, p.x, yy); ctx.fillStyle = p.c; ctx.fillText(p.text, p.x, yy);
  }
  ctx.globalAlpha = 1; ctx.restore();
}
requestAnimationFrame(pkFrame);

// ── анимация партии ──
const pkTween = (dur, fn, ease = (k) => k) => new Promise((res) => {
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, ((t - t0) * PK.speed) / dur); fn(ease(k)); if (k < 1) requestAnimationFrame(step); else res(); };
  requestAnimationFrame(step);
});
const easeIn = (k) => k * k, easeOut = (k) => 1 - (1 - k) * (1 - k);
function pkBurst(c, y, kind, n = 14) {
  const cs = PK.cs; const col = PK_COLORS[kind] || '#888'; const cols = [col, '#ffffff', PK_COLORS.stone];
  const m = LOW_END ? Math.ceil(n / 2) : n;
  for (let i = 0; i < m; i++) PK.parts.push({ x: (c + .5) * cs, y: (y + .5) * cs, vx: (Math.random() - .5) * 7, vy: -Math.random() * 6 - 1, s: 3 + Math.random() * 4, life: 1, c: cols[i % 3] });
}
function pkPop(c, y, v, col = '#6ee7b7') { PK.pops.push({ x: (c + .5) * PK.cs, y: (y + .2) * PK.cs, text: `+${(v / 100).toFixed(v % 100 ? (v % 10 ? 2 : 1) : 0)}x`, c: col, life: 1.4 }); }
let pkWin = 0, pkAmountNow = 0, pkHpNow = 100, pkMaxHp = 100;
function pkHud() {
  $('#pkHp').textContent = `${Math.max(0, Math.round(pkHpNow))}/${pkMaxHp}`;
  $('#pkHpFill').style.width = `${Math.max(0, (pkHpNow / pkMaxHp) * 100)}%`;
  $('#pkHpBox').classList.toggle('low', pkHpNow / pkMaxHp <= .25 && pkHpNow > 0);
  const el = $('#pkMult'), txt = `x${(pkWin / 100).toFixed(2)}`;
  if (el.textContent !== txt) { el.textContent = txt; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  $('#pkStars').innerHTML = `${fmt((pkAmountNow * pkWin) / 100)} ${STAR}`;
}
async function pkPlay(r) {
  const w = PK.world = buildWorld(r.events, (Math.random() * 2 ** 31) | 0);
  pkWin = 0; pkAmountNow = r.amount; pkMaxHp = r.maxHp; pkHpNow = r.maxHp;
  Object.assign(pick, { x: 3, y: -3, rot: -.5, show: true, crack: 0, target: null });
  PK.camY = -3 - (PK.H / PK.cs) * .38; PK.parts = []; PK.pops = [];
  pkHud();
  for (const p of w.path) {
    // вбок, затем вниз до клетки над блоком
    if (pick.x !== p.c) { const x0 = pick.x; await pkTween(140, (k) => { pick.x = x0 + (p.c - x0) * k; }, easeOut); }
    const yStart = pick.y, yEnd = p.y - 1;
    if (yEnd > yStart) { const rot0 = pick.rot; await pkTween(110 + 85 * Math.sqrt(yEnd - yStart), (k) => { pick.y = yStart + (yEnd - yStart) * k; pick.rot = rot0 + k * 1.2; }, easeIn); }
    pick.rot = -.4; pick.target = [p.c, p.y]; pick.crack = 0;
    // удары
    const hits = HARDC[p.k] || 1, hp0 = pkHpNow;
    for (let h = 1; h <= hits; h++) {
      await pkTween(70, (k) => { pick.rot = -.4 - k * .7; });
      await pkTween(60, (k) => { pick.rot = -1.1 + k * 1.5; pick.y = yEnd + k * .12; });
      pick.crack = h; pkHpNow = hp0 - (p.dmg * h) / hits; pkHud(); PK.shake = Math.max(PK.shake, 3);
      pkBurst(p.c, p.y, p.k, 4); haptic.sel();
      await pkTween(50, (k) => { pick.y = yEnd + .12 - k * .12; });
    }
    // блок сломан
    pick.target = null; pick.crack = 0; w.grid.set(w.key(p.c, p.y), 'cave'); pkBurst(p.c, p.y, p.k, 16);
    if (p.k === 'tnt') {
      PK.shake = 16; haptic.heavy();
      const st = $('#pkStage'); st.classList.remove('flash', 'shake'); void st.offsetWidth; st.classList.add('flash', 'shake');
      for (let i = 0; i < 26; i++) PK.parts.push({ x: (p.c + .5) * PK.cs, y: (p.y + .5) * PK.cs, vx: (Math.random() - .5) * 14, vy: (Math.random() - .5) * 14, s: 4 + Math.random() * 5, life: 1, c: ['#fde68a', '#fb923c', '#ef4444', '#ffffff'][i % 4] });
      for (const [cx, cy, k] of p.cells) { w.grid.set(w.key(cx, cy), 'cave'); pkBurst(cx, cy, k, 12); pkPop(cx, cy, PK_VALUES[k] || 0, '#fde68a'); pkWin += PK_VALUES[k] || 0; }
      pkHud();
    } else if (p.v > 0) {
      pkPop(p.c, p.y, p.v, p.v >= 500 ? '#f0abfc' : '#6ee7b7'); pkWin += p.v; pkHud(); haptic.tap();
      if (p.v >= 500) burst(...centerOf($('#pkStage')), { n: 40, power: 8 });
    }
    await pkTween(90, () => {});
  }
  // прочность кончилась — кирка ломается
  pkHpNow = 0; pkHud();
  for (let i = 0; i < 24; i++) PK.parts.push({ x: (pick.x + .5) * PK.cs, y: (pick.y + .5) * PK.cs, vx: (Math.random() - .5) * 9, vy: -Math.random() * 7, s: 3 + Math.random() * 4, life: 1, c: ['#c4b5fd', '#7c3aed', '#a16b36', '#ffffff'][i % 4] });
  pick.show = false; haptic.err();
  pkWin = Math.round(r.mult * 100); pkHud(); // финальное значение строго с сервера
  await sleep(450 / PK.speed);
}
function pkShowResult(r) {
  const box = $('#pkResult'), win = r.payout >= r.amount;
  box.className = `pk-result ${win ? 'win' : 'lose'}`;
  box.innerHTML = `<b>x${r.mult.toFixed(2)}</b><span>${r.payout > 0 ? `+${fmt(r.payout)}` : '0'} ${STAR}</span><small>${win ? 'Кирка отработала в плюс!' : 'Кирка сломалась'}</small>`;
  box.hidden = false;
  if (r.mult >= 2) burst(...centerOf($('#pkStage')), { n: r.mult >= 10 ? 160 : 90, power: r.mult >= 10 ? 13 : 10 });
  r.mult >= 1 ? haptic.ok() : haptic.err();
  PK.hist.unshift(r.mult); PK.hist.length = Math.min(PK.hist.length, 20);
  $('#pkHistory').innerHTML = PK.hist.map((m, i) => `<span class="hchip ${hClass(m)} ${i === 0 ? 'new' : ''}">${m.toFixed(2)}x</span>`).join('');
}
const pkInput = $('#pkAmount');
pkInput.addEventListener('blur', () => cleanInt(pkInput));
$$('[data-pkstep]').forEach((b) => b.addEventListener('click', () => { haptic.sel(); pkInput.value = Math.max(0, (Number(pkInput.value) || 0) + Number(b.dataset.pkstep)); }));
$$('[data-pkq]').forEach((b) => b.addEventListener('click', () => {
  haptic.sel(); const v = Number(pkInput.value) || 0, q = b.dataset.pkq, bal = S.me?.balance || 0;
  pkInput.value = q === 'half' ? Math.max(1, Math.floor(v / 2)) : q === 'x2' ? Math.min(bal, v * 2) : q === 'max' ? bal : Math.min(bal, v + Number(q));
}));
$('#pkSkip').addEventListener('click', () => { PK.speed = 8; haptic.tap(); $('#pkSkip').hidden = true; });
$('#pkGo').addEventListener('click', async () => {
  if (PK.playing || S.spinning) return;
  const btn = $('#pkGo'); btn.disabled = true; PK.playing = true; S.spinning = true; S.heldBalance = null;
  $('#pkResult').hidden = true;
  try {
    const r = await api('/api/pickaxe', { amount: Number(pkInput.value) || 0 });
    if (S.me) { S.me.balance -= r.amount; tweenNum($('#meBalance'), S.me.balance, 400); } // пока летит — только ставка
    $('#pkIdle').hidden = true; PK.speed = 1; $('#pkSkip').hidden = false; $('span', btn).textContent = 'Кирка копает…';
    haptic.heavy();
    await pkPlay(r);
    setBalance(S.heldBalance ?? r.balance); S.heldBalance = null;
    pkShowResult(r);
  } catch (e) {
    if (S.heldBalance != null) { setBalance(S.heldBalance); S.heldBalance = null; }
    fail(e);
  } finally {
    PK.playing = false; S.spinning = false; btn.disabled = false; $('#pkSkip').hidden = true; $('span', btn).textContent = 'Бросить кирку';
  }
});
function pkLegend() {
  const rows = [...Object.entries(PK_VALUES).map(([k, v]) => [k, `+${v / 100}x`, '']), ['stone', '0x', 'zero'], ['tnt', 'взрыв', 'boom']];
  const desc = { stone: 'тратит прочность', tnt: 'ломает соседние блоки' };
  $('#pkLegend').innerHTML = rows.map(([k, val, cls]) => `<div class="pk-leg"><img src="${pkTex(k).toDataURL()}" alt=""><div><b>${PK_NAMES[k]}</b>${desc[k] ? `<small>${desc[k]}</small>` : ''}</div><span class="val ${cls}">${val}</span></div>`).join('');
}
function pkHeroArt() {
  const c = $('#pkHero'); if (!c) return; const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const s = 40, ox = 24, oy = 30;
  [['diamond', 1, 0], ['stone', 0, 1], ['emerald', 1, 1], ['gold', 2, 1], ['stone', 0, 2], ['tnt', 1, 2], ['ruby', 2, 2]].forEach(([k, x, y]) => g.drawImage(pkTex(k), ox + x * s, oy + y * s - 10, s, s));
  g.save(); g.translate(ox + 96, oy + 6); g.rotate(-.5); g.drawImage(pkTex('pick'), -26, -26, 52, 52); g.restore();
}
pkLegend(); pkHeroArt();
function renderPkFair() {
  const t = S.cfg.pickaxe?.table; if (!t || !$('#frPkTbl')) return;
  $('#frPkRtp').textContent = Math.round((1 - S.cfg.pickaxe.edge) * 1000) / 10;
  const fmtP = (p) => (p >= 0.01 ? `${(p * 100).toFixed(1)}%` : p >= 0.0001 ? `${(p * 100).toFixed(2)}%` : `1 из ${fmt(1 / p)}`);
  $('#frPkTbl').innerHTML = '<span class="h">Икс</span><span class="h">Шанс</span><span class="h">Икс</span><span class="h">Шанс</span>'
    + t.map((r) => `<span class="r">x${r.x}</span><span>${fmtP(r.p)}</span>`).join('');
}

// ═══════════════ WebSocket ═══════════════
function setOnline(n) { S.online = n; tweenNum($('#hcOnline'), n, 500); tweenNum($('#rkOnline'), n, 500); }
let ws, wsTries = 0, wsEverOpen = false, wsTimer = 0;
function connectWS() {
  clearTimeout(wsTimer);
  if (ws && ws.readyState <= 1) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?initData=${encodeURIComponent(INIT)}`);
  ws.onopen = () => { wsTries = 0; if (wsEverOpen) { loadMe().catch(() => {}); } wsEverOpen = true; };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'crash') onCrashState(m);
    else if (m.type === 'crash_delta') onCrashDelta(m);
    else if (m.type === 'balance') { if (S.spinning) S.heldBalance = m.balance; else setBalance(m.balance); }
    else if (m.type === 'inventory') { loadMe().catch(() => {}); island('Новый подарок в инвентаре', 'ok', 'gift'); }
    else if (m.type === 'online') setOnline(m.n);
    else if (m.type === 'live') { S.live.unshift(m.event); S.live.length = Math.min(S.live.length, 20); renderLive(); }
  };
  ws.onclose = (e) => { if (e.code !== 4001) wsTimer = setTimeout(connectWS, Math.min(10000, 1000 * 1.6 ** wsTries++)); };
  ws.onerror = () => { try { ws.close(); } catch {} };
}
// вернулись в приложение — сразу переподключаемся и обновляем данные
document.addEventListener('visibilitychange', () => { if (!document.hidden && INIT && wsEverOpen) { connectWS(); if (S.me) loadMe().catch(() => {}); } });

// ═══════════════ Лендинг (открыто не из StaticGram) ═══════════════
async function renderLanding() {
  let cfg = {}, show = [];
  try { [cfg, show] = await Promise.all([fetch('/api/config').then((r) => r.json()), fetch('/api/showcase').then((r) => r.json())]); } catch {}
  const bot = cfg.bot ? `https://staticgram.top/${cfg.bot}` : '#';
  $('#app').outerHTML = `<div class="land">
    <nav class="land-nav"><div class="logo"><span class="logo-mark">${ic('gift')}</span>Epic Gift</div>
      <a class="btn-glow" href="${bot}" style="text-decoration:none;color:#fff"><span>Играть</span><i class="shine"></i></a></nav>
    <section class="land-hero">
      <div class="land-orbit"><div class="ring-o"></div>
        ${orbit(show, 5, (i) => `o${i + 1}`)}</div>
      <h1>Подарки,<br><span class="grad-text">которые растут</span></h1>
      <p class="lead">Ракетка и улучшение NFT-подарков StaticGram. Ставь звёзды — забирай редкие NFT и выводи их себе.</p>
      <a class="btn-main" href="${bot}">${ic('rocket')}<span>Открыть в StaticGram</span><i class="shine"></i></a>
    </section>
    <div class="land-feats">
      <div class="feat reveal" style="--i:1"><span class="step-ic">${ic('rocket')}</span><div><b>Ракетка</b><p>Забери выигрыш до взрыва. Множитель растёт каждую секунду, автовывод — на любом иксе.</p></div></div>
      <div class="feat reveal" style="--i:2"><span class="step-ic">${ic('up')}</span><div><b>Улучшение</b><p>Выбери подарок мечты и крути колесо. Шанс считается честно от твоей ставки.</p></div></div>
      <div class="feat reveal" style="--i:3"><span class="step-ic">${ic('diamond')}</span><div><b>Настоящие NFT</b><p>Закидывай улучшенные подарки и выводи выигранные прямо себе в StaticGram.</p></div></div>
      <div class="feat reveal" style="--i:4"><span class="step-ic">${ic('shield')}</span><div><b>Provably fair</b><p>Хэш раунда публикуется до старта, сид — после. Любой результат можно проверить.</p></div></div>
    </div>
    <div class="land-foot">Epic Gift · StaticGram</div>
  </div>`;
  hydrate();
}

// ═══════════════ Старт ═══════════════
(async function init() {
  if (!INIT) return renderLanding();
  requestAnimationFrame(() => moveInd($('#tabbar'), $('#tabInd'), $('.tabbar .active')));
  renderShowcase(); renderLive();
  try {
    S.cfg = await api('/api/config');
    $('#refPct').textContent = `${S.cfg.refPercent}%`;
    if (S.cfg.relayer) $('#howRelayer').textContent = `Подарок на @${S.cfg.relayer}`;
    await loadMe();
    S.live = await api('/api/live'); renderLive();
    await loadShop();
    connectWS();
    if (S.cfg.dev) {
      const b = document.createElement('button');
      b.className = 'btn-ghost'; b.innerHTML = `${STAR}DEV: +1000`;
      b.onclick = async () => { const r = await api('/api/dev/faucet', {}); setBalance(r.balance); burst(...centerOf(b), { n: 50 }); };
      $('#s-home').appendChild(b);
    }
    const sp = tg?.initDataUnsafe?.start_param;
    if (['rocket', 'upgrade', 'pickaxe', 'fair'].includes(sp)) go(sp);
  } catch (e) { fail(e); }
})();

