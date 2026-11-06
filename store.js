/* =====================================================
   store.js — يجلب بيانات المتجر من لوحة التحكم (Supabase) ويضعها في الصفحة
   - المنتجات المنشورة كلها (يظهر أولها عند فتح الموقع، والبقية في الشريط السفلي)
   - index.html?p=رابط-المنتج يفتح الموقع على منتج محدد
   - روابط التواصل، قسم "من نحن"، وعبارة الفوتر
   إن لم يُضبط config.js أو تعذّر الاتصال: تبقى الصفحة كما هي في index.html (لا يتعطل الموقع)
   يعمل قبل ronq.js، ويستدعي ronq.js الدالة applyStoreData عند التشغيل
   ===================================================== */

// قائمة المنتجات يملؤها هذا الملف، ويقرؤها ronq.js
window.PRODUCTS = [];

(function () {
  const cfg  = (typeof STORE_CONFIG !== 'undefined' && STORE_CONFIG) || {};
  const base = String(cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  const key  = cfg.SUPABASE_ANON_KEY || '';

  async function rest(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(base + '/rest/v1/' + path, {
        headers: { apikey: key },   // المفتاح الجديد (sb_publishable_) يُرسل في apikey فقط
        cache: 'no-store',
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function load() {
    if (!base || !key) return null;
    const out = { products: [], settings: {} };
    const [prods, sets] = await Promise.allSettled([
      rest('products?select=*&published=eq.true&order=featured.desc,sort.asc,created_at.asc'),
      rest('settings?select=key,value&key=in.(home,about,footer)')
    ]);
    if (prods.status === 'fulfilled') out.products = prods.value || [];
    else console.warn('تعذّر جلب المنتجات من لوحة التحكم، تبقى بيانات الصفحة الأصلية:', prods.reason && prods.reason.message);
    if (sets.status === 'fulfilled') (sets.value || []).forEach(r => { out.settings[r.key] = r.value; });
    else console.warn('تعذّر جلب إعدادات الصفحة:', sets.reason && sets.reason.message);
    return out;
  }

  window.STORE_READY = load();

  // الإعدادات (روابط، من نحن، فوتر) تُطبَّق فور وصولها دون انتظار بقية الصفحة
  window.STORE_READY.then(d => { if (d) applySettings(d.settings); }).catch(err => console.error(err));


  /* ---------- المنتجات ---------- */

  const num   = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const money = n => String(Math.round(n * 100) / 100) + '$';

  // يحوّل صفوف قاعدة البيانات إلى الشكل الذي يفهمه ronq.js
  window.applyStoreData = function (data) {
    if (!data || !data.products.length) return;
    const slug = new URLSearchParams(location.search).get('p');
    const rows = data.products.slice();
    const at = slug ? rows.findIndex(p => p.slug === slug) : -1;
    if (at > 0) rows.unshift(rows.splice(at, 1)[0]);   // المنتج المطلوب في الرابط يظهر أولاً

    const list = rows.map(p => {
      const imgs  = (Array.isArray(p.images) ? p.images : []).map(String).filter(Boolean);
      const price = num(p.price), old = num(p.old_price);
      return {
        src: imgs[0],
        gallery: imgs.slice(1),       // بقية الزوايا
        name: p.name,
        desc: p.description || '',
        price: isFinite(price) ? money(price) : '',
        oldPrice: isFinite(old) && isFinite(price) && old > price ? money(old) : '',
        features: Array.isArray(p.features) ? p.features.map(String).filter(Boolean) : [],
        glow: p.glow || undefined,
        base: p.base || undefined,
        offer: p.offer_text || undefined,
        offerText: p.offer_text || undefined,
        offerLabel: p.offer_label || undefined
      };
    });
    PRODUCTS.splice(0, PRODUCTS.length, ...list);
  };


  /* ---------- الإعدادات: روابط التواصل، من نحن، الفوتر ---------- */

  const ICONS = {
    facebook:  { icon: 'bxl-facebook',  label: 'فيسبوك' },
    instagram: { icon: 'bxl-instagram', label: 'انستغرام' },
    whatsapp:  { icon: 'bxl-whatsapp',  label: 'واتساب' },
    telegram:  { icon: 'bxl-telegram',  label: 'تيليغرام' },
    tiktok:    { icon: 'bxl-tiktok',    label: 'تيك توك' },
    youtube:   { icon: 'bxl-youtube',   label: 'يوتيوب' },
    twitter:   { icon: 'bxl-twitter',   label: 'إكس (تويتر)' }
  };
  const safeUrl = u => (/^https?:\/\/[^\s]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
  const safeImg = u => (/^(https?:\/\/|imgs\/)[^\s]+$/i.test(String(u || '').trim()) ? String(u).trim() : '');
  const color   = c => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : '');
  const $  = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  function setText(el, t) {
    if (!el) return;
    el.textContent = t;
    el.hidden = !String(t).trim();
  }

  function applySettings(s) {
    s = s || {};
    if (s.home)   applyHome(s.home);
    if (s.about)  applyAbout(s.about);
    if (s.footer) applyFooter(s.footer);
  }

  function applyHome(h) {
    // أيقونات التواصل (في صفحة المنتجات وفي الفوتر): كل رابط فارغ لا تظهر أيقونته
    if (Array.isArray(h.social)) {
      const items = h.social.filter(x => ICONS[x.id] && safeUrl(x.url));
      const make = (withLabel) => items.map(x => {
        const a = document.createElement('a');
        a.href = safeUrl(x.url);
        a.target = '_blank';
        a.rel = 'noopener';
        a.setAttribute('aria-label', ICONS[x.id].label);
        const i = document.createElement('i');
        i.className = 'bx ' + ICONS[x.id].icon;
        a.append(i);
        return a;
      });
      $$('.tauasul, .f-social').forEach(box => box.replaceChildren(...make()));
    }
    // رابط "تواصل معنا"
    const contact = safeUrl(h.contact);
    if (contact) $$('a[data-contact]').forEach(a => { a.href = contact; });
  }

  function applyFooter(f) {
    if (typeof f.text === 'string') setText($('#fText'), f.text);
  }

  function applyAbout(a) {
    const box = $('#about');
    if (!box) return;
    if (typeof a.tag === 'string')    setText($('#abTag'), a.tag);
    if (typeof a.brand === 'string')  setText($('.about-brand'), a.brand);
    if (typeof a.title1 === 'string') setText($('.about-text .h-store'), a.title1);
    if (typeof a.title2 === 'string') setText($('.about-text h2 em'), a.title2);
    if (typeof a.desc === 'string')   setText($('.about-text .desc'), a.desc);

    const img = safeImg(a.image);
    if (img) $('.about .img-main img').src = img;

    // الميزات: نكرر أول القوالب (بأيقوناتها) حسب العدد الذي كتبه المشرف
    if (Array.isArray(a.features)) {
      const wrap = $('.about .features');
      if (!window.__featureTpl) window.__featureTpl = $$('.about .feature').map(el => el.cloneNode(true));
      const tpl = window.__featureTpl;
      const items = a.features.filter(f => f && (String(f.title || '').trim() || String(f.text || '').trim()));
      if (wrap && tpl.length) {
        wrap.replaceChildren(...items.map((f, i) => {
          const el = tpl[i % tpl.length].cloneNode(true);
          el.querySelector('h3').textContent = f.title || '';
          el.querySelector('p').textContent  = f.text || '';
          return el;
        }));
        wrap.hidden = !items.length;
      }
    }

    // العدادات
    const counters = $('.about .counters');
    if (counters) {
      if (a.showCounters === false) counters.hidden = true;
      else if (Array.isArray(a.counters)) {
        counters.hidden = false;
        $$('.about .counter').forEach((el, i) => {
          const c = a.counters[i];
          if (!c) return;
          const n = el.querySelector('.num');
          const v = Math.max(0, Math.round(Number(c.n) || 0));
          n.dataset.count = v;
          if (n.dataset.done) n.textContent = v.toLocaleString('en-US');
          el.querySelector('.lbl').textContent = c.label || '';
        });
      }
    }

    // الألوان (الفارغ = اللون الافتراضي التلقائي)
    const c = a.colors || {};
    const set = (prop, v) => { const ok = color(v); if (ok) box.style.setProperty(prop, ok); else box.style.removeProperty(prop); };
    set('--c-title1', c.title1);
    set('--c-title2', c.title2);
    set('--c-desc',   c.desc);
    set('--c-accent', c.accent);
    set('--c-ft',     c.featTitle);
    set('--c-fx',     c.featText);
    set('--c-bg',     c.bg);
    box.classList.toggle('has-t1', !!color(c.title1));
  }
})();
