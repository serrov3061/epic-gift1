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
const LOW_END = matchMedia('(prefers-reduced-motion: reduce)').matches
  || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
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
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-init-data': INIT },
    body: body ? JSON.stringify(body) : undefined,
  });
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
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(islT); islT = setTimeout(() => el.classList.remove('show'), 2600);
}
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
  const from = Number(el.dataset.v ?? (String(el.textContent).replace(/\D/g, '') || 0));
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
const ORDER = ['inventory', 'friends', 'home', 'rating', 'rocket', 'upgrade'];
const GAME = ['rocket', 'upgrade'];
let current = 'home';
function moveInd(container, ind, active) {
  if (!active) { ind.style.opacity = 0; return; }
  ind.style.opacity = 1;
  ind.style.width = `${active.offsetWidth}px`;
  ind.style.transform = `translateX(${active.offsetLeft}px)`;
}
function go(name) {
  if (name === current) return;
  haptic.tap();
  const back = ORDER.indexOf(name) < ORDER.indexOf(current);
  current = name;
  $$('.screen').forEach((s) => {
    const on = s.id === `s-${name}`;
    s.classList.toggle('active', on); s.classList.toggle('back-anim', on && back);
  });
  $$('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  moveInd($('#tabbar'), $('#tabInd'), $(`.tabbar [data-tab="${name}"]`));
  const isGame = GAME.includes(name);
  $('#navBack').hidden = !isGame;
  if (tg) isGame ? tg.BackButton.show() : tg.BackButton.hide();
  scrollTo(0, 0);
  if (name === 'rating') loadRating();
  if (name === 'upgrade') { loadShop(); requestAnimationFrame(() => moveInd($('#upSeg'), $('#upSeg .seg-ind'), $('#upSeg .active'))); }
  if (name === 'inventory') renderInventory();
  if (name === 'rocket') { resizeCanvas(); renderBets(); }
  hydrate();
}
$$('.tabbar button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });
$('#navBack').addEventListener('click', () => go('home'));
tg?.BackButton.onClick(() => go('home'));
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
function openSheet(html, onMount) {
  closeSheet(true);
  const root = $('#sheetRoot');
  root.innerHTML = `<div class="backdrop"></div><div class="sheet"><div class="grabber"></div>${html}</div>`;
  $('.backdrop', root).addEventListener('click', () => closeSheet());
  const sheet = $('.sheet', root);
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', (e) => { if (sheet.scrollTop <= 0) { y0 = e.touches[0].clientY; sheet.style.transition = 'none'; } }, { passive: true });
  sheet.addEventListener('touchmove', (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translate(-50%, ${dy}px)`; }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (y0 === null) return; y0 = null; sheet.style.transition = 'transform .4s cubic-bezier(.2,1.25,.35,1)';
    if (dy > 110) closeSheet(); else sheet.style.transform = ''; dy = 0;
  });
  onMount?.(sheet);
  hydrate(sheet);
  return sheet;
}
function closeSheet(instant) {
  const root = $('#sheetRoot');
  if (!root.firstChild) return;
  if (instant) { root.innerHTML = ''; hydrate(); return; }
  $$('.sheet, .backdrop', root).forEach((el) => { el.style.transform = ''; el.style.transition = ''; el.classList.add('closing'); });
  setTimeout(() => { root.innerHTML = ''; hydrate(); }, 260);
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
                if (status === 'paid') { haptic.ok(); burst(innerWidth / 2, innerHeight * .4); island('Звёзды зачислены', 'ok'); closeSheet(); setTimeout(loadMe, 1200); }
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
          <p class="sub">Вывод на ваш аккаунт StaticGram · от ${fmt(S.cfg.minWithdraw)} ⭐</p>
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
            setBalance(r.balance); loadMe(); haptic.ok();
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
$$('.round-btn').forEach((b) => b.addEventListener('click', () => { haptic.sel(); betInput.value = Math.max(0, (Number(betInput.value) || 0) + Number(b.dataset.step)); }));
$$('.quick [data-q]').forEach((b) => b.addEventListener('click', () => {
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
    if (b && !b.cashout) { text = `Забрать ${fmt(b.value * multAt(sNow() - st.startAt))}`; cls = 'green'; }
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
const chanceFor = (input, target) => (!(input > 0) || !(target > input) ? 0 : (input / target) * (1 - (S.cfg.upgradeEdge ?? .15)));
const pct = (c) => (!c ? '0%' : (c * 100 >= 10 ? Math.round(c * 100) : (c * 100).toFixed(1)) + '%');
function targetValue() {
  const t = S.upTarget, input = upInputValue(); if (!t) return 0;
  return t.type === 'mult' ? Math.floor(input * t.mult) : S.shop.find((i) => i.id === t.id)?.value || 0;
}
let coreKey = '';
function renderUpgrade(gridToo = true) {
  const input = upInputValue();
  tweenNum($('#upInputValue'), input, 400);
  const maxC = S.cfg.maxChance ?? .75, minC = S.cfg.minChance ?? .01, ok = (c) => c >= minC && c <= maxC;
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
        const c = (1 - (S.cfg.upgradeEdge ?? .15)) / mu;
        return `<button class="nft mult reveal ${S.upTarget?.type === 'mult' && S.upTarget.mult === mu ? 'sel' : ''} ${ok(c) ? '' : 'dim'}" style="--i:${i}" data-mult="${mu}">
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
  $('#upGo').disabled = !(t && input > 0 && ok(c));
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
    const r = await api('/api/upgrade', { amount: Number($('#upAmount').value) || 0, target: S.upTarget });
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
    setBalance(r.balance);
    await sleep(700);
    showUpgradeResult(r);
    $('#upAmount').value = 0; S.upTarget = null; coreKey = '-';
    S.spinning = false;
    loadMe(); loadShop();
  } catch (e) { S.spinning = false; wheel.classList.remove('spinning'); fail(e); renderUpgrade(); }
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
      try { const r = await api(`/api/items/${it.id}/sell`, {}); haptic.ok(); setBalance(r.balance); island(`Продано за ${fmt(r.price)}`, 'ok', 'sell'); closeSheet(); loadMe(); } catch (e) { fail(e); }
    });
    $('#iaOut', s)?.addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await api(`/api/items/${it.id}/withdraw`, {}); haptic.ok(); island('Подарок отправлен в StaticGram', 'ok', 'send'); closeSheet(); loadMe(); } catch (err) { fail(err); }
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

// ═══════════════ WebSocket ═══════════════
function setOnline(n) { S.online = n; tweenNum($('#hcOnline'), n, 500); tweenNum($('#rkOnline'), n, 500); }
function connectWS() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?initData=${encodeURIComponent(INIT)}`);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'crash') onCrashState(m);
    else if (m.type === 'crash_delta') onCrashDelta(m);
    else if (m.type === 'balance') setBalance(m.balance);
    else if (m.type === 'inventory') { loadMe(); island('Новый подарок в инвентаре', 'ok', 'gift'); }
    else if (m.type === 'online') setOnline(m.n);
    else if (m.type === 'live') { S.live.unshift(m.event); S.live.length = Math.min(S.live.length, 20); renderLive(); }
  };
  ws.onclose = (e) => { if (e.code !== 4001) setTimeout(connectWS, 1500); };
}

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
    if (sp === 'rocket' || sp === 'upgrade') go(sp);
  } catch (e) { fail(e); }
})();
