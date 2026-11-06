/* =====================================================
   ronq.js — منطق الموقع. المنتجات تُدار كلها من لوحة التحكم (admin.html)،
   ويجلبها store.js من قاعدة البيانات
   ===================================================== */

const main      = document.querySelector('.imgs img');    // صورة المنتج في الوسط
const bg        = document.querySelector('.shamelll');    // خلفية الصفحة
const wave      = document.querySelector('.bg-wave');     // الطبقة التي تتسع من الوسط
const strip     = document.querySelector('.icon');        // شريط الصور الصغيرة
const btnPrev   = document.querySelector('.nav-btn.prev');
const btnNext   = document.querySelector('.nav-btn.next');

const VISIBLE  = 5;      // عدد الصور الصغيرة الظاهرة
const DURATION = 900;    // مدة حركة الانتقال (ms)

// ===== الألوان الاحتياطية =====
// تُستخدم للمنتج الذي لا يحدد له المشرف ألواناً مخصصة.
// كلها فاتحة هادئة (أبيض وتدرجاته) تظهر جميلة خلف أي منتج، وتتحول النصوص تلقائياً إلى الغامق.
// تُوزَّع على المنتجات بالتناوب. accent = لون التمييز في قسم "من نحن" والفوتر (الأبيض لا يصلح لهما).
const FALLBACK_COLORS = [
  { glow: '#ffffff', base: '#dbe4f1', accent: ['#5b7cfa', '#2f43b3'] },   // لؤلؤي مائل للأزرق
  { glow: '#fffdf9', base: '#eadfce', accent: ['#d98a3d', '#8a4a14'] },   // كريمي دافئ
  { glow: '#fbfffd', base: '#d3e8dd', accent: ['#2fa37a', '#17644b'] },   // نعناعي هادئ
  { glow: '#fffafb', base: '#efd8dc', accent: ['#d4577a', '#8c2b4a'] },   // وردي ناعم
  { glow: '#fdfcff', base: '#ddd8f1', accent: ['#7f63e0', '#45319b'] }    // لافندر
];
const LIGHT_ACCENT = ['#5b7cfa', '#2f43b3'];   // لون التمييز إن كتبتَ أنت ألواناً فاتحة

let products = [];   // المنتجات الصالحة فقط
let current  = 0;    // رقم المنتج المعروض في المنتصف
let busy     = false;


/* ---------- لودر إعادة التحميل (زر "الرئيسية") ---------- */

const root         = document.documentElement;
const RELOAD_DELAY = 500;    // مدة ظهور اللودر قبل إعادة التحميل (ms)
const LOADER_MIN   = 1000;   // أقل زمن (من بداية التحميل) يبقى فيه اللودر بعد إعادة التحميل (ms)
const cameFromReload = root.classList.contains('reloading');   // يضبطها السكربت الصغير في head
let reloadingNow = false;

if (cameFromReload) window.scrollTo(0, 0);

function reloadHome() {
  if (reloadingNow) return;
  reloadingNow = true;

  const base = bg.classList.contains('light')
    ? '#1b2340'   // خلفية فاتحة: لودر غامق ليظهر الدوّار الأبيض
    : (getComputedStyle(bg).getPropertyValue('--base').trim() || '#0000c8');
  try {
    sessionStorage.setItem('ronqReload', '1');
    sessionStorage.setItem('ronqReloadBg', base);
  } catch (e) {}
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  root.style.setProperty('--loader-bg', base);   // لون اللودر = لون خلفية المنتج الحالي
  root.classList.add('reloading');
  setTimeout(() => location.reload(), RELOAD_DELAY);
}

document.querySelectorAll('a[data-reload]').forEach(a =>
  a.addEventListener('click', e => { e.preventDefault(); reloadHome(); })
);

// بعد إعادة التحميل: يبقى اللودر ثانية على الأقل ثم يختفي بنعومة
async function hideLoader() {
  if (!cameFromReload) return;
  const wait = Math.max(0, LOADER_MIN - performance.now());
  if (wait) await new Promise(r => setTimeout(r, wait));
  try {
    sessionStorage.removeItem('ronqReload');
    sessionStorage.removeItem('ronqReloadBg');
  } catch (e) {}
  root.classList.remove('reloading');
  if ('scrollRestoration' in history) history.scrollRestoration = 'auto';
  await new Promise(r => setTimeout(r, 380));   // مدة التلاشي
}


/* ---------- بيانات المنتج (الاسم والشرح والأسعار والميزات) ---------- */

const textBox = document.querySelector('.text');      // القسم الأيمن: الاسم والشرح والزر
const infoBox = document.querySelector('.maizat');    // القسم الأيسر: الأسعار والميزات
const mohtaoa = document.querySelector('.mohtaoa');

const els = {
  name:     document.querySelector('.text h1'),
  desc:     document.querySelector('.text p'),
  oldPrice: document.querySelector('.alsaer .kdem'),
  price:    document.querySelector('.alsaer .jaaded .price'),
  features: document.querySelector('.overlay ul'),
  badge:    document.getElementById('offerBadge')       // شارة العرض
};

// أزمنة حركة النصوص (ms): خروج، توقف خارج الشاشة، عودة
const TEXT_OUT  = 550;
const TEXT_HOLD = 250;
const TEXT_IN   = 1500;

// القيم الأصلية المكتوبة في index.html: تُستخدم لأي حقل ناقص في بيانات المنتج
const defaults = {
  name:     els.name     ? els.name.textContent.trim()     : '',
  desc:     els.desc     ? els.desc.textContent.trim()     : '',
  oldPrice: els.oldPrice ? els.oldPrice.textContent.trim() : '',
  price:    els.price    ? els.price.textContent.trim()    : '',
  features: els.features ? [...els.features.children].map(li => li.textContent.trim()) : []
};

function toPrice(v) {
  return typeof v === 'number' ? v + '$' : String(v);
}

// يأخذ الحقول النصية من المنتج ويتجاهل أي حقل فارغ أو بشكل خاطئ
function normalizeText(o) {
  const t = {};
  if (o.name)     t.name     = String(o.name);
  if (o.desc)     t.desc     = String(o.desc);
  // oldPrice: '' (أو false) = بدون سعر قديم، ويظهر السعر الجديد وحده. وإن لم تكتب الحقل أصلاً يؤخذ من index.html
  if ('oldPrice' in o) t.oldPrice = o.oldPrice ? toPrice(o.oldPrice) : '';
  if (o.price)    t.price    = toPrice(o.price);
  if (Array.isArray(o.features) && o.features.length) t.features = o.features.map(String);

  // العرض: offer: true مع offerText (وofferLabel اختياري)، أو offer: 'نص العرض' مباشرة
  if (o.offer) {
    const txt = typeof o.offer === 'string' ? o.offer : o.offerText;
    if (txt) {
      t.offer      = String(txt);
      t.offerLabel = o.offerLabel ? String(o.offerLabel) : 'عرض خاص';
    }
  }
  return t;
}

// شارة العرض في أعلى يمين المنتج: تظهر فقط للمنتجات التي فيها عرض
let offerAnim = null;
function showOffer(t, animate) {
  const b = els.badge;
  if (!b) return;
  if (offerAnim) { offerAnim.cancel(); offerAnim = null; }
  if (!t.offer) { b.hidden = true; return; }
  b.querySelector('.ob-label').textContent = t.offerLabel || 'عرض خاص';
  b.querySelector('.ob-text').textContent  = t.offer;
  b.hidden = false;
  placeOfferBadge();
  if (animate) {
    offerAnim = b.animate(
      [{ opacity: 0, scale: '0.5' }, { opacity: 1, scale: '1' }],
      { duration: 500, easing: 'cubic-bezier(.2, 1.4, .4, 1)' }
    );
  }
}

// الصورة محصورة داخل صندوق ثابت (contain)، فإذا كانت عريضة (نظارة مثلاً) تبتعد زاوية الصندوق عن المنتج.
// لذلك نضع الشارة عند الزاوية العليا اليمنى لمستطيل الصورة الفعلي.
function placeOfferBadge() {
  const b = els.badge;
  if (!b || b.hidden || !main.naturalWidth) return;
  const bw = main.offsetWidth, bh = main.offsetHeight;
  const s = Math.min(bw / main.naturalWidth, bh / main.naturalHeight);
  const w = main.naturalWidth * s, h = main.naturalHeight * s;
  b.style.top   = Math.max(0, (bh - h) / 2 - 10) + 'px';
  b.style.right = Math.max(0, (bw - w) / 2) + 'px';
}

// صندوق صورة المنتج ثابت الحجم، والصورة العريضة (نظارة) تترك فراغاً تحتها. نقيس أصغر فراغ تحت أي منتج
// ونضعه في المتغير --trim ليرفع العنوان نحو الصورة في الشاشات الصغيرة (ronq.css) دون أن يلمسها.
function updateImageGap() {
  const holder = document.querySelector('.safhaon');
  const bw = main.offsetWidth, bh = main.offsetHeight;
  if (!holder || !bw || !bh) return;
  // مع المعرض تأتي الصور المصغّرة تحت المنتج مباشرة، فلا نرفع العنوان نحو الصورة
  if (imgsBox.classList.contains('has-gallery')) { holder.style.setProperty('--trim', '6px'); return; }
  const imgs = products.length ? products.map(p => p.img) : [main];
  let trim = Infinity;
  imgs.forEach(im => {
    if (!im.naturalWidth) return;
    const s = Math.min(bw / im.naturalWidth, bh / im.naturalHeight);
    trim = Math.min(trim, (bh - im.naturalHeight * s) / 2);
  });
  holder.style.setProperty('--trim', (isFinite(trim) ? Math.max(0, Math.floor(trim)) : 0) + 'px');
}

window.addEventListener('load', updateImageGap);
window.addEventListener('resize', updateImageGap);
main.addEventListener('load', updateImageGap);
window.addEventListener('load', placeOfferBadge);
window.addEventListener('resize', placeOfferBadge);
main.addEventListener('load', placeOfferBadge);

function applyText(p, animate) {
  const t = { ...defaults, ...p.text };
  if (els.name)     els.name.textContent     = t.name;
  if (els.desc)     els.desc.textContent     = t.desc;
  if (els.oldPrice) els.oldPrice.textContent = (t.oldPrice && t.oldPrice !== t.price) ? t.oldPrice : '';
  if (els.price)    els.price.textContent    = t.price;
  if (els.features) {
    els.features.replaceChildren(...t.features.map(f => {
      const li = document.createElement('li');
      li.textContent = f;
      return li;
    }));
  }
  showOffer(t, animate);
}

// المسافة التي يحتاجها القسم ليخرج بالكامل من الشاشة (يمين أو يسار)
function offscreenShift(el, side) {
  const r = el.getBoundingClientRect();
  return side === 'right' ? window.innerWidth - r.left + 30 : -(r.right + 30);
}

// في الجوال: النصوص لا تخرج للجانبين، بل تتلاشى لحظة وتعود في مكانها وقد تغيّرت
const PHONE_QUERY = '(max-width: 900px)';   // نفس حد التخطيط العمودي في ronq.css
const FADE_OUT  = 300;
const FADE_HOLD = 150;
const FADE_IN   = 400;

async function fadeText(p) {
  const targets = [els.name, els.desc, document.querySelector('.alsaer'), document.querySelector('.overlay')].filter(Boolean);
  const outs = targets.map(el => el.animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: FADE_OUT, easing: 'ease-in', fill: 'forwards' }
  ));

  try {
    await Promise.all(outs.map(a => a.finished));
    applyText(p, true);
    await new Promise(r => setTimeout(r, FADE_HOLD));

    const ins = targets.map(el => el.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: FADE_IN, easing: 'ease-out', fill: 'backwards' }
    ));
    outs.forEach(a => a.cancel());
    await Promise.all(ins.map(a => a.finished));
  } finally {
    outs.forEach(a => a.cancel());
  }
}

// القسمان يخرجان إلى جانبي الموقع، يتوقفان قليلاً وتتبدل بياناتهما، ثم يعودان
async function swapText(p) {
  if (window.matchMedia(PHONE_QUERY).matches) return fadeText(p);
  const boxes = [
    { el: textBox, side: 'right' },
    { el: infoBox, side: 'left' }
  ].filter(b => b.el).map(b => ({ ...b, dx: offscreenShift(b.el, b.side) }));

  const outs = boxes.map(b => b.el.animate(
    [{ transform: 'translateX(0)' }, { transform: `translateX(${b.dx}px)` }],
    { duration: TEXT_OUT, easing: 'ease-in', fill: 'forwards' }
  ));

  try {
    await Promise.all(outs.map(a => a.finished));
    applyText(p, true);
    await new Promise(r => setTimeout(r, TEXT_HOLD));

    const ins = boxes.map((b, i) => b.el.animate(
      [{ transform: `translateX(${b.dx}px)` }, { transform: 'translateX(0)' }],
      { duration: TEXT_IN, delay: i * 90, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }
    ));
    outs.forEach(a => a.cancel());
    await Promise.all(ins.map(a => a.finished));
  } finally {
    outs.forEach(a => a.cancel());
  }
}

// نثبّت ارتفاع القسم على أطول بيانات بين المنتجات، حتى لا تتحرك صورة المنتج عند اختلاف طول النصوص
function lockLayoutHeight() {
  if (!mohtaoa || !products.length) return;
  mohtaoa.style.minHeight = '';
  if (!mohtaoa.offsetHeight) return;          // في الجوال التخطيط مختلف ولا حاجة له
  let max = 0;
  products.forEach(p => {
    applyText(p);
    max = Math.max(max, mohtaoa.offsetHeight);
  });
  applyText(products[current]);
  mohtaoa.style.minHeight = max + 'px';
  updateGlowCenter();
}

let lockTimer;
function scheduleLock() {
  clearTimeout(lockTimer);
  lockTimer = setTimeout(() => (busy ? scheduleLock() : lockLayoutHeight()), 200);
}
window.addEventListener('resize', scheduleLock);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleLock);


/* ---------- أدوات مساعدة ---------- */

function plainLoad(src, cors) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('تعذّر تحميل الصورة: ' + src));
    img.src = src;
  });
}

/* ---------- قصّ الهوامش الفارغة حول المنتج تلقائياً ----------
   صور المنتجات تختلف في المساحة الشفافة (أو البيضاء) حول المنتج، فيظهر المنتج أحياناً أصغر وأحياناً أكبر،
   وتبعد الصور المصغّرة عنه. لذلك نقصّ كل صورة عند التحميل على حدود المنتج الفعلية مع هامش ثابت صغير،
   فتشغل كل المنتجات صندوق العرض بنفس الطريقة. إن تعذّر القصّ (حماية CORS مثلاً) تُعرض الصورة كما هي. */

const TRIM_ALPHA  = 24;     // أدنى شفافية تُعدّ جزءاً من المنتج (من 255)
const TRIM_MARGIN = 0.03;   // الهامش حول المنتج بعد القصّ (نسبة من أطول ضلع)
const trimCache = new Map();

function findBox(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  if (!W || !H) return null;
  const s = Math.min(1, 400 / Math.max(W, H));
  const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;      // يرمي خطأ إن كانت الصورة محجوبة (CORS)

  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 20) clear++;
  const alphaMode = clear >= 0.03 * w * h;           // صورة بخلفية شفافة؟

  let isFg, bgc = null;
  if (alphaMode) {
    isFg = i => d[i + 3] >= TRIM_ALPHA;
  } else {
    // خلفية مصمتة (jpg): لون الزوايا الأربع يجب أن يتقارب، وما يختلف عنه فهو المنتج
    const k = Math.max(2, Math.round(Math.min(w, h) * 0.03));
    const patch = (x0, y0) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y0 + k; y++) for (let x = x0; x < x0 + k; x++) { const i = (y * w + x) * 4; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      return [r / n, g / n, b / n];
    };
    const cs = [patch(0, 0), patch(w - k, 0), patch(0, h - k), patch(w - k, h - k)];
    bgc = [0, 1, 2].map(ch => cs.reduce((a, p) => a + p[ch], 0) / 4);
    if (cs.some(p => Math.max(Math.abs(p[0] - bgc[0]), Math.abs(p[1] - bgc[1]), Math.abs(p[2] - bgc[2])) > 40)) return null;
    isFg = i => d[i + 3] >= TRIM_ALPHA &&
      Math.max(Math.abs(d[i] - bgc[0]), Math.abs(d[i + 1] - bgc[1]), Math.abs(d[i + 2] - bgc[2])) > 38;
  }

  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isFg((y * w + x) * 4)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const bx = Math.floor(x0 / s), by = Math.floor(y0 / s);
  const bw = Math.min(W - bx, Math.ceil((x1 + 1) / s) - bx), bh = Math.min(H - by, Math.ceil((y1 + 1) / s) - by);
  const m = Math.round(Math.max(bw, bh) * TRIM_MARGIN);
  if (bw + 2 * m >= 0.9 * W && bh + 2 * m >= 0.9 * H) return null;   // لا هوامش تستحق القصّ
  return { bx, by, bw, bh, m, alphaMode, bgc };
}

function trimImage(src) {
  if (/^(blob|data):/i.test(src)) return Promise.resolve(null);
  if (trimCache.has(src)) return trimCache.get(src);
  const job = (async () => {
    try {
      const img = await plainLoad(src, true);
      const b = findBox(img);
      if (!b) return null;
      const cw = b.bw + 2 * b.m, ch = b.bh + 2 * b.m;
      const sc = Math.min(1, 1600 / Math.max(cw, ch));
      const c = document.createElement('canvas');
      c.width = Math.round(cw * sc); c.height = Math.round(ch * sc);
      const ctx = c.getContext('2d');
      if (!b.alphaMode) { ctx.fillStyle = 'rgb(' + b.bgc.map(Math.round).join(',') + ')'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, b.bx, b.by, b.bw, b.bh, b.m * sc, b.m * sc, b.bw * sc, b.bh * sc);
      const blob = await new Promise(r => c.toBlob(r, b.alphaMode ? 'image/png' : 'image/jpeg', 0.92));
      return blob ? URL.createObjectURL(blob) : null;
    } catch (e) {
      return null;
    }
  })();
  trimCache.set(src, job);
  return job;
}

async function loadImage(src) {
  const trimmed = await trimImage(src);
  return plainLoad(trimmed || src, false);
}

// سطوع لون CSS (0 غامق ... 1 فاتح): نحوّله إلى RGB عبر canvas ليعمل مع hex وhsl والأسماء
function brightness(color) {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    const v = ctx.fillStyle;
    let r, g, b;
    if (v[0] === '#') {
      const n = parseInt(v.slice(1), 16);
      r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
    } else {
      [r, g, b] = v.match(/[\d.]+/g).map(Number);
    }
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  } catch (err) {
    return 0;
  }
}

// الخلفية فاتحة؟ عندها تتحول النصوص والأزرار إلى الغامق (كلاس light)
function isLightBg(glow, base) {
  return brightness(glow) * 0.35 + brightness(base) * 0.65 > 0.62;
}

function buildProduct(item, index, img) {
  const o = typeof item === 'string' ? { src: item } : item;
  let glow = o.glow, base = o.base, accent = null;

  if (!glow || !base) {
    const f = FALLBACK_COLORS[index % FALLBACK_COLORS.length];
    glow = glow || f.glow;
    base = base || f.base;
    accent = f.accent;
  }
  const light = isLightBg(glow, base);
  return { url: img.src, img, glow, base, light, accent: light ? (accent || LIGHT_ACCENT) : null, text: normalizeText(o), gallery: Array.isArray(o.gallery) ? o.gallery : [] };
}

function setBackground(p) {
  bg.style.setProperty('--glow', p.glow);
  bg.style.setProperty('--base', p.base);
  bg.classList.toggle('light', !!p.light);
  // لون تمييز لقسم "من نحن" والفوتر عند الخلفيات الفاتحة (يقرؤه about.js)
  if (p.accent) {
    bg.style.setProperty('--acc-glow', p.accent[0]);
    bg.style.setProperty('--acc-base', p.accent[1]);
  } else {
    bg.style.removeProperty('--acc-glow');
    bg.style.removeProperty('--acc-base');
  }
}


/* ---------- مركز التوهج خلف صورة المنتج ---------- */

function getGlowGeometry() {
  const r = main.getBoundingClientRect();
  const b = bg.getBoundingClientRect();
  const cx = r.left - b.left + r.width / 2;
  const cy = r.top - b.top + r.height / 2;
  const radius = Math.hypot(Math.max(cx, b.width - cx), Math.max(cy, b.height - cy)) + 4;
  return { cx, cy, radius };
}

function updateGlowCenter() {
  const { cx, cy } = getGlowGeometry();
  bg.style.setProperty('--cx', cx + 'px');
  bg.style.setProperty('--cy', cy + 'px');
}

window.addEventListener('load', updateGlowCenter);
window.addEventListener('resize', updateGlowCenter);
main.addEventListener('load', updateGlowCenter);
updateGlowCenter();


/* ---------- معرض صور المنتج ----------
   الصورة الأولى للمنتج هي الرئيسية، وبقية صوره (زواياه الأخرى) تظهر مصغّرة تحته؛
   الضغط عليها أو السحب يميناً/يساراً على المنتج يبدّل الصورة بحركة ناعمة. */

const imgsBox    = document.querySelector('.imgs');
const galleryBox = document.getElementById('gallery');
let galleryList  = [];      // [{ url }] — الأولى هي الصورة الأساسية
let galleryIdx   = 0;       // رقم الصورة المعروضة
let gallerySwap  = 0;       // رقم آخر عملية تبديل (لتجاهل الضغطات السريعة المتتالية)
let galleryAnim  = null;
let galleryBuild = 0;       // رقم آخر بناء للمعرض (لتجاهل البناء القديم عند التنقل السريع)
let galleryRatios = [];     // نسبة ارتفاع/عرض كل صورة من صور المنتج (لوضع الصور المصغّرة تحت أطول زاوية)
let reserveGallery = false; // أي منتج له معرض؟ نحجز مساحته دائماً حتى لا تقفز الصفحة بين المنتجات

// الصور المصغّرة تلتصق بأسفل المنتج بمسافة ثابتة (لا تبعد ولا تقترب مهما كانت أبعاد الصورة).
// موضعها ثابت: تحت أطول زاوية للمنتج، فلا تتحرك عند التبديل بين الزوايا.
const GALLERY_GAP = 34;
function placeGallery() {
  if (!galleryBox || !galleryRatios.length) return;
  const bw = main.offsetWidth, bh = main.offsetHeight;
  if (!bw || !bh) return;
  const shown = Math.min(bh, bw * Math.max(...galleryRatios));   // تحت أطول زاوية: الموضع ثابت بين كل الصور
  galleryBox.style.bottom = 'auto';
  galleryBox.style.top = Math.round(bh / 2 + shown / 2 + GALLERY_GAP) + 'px';
}
window.addEventListener('resize', placeGallery);

async function setGallery(extraSrcs) {
  if (!galleryBox || !imgsBox) return;
  const extras = (Array.isArray(extraSrcs) ? extraSrcs : []).map(s => String(s || '').trim().replace(/^\/+/, '')).filter(Boolean);   // نحذف الشرطة الأولى إن كُتبت: '/imgs/a.png' = 'imgs/a.png'

  const build = ++galleryBuild;
  galleryBox.replaceChildren();
  galleryBox.hidden = true;
  galleryList = [];
  galleryRatios = [];
  galleryIdx = 0;
  // نحجز مساحة الصور المصغّرة فوراً حتى لا تقفز الصفحة بعد تحميل الصور
  imgsBox.classList.toggle('has-gallery', reserveGallery || extras.length > 0);
  updateImageGap();
  if (!extras.length) return;

  const results = await Promise.allSettled([main.src, ...extras].map(loadImage));
  if (build !== galleryBuild) return;   // انتقل الزائر لمنتج آخر أثناء التحميل
  const seen = new Set();
  results.forEach(res => {
    if (res.status !== 'fulfilled') { console.warn('تم تجاهل صورة من المعرض:', res.reason.message); return; }
    const url = res.value.src;
    if (seen.has(url)) return;       // إن كررتَ الصورة الأساسية لا تظهر مرتين
    seen.add(url);
    galleryList.push({ url });
    galleryRatios.push(res.value.naturalHeight / res.value.naturalWidth);
  });

  if (galleryList.length < 2) {      // لا معنى لمعرض بصورة واحدة
    galleryList = [];
    imgsBox.classList.toggle('has-gallery', reserveGallery);
    updateImageGap();
    updateGlowCenter();
    return;
  }

  galleryBox.replaceChildren(...galleryList.map((g, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'g-thumb' + (i === 0 ? ' active' : '');
    b.style.backgroundImage = 'url(' + JSON.stringify(g.url) + ')';
    b.setAttribute('aria-label', 'عرض الصورة ' + (i + 1) + ' من ' + galleryList.length);
    b.addEventListener('click', () => showGalleryImage(i));
    return b;
  }));
  galleryBox.hidden = false;
  placeGallery();
  galleryBox.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
  main.draggable = false;
  updateImageGap();
  updateGlowCenter();
}

// dir: 1 = التالية (تخرج الصورة الحالية لليسار وتدخل الجديدة من اليمين)، -1 = السابقة
async function showGalleryImage(i, dir) {
  if (!galleryList[i] || i === galleryIdx) return;
  if (dir === undefined) dir = i > galleryIdx ? 1 : -1;
  galleryIdx = i;
  placeGallery();
  const token = ++gallerySwap;

  [...galleryBox.children].forEach((b, k) => b.classList.toggle('active', k === i));
  // إن كان صف الصور المصغّرة أعرض من الشاشة نمرّره ليظهر المختار
  const t = galleryBox.children[i];
  if (t && galleryBox.scrollWidth > galleryBox.clientWidth) {
    galleryBox.scrollTo({ left: t.offsetLeft - (galleryBox.clientWidth - t.offsetWidth) / 2, behavior: 'smooth' });
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dx = reduce ? 0 : 28;
  try {
    if (galleryAnim) galleryAnim.cancel();
    galleryAnim = main.animate(
      [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: (-dir * dx) + 'px 0' }],
      { duration: reduce ? 1 : 170, easing: 'ease-in', fill: 'forwards' }
    );
    await galleryAnim.finished;

    main.src = galleryList[i].url;
    try { await main.decode(); } catch (e) {}
    if (token !== gallerySwap) return;       // ضغط المستخدم صورة أخرى أثناء الحركة: هي التي تكمل

    const out = galleryAnim;
    galleryAnim = main.animate(
      [{ opacity: 0, translate: (dir * dx) + 'px 0' }, { opacity: 1, translate: '0 0' }],
      { duration: reduce ? 1 : 280, easing: 'ease-out' }
    );
    out.cancel();
    await galleryAnim.finished;
  } catch (e) {
    /* أُلغيت الحركة بضغطة أحدث */
  } finally {
    if (token === gallerySwap && galleryAnim) { galleryAnim.cancel(); galleryAnim = null; }
  }
}

function stepGallery(d) {
  if (galleryList.length < 2) return;
  showGalleryImage((galleryIdx + d + galleryList.length) % galleryList.length, d);
}

// السحب بالإصبع (أو الماوس) على المنتج: يساراً = التالية، يميناً = السابقة
let dragStartX = null, dragStartY = 0;
if (imgsBox) {
  imgsBox.addEventListener('pointerdown', e => {
    if (galleryList.length < 2 || e.button > 0 || e.target.closest('.gallery')) return;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
  });
  imgsBox.addEventListener('pointerup', e => {
    if (dragStartX === null) return;
    const dx = e.clientX - dragStartX, dy = e.clientY - dragStartY;
    dragStartX = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) stepGallery(dx < 0 ? 1 : -1);
  });
  imgsBox.addEventListener('pointercancel', () => { dragStartX = null; });
}


/* ---------- شريط الصور الصغيرة (حلقة) ---------- */

const STRIP_MS = 700;   // مدة تقدّم الصور داخل الشريط (ms)

// الشريط يعرض المنتجات التي تلي المنتج المعروض في المنتصف، ويلتف حول القائمة
// (المنتج المعروض في المنتصف لا يتكرر داخل الشريط)
function stripIndexes(cur) {
  const n = products.length;
  const count = isSmall() ? n - 1 : Math.min(VISIBLE, n - 1);   // الجوال: كل المنتجات للتمرير باللمس
  return Array.from({ length: count }, (_, k) => (cur + 1 + k) % n);
}

function makeThumb(pi) {
  const img = document.createElement('img');
  img.src = products[pi].url;
  img.alt = 'المنتج ' + (pi + 1);
  img.draggable = false;
  img.dataset.index = pi;
  img.addEventListener('click', () => goTo(pi, img));
  return img;
}

function updateArrows() {
  const single = products.length < 2;
  btnPrev.hidden = single;
  btnNext.hidden = single;
  const box = strip.parentElement;
  box.hidden = single;                                          // منتج واحد: لا شريط
  box.style.setProperty('--n', Math.max(1, strip.children.length));   // عرض الشريط على قد عدد صوره
}

// بناء الشريط أول مرة (بدون حركة)
function renderStrip() {
  strip.replaceChildren(...stripIndexes(current).map(makeThumb));
  updateArrows();
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// يحدّث الشريط للمنتج الجديد بحركة هادئة، كأن الصور مصطفّة على "دور" يتحرك:
// الصورة المضغوطة تغادر مكانها (تطير للمنتصف)، فتتقدم الصور التي بعدها لتملأ الفراغ بانزلاق ناعم،
// وصورة المنتج الذي كان في المنتصف تظهر في نهاية الصف.
// lateIndex: منتج يظهر مكانه في الشريط في آخر الحركة فقط (عند الرجوع تهبط إليه الصورة الطائرة)
function updateStrip(newCur, clickedEl, lateIndex = -1) {
  const small = isSmall();
  const oldEls = [...strip.children];
  const oldRects = new Map(oldEls.map(el => [el, el.getBoundingClientRect()]));
  const byIndex = new Map(oldEls.map(el => [Number(el.dataset.index), el]));

  const reused = new Set();
  const fresh = new Set();
  // الجوال: الشريط "دور" بسيط. الصورة المضغوطة تخرج منه فقط، والبقية تحتفظ بترتيبها وتتقدم خطوة،
  // وصورة المنتج الذي كان في المنتصف تُضاف في آخر الدور (بدون التفاف يجعل الصور تعبر فوق بعضها)
  let idxList = stripIndexes(newCur);
  if (small && lateIndex < 0) {
    idxList = oldEls.map(el => Number(el.dataset.index)).filter(pi => pi !== newCur);
    idxList.push(current);
  }
  // الجوال أبطأ وأهدأ: الانزلاق يبدأ بعد أن تبتعد الصورة الطائرة، والصورة الجديدة تظهر بعده
  const slideMs    = small ? 1000 : STRIP_MS;
  const slideDelay = small ? 250 : 100;
  const freshMs    = small ? 800 : STRIP_MS;
  const freshDelay = small ? 550 : 150;

  const ordered = idxList.map(pi => {
    const old = byIndex.get(pi);
    if (old && old !== clickedEl) { reused.add(old); return old; }
    const el = makeThumb(pi);
    fresh.add(el);
    return el;
  });

  // الصور الخارجة من الشريط (غير المضغوطة): نسخة ثابتة تتلاشى في مكانها بنفس شكلها (الخلفية الضبابية)
  oldEls.forEach(el => {
    if (reused.has(el) || el === clickedEl) return;
    const r = oldRects.get(el);
    const cs = getComputedStyle(el);
    const ghost = el.cloneNode();
    Object.assign(ghost.style, {
      position: 'fixed',
      left: r.left + 'px',
      top: r.top + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
      maxWidth: 'none',
      objectFit: 'contain',
      margin: 0,
      zIndex: 5,
      pointerEvents: 'none',
      boxSizing: 'border-box',
      padding: cs.padding,
      borderWidth: cs.borderTopWidth,
      borderStyle: cs.borderTopStyle,
      borderColor: cs.borderTopColor,
      borderRadius: cs.borderRadius,
      backgroundColor: cs.backgroundColor
    });
    document.body.appendChild(ghost);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, easing: 'ease-out', fill: 'forwards' })
      .finished.then(() => ghost.remove(), () => ghost.remove());
  });

  // إطار الصورة المضغوطة (خلفيتها الضبابية) يتلاشى في مكانه بهدوء بدل أن يختفي فجأة
  if (clickedEl) {
    const r = oldRects.get(clickedEl);
    const cs = getComputedStyle(clickedEl);
    if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      const frame = document.createElement('div');
      Object.assign(frame.style, {
        position: 'fixed',
        left: r.left + 'px',
        top: r.top + 'px',
        width: r.width + 'px',
        height: r.height + 'px',
        zIndex: 4,
        pointerEvents: 'none',
        boxSizing: 'border-box',
        borderWidth: cs.borderTopWidth,
        borderStyle: cs.borderTopStyle,
        borderColor: cs.borderTopColor,
        borderRadius: cs.borderRadius,
        backgroundColor: cs.backgroundColor,
        backdropFilter: cs.backdropFilter,
        webkitBackdropFilter: cs.backdropFilter
      });
      document.body.appendChild(frame);
      frame.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: 'ease-out', fill: 'forwards' })
        .finished.then(() => frame.remove(), () => frame.remove());
    }
  }

  strip.replaceChildren(...ordered);

  const ease = 'cubic-bezier(.45, .05, .25, 1)';   // حركة هادئة تبدأ وتنتهي بنعومة
  const anims = [];
  const shifts = [];

  // الصور الباقية تنزلق من مكانها القديم إلى الجديد (بعد لحظة قصيرة من اختفاء الصورة المضغوطة)
  reused.forEach(el => {
    const o = oldRects.get(el);
    const n = el.getBoundingClientRect();
    const dx = o.left - n.left;
    const dy = o.top - n.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    shifts.push(dx);
    anims.push(el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: slideMs, delay: slideDelay, easing: ease, fill: 'backwards' }
    ).finished);
  });

  // الصور الجديدة تدخل مع نفس الاتجاه كأنها جزء من الحركة
  const typical = median(shifts);
  fresh.forEach(el => {
    if (Number(el.dataset.index) === lateIndex) {
      // تبقى مخفية حتى تصلها الصورة الطائرة في آخر الحركة
      anims.push(el.animate(
        [{ opacity: 0 }, { opacity: 0, offset: 0.9 }, { opacity: 1 }],
        { duration: DURATION, easing: 'linear', fill: 'backwards' }
      ).finished);
      return;
    }
    anims.push(el.animate(
      [{ opacity: 0, transform: `translateX(${typical}px)` }, { opacity: 1, transform: 'translateX(0)' }],
      { duration: freshMs, delay: freshDelay, easing: ease, fill: 'backwards' }
    ).finished);
  });

  updateArrows();
  return Promise.all(anims).catch(() => {});
}


/* ---------- الانتقال إلى منتج ---------- */

// الشاشات الصغيرة (نفس حد التخطيط العمودي في ronq.css)
const SMALL_QUERY = '(max-width: 900px)';
const isSmall = () => window.matchMedia(SMALL_QUERY).matches;

// عند عبور حد الشاشة الصغيرة نعيد بناء الشريط (كل المنتجات للتمرير في الجوال، و5 في الشاشات الكبيرة)
window.matchMedia(SMALL_QUERY).addEventListener('change', () => {
  if (!busy && products.length) renderStrip();
});

// الشريط في الجوال تحت الصورة: إن كان المنتج الكبير خارج الشاشة نصعد إليه أولاً ثم تبدأ الحركة
async function ensureMainVisible() {
  const r = main.getBoundingClientRect();
  if (r.top >= 0 && r.bottom <= window.innerHeight) return;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  let last = -1, same = 0;
  for (let i = 0; i < 30 && same < 3; i++) {
    await new Promise(res => setTimeout(res, 50));
    same = window.scrollY === last ? same + 1 : 0;
    last = window.scrollY;
  }
}

// المستطيل الذي تشغله الصورة فعلياً داخل صندوق (object-fit: contain)
function fitRect(box, img) {
  const s = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h };
}

// المستطيل الداخلي لصورة صغيرة (بعد الحشوة والإطار)، حيث تقع الصورة نفسها فعلياً
function innerRect(el) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const n = k => parseFloat(cs[k]) || 0;
  const l = n('paddingLeft') + n('borderLeftWidth'), t = n('paddingTop') + n('borderTopWidth');
  const rr = n('paddingRight') + n('borderRightWidth'), b = n('paddingBottom') + n('borderBottomWidth');
  return { left: r.left + l, top: r.top + t, width: r.width - l - rr, height: r.height - t - b };
}

function placeFixed(el, r, z) {
  Object.assign(el.style, {
    position: 'fixed',
    left: r.left + 'px',
    top: r.top + 'px',
    width: r.width + 'px',
    height: r.height + 'px',
    maxWidth: 'none',
    margin: 0,
    zIndex: z,
    transformOrigin: 'top left',
    pointerEvents: 'none'
  });
}

// تحريك صورة طائرة من مستطيل إلى آخر (انتقال وتكبير/تصغير)
function fly(el, from, target) {
  return el.animate([
    { transform: 'translate(0, 0) scale(1, 1)' },
    { transform: `translate(${target.left - from.left}px, ${target.top - from.top}px) scale(${target.width / from.width}, ${target.height / from.height})` }
  ], { duration: DURATION, easing: 'ease-in-out', fill: 'forwards' }).finished;
}

// التالي أو الضغط على صورة من الشريط (thumb):
//   الصورة تطير من مكانها إلى المنتصف، ويختفي مكانها من الشريط فيتقدم الدور، وصورة المنتصف القديمة تصعد وتتلاشى
//   وتظهر في نهاية الصف.
// السابق (بدون thumb): عكس ذلك تماماً: صورة المنتصف تعود إلى بداية الصف، والمنتج السابق ينزل من الأعلى
//   إلى المنتصف، ويتراجع الدور خطوة.
async function goTo(index, thumb) {
  if (busy || index === current || !products[index]) return;
  busy = true;

  const next  = products[index];
  const prev  = products[current];
  const back  = !thumb;
  const small = isSmall();
  let flyer, mainAnim, waveAnim, galFade = null;

  try {
    // إن كان الزائر يشاهد زاوية أخرى للمنتج: نعيد صورته الرئيسية قبل الحركة، وصور الزوايا تتلاشى
    if (galleryIdx !== 0 || galleryAnim) {
      gallerySwap++;
      if (galleryAnim) { galleryAnim.cancel(); galleryAnim = null; }
      galleryIdx = 0;
      main.src = prev.url;
      try { await main.decode(); } catch (e) {}
    }
    if (galleryBox && !galleryBox.hidden) {
      galFade = galleryBox.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
    }
    if (small) await ensureMainVisible();
    const to = main.getBoundingClientRect();
    const { cx, cy, radius } = getGlowGeometry();

    // 1) الخلفية الجديدة: تتسع من وسط المنتج، وفي الشاشات الصغيرة تتبدل بتلاشٍ ناعم
    wave.style.setProperty('--glow', next.glow);
    wave.style.setProperty('--base', next.base);
    // ألوان النصوص (فاتحة/غامقة) تتبدل في منتصف الحركة مع اتساع الخلفية
    setTimeout(() => bg.classList.toggle('light', !!next.light), DURATION * 0.5);
    waveAnim = small
      ? wave.animate([
          { clipPath: 'inset(0)', opacity: 0 },
          { clipPath: 'inset(0)', opacity: 1 }
        ], { duration: DURATION + 200, easing: 'ease-in-out', fill: 'forwards' })
      : wave.animate([
          { clipPath: `circle(0px at ${cx}px ${cy}px)` },
          { clipPath: `circle(${radius}px at ${cx}px ${cy}px)` }
        ], { duration: DURATION, easing: 'ease-in-out', fill: 'forwards' });

    // 2) الصورة الكبيرة
    if (back) {
      // الرجوع: نسخة من الصورة الحالية تبدأ من مكانها، والصورة الكبيرة تتبدل للمنتج السابق وتنزل من الأعلى
      flyer = new Image();
      flyer.src = prev.url;
      placeFixed(flyer, fitRect(to, prev.img), 10);
      document.body.appendChild(flyer);
      main.src = next.url;
      mainAnim = main.animate([
        { transform: `translateY(${-to.height * 0.9}px)`, opacity: 0 },
        { transform: 'translateY(0)', opacity: 1 }
      ], { duration: DURATION, easing: 'ease-out', fill: 'backwards' });
    } else {
      // التالي: الصورة الحالية تصعد للأعلى وتزداد شفافيتها
      mainAnim = main.animate([
        { transform: 'translateY(0)', opacity: 1 },
        { transform: `translateY(${-to.height * 0.9}px)`, opacity: 0 }
      ], { duration: DURATION, easing: 'ease-in', fill: 'forwards' });
    }

    // شارة العرض القديمة تتلاشى مع بدء الانتقال
    if (els.badge && !els.badge.hidden) {
      if (offerAnim) offerAnim.cancel();
      offerAnim = els.badge.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
    }

    const waits = [mainAnim.finished, waveAnim.finished];

    // النصوص تخرج (أو تتلاشى في الجوال) وتعود ببيانات المنتج الجديد
    const textPromise = swapText(next).catch(err => console.error(err));

    // 3) الصورة الطائرة والشريط
    const thumbBox = back ? null : innerRect(thumb);          // نقيسها قبل أن يتغير الشريط
    const stripPromise = updateStrip(index, thumb || null, back ? current : -1);

    if (back) {
      // تعود إلى مكانها الجديد في بداية الشريط
      const slot = strip.querySelector(`img[data-index="${current}"]`);
      if (slot) waits.push(fly(flyer, fitRect(to, prev.img), fitRect(innerRect(slot), prev.img)));
      else { flyer.remove(); flyer = null; }
    } else {
      // تطير من مكانها في الشريط إلى مكان وحجم صورة المنتصف
      flyer = new Image();
      flyer.src = next.url;
      const from = fitRect(thumbBox, next.img);
      placeFixed(flyer, from, 10);
      document.body.appendChild(flyer);
      waits.push(fly(flyer, from, fitRect(to, next.img)));
    }

    await Promise.all(waits);

    // نثبّت الصورة الأساسية والخلفية الجديدة
    if (!back) main.src = next.url;
    setBackground(next);
    mainAnim.cancel();
    waveAnim.cancel();
    if (flyer) { flyer.remove(); flyer = null; }

    current = index;
    updateGlowCenter();
    if (galFade) { galFade.cancel(); galFade = null; }
    setGallery(next.gallery).catch(err => console.error(err));   // زوايا المنتج الجديد

    // ننتظر انتهاء بقية الحركات: النصوص والشريط
    await Promise.all([textPromise, stripPromise]);
  } catch (err) {
    console.error(err);
  } finally {
    // مهما حصل: نفتح القفل ونزيل الصورة الطائرة
    if (flyer) flyer.remove();
    if (galFade) galFade.cancel();
    busy = false;
  }
}

// السهم الأيمن (يشير لليمين) = التالي: أول صورة في الشريط. السهم الأيسر (يشير لليسار) = السابق: المنتج الذي قبل الحالي
btnPrev.addEventListener('click', () => {
  const first = strip.firstElementChild;
  if (first) goTo(Number(first.dataset.index), first);
});
btnNext.addEventListener('click', () => {
  if (products.length > 1) goTo((current - 1 + products.length) % products.length, null);
});


/* ---------- التشغيل ---------- */

async function initCore() {
  const list = (typeof PRODUCTS !== 'undefined' && Array.isArray(PRODUCTS)) ? PRODUCTS : [];
  if (!list.length) {
    // لا منتجات في لوحة التحكم (أو تعذّر الاتصال): تبقى الصفحة كما هي في index.html
    if (els.badge) els.badge.hidden = true;
    return;
  }

  const results = await Promise.allSettled(list.map(item => {
    const src = typeof item === 'string' ? item : item && item.src;
    return src ? loadImage(src) : Promise.reject(new Error('منتج بدون مسار صورة (src)'));
  }));

  results.forEach((res, i) => {
    if (res.status === 'fulfilled') products.push(buildProduct(list[i], products.length, res.value));
    else console.warn('تم تجاهل منتج:', res.reason.message);
  });

  if (!products.length) return;

  // المنتج الأول هو الذي يظهر عند فتح الموقع
  if (main.src !== products[0].url) main.src = products[0].url;
  setBackground(products[0]);
  applyText(products[0]);
  reserveGallery = products.some(p => p.gallery.length);
  setGallery(products[0].gallery).catch(err => console.error(err));
  updateImageGap();
  renderStrip();
  lockLayoutHeight();
  updateGlowCenter();
}

/* ---------- حركة دخول الصفحة ----------
   النصوص تدخل من الجانبين، المنتج من الأسفل، والشريط السفلي من الأسفل
   (نفس حركة أسهم التالي والسابق). في الجوال: ظهور تدريجي من الأسفل. */
async function playIntro() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease    = 'cubic-bezier(.2,.8,.2,1)';
  const imgsBox = document.querySelector('.imgs');
  const bottom  = document.querySelector('.thelsafhaon');
  const small   = window.matchMedia('(max-width: 900px)').matches;
  const anims   = [];

  const run = (el, frames, opts) => {
    if (!el) return;
    anims.push(el.animate(frames, { fill: 'backwards', easing: ease, ...opts }).finished);
  };
  const rise = (el, y, delay, duration, easing) => run(el,
    [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'translateY(0)' }],
    { duration, delay, ...(easing ? { easing } : {}) }
  );

  if (!reduceMotion) {
    rise(imgsBox, 300, 100, 700, 'ease-out');                       // المنتج يدخل من الأسفل

    if (!small) {
      // النصوص من الجانبين (النص يمين، والسعر والميزات يسار)
      [[textBox, 'right', 200], [infoBox, 'left', 290]].forEach(([el, side, delay]) => {
        if (!el) return;
        run(el,
          [{ transform: `translateX(${offscreenShift(el, side)}px)` }, { transform: 'translateX(0)' }],
          { duration: TEXT_IN, delay }
        );
      });
      rise(bottom, 140, 400, 900);                                   // الشريط السفلي من الأسفل
    } else {
      [els.name, els.desc, document.querySelector('.text button'),
       document.querySelector('.alsaer'), document.querySelector('.overlay')]
        .forEach((el, i) => rise(el, 30, 350 + i * 90, 700));
      [document.querySelector('.carousel'), document.querySelector('.tauasul')]
        .forEach((el, i) => rise(el, 120, 300 + i * 80, 800));
    }
  }

  // نرفع الإخفاء بعد تجهيز الحركات مباشرة: كل عنصر يبدأ من وضعه الأول بلا وميض
  root.classList.remove('intro-pending');
  await Promise.all(anims).catch(() => {});
}

async function init() {
  // بيانات المنتجات من لوحة التحكم (store.js): إن لم تتوفر تبقى الصفحة كما هي
  try {
    const data = window.STORE_READY ? await window.STORE_READY : null;
    if (data && window.applyStoreData) window.applyStoreData(data);
  } catch (err) { console.error(err); }
  try { await initCore(); } catch (err) { console.error(err); }
  await hideLoader();
  await playIntro();
}

init();


/* ======================================================
   طبقة الطلب (تظهر عند الضغط على "اطلب الان")
   الهاتف يتولاه phone.js (input, getE164, getFinalPhone, checkPhone)
   ====================================================== */

// سعر صرف الدولار مقابل الليرة السورية (بالعملة القديمة، سعر المبيع في السوق).
// ترتيب المصادر عند تحميل الصفحة:
//   1) دالة Supabase (rate) التي تجلب سعر السوق من LiraScope من جهة الخادم
//   2) LiraScope مباشرة
//   3) السعر اليدوي الذي يكتبه المشرف في لوحة التحكم
//   4) آخر سعر ناجح محفوظ في المتصفح، ثم الرقم الاحتياطي أدناه
const FALLBACK_USD_TO_SYP = 14330;
const RATE_API_URL = 'https://lirascope.syria-cloud.sy/api/v1/rates/latest?currencies=USD&lang=en';
const OLD_PER_NEW  = 100;     // الليرة الجديدة = 100 قديمة (الـ API يعطي الجديدة)
let   USD_TO_SYP = FALLBACK_USD_TO_SYP;
let   rateSource = '';
try {   // آخر سعر ناجح محفوظ (أدق من الرقم الاحتياطي إن تعذّر الاتصال)
  const saved = JSON.parse(localStorage.getItem('ronqRate') || 'null');
  if (saved && saved.r > 1000 && saved.r < 1000000 && Date.now() - saved.t < 7 * 24 * 3600 * 1000) USD_TO_SYP = saved.r;
} catch (e) {}
const MAX_QTY    = 10;

function acceptRate(r, source) {
  if (isFinite(r) && r > 1000 && r < 1000000) {   // نتجاهل أي قيمة غير منطقية
    USD_TO_SYP = r;
    try { localStorage.setItem('ronqRate', JSON.stringify({ r, t: Date.now() })); } catch (e) {}   // آخر سعر ناجح
    rateSource = source;
    if (typeof updateTotals === 'function') updateTotals();
    return true;
  }
  console.warn(source + ': قيمة غير صالحة (' + r + ')');
  return false;
}

async function fetchJson(url, timeoutMs, headers) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal, headers: headers || {} });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadRate() {
  const cfg  = (typeof STORE_CONFIG !== 'undefined' && STORE_CONFIG) || {};
  const base = String(cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  const key  = cfg.SUPABASE_ANON_KEY || '';
  const auth = { apikey: key };

  // 1) دالة Supabase (rate): تجلب السعر الحي من جهة الخادم فلا يحجبها المتصفح
  if (base && key) {
    try {
      const d = await fetchJson(base + '/functions/v1/rate', 6000, auth);
      if (acceptRate(Number(d.rate), 'auto')) return;
    } catch (err) {
      console.warn('تعذّر جلب السعر من دالة Supabase:', err.message);
    }
  }
  // 2) LiraScope مباشرة (قد يحجبها المتصفح)
  try {
    const data = await fetchJson(RATE_API_URL, 5000);
    const usd = (data.marketRates || []).find(x => x.currency === 'USD');
    if (usd && acceptRate(Math.round(Number(usd.sell) * OLD_PER_NEW), 'auto')) return;
  } catch (err) {
    console.warn('تعذّر الاتصال بـ LiraScope:', err.message);
  }
  // 3) السعر اليدوي الذي كتبه المشرف في لوحة التحكم
  if (base && key) {
    try {
      const rows = await fetchJson(base + '/rest/v1/settings?select=value&key=eq.usd_rate_manual&limit=1', 5000, auth);
      if (rows[0] && acceptRate(Number(rows[0].value), 'manual')) return;
    } catch (err) {
      console.warn('تعذّر قراءة السعر اليدوي:', err.message);
    }
  }
}
loadRate();

// تحديث السعر أثناء بقاء الصفحة مفتوحة: كل 5 دقائق، وعند العودة للتبويب، وعند فتح نافذة الطلب
let rateFetchedAt = Date.now();
function refreshRate(minGapMs) {
  if (Date.now() - rateFetchedAt < minGapMs) return;
  rateFetchedAt = Date.now();
  loadRate();
}
setInterval(() => refreshRate(0), 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshRate(60 * 1000); });

// ===== رابط Google Sheets (تطبيق الويب Apps Script) =====
// الصق هنا الرابط الذي يعطيك إياه Google بعد نشر الملف google-apps-script.gs (ينتهي بـ /exec).
// خطوات الربط مكتوبة في أعلى ملف google-apps-script.gs
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbz0vNw17CbnxR3p7xGs77ZwuFfBw1e94n9ItKVHNo3leDQLeMXjhUuZl_M45-3tzmBk/exec';

const orderBtn    = document.querySelector('.text button');
const orderOverlay = document.getElementById('orderOverlay');
const orderClose   = orderOverlay.querySelector('.order-close');
const orderForm    = document.getElementById('orderForm');
const fName        = document.getElementById('fName');
const fGov         = document.getElementById('fGov');
const fAddr        = document.getElementById('fAddr');
const qtyVal       = document.getElementById('qtyVal');
const orderOk      = document.getElementById('orderOk');
const orderErr     = document.getElementById('orderErr');
const submitBtn    = orderForm.querySelector('.order-submit');

let orderQty = 1;



/* --- فتح وإغلاق --- */

function openOrder() {
  refreshRate(30 * 1000);   // سعر محدّث عند فتح نافذة الطلب
  fillSummary();
  orderOk.hidden = true;
  orderErr.hidden = true;
  orderOverlay.scrollTop = 0;
  orderOverlay.classList.add('open');
  orderOverlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
}

function closeOrder() {
  orderOverlay.classList.remove('open');
  orderOverlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}

orderBtn.addEventListener('click', openOrder);
orderClose.addEventListener('click', closeOrder);

// "الرئيسية" في الشريط العلوي تغلق الطبقة وتعود للصفحة
orderOverlay.querySelector('.navbar ul li:first-child a').addEventListener('click', e => {
  e.preventDefault();
  closeOrder();
});

// الضغط على الخلفية الضبابية (خارج الشريط والنموذج والملخص) يغلق الطبقة
orderOverlay.addEventListener('click', e => {
  if (!e.target.closest('.navbar, .order-form, .order-summary')) closeOrder();
});

// Escape يغلق الطبقة، إلا إذا كان يغلق قائمة الدول فقط (phone.js يمنع الحدث وقتها)
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !e.defaultPrevented) closeOrder();
});


/* --- ملخص الطلب: يُقرأ من المنتج المعروض وقت فتح الطبقة --- */

function readPrice() {
  const n = parseFloat((els.price ? els.price.textContent : '').replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function fillSummary() {
  document.getElementById('sumImg').src = main.src;
  document.getElementById('sumName').textContent = els.name ? els.name.textContent : '';
  document.getElementById('sumOld').textContent  = els.oldPrice ? els.oldPrice.textContent : '';
  document.getElementById('sumNew').textContent  = els.price ? els.price.textContent : '';

  // لون الطبقة والنموذج = لون خلفية الصفحة المعروضة حالياً (خلفية المنتج)
  const cs   = getComputedStyle(bg);
  const cur  = products[current];
  const glow = cs.getPropertyValue('--glow').trim() || (cur && cur.glow);
  const base = cs.getPropertyValue('--base').trim() || (cur && cur.base);
  // خلفية المنتج فاتحة: طبقة الطلب تبقى غامقة لتبقى النصوص البيضاء مقروءة
  const dark = bg.classList.contains('light');
  orderOverlay.classList.toggle('tone-dark', dark);
  if (glow) orderOverlay.style.setProperty('--glow', dark ? '#33406b' : glow);
  if (base) orderOverlay.style.setProperty('--base', dark ? '#1b2340' : base);

  updateTotals();
}


/* --- الكمية والإجمالي --- */

function totalUsd() {
  return Math.round(readPrice() * orderQty * 100) / 100;
}

function updateTotals() {
  const usd = totalUsd();
  const syp = Math.round(usd * USD_TO_SYP);
  qtyVal.textContent = orderQty;
  document.getElementById('totUsd').textContent = usd.toLocaleString('en-US') + '$';
  document.getElementById('totSyp').textContent = syp.toLocaleString('en-US') + ' ل.س';
  const rn = document.getElementById('rateNote');
  if (rn) rn.textContent = 'سعر الصرف المعتمد: 1$ = ' + Math.round(USD_TO_SYP).toLocaleString('en-US') + ' ل.س' + (rateSource === 'manual' ? ' (سعر محدّد من المتجر)' : '');
}

document.getElementById('qtyMinus').addEventListener('click', () => {
  if (orderQty > 1) { orderQty--; updateTotals(); }
});
document.getElementById('qtyPlus').addEventListener('click', () => {
  if (orderQty < MAX_QTY) { orderQty++; updateTotals(); }
});


/* --- التحقق من بقية الحقول (الهاتف يتحقق منه phone.js) --- */

function setFieldError(el, message) {
  const field = el.closest('.field');
  field.classList.toggle('invalid', !!message);
  field.querySelector('.err').textContent = message || '';
  return !message;
}

function validateOrder() {
  const okName  = setFieldError(fName, fName.value.trim().length >= 3 ? '' : 'اكتب اسمك الكامل');
  const okPhone = checkPhone();
  const okGov   = setFieldError(fGov, fGov.value ? '' : 'اختر المحافظة');
  const okAddr  = setFieldError(fAddr, fAddr.value.trim().length >= 8 ? '' : 'اكتب عنوانك بالتفصيل (المدينة أو القرية، الحي، الشارع)');
  const all = okName && okPhone && okGov && okAddr;
  if (!all) {   // ننزل إلى أول حقل فيه خطأ (مفيد في الجوال حيث النموذج طويل)
    const first = !okName ? fName : !okPhone ? document.getElementById('x') : !okGov ? fGov : fAddr;
    first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return all;
}

// خانة العنوان: بارتفاع خانة الاسم، وتكبر مع كل سطر جديد (حتى حد أقصى ثم يظهر التمرير)
function autoGrow() {
  fAddr.style.height = '';                       // العودة للارتفاع الأساسي ثم القياس
  if (!fAddr.value) { fAddr.style.overflowY = 'hidden'; return; }
  const h = Math.min(fAddr.scrollHeight + 2, 200);
  fAddr.style.height = h + 'px';
  fAddr.style.overflowY = fAddr.scrollHeight + 2 > 200 ? 'auto' : 'hidden';
}
fAddr.addEventListener('input', autoGrow);
window.addEventListener('resize', autoGrow);

[fName, fGov, fAddr].forEach(el => {
  el.addEventListener('input', () => setFieldError(el, ''));
  el.addEventListener('change', () => setFieldError(el, ''));
});


/* --- الإرسال إلى Google Sheets --- */

let sending = false;

function showOrderError(msg) {
  orderOk.hidden = true;
  orderErr.textContent = msg;
  orderErr.hidden = false;
}

// نرسل الطلب كنص JSON بطلب POST (text/plain حتى لا يحتاج فحصاً مسبقاً CORS) إلى تطبيق الويب (Apps Script)
// ونقرأ ردّه: لا نعدّ الطلب ناجحاً إلا إذا ردّ الجدول {"ok":true}. أي رد آخر (صفحة تسجيل دخول، خطأ في الكود...) يُعدّ فشلاً.
async function sendOrderToSheet(order) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(SHEET_URL, { method: 'POST', body: JSON.stringify(order), signal: ctrl.signal });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!data || data.ok !== true) {
      throw new Error(data && data.error ? data.error : 'ردّ غير متوقع من الرابط (تأكد من النشر: Anyone، ومن أنه رابط /exec)');
    }
  } finally {
    clearTimeout(timer);
  }
}

function resetOrderForm() {
  fName.value = '';
  fGov.value = '';
  fAddr.value = '';
  autoGrow();
  orderQty = 1;
  try { input.value = ''; refresh(); } catch (e) {}   // خانة الهاتف (phone.js)
  updateTotals();
}

orderForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (sending || !validateOrder()) return;

  orderOk.hidden = true;
  orderErr.hidden = true;

  if (!SHEET_URL) {
    console.error('SHEET_URL فارغ في ronq.js: الصق رابط تطبيق الويب (Apps Script) الذي ينتهي بـ /exec');
    showOrderError('الموقع غير مربوط بجدول الطلبات بعد. تواصل مع صاحب المتجر.');
    return;
  }

  const usd = totalUsd();
  const order = {
    name:         fName.value.trim(),
    phone:        getE164(),
    phoneDisplay: getFinalPhone(),
    governorate: fGov.value,
    address:      fAddr.value.trim(),
    product:      els.name ? els.name.textContent.trim() : '',
    quantity:     orderQty,
    totalUsd:     usd,
    totalSyp:     Math.round(usd * USD_TO_SYP),
    rate:         USD_TO_SYP
  };

  sending = true;
  submitBtn.disabled = true;
  const label = submitBtn.textContent;
  submitBtn.textContent = 'جاري الإرسال...';

  try {
    await sendOrderToSheet(order);
    orderOk.hidden = false;
    resetOrderForm();
  } catch (err) {
    console.error('تعذّر إرسال الطلب:', err);
    showOrderError('تعذّر تسجيل الطلب، حاول مرة أخرى بعد قليل أو تواصل معنا عبر واتساب.');
  } finally {
    sending = false;
    submitBtn.disabled = false;
    submitBtn.textContent = label;
  }
});
