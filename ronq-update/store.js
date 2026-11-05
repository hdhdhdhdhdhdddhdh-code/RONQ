/* =====================================================
   store.js — يجلب المنتج المنشور من قاعدة البيانات ويضعه في الصفحة
   - الرابط index.html?p=رابط-المنتج يعرض منتجاً محدداً
   - بدون ?p يُعرض المنتج المعلَّم "الرئيسي" (وإلا أول منتج منشور)
   - إن لم يُضبط config.js أو تعذّر الاتصال: تبقى الصفحة كما هي من index.html (لا يتعطل الموقع)
   يعمل قبل ronq.js، ويستدعيه ronq.js عند التشغيل
   ===================================================== */
(function () {
  const cfg  = (typeof STORE_CONFIG !== 'undefined' && STORE_CONFIG) || {};
  const base = String(cfg.SUPABASE_URL || '').replace(/\/+$/, '');
  const key  = cfg.SUPABASE_ANON_KEY || '';

  async function query(qs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(base + '/rest/v1/products?select=*&published=eq.true' + qs + '&limit=1', {
        headers: { apikey: key, Authorization: 'Bearer ' + key },
        cache: 'no-store',
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      return rows[0] || null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function load() {
    if (!base || !key) return null;
    try {
      const slug = new URLSearchParams(location.search).get('p');
      let p = null;
      if (slug) p = await query('&slug=eq.' + encodeURIComponent(slug));
      if (!p) p = await query('&order=featured.desc,sort.asc,created_at.asc');
      return p;
    } catch (err) {
      console.warn('تعذّر جلب المنتج من لوحة التحكم، تبقى بيانات الصفحة الأصلية:', err.message);
      return null;
    }
  }

  window.STORE_READY = load();

  const num = v => (v === null || v === undefined || v === '' ? NaN : Number(v));
  const money = n => String(Math.round(n * 100) / 100) + '$';

  function preload(url) {
    return new Promise(resolve => {
      const im = new Image();
      im.onload = () => resolve(true);
      im.onerror = () => resolve(false);
      im.src = url;
    });
  }

  // يُستدعى من ronq.js قبل التشغيل: يضع بيانات المنتج في الصفحة (الاسم، الشرح، السعر، الميزات، العرض، الصور، الألوان)
  window.applyStoreProduct = async function (p) {
    if (!p) return;
    if (typeof PRODUCTS !== 'undefined') PRODUCTS.length = 0;   // وضع المنتج الواحد

    if (els.name && p.name) els.name.textContent = p.name;
    if (els.desc) els.desc.textContent = p.description || '';

    const price = num(p.price), old = num(p.old_price);
    if (els.price && isFinite(price)) els.price.textContent = money(price);

    // السعر القديم المشطوب: يُنشأ عند الحاجة (إن كان محذوفاً من index.html)
    if (isFinite(old) && isFinite(price) && old > price) {
      if (!els.oldPrice) {
        const holder = document.querySelector('.alsaer');
        const el = document.createElement('p');
        el.className = 'kdem';
        if (holder) holder.insertBefore(el, holder.firstChild);
        els.oldPrice = el;
      }
      els.oldPrice.textContent = money(old);
    } else if (els.oldPrice) {
      els.oldPrice.textContent = '';
    }

    const feats = Array.isArray(p.features) ? p.features.map(String).filter(Boolean) : [];
    if (els.features && feats.length) {
      els.features.replaceChildren(...feats.map(f => {
        const li = document.createElement('li');
        li.textContent = f;
        return li;
      }));
    }

    // العرض (الشارة)
    Object.assign(PAGE_OFFER, {
      enabled: !!p.offer_text,
      label: p.offer_label || 'عرض خاص',
      text: p.offer_text || ''
    });

    // الصور: الأولى هي الرئيسية، والبقية تصير الصور المصغّرة (المعرض)
    const imgs = (Array.isArray(p.images) ? p.images : []).map(String).filter(Boolean);
    if (imgs.length) {
      if (await preload(imgs[0])) {
        main.src = imgs[0];
        PAGE_GALLERY.splice(0, PAGE_GALLERY.length, ...imgs.slice(1));
      } else {
        console.warn('تعذّر تحميل صورة المنتج الرئيسية، تبقى الصورة الأصلية');
      }
    }

    // الألوان (اختيارية): بدونها تبقى الخلفية الفاتحة الافتراضية
    if (p.glow && p.base) {
      const light = isLightBg(p.glow, p.base);
      setBackground({ glow: p.glow, base: p.base, light, accent: light ? LIGHT_ACCENT : null });
    }
  };
})();
