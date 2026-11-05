/* =====================================================
   admin.js — لوحة تحكم المتجر: دخول بالبريد وكلمة المرور، وإدارة المنتجات والصور
   تعتمد على Supabase (الإعداد في config.js و supabase-setup.sql)
   ===================================================== */
(function () {
  const $ = id => document.getElementById(id);
  const cfg = (typeof STORE_CONFIG !== 'undefined' && STORE_CONFIG) || {};
  const BUCKET = 'product-images';
  const MAX_SIDE = 1600;       // أطول ضلع للصورة بعد التصغير (px)
  const MAX_IMAGES = 8;
  const PRESETS = [
    { n: 'أزرق',   glow: '#1a6fff', base: '#0000c8' },
    { n: 'أسود',   glow: '#4a4a4a', base: '#0b0b0b' },
    { n: 'أحمر',   glow: '#d7440e', base: '#5c0e07' },
    { n: 'أخضر',   glow: '#2fa37a', base: '#0d4a35' },
    { n: 'بنفسجي', glow: '#7f63e0', base: '#2d1d6b' },
    { n: 'ذهبي',   glow: '#d9a441', base: '#5b3a0a' }
  ];

  // ---------- أدوات ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  }
  let toastTimer;
  function toast(msg, bad) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.toggle('bad', !!bad);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  const toEn = s => String(s || '').replace(/[٠-٩]/g, c => c.charCodeAt(0) - 1632).replace(/[۰-۹]/g, c => c.charCodeAt(0) - 1776).replace(/٫/g, '.').trim();
  const num = s => { const n = parseFloat(toEn(s)); return isFinite(n) ? n : NaN; };
  const money = n => String(Math.round(n * 100) / 100) + '$';
  const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  const pathOf = url => { const i = String(url).indexOf('/' + BUCKET + '/'); return i < 0 ? null : decodeURIComponent(String(url).slice(i + BUCKET.length + 2).split('?')[0]); };
  const show = id => ['setupView', 'loginView', 'appView'].forEach(v => $(v).hidden = v !== id);

  // ---------- بدء التشغيل ----------
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) { show('setupView'); return; }
  if (!window.supabase) { show('setupView'); $('setupView').querySelector('p').textContent = 'تعذّر تحميل مكتبة Supabase. تأكد من اتصال الإنترنت ثم أعد تحميل الصفحة.'; return; }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  let products = [];
  let form = null;   // حالة النموذج المفتوح

  async function isAdmin(userId) {
    const { data, error } = await sb.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
    return !error && !!data;
  }

  async function boot() {
    const { data } = await sb.auth.getSession();
    const user = data && data.session && data.session.user;
    if (user && await isAdmin(user.id)) { await enterApp(); }
    else { if (user) await sb.auth.signOut(); show('loginView'); }
  }

  // ---------- تسجيل الدخول ----------
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('loginErr'), btn = $('loginBtn');
    err.hidden = true;
    const email = $('lEmail').value.trim(), password = $('lPass').value;
    if (!email || !password) { err.textContent = 'اكتب البريد وكلمة المرور'; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'جاري الدخول...';
    try {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error('البريد أو كلمة المرور غير صحيحة');
      if (!(await isAdmin(data.user.id))) { await sb.auth.signOut(); throw new Error('هذا الحساب ليس مشرفاً على المتجر'); }
      $('lPass').value = '';
      await enterApp();
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'دخول';
    }
  });

  $('logoutBtn').addEventListener('click', async () => {
    await sb.auth.signOut();
    products = []; form = null;
    show('loginView');
  });

  async function enterApp() {
    show('appView');
    openList();
    await loadProducts();
  }

  // ---------- قائمة المنتجات ----------
  function openList() { $('listView').hidden = false; $('editView').hidden = true; window.scrollTo(0, 0); }

  async function loadProducts() {
    const { data, error } = await sb.from('products').select('*').order('sort', { ascending: true }).order('created_at', { ascending: true });
    if (error) { toast('تعذّر تحميل المنتجات: ' + error.message, true); return; }
    products = data || [];
    renderList();
  }

  const siteUrl = slug => new URL('index.html?p=' + slug, location.href.replace(/admin\.html.*$/, '')).href;

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); toast('تم نسخ الرابط'); }
    catch (e) { window.prompt('انسخ الرابط:', t); }
  }

  function renderList() {
    const box = $('productList');
    box.replaceChildren(...products.map(p => {
      const img = (p.images || [])[0];
      return h('article', { class: 'card' },
        h('div', { class: 'thumb' }, img ? h('img', { src: img, alt: '' }) : null),
        h('div', { class: 'body' },
          h('h4', {}, p.name),
          h('div', { class: 'price' }, h('span', { dir: 'ltr' }, money(Number(p.price))), p.old_price ? h('s', { dir: 'ltr' }, money(Number(p.old_price))) : null),
          h('div', { class: 'tags' },
            h('span', { class: 'tag ' + (p.published ? 'on' : 'off') }, p.published ? 'منشور' : 'مخفي'),
            p.featured ? h('span', { class: 'tag' }, 'الرئيسي') : null,
            (p.images || []).length > 1 ? h('span', { class: 'tag' }, (p.images || []).length + ' صور') : null)),
        h('div', { class: 'btns' },
          h('button', { class: 'btn sm primary', type: 'button', onclick: () => openEdit(p) }, 'تعديل'),
          h('a', { class: 'btn sm ghost', href: siteUrl(p.slug), target: '_blank', rel: 'noopener' }, 'معاينة'),
          h('button', { class: 'btn sm ghost', type: 'button', onclick: () => copyText(siteUrl(p.slug)) }, 'نسخ الرابط'),
          h('button', { class: 'btn sm ghost', type: 'button', onclick: () => togglePublish(p) }, p.published ? 'إخفاء' : 'نشر'),
          h('button', { class: 'btn sm danger', type: 'button', onclick: () => removeProduct(p) }, 'حذف')));
    }));
    $('emptyMsg').hidden = products.length > 0;
  }

  async function togglePublish(p) {
    const { error } = await sb.from('products').update({ published: !p.published }).eq('id', p.id);
    if (error) return toast('تعذّر التحديث: ' + error.message, true);
    toast(p.published ? 'تم إخفاء المنتج' : 'تم نشر المنتج');
    loadProducts();
  }

  async function removeProduct(p) {
    if (!confirm('حذف المنتج «' + p.name + '» نهائياً مع صوره؟ لا يمكن التراجع.')) return;
    const { error } = await sb.from('products').delete().eq('id', p.id);
    if (error) return toast('تعذّر الحذف: ' + error.message, true);
    await removeFiles(p.images || []);
    toast('تم حذف المنتج');
    loadProducts();
  }

  async function removeFiles(urls) {
    const paths = urls.map(pathOf).filter(Boolean);
    if (!paths.length) return;
    const { error } = await sb.storage.from(BUCKET).remove(paths);
    if (error) console.warn('تعذّر حذف بعض الصور من التخزين:', error.message);
  }

  // ---------- نموذج المنتج ----------
  $('addBtn').addEventListener('click', () => openEdit(null));
  $('backBtn').addEventListener('click', cancelEdit);
  $('cancelBtn').addEventListener('click', cancelEdit);

  function openEdit(p) {
    form = {
      id: p ? p.id : null,
      original: p ? (p.images || []).slice() : [],
      images: p ? (p.images || []).map(url => ({ url })) : [],
      uploaded: [],            // صور رُفعت في هذه الجلسة ولم تُحفظ بعد
      features: p ? (p.features || []).slice() : ['', '', ''],
      slugTouched: !!p
    };
    $('editTitle').textContent = p ? 'تعديل المنتج' : 'منتج جديد';
    $('pName').value = p ? p.name : '';
    $('pDesc').value = p ? p.description || '' : '';
    $('pPrice').value = p ? Number(p.price) : '';
    $('pOld').value = p && p.old_price ? Number(p.old_price) : '';
    $('pOfferText').value = p ? p.offer_text || '' : '';
    $('pOfferLabel').value = p ? p.offer_label || '' : '';
    $('pSlug').value = p ? p.slug : 'p-' + rand(6);
    $('pPublished').checked = p ? !!p.published : true;
    $('pFeatured').checked = p ? !!p.featured : !products.some(x => x.featured);
    const custom = !!(p && p.glow && p.base);
    document.querySelector('input[name=colorMode][value=' + (custom ? 'custom' : 'default') + ']').checked = true;
    $('pGlow').value = custom ? p.glow : '#1a6fff';
    $('pBase').value = custom ? p.base : '#0000c8';
    $('formErr').hidden = $('imgErr').hidden = true;
    renderImages(); renderFeatures(); syncColorUi(); updateSlugHint();
    $('listView').hidden = true; $('editView').hidden = false;
    window.scrollTo(0, 0);
  }

  async function cancelEdit() {
    if (form && form.uploaded.length) await removeFiles(form.uploaded);   // صور رُفعت ولم تُحفظ
    form = null;
    openList();
  }

  // --- الصور ---
  function renderImages() {
    const list = $('imageList');
    list.replaceChildren(...form.images.map((im, i) => h('div', { class: 'img-item' + (i === 0 ? ' main' : '') + (im.busy ? ' busy' : '') },
      i === 0 ? h('span', { class: 'badge' }, 'الرئيسية') : null,
      h('div', { class: 'pic' }, im.url ? h('img', { src: im.url, alt: '' }) : h('span', {}, '...')),
      h('div', { class: 'ctl' },
        h('button', { type: 'button', title: 'تقديم', 'aria-label': 'تقديم', disabled: i === 0 || im.busy, onclick: () => moveImage(i, -1) }, '→'),
        h('button', { type: 'button', title: 'تأخير', 'aria-label': 'تأخير', disabled: i === form.images.length - 1 || im.busy, onclick: () => moveImage(i, 1) }, '←'),
        h('button', { type: 'button', class: 'del', title: 'حذف', 'aria-label': 'حذف الصورة', disabled: im.busy, onclick: () => deleteImage(i) }, '✕')))));
  }
  function moveImage(i, d) {
    const j = i + d;
    if (j < 0 || j >= form.images.length) return;
    [form.images[i], form.images[j]] = [form.images[j], form.images[i]];
    renderImages();
  }
  async function deleteImage(i) {
    const [im] = form.images.splice(i, 1);
    renderImages();
    const k = form.uploaded.indexOf(im.url);
    if (k >= 0) { form.uploaded.splice(k, 1); await removeFiles([im.url]); }   // مرفوعة حديثاً: تُحذف فوراً. الأصلية تُحذف عند الحفظ
  }

  // تصغير الصورة الكبيرة مع الحفاظ على الشفافية (PNG يبقى PNG)
  async function prepare(file) {
    const type = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ? file.type : null;
    if (!type) throw new Error('نوع غير مدعوم: ' + file.name + ' (استخدم PNG أو JPG أو WEBP)');
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
    try {
      const bmp = await createImageBitmap(file);
      const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      if (s === 1 && file.size < 1.5 * 1024 * 1024) return { blob: file, type, ext };
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise(r => c.toBlob(r, type, 0.9));
      if (blob) return { blob, type, ext };
    } catch (e) { /* نرفع الأصل */ }
    return { blob: file, type, ext };
  }

  $('fileInput').addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = '';
    const err = $('imgErr');
    err.hidden = true;
    for (const f of files) {
      if (form.images.length >= MAX_IMAGES) { err.textContent = 'الحد الأقصى ' + MAX_IMAGES + ' صور للمنتج'; err.hidden = false; break; }
      const slot = { url: null, busy: true };
      form.images.push(slot);
      renderImages();
      try {
        const { blob, type, ext } = await prepare(f);
        const path = 'p/' + Date.now() + '-' + rand(6) + '.' + ext;
        const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
        if (up.error) throw new Error(up.error.message);
        slot.url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        slot.busy = false;
        form.uploaded.push(slot.url);
      } catch (ex) {
        form.images.splice(form.images.indexOf(slot), 1);
        err.textContent = 'تعذّر رفع «' + f.name + '»: ' + ex.message; err.hidden = false;
      }
      renderImages();
    }
  });

  // --- الميزات ---
  function renderFeatures() {
    $('featureList').replaceChildren(...form.features.map((t, i) => h('div', { class: 'feat' },
      h('input', { value: t, maxlength: 120, placeholder: 'مثال: إطار معدني خفيف', 'aria-label': 'الميزة ' + (i + 1), oninput: e => { form.features[i] = e.target.value; } }),
      h('button', { type: 'button', 'aria-label': 'حذف الميزة', onclick: () => { form.features.splice(i, 1); renderFeatures(); } }, '✕'))));
  }
  $('addFeature').addEventListener('click', () => {
    form.features.push(''); renderFeatures();
    const ins = $('featureList').querySelectorAll('input'); ins[ins.length - 1].focus();
  });

  // --- الألوان ---
  $('swatches').replaceChildren(...PRESETS.map(p => h('button', {
    type: 'button', class: 'sw', title: p.n, 'aria-label': p.n,
    style: 'background:radial-gradient(circle at 35% 35%,' + p.glow + ',' + p.base + ')',
    onclick: () => { document.querySelector('input[name=colorMode][value=custom]').checked = true; $('pGlow').value = p.glow; $('pBase').value = p.base; syncColorUi(); }
  })));
  function syncColorUi() {
    const custom = document.querySelector('input[name=colorMode]:checked').value === 'custom';
    $('customColors').hidden = !custom; $('colorPreview').hidden = !custom; $('swatches').hidden = !custom;
    if (custom) {
      $('colorPreview').style.background = 'radial-gradient(circle at 50% 50%,' + $('pGlow').value + ' 0%,' + $('pBase').value + ' 85%)';
      $('colorPreview').textContent = 'معاينة خلفية الصفحة';
      $('colorPreview').style.color = '#fff';
    }
  }
  document.querySelectorAll('input[name=colorMode]').forEach(r => r.addEventListener('change', syncColorUi));
  ['pGlow', 'pBase'].forEach(id => $(id).addEventListener('input', syncColorUi));

  // --- الرابط ---
  function updateSlugHint() { $('slugHint').textContent = siteUrl($('pSlug').value.trim() || '...'); }
  $('pSlug').addEventListener('input', () => { form.slugTouched = true; updateSlugHint(); });

  // --- الحفظ ---
  const fail = msg => { const e = $('formErr'); e.textContent = msg; e.hidden = false; e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

  $('productForm').addEventListener('submit', async e => {
    e.preventDefault();
    $('formErr').hidden = true;
    if (form.images.some(i => i.busy)) return fail('انتظر حتى ينتهي رفع الصور');
    const images = form.images.map(i => i.url).filter(Boolean);
    const name = $('pName').value.trim();
    const price = num($('pPrice').value);
    const oldRaw = $('pOld').value.trim();
    const old = oldRaw ? num(oldRaw) : null;
    const slug = $('pSlug').value.trim().toLowerCase();

    if (!images.length) return fail('أضف صورة واحدة على الأقل للمنتج');
    if (name.length < 3) return fail('اكتب اسم المنتج');
    if (!isFinite(price) || price <= 0) return fail('اكتب سعراً صحيحاً أكبر من صفر');
    if (old !== null && (!isFinite(old) || old <= 0)) return fail('السعر القديم غير صحيح');
    if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) return fail('رابط المنتج: حروف إنجليزية صغيرة وأرقام وشرطة فقط');

    const custom = document.querySelector('input[name=colorMode]:checked').value === 'custom';
    const offerText = $('pOfferText').value.trim();
    const row = {
      slug, name,
      description: $('pDesc').value.trim(),
      price, old_price: old,
      features: form.features.map(f => f.trim()).filter(Boolean),
      images,
      glow: custom ? $('pGlow').value : null,
      base: custom ? $('pBase').value : null,
      offer_text: offerText || null,
      offer_label: offerText ? ($('pOfferLabel').value.trim() || null) : null,
      published: $('pPublished').checked,
      featured: $('pFeatured').checked
    };

    const btn = $('saveBtn');
    btn.disabled = true; btn.textContent = 'جاري الحفظ...';
    try {
      if (row.featured) {   // منتج رئيسي واحد فقط
        let q = sb.from('products').update({ featured: false }).eq('featured', true);
        if (form.id) q = q.neq('id', form.id);
        const r = await q;
        if (r.error) throw r.error;
      }
      let res;
      if (form.id) res = await sb.from('products').update(row).eq('id', form.id);
      else {
        row.sort = products.reduce((m, p) => Math.max(m, p.sort || 0), 0) + 1;
        res = await sb.from('products').insert(row);
      }
      if (res.error) throw res.error;

      await removeFiles(form.original.filter(u => !images.includes(u)));   // الصور التي حُذفت أثناء التعديل
      form = null;
      toast('تم الحفظ');
      openList();
      await loadProducts();
    } catch (ex) {
      fail(ex.code === '23505' ? 'رابط المنتج مستخدم لمنتج آخر، غيّره' : 'تعذّر الحفظ: ' + (ex.message || ex));
    } finally {
      btn.disabled = false; btn.textContent = 'حفظ';
    }
  });

  boot().catch(err => { console.error(err); show('loginView'); });
})();
