/* =====================================================
   ronq.js — منطق الموقع. لا تحتاج لتعديله عند إضافة منتج،
   فالمنتجات كلها في ملف products.js
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
// تُستخدم للمنتج الذي لا تكتب له glow و base في products.js.
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
// true: يحسب لون الخلفية من صورة المنتج (الطريقة القديمة) بدل الألوان الاحتياطية
const AUTO_COLORS_FROM_IMAGE = false;

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
 
// القيم الأصلية المكتوبة في index.html: تُستخدم لأي حقل لم تكتبه في products.js
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
  if (o.price !== undefined && o.price !== null && o.price !== '') t.price = toPrice(o.price);
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

// متجر بمنتج واحد (قائمة PRODUCTS فارغة): الشارة تُضبط من PAGE_OFFER في products.js
function applyPageOffer() {
  const cfg = (typeof PAGE_OFFER !== 'undefined' && PAGE_OFFER) ? PAGE_OFFER : null;
  if (!cfg || !cfg.enabled || !cfg.text) { if (els.badge) els.badge.hidden = true; return; }
  showOffer({ offer: String(cfg.text), offerLabel: cfg.label ? String(cfg.label) : 'عرض خاص' }, false);
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
 
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error('تعذّر تحميل الصورة: ' + src));
    img.src = src;
  });
}
 
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r)      h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else                h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}
 
// يحسب لون التوهج من الصورة نفسها (يعطي null إذا منع المتصفح قراءة البكسلات)
function autoColors(img) {
  try {
    const S = 40;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
 
    let r = 0, g = 0, b = 0, w = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 200) continue;                       // نتجاهل الشفاف
      const max = Math.max(d[i], d[i + 1], d[i + 2]);
      const min = Math.min(d[i], d[i + 1], d[i + 2]);
      const sat = max ? (max - min) / max : 0;
      const wt = sat * (max / 255) + 0.02;                // الألوان الزاهية أهم من الأسود والأبيض
      r += d[i] * wt; g += d[i + 1] * wt; b += d[i + 2] * wt; w += wt;
    }
    if (!w) return null;
 
    let [h, s] = rgbToHsl(r / w, g / w, b / w);
    if (s < 0.08) h = 220;                                // صورة رمادية: نميل للأزرق
    const gs = Math.round(Math.max(s, 0.45) * 100);
    const bs = Math.round(Math.max(s, 0.5) * 100);
    return {
      glow: `hsl(${Math.round(h)}, ${gs}%, 52%)`,
      base: `hsl(${Math.round(h)}, ${bs}%, 20%)`
    };
  } catch (e) {
    return null;
  }
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

  if ((!glow || !base) && AUTO_COLORS_FROM_IMAGE) {
    const auto = autoColors(img);
    if (auto) { glow = glow || auto.glow; base = base || auto.base; }
  }
  if (!glow || !base) {
    const f = FALLBACK_COLORS[index % FALLBACK_COLORS.length];
    glow = glow || f.glow;
    base = base || f.base;
    accent = f.accent;
  }
  const light = isLightBg(glow, base);
  return { url: img.src, img, glow, base, light, accent: light ? (accent || LIGHT_ACCENT) : null, text: normalizeText(o) };
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
   الصورة الأساسية = الصورة المكتوبة في index.html، وبقية الزوايا تُكتب في PAGE_GALLERY (products.js).
   تظهر صور مصغّرة تحت المنتج؛ الضغط عليها أو السحب يميناً/يساراً على المنتج يبدّل الصورة بحركة ناعمة. */

const imgsBox    = document.querySelector('.imgs');
const galleryBox = document.getElementById('gallery');
let galleryList  = [];      // [{ url }] — الأولى هي الصورة الأساسية
let galleryIdx   = 0;       // رقم الصورة المعروضة
let gallerySwap  = 0;       // رقم آخر عملية تبديل (لتجاهل الضغطات السريعة المتتالية)
let galleryAnim  = null;

async function setGallery(extraSrcs) {
  if (!galleryBox || !imgsBox) return;
  const extras = (Array.isArray(extraSrcs) ? extraSrcs : []).map(s => String(s || '').trim().replace(/^\/+/, '')).filter(Boolean);   // نحذف الشرطة الأولى إن كُتبت: '/imgs/a.png' = 'imgs/a.png'

  galleryBox.replaceChildren();
  galleryBox.hidden = true;
  galleryList = [];
  galleryIdx = 0;
  // نحجز مساحة الصور المصغّرة فوراً حتى لا تقفز الصفحة بعد تحميل الصور
  imgsBox.classList.toggle('has-gallery', extras.length > 0);
  updateImageGap();
  if (!extras.length) return;

  const results = await Promise.allSettled([main.src, ...extras].map(loadImage));
  const seen = new Set();
  results.forEach(res => {
    if (res.status !== 'fulfilled') { console.warn('تم تجاهل صورة من المعرض:', res.reason.message); return; }
    const url = res.value.src;
    if (seen.has(url)) return;       // إن كررتَ الصورة الأساسية لا تظهر مرتين
    seen.add(url);
    galleryList.push({ url });
  });

  if (galleryList.length < 2) {      // لا معنى لمعرض بصورة واحدة
    galleryList = [];
    imgsBox.classList.remove('has-gallery');
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
 
// const STRIP_MS = 700;   // مدة تقدّم الصور داخل الشريط (ms)
 
// // الشريط يعرض المنتجات التي تلي المنتج المعروض في المنتصف، ويلتف حول القائمة
// // (المنتج المعروض في المنتصف لا يتكرر داخل الشريط)
// function stripIndexes(cur) {
//   const n = products.length;
//   const count = isSmall() ? n - 1 : Math.min(VISIBLE, n - 1);   // الجوال: كل المنتجات للتمرير باللمس
//   return Array.from({ length: count }, (_, k) => (cur + 1 + k) % n);
// }
 
// function makeThumb(pi) {
//   const img = document.createElement('img');
//   img.src = products[pi].url;
//   img.alt = 'المنتج ' + (pi + 1);
//   img.draggable = false;
//   img.dataset.index = pi;
//   img.addEventListener('click', () => goTo(pi, img));
//   return img;
// }
 
// function updateArrows() {
//   const single = products.length < 2;
//   btnPrev.hidden = single;
//   btnNext.hidden = single;
// }
 
// // بناء الشريط أول مرة (بدون حركة)
// function renderStrip() {
//   strip.replaceChildren(...stripIndexes(current).map(makeThumb));
//   updateArrows();
// }
 
// function median(arr) {
//   if (!arr.length) return 0;
//   const s = [...arr].sort((a, b) => a - b);
//   return s[Math.floor(s.length / 2)];
// }
 
// // يحدّث الشريط للمنتج الجديد بحركة هادئة، كأن الصور مصطفّة على "دور" يتحرك:
// // الصورة المضغوطة تغادر مكانها (تطير للمنتصف)، فتتقدم الصور التي بعدها لتملأ الفراغ بانزلاق ناعم،
// // وصورة المنتج الذي كان في المنتصف تظهر في نهاية الصف.
// // lateIndex: منتج يظهر مكانه في الشريط في آخر الحركة فقط (عند الرجوع تهبط إليه الصورة الطائرة)
// function updateStrip(newCur, clickedEl, lateIndex = -1) {
//   const small = isSmall();
//   const oldEls = [...strip.children];
//   const oldRects = new Map(oldEls.map(el => [el, el.getBoundingClientRect()]));
//   const byIndex = new Map(oldEls.map(el => [Number(el.dataset.index), el]));

//   const reused = new Set();
//   const fresh = new Set();
//   // الجوال: الشريط "دور" بسيط. الصورة المضغوطة تخرج منه فقط، والبقية تحتفظ بترتيبها وتتقدم خطوة،
//   // وصورة المنتج الذي كان في المنتصف تُضاف في آخر الدور (بدون التفاف يجعل الصور تعبر فوق بعضها)
//   let idxList = stripIndexes(newCur);
//   if (small && lateIndex < 0) {
//     idxList = oldEls.map(el => Number(el.dataset.index)).filter(pi => pi !== newCur);
//     idxList.push(current);
//   }
//   // الجوال أبطأ وأهدأ: الانزلاق يبدأ بعد أن تبتعد الصورة الطائرة، والصورة الجديدة تظهر بعده
//   const slideMs    = small ? 1000 : STRIP_MS;
//   const slideDelay = small ? 250 : 100;
//   const freshMs    = small ? 800 : STRIP_MS;
//   const freshDelay = small ? 550 : 150;

//   const ordered = idxList.map(pi => {
//     const old = byIndex.get(pi);
//     if (old && old !== clickedEl) { reused.add(old); return old; }
//     const el = makeThumb(pi);
//     fresh.add(el);
//     return el;
//   });

//   // الصور الخارجة من الشريط (غير المضغوطة): نسخة ثابتة تتلاشى في مكانها بنفس شكلها (الخلفية الضبابية)
//   oldEls.forEach(el => {
//     if (reused.has(el) || el === clickedEl) return;
//     const r = oldRects.get(el);
//     const cs = getComputedStyle(el);
//     const ghost = el.cloneNode();
//     Object.assign(ghost.style, {
//       position: 'fixed',
//       left: r.left + 'px',
//       top: r.top + 'px',
//       width: r.width + 'px',
//       height: r.height + 'px',
//       maxWidth: 'none',
//       objectFit: 'contain',
//       margin: 0,
//       zIndex: 5,
//       pointerEvents: 'none',
//       boxSizing: 'border-box',
//       padding: cs.padding,
//       borderWidth: cs.borderTopWidth,
//       borderStyle: cs.borderTopStyle,
//       borderColor: cs.borderTopColor,
//       borderRadius: cs.borderRadius,
//       backgroundColor: cs.backgroundColor
//     });
//     document.body.appendChild(ghost);
//     ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, easing: 'ease-out', fill: 'forwards' })
//       .finished.then(() => ghost.remove(), () => ghost.remove());
//   });

//   // إطار الصورة المضغوطة (خلفيتها الضبابية) يتلاشى في مكانه بهدوء بدل أن يختفي فجأة
//   if (clickedEl) {
//     const r = oldRects.get(clickedEl);
//     const cs = getComputedStyle(clickedEl);
//     if (cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
//       const frame = document.createElement('div');
//       Object.assign(frame.style, {
//         position: 'fixed',
//         left: r.left + 'px',
//         top: r.top + 'px',
//         width: r.width + 'px',
//         height: r.height + 'px',
//         zIndex: 4,
//         pointerEvents: 'none',
//         boxSizing: 'border-box',
//         borderWidth: cs.borderTopWidth,
//         borderStyle: cs.borderTopStyle,
//         borderColor: cs.borderTopColor,
//         borderRadius: cs.borderRadius,
//         backgroundColor: cs.backgroundColor,
//         backdropFilter: cs.backdropFilter,
//         webkitBackdropFilter: cs.backdropFilter
//       });
//       document.body.appendChild(frame);
//       frame.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, easing: 'ease-out', fill: 'forwards' })
//         .finished.then(() => frame.remove(), () => frame.remove());
//     }
//   }

//   strip.replaceChildren(...ordered);

//   const ease = 'cubic-bezier(.45, .05, .25, 1)';   // حركة هادئة تبدأ وتنتهي بنعومة
//   const anims = [];
//   const shifts = [];

//   // الصور الباقية تنزلق من مكانها القديم إلى الجديد (بعد لحظة قصيرة من اختفاء الصورة المضغوطة)
//   reused.forEach(el => {
//     const o = oldRects.get(el);
//     const n = el.getBoundingClientRect();
//     const dx = o.left - n.left;
//     const dy = o.top - n.top;
//     if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
//     shifts.push(dx);
//     anims.push(el.animate(
//       [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
//       { duration: slideMs, delay: slideDelay, easing: ease, fill: 'backwards' }
//     ).finished);
//   });

//   // الصور الجديدة تدخل مع نفس الاتجاه كأنها جزء من الحركة
//   const typical = median(shifts);
//   fresh.forEach(el => {
//     if (Number(el.dataset.index) === lateIndex) {
//       // تبقى مخفية حتى تصلها الصورة الطائرة في آخر الحركة
//       anims.push(el.animate(
//         [{ opacity: 0 }, { opacity: 0, offset: 0.9 }, { opacity: 1 }],
//         { duration: DURATION, easing: 'linear', fill: 'backwards' }
//       ).finished);
//       return;
//     }
//     anims.push(el.animate(
//       [{ opacity: 0, transform: `translateX(${typical}px)` }, { opacity: 1, transform: 'translateX(0)' }],
//       { duration: freshMs, delay: freshDelay, easing: ease, fill: 'backwards' }
//     ).finished);
//   });

//   updateArrows();
//   return Promise.all(anims).catch(() => {});
// }


// /* ---------- الانتقال إلى منتج ---------- */
 
// // الشاشات الصغيرة (نفس حد التخطيط العمودي في ronq.css)
// const SMALL_QUERY = '(max-width: 900px)';
// const isSmall = () => window.matchMedia(SMALL_QUERY).matches;

// // عند عبور حد الشاشة الصغيرة نعيد بناء الشريط (كل المنتجات للتمرير في الجوال، و5 في الشاشات الكبيرة)
// window.matchMedia(SMALL_QUERY).addEventListener('change', () => {
//   if (!busy && products.length) renderStrip();
// });

// // الشريط في الجوال تحت الصورة: إن كان المنتج الكبير خارج الشاشة نصعد إليه أولاً ثم تبدأ الحركة
// async function ensureMainVisible() {
//   const r = main.getBoundingClientRect();
//   if (r.top >= 0 && r.bottom <= window.innerHeight) return;
//   window.scrollTo({ top: 0, behavior: 'smooth' });
//   let last = -1, same = 0;
//   for (let i = 0; i < 30 && same < 3; i++) {
//     await new Promise(res => setTimeout(res, 50));
//     same = window.scrollY === last ? same + 1 : 0;
//     last = window.scrollY;
//   }
// }

// // المستطيل الذي تشغله الصورة فعلياً داخل صندوق (object-fit: contain)
// function fitRect(box, img) {
//   const s = Math.min(box.width / img.naturalWidth, box.height / img.naturalHeight);
//   const w = img.naturalWidth * s, h = img.naturalHeight * s;
//   return { left: box.left + (box.width - w) / 2, top: box.top + (box.height - h) / 2, width: w, height: h };
// }

// // المستطيل الداخلي لصورة صغيرة (بعد الحشوة والإطار)، حيث تقع الصورة نفسها فعلياً
// function innerRect(el) {
//   const r = el.getBoundingClientRect();
//   const cs = getComputedStyle(el);
//   const n = k => parseFloat(cs[k]) || 0;
//   const l = n('paddingLeft') + n('borderLeftWidth'), t = n('paddingTop') + n('borderTopWidth');
//   const rr = n('paddingRight') + n('borderRightWidth'), b = n('paddingBottom') + n('borderBottomWidth');
//   return { left: r.left + l, top: r.top + t, width: r.width - l - rr, height: r.height - t - b };
// }

// function placeFixed(el, r, z) {
//   Object.assign(el.style, {
//     position: 'fixed',
//     left: r.left + 'px',
//     top: r.top + 'px',
//     width: r.width + 'px',
//     height: r.height + 'px',
//     maxWidth: 'none',
//     margin: 0,
//     zIndex: z,
//     transformOrigin: 'top left',
//     pointerEvents: 'none'
//   });
// }

// // تحريك صورة طائرة من مستطيل إلى آخر (انتقال وتكبير/تصغير)
// function fly(el, from, target) {
//   return el.animate([
//     { transform: 'translate(0, 0) scale(1, 1)' },
//     { transform: `translate(${target.left - from.left}px, ${target.top - from.top}px) scale(${target.width / from.width}, ${target.height / from.height})` }
//   ], { duration: DURATION, easing: 'ease-in-out', fill: 'forwards' }).finished;
// }

// // التالي أو الضغط على صورة من الشريط (thumb):
// //   الصورة تطير من مكانها إلى المنتصف، ويختفي مكانها من الشريط فيتقدم الدور، وصورة المنتصف القديمة تصعد وتتلاشى
// //   وتظهر في نهاية الصف.
// // السابق (بدون thumb): عكس ذلك تماماً: صورة المنتصف تعود إلى بداية الصف، والمنتج السابق ينزل من الأعلى
// //   إلى المنتصف، ويتراجع الدور خطوة.
// async function goTo(index, thumb) {
//   if (busy || index === current || !products[index]) return;
//   busy = true;

//   const next  = products[index];
//   const prev  = products[current];
//   const back  = !thumb;
//   const small = isSmall();
//   let flyer, mainAnim, waveAnim;

//   try {
//     if (small) await ensureMainVisible();
//     const to = main.getBoundingClientRect();
//     const { cx, cy, radius } = getGlowGeometry();

//     // 1) الخلفية الجديدة: تتسع من وسط المنتج، وفي الشاشات الصغيرة تتبدل بتلاشٍ ناعم
//     wave.style.setProperty('--glow', next.glow);
//     wave.style.setProperty('--base', next.base);
//     // ألوان النصوص (فاتحة/غامقة) تتبدل في منتصف الحركة مع اتساع الخلفية
//     setTimeout(() => bg.classList.toggle('light', !!next.light), DURATION * 0.5);
//     waveAnim = small
//       ? wave.animate([
//           { clipPath: 'inset(0)', opacity: 0 },
//           { clipPath: 'inset(0)', opacity: 1 }
//         ], { duration: DURATION + 200, easing: 'ease-in-out', fill: 'forwards' })
//       : wave.animate([
//           { clipPath: `circle(0px at ${cx}px ${cy}px)` },
//           { clipPath: `circle(${radius}px at ${cx}px ${cy}px)` }
//         ], { duration: DURATION, easing: 'ease-in-out', fill: 'forwards' });

//     // 2) الصورة الكبيرة
//     if (back) {
//       // الرجوع: نسخة من الصورة الحالية تبدأ من مكانها، والصورة الكبيرة تتبدل للمنتج السابق وتنزل من الأعلى
//       flyer = new Image();
//       flyer.src = prev.url;
//       placeFixed(flyer, fitRect(to, prev.img), 10);
//       document.body.appendChild(flyer);
//       main.src = next.url;
//       mainAnim = main.animate([
//         { transform: `translateY(${-to.height * 0.9}px)`, opacity: 0 },
//         { transform: 'translateY(0)', opacity: 1 }
//       ], { duration: DURATION, easing: 'ease-out', fill: 'backwards' });
//     } else {
//       // التالي: الصورة الحالية تصعد للأعلى وتزداد شفافيتها
//       mainAnim = main.animate([
//         { transform: 'translateY(0)', opacity: 1 },
//         { transform: `translateY(${-to.height * 0.9}px)`, opacity: 0 }
//       ], { duration: DURATION, easing: 'ease-in', fill: 'forwards' });
//     }

//     // شارة العرض القديمة تتلاشى مع بدء الانتقال
//     if (els.badge && !els.badge.hidden) {
//       if (offerAnim) offerAnim.cancel();
//       offerAnim = els.badge.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' });
//     }

//     const waits = [mainAnim.finished, waveAnim.finished];

//     // النصوص تخرج (أو تتلاشى في الجوال) وتعود ببيانات المنتج الجديد
//     const textPromise = swapText(next).catch(err => console.error(err));

//     // 3) الصورة الطائرة والشريط
//     const thumbBox = back ? null : innerRect(thumb);          // نقيسها قبل أن يتغير الشريط
//     const stripPromise = updateStrip(index, thumb || null, back ? current : -1);

//     if (back) {
//       // تعود إلى مكانها الجديد في بداية الشريط
//       const slot = strip.querySelector(`img[data-index="${current}"]`);
//       if (slot) waits.push(fly(flyer, fitRect(to, prev.img), fitRect(innerRect(slot), prev.img)));
//       else { flyer.remove(); flyer = null; }
//     } else {
//       // تطير من مكانها في الشريط إلى مكان وحجم صورة المنتصف
//       flyer = new Image();
//       flyer.src = next.url;
//       const from = fitRect(thumbBox, next.img);
//       placeFixed(flyer, from, 10);
//       document.body.appendChild(flyer);
//       waits.push(fly(flyer, from, fitRect(to, next.img)));
//     }

//     await Promise.all(waits);

//     // نثبّت الصورة الأساسية والخلفية الجديدة
//     if (!back) main.src = next.url;
//     setBackground(next);
//     mainAnim.cancel();
//     waveAnim.cancel();
//     if (flyer) { flyer.remove(); flyer = null; }

//     current = index;
//     updateGlowCenter();

//     // ننتظر انتهاء بقية الحركات: النصوص والشريط
//     await Promise.all([textPromise, stripPromise]);
//   } catch (err) {
//     console.error(err);
//   } finally {
//     // مهما حصل: نفتح القفل ونزيل الصورة الطائرة
//     if (flyer) flyer.remove();
//     busy = false;
//   }
// }

// // السهم الأيمن (يشير لليمين) = التالي: أول صورة في الشريط. السهم الأيسر (يشير لليسار) = السابق: المنتج الذي قبل الحالي
// btnPrev.addEventListener('click', () => {
//   const first = strip.firstElementChild;
//   if (first) goTo(Number(first.dataset.index), first);
// });
// btnNext.addEventListener('click', () => {
//   if (products.length > 1) goTo((current - 1 + products.length) % products.length, null);
// });
 
 
/* ---------- التشغيل ---------- */
 
async function initCore() {
  const list = (typeof PRODUCTS !== 'undefined' && Array.isArray(PRODUCTS)) ? PRODUCTS : [];
  if (!list.length) {
    console.warn('قائمة PRODUCTS فارغة أو غير موجودة. تأكد من ملف products.js');
    applyPageOffer();   // متجر بمنتج واحد: شارة العرض من PAGE_OFFER
    setGallery(typeof PAGE_GALLERY !== 'undefined' ? PAGE_GALLERY : []).catch(err => console.error(err));   // وصور المعرض من PAGE_GALLERY
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
  updateImageGap();
  // استُبدل شريط المنتجات القديم المعلّق بشريط آمن لمنتجات الإدارة.
  renderCatalogMenu();
  lockLayoutHeight();
  updateGlowCenter();
}
 

/* =====================================================
   RONQ Live Catalog: يُحدَّث من Firestore بعد ضبط Firebase.
   يُبقي بيانات HTML / products.js الأصلية عندما لا توجد قاعدة مهيأة.
   ===================================================== */
let liveCatalogToken = 0;
let currentCatalogId = null;

function renderCatalogMenu() {
  const holder = document.querySelector('.carousel');
  if (!holder) return;
  holder.classList.add('ronq-live-catalog');
  holder.classList.toggle('has-products', products.length > 1);
  holder.replaceChildren();
  if (products.length < 2) return;
  products.forEach((p, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ronq-product-option';
    button.setAttribute('aria-pressed', String(current === index));
    button.setAttribute('aria-label', 'عرض ' + (p.text.name || 'المنتج'));
    const pic = new Image();
    pic.src = p.url;
    pic.alt = '';
    pic.loading = 'lazy';
    const details = document.createElement('span');
    const title = document.createElement('span');
    title.className = 'ronq-title';
    title.textContent = p.text.name || 'منتج';
    const price = document.createElement('span');
    price.className = 'ronq-price';
    price.textContent = p.text.price || '';
    details.append(title, price);
    button.append(pic, details);
    button.addEventListener('click', () => showCatalogProduct(index));
    holder.appendChild(button);
  });
}

function showCatalogProduct(index) {
  const p = products[index];
  if (!p) return;
  current = index;
  currentCatalogId = p.catalogId || null;
  main.hidden = false;
  if (main.src !== p.url) main.src = p.url;
  const orderButton = document.querySelector('.text button');
  if (orderButton) orderButton.hidden = false;
  setBackground(p);
  applyText(p, true);
  if (els.badge) placeOfferBadge();
  setGallery(Array.isArray(p.galleryImages) ? p.galleryImages.slice(1) : [])
    .catch(err => console.warn('معرض المنتج:', err));
  renderCatalogMenu();
  updateImageGap();
  updateGlowCenter();
}

// ممر داخلي للمكوّن العام؛ لا تُكتب الأسعار والألوان في عناصر HTML بشكل غير آمن.
window.RONQ_CATALOG = {
  async applyRecords(records, initialized) {
    if (!initialized) return; // لم تُرحل المنتجات بعد؛ احتفظ بالمتجر السابق.
    const token = ++liveCatalogToken;
    const ready = await Promise.allSettled((records || []).map(async (r, i) => {
      const pics = Array.isArray(r.images) ? r.images.filter(Boolean) : [];
      const src = pics[0] || r.src;
      if (!src) return null;
      const pic = await loadImage(src);
      const result = buildProduct({ ...r, src }, i, pic);
      result.catalogId = r.id;
      result.galleryImages = pics.length ? pics : [src];
      return result;
    }));
    if (token !== liveCatalogToken) return;
    products = ready.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    if (!products.length) {
      const holder = document.querySelector('.carousel');
      if (holder) holder.replaceChildren();
      if (holder) holder.classList.remove('has-products');
      main.hidden = true;
      if (els.name) els.name.textContent = 'لا توجد منتجات منشورة حاليًا';
      if (els.desc) els.desc.textContent = 'تابعنا للاطلاع على المنتجات الجديدة.';
      if (els.price) els.price.textContent = '';
      if (els.features) els.features.replaceChildren();
      if (els.badge) els.badge.hidden = true;
      if (galleryBox) { galleryBox.hidden = true; galleryBox.replaceChildren(); }
      if (imgsBox) imgsBox.classList.remove('has-gallery');
      const b = document.querySelector('.text button');
      if (b) b.hidden = true;
      currentCatalogId = null;
      return;
    }
    let pick = products.findIndex(p => p.catalogId === currentCatalogId);
    if (pick < 0) pick = 0;
    showCatalogProduct(pick);
  }
};

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
      [document.querySelector('.carousel'), document.querySelector('.taosel'), document.querySelector('.tauasul')]
        .forEach((el, i) => rise(el, 120, 300 + i * 80, 800));
    }
  }

  // نرفع الإخفاء بعد تجهيز الحركات مباشرة: كل عنصر يبدأ من وضعه الأول بلا وميض
  root.classList.remove('intro-pending');
  await Promise.all(anims).catch(() => {});
}

async function init() {
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
//   1) LiraScope API مباشرة (سعر السوق، مجاني وبلا مفتاح)
//   2) ملف rates.json (تعدّله يدوياً أو يحدّثه n8n)
//   3) الرقم الاحتياطي أدناه
const FALLBACK_USD_TO_SYP = 14330;
const RATE_API_URL = 'https://lirascope.syria-cloud.sy/api/v1/rates/latest?currencies=USD&lang=en';
const OLD_PER_NEW  = 100;     // الليرة الجديدة = 100 قديمة (الـ API يعطي الجديدة)
let   USD_TO_SYP = FALLBACK_USD_TO_SYP;
const MAX_QTY    = 10;

function acceptRate(r, source) {
  if (isFinite(r) && r > 1000 && r < 1000000) {   // نتجاهل أي قيمة غير منطقية
    USD_TO_SYP = r;
    if (typeof updateTotals === 'function') updateTotals();
    return true;
  }
  console.warn(source + ': قيمة غير صالحة (' + r + ')');
  return false;
}

async function fetchJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadRate() {
  // 1) LiraScope: سعر مبيع السوق للدولار بالليرة الجديدة ثم نحوّله للقديمة
  try {
    const data = await fetchJson(RATE_API_URL, 5000);
    const usd = (data.marketRates || []).find(x => x.currency === 'USD');
    if (usd && acceptRate(Math.round(Number(usd.sell) * OLD_PER_NEW), 'LiraScope')) return;
  } catch (err) {
    console.warn('تعذّر الاتصال بـ LiraScope، جاري استخدام rates.json:', err.message);
  }
  // 2) rates.json
  try {
    const data = await fetchJson('rates.json?t=' + Date.now(), 5000);
    if (acceptRate(Number(data.usdToSyp), 'rates.json')) return;
  } catch (err) {
    console.warn('تعذّر قراءة rates.json، سيُستخدم السعر الاحتياطي:', err.message);
  }
}
loadRate();
 
// ===== رابط Google Sheets (تطبيق الويب Apps Script) =====
// الصق هنا الرابط الذي يعطيك إياه Google بعد نشر الملف google-apps-script.gs (ينتهي بـ /exec).
// خطوات الربط مكتوبة في أعلى ملف google-apps-script.gs
const SHEET_URL = 'https://script.google.com/macros/s/AKfycbz0vNw17CbnxR3p7xGs77ZwuFfBw1e94n9ItKVHNo3leDQLeMXjhUuZl_M45-3tzmBk/exec';

// --- إرسال واتساب (معطّل: محفوظ كتعليق) ---
// رقم واتساب الذي يستقبل الطلبات (بدون + وبدون مسافات)
// const WHATSAPP_NUMBER = '40722719456';





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
  fillSummary();
  orderOk.hidden = true;
  orderErr.hidden = true;
  // smsLink.hidden = true;   // (SMS معطّل)
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
  const okGov   = setFieldError(fGov, fGov.value ? '' : 'اختر المحافظة من القائمة');
  const okAddr  = setFieldError(fAddr, fAddr.value.trim().length >= 8 ? '' : 'اكتب العنوان بالتفصيل (المدينة أو القرية، الحي، الشارع)');
  return okName && okPhone && okGov && okAddr;
}
 
[fName, fGov, fAddr].forEach(el =>
  el.addEventListener('input', () => setFieldError(el, ''))
);
 
 
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
    city: '',
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


/* =====================================================================
   إرسال الطلب عبر واتساب و SMS — معطّل ومحفوظ كتعليق
   لإعادته: احذف علامتَي التعليق (السطر الذي يلي هذا التعليق وآخر سطر في الملف) حول هذه الكتلة، وأعد تفعيل السطر
   const WHATSAPP_NUMBER في الأعلى، وأعد سطر smsLink.hidden = true في openOrder،
   وأزل التعليق عن <a id="smsFallback"> في index.html، ثم اجعل معالج submit
   يستدعي buildWhatsAppUrl(order) بدل sendOrderToSheet.
   ===================================================================== */
/*
function buildWhatsAppUrl(o) {
  const lines = [
    '',
    '',
    'المنتج: ' + o.product,
    'الكمية: ' + o.quantity,
    'الإجمالي: ' + o.totalUsd + '$ (' + o.totalSyp.toLocaleString('en-US') + ' ل.س)',
    '',
    'الاسم: ' + o.name,
    'الهاتف: ' + o.phoneDisplay,
    'العنوان: ' + o.address,
    'الدفع: عند الاستلام'
  ];
  return 'https://wa.me/' + WHATSAPP_NUMBER + '?text=' + encodeURIComponent(lines.join('\n'));
}

// الرقم الذي يستقبل رسائل SMS (بصيغة دولية مع +)
const SMS_NUMBER = '+40722719456';

// نسخة مختصرة من الرسالة: الـ SMS بالعربية يُحتسب كل 70 حرفاً تقريباً برسالة مستقلة
function buildSmsUrl(o) {
  const lines = [
    'طلب جديد',
    'المنتج: ' + o.product,
    'الكمية: ' + o.quantity,
    'الإجمالي: ' + o.totalUsd + '$',
    'الاسم: ' + o.name,
    'الهاتف: ' + o.phoneDisplay,
    'العنوان: ' + o.address
  ];
  return 'sms:' + SMS_NUMBER + '?&body=' + encodeURIComponent(lines.join('\n'));
}

const smsLink  = document.getElementById('smsFallback');
const isMobile = window.matchMedia('(pointer: coarse)').matches;   // الروابط sms: لا تعمل على الحاسوب

// داخل معالج submit بدل sendOrderToSheet:
//   const url = buildWhatsAppUrl(order);
//   const w = window.open(url, '_blank');
//   if (!w) window.location.href = url;   // إن منع المتصفح النافذة الجديدة
//   orderOk.hidden = false;
//   if (isMobile) {
//     smsLink.href = buildSmsUrl(order);
//     smsLink.hidden = false;
//   }
*/