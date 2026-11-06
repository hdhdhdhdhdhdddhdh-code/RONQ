/* =====================================================
   admin.js — لوحة تحكم المتجر: دخول بالبريد وكلمة المرور، وثلاثة أقسام:
   الصفحة الرئيسية (المنتجات + روابط التواصل + سعر الصرف) ، من نحن ، الفوتر
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
    if (error) console.error('فحص المشرف فشل:', error.message, error);
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
      if (error) throw new Error('البريد أو كلمة المرور غير صحيحة (' + error.message + ')');
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
    products = []; form = null; about = null;
    show('loginView');
  });

  async function enterApp() {
    show('appView');
    switchTab('home');
    openList();
    loadRateCard();
    await Promise.all([loadProducts(), loadSettings()]);
  }

  // ---------- التبويبات ----------
  function switchTab(name) {
    document.querySelectorAll('.tab').forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.pane').forEach(p => { p.hidden = p.id !== 'tab-' + name; });
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));

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
    box.replaceChildren(...products.map((p, i) => {
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
          h('button', { class: 'btn sm danger', type: 'button', onclick: () => removeProduct(p) }, 'حذف'),
          h('span', { class: 'order-btns' },
            h('button', { type: 'button', title: 'تقديم في الشريط', 'aria-label': 'تقديم', disabled: i === 0, onclick: () => moveProduct(i, -1) }, '→'),
            h('button', { type: 'button', title: 'تأخير في الشريط', 'aria-label': 'تأخير', disabled: i === products.length - 1, onclick: () => moveProduct(i, 1) }, '←'))));
    }));
    $('emptyMsg').hidden = products.length > 0;
  }

  // ترتيب المنتجات (يحدد ترتيبها في الشريط السفلي للموقع)
  async function moveProduct(i, d) {
    const j = i + d;
    if (j < 0 || j >= products.length) return;
    const list = products.slice();
    [list[i], list[j]] = [list[j], list[i]];
    const changes = list.map((p, k) => ({ p, sort: k + 1 })).filter(x => x.p.sort !== x.sort);
    const res = await Promise.all(changes.map(x => sb.from('products').update({ sort: x.sort }).eq('id', x.p.id)));
    const bad = res.find(r => r.error);
    if (bad) toast('تعذّر تغيير الترتيب: ' + bad.error.message, true);
    await loadProducts();
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

  $('fileInput').addEventListener('change', e => { const files = [...e.target.files]; e.target.value = ''; uploadImages(files); });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => uploadImages([...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))));

  async function uploadImages(files) {
    const fm = form;
    if (!fm) return;
    const err = $('imgErr');
    err.hidden = true;
    for (const f of files) {
      if (fm !== form) break;   // أُغلق النموذج أثناء الرفع
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
  }

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

  // ---------- سعر الصرف ----------
  async function loadRateCard() {
    const live = $('liveRate');
    live.className = 'live'; live.textContent = 'السعر التلقائي الآن: ...';
    try {
      const res = await fetch(cfg.SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1/rate', { headers: { apikey: cfg.SUPABASE_ANON_KEY }, cache: 'no-store' });
      const d = await res.json();
      if (!res.ok || !d.rate) throw new Error(d.error || 'HTTP ' + res.status);
      live.textContent = 'السعر التلقائي الآن: ' + Number(d.rate).toLocaleString('en-US') + ' ل.س للدولار (يُستخدم تلقائياً)';
    } catch (e) {
      live.className = 'live bad';
      live.textContent = 'تعذّر الجلب التلقائي، يُستخدم السعر اليدوي أدناه (' + e.message + ')';
    }
    const { data } = await sb.from('settings').select('value').eq('key', 'usd_rate_manual').maybeSingle();
    $('rateInput').value = data && data.value ? Number(data.value) : '';
  }
  $('rateSave').addEventListener('click', async () => {
    const v = num($('rateInput').value);
    if (!isFinite(v) || v < 1000 || v > 1000000) return toast('اكتب سعراً صحيحاً بالليرة القديمة، مثل 14400', true);
    const { error } = await sb.from('settings').upsert({ key: 'usd_rate_manual', value: Math.round(v), updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) return toast('تعذّر الحفظ: ' + error.message, true);
    toast('تم حفظ السعر اليدوي');
  });

  
  /* =====================================================
     إعدادات الموقع: روابط التواصل، من نحن، الفوتر (جدول settings)
     القيم الافتراضية هنا مطابقة لما هو مكتوب في index.html
     ===================================================== */
  const DEF = {
    social: [
      { id: 'instagram', url: 'https://www.instagram.com/ronq183?exln=cGUzbmtyMDUyeHpk' },
      { id: 'whatsapp',  url: 'https://wa.me/40722719456' }
    ],
    contact: 'https://wa.me/40722719456',
    about: {
      tag: 'من نحن',
      brand: 'RONQ',
      title1: 'متجر إلكتروني',
      title2: 'يوصل طلبك حتى باب بيتك',
      desc: 'في RONQ نؤمن أن التسوق يجب أن يكون سهلاً وآمناً وممتعاً. نقدّم لك منتجات مختارة بعناية بجودة عالية وسعر مناسب، ونتولى توصيل طلبك إلى منزلك في مختلف المحافظات مع الدفع عند الاستلام، لتستلم ما تحب وأنت مرتاح في مكانك.',
      image: 'imgs/photo_2026-11-03_06-49-16.jpg',
      features: [
        { title: 'توصيل لباب المنزل', text: 'نصل إلى عنوانك أينما كنت في سوريا، ونوافيك بحالة طلبك حتى يصلك.' },
        { title: 'دفع آمن عند الاستلام', text: 'لا تدفع إلا بعد أن تستلم طلبك وتتأكد منه بنفسك، بكل أمان وثقة.' },
        { title: 'جودة مضمونة', text: 'نختار منتجاتنا بعناية ونراجعها قبل الشحن لنضمن لك رضاك الكامل.' }
      ],
      showCounters: true,
      counters: [
        { n: 1200, label: 'إجمالي الطلبات' },
        { n: 850,  label: 'طلبات تم استلامها' },
        { n: 785,  label: 'عملاء سعداء' },
        { n: 14,   label: 'محافظة نوصل إليها' }
      ],
      colors: { title1: '', title2: '', desc: '', accent: '', featTitle: '', featText: '', bg: '' }
    },
    footer: { text: 'طلبك يصلك لباب بيتك والدفع عند الاستلام، نختار منتجاتنا بعناية لنضمن لك رضاك.' }
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  const ICO = {
    facebook:  '<path d="M14 8h3V4h-3a4 4 0 0 0-4 4v3H7v4h3v6h4v-6h3l1-4h-4V8z"/>',
    instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5v.01"/>',
    whatsapp:  '<path d="M4 20l1.3-4.2A8 8 0 1 1 8.2 18.8L4 20z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-.8.8c-.8-.4-1.5-1.1-1.9-1.9l.8-.8-1-2L9 9.5z"/>',
    telegram:  '<path d="M21 4L3 11l6 2 2 6 3-4 5 4 2-15z"/><path d="M9 13l12-9"/>',
    tiktok:    '<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c0 2.5 2 4 4.5 4"/>',
    youtube:   '<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10.5 9.5v5l4-2.5-4-2.5z"/>',
    twitter:   '<path d="M5 4l14 16M19 4L5 20"/>'
  };
  const SOCIALS = [
    { id: 'facebook',  name: 'فيسبوك',   ph: 'https://facebook.com/صفحتك' },
    { id: 'instagram', name: 'انستغرام', ph: 'https://instagram.com/حسابك' },
    { id: 'whatsapp',  name: 'واتساب',   ph: 'https://wa.me/963933123456' },
    { id: 'telegram',  name: 'تيليغرام', ph: 'https://t.me/حسابك' },
    { id: 'tiktok',    name: 'تيك توك',  ph: 'https://tiktok.com/@حسابك' },
    { id: 'youtube',   name: 'يوتيوب',   ph: 'https://youtube.com/@قناتك' },
    { id: 'twitter',   name: 'إكس (تويتر)', ph: 'https://x.com/حسابك' }
  ];
  const svg = inner => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 24'); el.innerHTML = inner; return el; };
  // رابط صالح: يضيف https:// إن نُسيت. يعيد null إن كان غير صالح، و'' إن كان فارغاً
  function fixUrl(v) {
    v = String(v || '').trim();
    if (!v) return '';
    if (/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v)) return v;
    if (/^[^\s/]+\.[^\s/]+(\/[^\s]*)?$/.test(v) && !/^https?:/i.test(v)) return 'https://' + v;
    return null;
  }
  const showErr = (id, msg) => { const e = $(id); e.textContent = msg || ''; e.hidden = !msg; if (msg) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };

  async function saveSetting(key, value) {
    const { error } = await sb.from('settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    return error;
  }
  async function withBusy(btn, label, fn) {
    const old = btn.textContent;
    btn.disabled = true; btn.textContent = label;
    try { await fn(); } finally { btn.disabled = false; btn.textContent = old; }
  }

  let about = null, aboutOriginalImg = '', aboutUploaded = null;

  async function loadSettings() {
    const { data, error } = await sb.from('settings').select('key,value').in('key', ['home', 'about', 'footer']);
    if (error) toast('تعذّر تحميل الإعدادات: ' + error.message, true);
    const s = {};
    (data || []).forEach(r => { s[r.key] = r.value; });

    // روابط التواصل
    const social = {};
    (s.home && Array.isArray(s.home.social) ? s.home.social : (s.home ? [] : DEF.social)).forEach(x => { social[x.id] = x.url; });
    renderSocials(social);
    $('hContact').value = (s.home && s.home.contact) || (s.home ? '' : DEF.contact);

    // من نحن (القيم المحفوظة فوق الافتراضية)
    const base = clone(DEF.about);
    about = Object.assign(base, s.about || {});
    about.colors = Object.assign(clone(DEF.about.colors), (s.about && s.about.colors) || {});
    aboutOriginalImg = about.image; aboutUploaded = null;
    fillAbout();

    // الفوتر
    $('fText').value = s.footer && typeof s.footer.text === 'string' ? s.footer.text : DEF.footer.text;
    footerPreview();
  }

  // ---------- روابط التواصل ----------
  function renderSocials(values) {
    $('socialList').replaceChildren(...SOCIALS.map(sc => {
      const input = h('input', { dir: 'ltr', placeholder: sc.ph, value: values[sc.id] || '', 'data-id': sc.id, 'aria-label': 'رابط ' + sc.name });
      const row = h('div', { class: 'social' + (values[sc.id] ? '' : ' is-empty') }, h('span', { class: 'ico' }, svg(ICO[sc.id])), h('label', { class: 'nm' }, sc.name), input);
      input.addEventListener('input', () => row.classList.toggle('is-empty', !input.value.trim()));
      return row;
    }));
  }

  $('homeSave').addEventListener('click', () => withBusy($('homeSave'), 'جاري الحفظ...', async () => {
    showErr('homeErr', '');
    const social = [];
    for (const sc of SOCIALS) {
      const inp = $('socialList').querySelector('[data-id="' + sc.id + '"]');
      const u = fixUrl(inp.value);
      if (u === null) return showErr('homeErr', 'رابط ' + sc.name + ' غير صالح. اكتبه كاملاً مثل: ' + sc.ph);
      if (u) social.push({ id: sc.id, url: u });
    }
    const contact = fixUrl($('hContact').value);
    if (contact === null) return showErr('homeErr', 'رابط «تواصل معنا» غير صالح');
    const err = await saveSetting('home', { social, contact });
    if (err) return showErr('homeErr', 'تعذّر الحفظ: ' + err.message);
    toast('تم حفظ الروابط');
  }));


  // ---------- من نحن ----------
  const ACOLORS = [
    ['title1',    'لون العنوان الكبير',                '#2f43b3'],
    ['title2',    'لون العنوان الثانوي',               '#2f43b3'],
    ['desc',      'لون الشرح',                        '#5d6080'],
    ['accent',    'لون التمييز (الشارة والأيقونات)',   '#5b7cfa'],
    ['featTitle', 'لون عناوين المميزات',               '#14163a'],
    ['featText',  'لون نصوص المميزات',                 '#5d6080'],
    ['bg',        'لون خلفية القسم',                  '#ffffff']
  ];
  const TEXT_FIELDS = { aTag: 'tag', aBrand: 'brand', aTitle1: 'title1', aTitle2: 'title2', aDesc: 'desc' };

  Object.entries(TEXT_FIELDS).forEach(([id, k]) => $(id).addEventListener('input', () => { about[k] = $(id).value; aboutPreview(); }));
  $('aShowCounters').addEventListener('change', () => { about.showCounters = $('aShowCounters').checked; });

  function fillAbout() {
    Object.entries(TEXT_FIELDS).forEach(([id, k]) => { $(id).value = about[k] || ''; });
    $('aShowCounters').checked = about.showCounters !== false;
    $('aImg').src = about.image || '';
    renderAboutFeatures(); renderAboutCounters(); renderAboutColors(); aboutPreview();
  }

  function renderAboutFeatures() {
    $('aFeatures').replaceChildren(...about.features.map((f, i) => h('div', { class: 'item-row' },
      h('div', { class: 'stack' },
        h('input', { value: f.title || '', maxlength: 60, placeholder: 'عنوان الميزة', 'aria-label': 'عنوان الميزة ' + (i + 1), oninput: e => { f.title = e.target.value; aboutPreview(); } }),
        h('textarea', { rows: 2, maxlength: 200, placeholder: 'شرح قصير', 'aria-label': 'شرح الميزة ' + (i + 1), oninput: e => { f.text = e.target.value; aboutPreview(); } }, f.text || '')),
      h('button', { type: 'button', 'aria-label': 'حذف الميزة', onclick: () => { about.features.splice(i, 1); renderAboutFeatures(); aboutPreview(); } }, '✕'))));
  }
  $('aAddFeature').addEventListener('click', () => {
    if (about.features.length >= 6) return toast('الحد الأقصى 6 مميزات', true);
    about.features.push({ title: '', text: '' }); renderAboutFeatures();
    const ins = $('aFeatures').querySelectorAll('input'); ins[ins.length - 1].focus();
  });

  function renderAboutCounters() {
    $('aCounters').replaceChildren(...about.counters.map((c, i) => h('div', { class: 'counter-row' },
      h('input', { value: c.n, type: 'text', inputmode: 'numeric', dir: 'ltr', autocomplete: 'off', 'aria-label': 'رقم العداد ' + (i + 1), oninput: e => { c.n = e.target.value; } }),
      h('input', { value: c.label || '', maxlength: 40, placeholder: 'العنوان', 'aria-label': 'عنوان العداد ' + (i + 1), oninput: e => { c.label = e.target.value; } }))));
  }

  function renderAboutColors() {
    $('aColors').replaceChildren(...ACOLORS.map(([k, label, def]) => {
      const cur = about.colors[k] || '';
      const pick = h('input', { type: 'color', value: cur || def, 'aria-label': label, disabled: !cur });
      const auto = h('input', { type: 'checkbox', checked: !cur });
      pick.addEventListener('input', () => { about.colors[k] = pick.value; aboutPreview(); });
      auto.addEventListener('change', () => {
        pick.disabled = auto.checked;
        about.colors[k] = auto.checked ? '' : pick.value;
        aboutPreview();
      });
      return h('div', { class: 'cf' }, h('span', {}, label), pick, h('label', {}, auto, 'تلقائي'));
    }));
  }

  // معاينة مبسّطة لقسم «من نحن» تتبع ما يكتبه المشرف
  function aboutPreview() {
    const c = about.colors, d = n => (ACOLORS.find(x => x[0] === n) || [])[2];
    const f = about.features[0] || {};
    $('pvTag').textContent = about.tag || '';
    $('pvBrand').textContent = about.brand || '';
    $('pvT1').textContent = about.title1 || '';
    $('pvT2').textContent = about.title2 || '';
    $('pvDesc').textContent = about.desc || '';
    $('pvFT').textContent = f.title || '';
    $('pvFX').textContent = f.text || '';
    const acc = c.accent || d('accent');
    $('abPreview').style.background = c.bg || '#ffffff';
    $('pvTag').style.cssText = 'color:' + acc + ';background:color-mix(in srgb,' + acc + ' 14%,#fff)';
    $('pvBrand').style.color = acc;
    $('pvT1').style.color = c.title1 || d('title1');
    $('pvT2').style.color = c.title2 || d('title2');
    $('pvDesc').style.color = c.desc || d('desc');
    $('pvFT').style.color = c.featTitle || d('featTitle');
    $('pvFX').style.color = c.featText || d('featText');
  }

  // صورة القسم
  $('aImgFile').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    showErr('aImgErr', '');
    try {
      const { blob, type, ext } = await prepare(f);
      const path = 'about/' + Date.now() + '-' + rand(6) + '.' + ext;
      const up = await sb.storage.from(BUCKET).upload(path, blob, { contentType: type, cacheControl: '31536000', upsert: false });
      if (up.error) throw new Error(up.error.message);
      if (aboutUploaded) await removeFiles([aboutUploaded]);   // رُفعت قبلها صورة ولم تُحفظ
      aboutUploaded = about.image = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      $('aImg').src = about.image;
    } catch (ex) {
      showErr('aImgErr', 'تعذّر رفع الصورة: ' + ex.message);
    }
  });

  $('aboutReset').addEventListener('click', async () => {
    if (!confirm('استعادة نصوص وألوان وصورة «من نحن» الأصلية؟ لن يتغير الموقع حتى تضغط «حفظ».')) return;
    if (aboutUploaded) { await removeFiles([aboutUploaded]); aboutUploaded = null; }
    about = clone(DEF.about);
    fillAbout();
  });

  $('aboutSave').addEventListener('click', () => withBusy($('aboutSave'), 'جاري الحفظ...', async () => {
    showErr('aboutErr', '');
    const counters = about.counters.map(c => ({ n: Math.max(0, Math.round(num(c.n) || 0)), label: String(c.label || '').trim() }));
    const value = {
      tag: about.tag.trim(), brand: about.brand.trim(), title1: about.title1.trim(), title2: about.title2.trim(), desc: about.desc.trim(),
      image: about.image,
      features: about.features.map(f => ({ title: String(f.title || '').trim(), text: String(f.text || '').trim() })).filter(f => f.title || f.text),
      showCounters: about.showCounters !== false,
      counters,
      colors: about.colors
    };
    const err = await saveSetting('about', value);
    if (err) return showErr('aboutErr', 'تعذّر الحفظ: ' + err.message);
    if (aboutOriginalImg && aboutOriginalImg !== value.image) await removeFiles([aboutOriginalImg]);   // الصورة القديمة (إن كانت مرفوعة هنا)
    aboutOriginalImg = value.image; aboutUploaded = null;
    about.counters = counters; renderAboutCounters();
    toast('تم حفظ قسم «من نحن»');
  }));


  // ---------- الفوتر ----------
  function footerPreview() { $('fPreview').textContent = $('fText').value; }
  $('fText').addEventListener('input', footerPreview);
  $('footerSave').addEventListener('click', () => withBusy($('footerSave'), 'جاري الحفظ...', async () => {
    showErr('footerErr', '');
    const err = await saveSetting('footer', { text: $('fText').value.trim() });
    if (err) return showErr('footerErr', 'تعذّر الحفظ: ' + err.message);
    toast('تم حفظ الفوتر');
  }));

  boot().catch(err => { console.error(err); show('loginView'); });
})();
