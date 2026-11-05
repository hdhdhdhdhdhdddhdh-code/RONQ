/* RONQ product editor - protected by Firebase Auth AND server-side Firestore/Storage rules. */
const $ = id => document.getElementById(id);
const config = window.RONQ_FIREBASE_CONFIG;
const configReady = config && config.apiKey && config.projectId && config.appId;
let auth, db, storage, api;
let isAuthorized = false;
let docId = null;
let items = [];
let photos = [];
let stopListen = null;
let busy = false;

function showMessage(message, type = '') {
  const box = $('globalMessage');
  box.textContent = message;
  box.className = 'notice' + (type ? ' ' + type : '');
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
function clearMessage() { $('globalMessage').hidden = true; }
function checkPhotoUrl(value) {
  const url = String(value || '').trim();
  if (!url) return false;
  // no javascript:, data: or arbitrary protocols
  return /^https:\/\//i.test(url) || /^\/?imgs\/[^?#]+/i.test(url);
}
function toRgbHex(v, fallback) {
  return /^#[0-9a-f]{6}$/i.test(v || '') ? v : fallback;
}
function setBusy(value, label) {
  busy = value;
  $('saveBtn').disabled = value;
  $('deleteBtn').disabled = value;
  $('loginSubmit').disabled = value;
  $('saveBtn').textContent = label || (value ? 'جاري الحفظ...' : 'حفظ المنتج');
}
function currentForm() {
  return {
    name: $('pName').value.trim(),
    desc: $('pDesc').value.trim(),
    price: Number($('pPrice').value),
    oldPrice: $('pOldPrice').value.trim() === '' ? '' : Number($('pOldPrice').value),
    features: $('pFeatures').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 20),
    images: [...photos],
    src: photos[0] || '',
    glow: $('pGlow').value,
    base: $('pBase').value,
    published: $('pPublished').checked,
    sortOrder: Number($('pSortOrder').value) || 0,
    offer: $('pOffer').checked,
    offerText: $('pOfferText').value.trim(),
    offerLabel: $('pOfferLabel').value.trim() || 'عرض خاص',
    updatedAt: api.serverTimestamp()
  };
}
function refreshPhotos() {
  const list = $('photoList');
  list.replaceChildren();
  if (!photos.length) {
    const p = document.createElement('p');
    p.className = 'helper';
    p.textContent = 'لا توجد صور بعد. أضف أول صورة لتصبح الصورة الرئيسية للمنتج.';
    list.append(p);
    return;
  }
  photos.forEach((url, index) => {
    const tile = document.createElement('div');
    tile.className = 'photo-card';
    const img = new Image();
    img.src = url;
    img.alt = 'صورة المنتج رقم ' + (index + 1);
    img.loading = 'lazy';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', 'إزالة الصورة رقم ' + (index + 1));
    remove.addEventListener('click', () => {
      photos.splice(index, 1);
      refreshPhotos();
    });
    const label = document.createElement('small');
    label.textContent = index === 0 ? 'الصورة الرئيسية' : 'صورة إضافية';
    tile.append(img, remove, label);
    list.append(tile);
  });
}
function setPhotoImages(list) {
  photos = (Array.isArray(list) ? list : []).filter(checkPhotoUrl).slice(0, 8);
  refreshPhotos();
}
function editItem(item) {
  clearMessage();
  docId = item?.id || null;
  $('editModeLabel').textContent = docId ? 'تعديل المنتج الحالي' : 'إضافة منتج جديد';
  $('editTitle').textContent = docId ? 'تعديل المنتج' : 'إضافة منتج';
  $('deleteBtn').hidden = !docId;
  $('productForm').reset();
  $('pName').value = item?.name || '';
  $('pDesc').value = item?.desc || '';
  $('pPrice').value = item?.price ?? '';
  $('pOldPrice').value = item?.oldPrice ?? '';
  $('pFeatures').value = (item?.features || []).join('\n');
  $('pGlow').value = toRgbHex(item?.glow, '#ffffff');
  $('pBase').value = toRgbHex(item?.base, '#dbe4f1');
  $('pPublished').checked = item?.published ?? true;
  $('pSortOrder').value = item?.sortOrder || 0;
  $('pOffer').checked = !!item?.offer;
  $('pOfferText').value = item?.offerText || '';
  $('pOfferLabel').value = item?.offerLabel || 'عرض خاص';
  setPhotoImages(item?.images?.length ? item.images : item?.src ? [item.src] : []);
  $('newImageUrl').value = '';
  $('glowHex').textContent = $('pGlow').value;
  $('baseHex').textContent = $('pBase').value;
  refreshBadge();
  renderList();
}
function refreshBadge() {
  const published = $('pPublished').checked;
  $('editBadge').textContent = published ? 'منشور' : 'مسودة';
  $('editBadge').className = 'state' + (published ? ' published' : '');
}
function renderList() {
  const box = $('productList');
  const term = $('searchProducts').value.trim().toLowerCase();
  box.replaceChildren();
  let shown = 0;
  items.forEach(item => {
    if (term && !String(item.name || '').toLowerCase().includes(term)) return;
    shown++;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'product-row' + (item.id === docId ? ' selected' : '');
    const img = new Image();
    img.src = item?.images?.[0] || item.src || '';
    img.alt = '';
    const summary = document.createElement('span');
    const title = document.createElement('b');
    title.textContent = item.name || 'بدون اسم';
    const price = document.createElement('small');
    price.textContent = (item.price ?? '—') + '$';
    summary.append(title, price);
    const status = document.createElement('em');
    status.textContent = item.published ? 'منشور' : 'مسودة';
    btn.append(img, summary, status);
    btn.addEventListener('click', () => editItem(item));
    box.append(btn);
  });
  if (!shown) {
    const p = document.createElement('p');
    p.className = 'helper';
    p.textContent = 'لا توجد منتجات مطابقة.';
    box.append(p);
  }
}
function detach() {
  if (stopListen) stopListen();
  stopListen = null;
  isAuthorized = false;
  $('editor').hidden = true;
  $('logoutBtn').hidden = true;
}
function openAuthorizedStore() {
  $('authGate').hidden = true;
  $('editor').hidden = false;
  $('logoutBtn').hidden = false;
  isAuthorized = true;
  stopListen = api.onSnapshot(api.collection(db, 'products'), snapshot => {
    items = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
    items.sort((a,b) => (Number(a.sortOrder)||0) - (Number(b.sortOrder)||0)
      || String(a.name||'').localeCompare(String(b.name||''), 'ar'));
    renderList();
  }, error => showMessage('تعذّر قراءة المنتجات: ' + error.message, 'error'));
  editItem(null);
}

$('newBtn').addEventListener('click', () => editItem(null));
$('importLegacyBtn').addEventListener('click', async () => {
  if (!isAuthorized) return;
  if (items.length && !confirm('يوجد منتجات محفوظة. استيراد المنتج الحالي سيملأ النموذج كمنتج جديد دون حفظه تلقائيًا. متابعة؟')) return;
  try {
    const result = await fetch('index.html', { cache: 'no-store' });
    if (!result.ok) throw new Error('لم يمكن قراءة index.html');
    const documentData = new DOMParser().parseFromString(await result.text(), 'text/html');
    const text = (selector) => documentData.querySelector(selector)?.textContent?.trim() || '';
    const image = documentData.querySelector('.imgs img')?.getAttribute('src') || '';
    const price = Number(text('.alsaer .price').replace(/[^\d.]/g, '')) || 0;
    const features = [...documentData.querySelectorAll('.overlay ul li')]
      .map(el => el.textContent.trim()).filter(Boolean);
    editItem({
      name: text('.text h1'), desc: text('.text p'), price,
      oldPrice: '', features, images: image ? [image] : [],
      glow: '#ffffff', base: '#dbe4f1', sortOrder: 0, published: true
    });
    showMessage('تم نقل بيانات المنتج الحالي إلى النموذج. راجع الصور والألوان ثم اضغط حفظ المنتج. لم تُرسل أي تغييرات بعد.', 'success');
  } catch (err) {
    showMessage('تعذّر استيراد المنتج من index.html: ' + err.message, 'error');
  }
});

$('resetBtn').addEventListener('click', () => {
  editItem(docId ? items.find(x => x.id === docId) || null : null);
});
$('searchProducts').addEventListener('input', renderList);
$('pPublished').addEventListener('change', refreshBadge);
for (const [input, label] of [['pGlow','glowHex'],['pBase','baseHex']]) {
  $(input).addEventListener('input', () => { $(label).textContent = $(input).value; });
}
$('addImageUrl').addEventListener('click', () => {
  const url = $('newImageUrl').value.trim();
  if (!checkPhotoUrl(url)) {
    showMessage('أدخل رابط صورة يبدأ بـ https:// أو مسارًا من مجلد imgs/.', 'error');
    return;
  }
  if (photos.length >= 8) { showMessage('الحد الأقصى 8 صور للمنتج.', 'error'); return; }
  if (!photos.includes(url)) photos.push(url);
  $('newImageUrl').value = '';
  refreshPhotos();
  clearMessage();
});
$('uploadFiles').addEventListener('change', async e => {
  const chosen = [...e.target.files];
  e.target.value = '';
  if (!isAuthorized) return;
  if (!storage || !config.storageBucket) {
    showMessage('التخزين غير مهيأ. يمكنك استخدام روابط الصور، أو تفعيل Firebase Storage بعد الموافقة على متطلبات الفوترة.', 'error');
    return;
  }
  if (chosen.length + photos.length > 8) {
    showMessage('يمكن إضافة 8 صور كحد أقصى لكل منتج.', 'error');
    return;
  }
  for (const file of chosen) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size >= 5 * 1024 * 1024) {
      showMessage('ارفع صور JPG أو PNG أو WEBP أصغر من 5 ميغابايت.', 'error');
      return;
    }
  }
  try {
    setBusy(true, 'جاري رفع الصور...');
    for (const file of chosen) {
      // Unique paths prevent overwriting existing product photos.
      const id = (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random());
      const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const storageRef = api.storageRef(storage, 'product-images/' + id + '.' + extension);
      await api.uploadBytes(storageRef, file, { contentType: file.type });
      photos.push(await api.getDownloadURL(storageRef));
      refreshPhotos();
    }
    showMessage('تم رفع الصور. اضغط «حفظ المنتج» لاعتمادها في المتجر.', 'success');
  } catch (err) {
    showMessage('تعذّر رفع الصور: ' + err.message + ' — تحقّق من تفعيل التخزين وقواعد الصلاحية.', 'error');
  } finally {
    setBusy(false);
  }
});

$('productForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!isAuthorized || busy) return;
  const record = currentForm();
  if (!record.name) { showMessage('اسم المنتج مطلوب.', 'error'); return; }
  if (!Number.isFinite(record.price) || record.price < 0 || $('pPrice').value === '') {
    showMessage('أدخل سعرًا صالحًا.', 'error'); return;
  }
  if (!record.images.length) { showMessage('يجب إضافة صورة واحدة للمنتج على الأقل.', 'error'); return; }
  if (record.images.some(url => !checkPhotoUrl(url))) { showMessage('هناك رابط صورة غير صالح.', 'error'); return; }
  try {
    setBusy(true);
    const target = docId ? api.doc(db, 'products', docId) : api.doc(api.collection(db, 'products'));
    const batch = api.writeBatch(db);
    batch.set(target, record);
    batch.set(api.doc(db, 'storeSettings', 'catalog'), {
      initialized: true,
      updatedAt: api.serverTimestamp()
    }, { merge: true });
    await batch.commit();
    docId = target.id;
    $('deleteBtn').hidden = false;
    showMessage('تم حفظ المنتج بنجاح. ستظهر التغييرات للزوار تلقائيًا عند اتصال المتجر بقاعدة البيانات.', 'success');
    renderList();
  } catch (err) {
    showMessage('فشل حفظ المنتج: ' + err.message, 'error');
  } finally {
    setBusy(false);
  }
});
$('deleteBtn').addEventListener('click', async () => {
  if (!isAuthorized || !docId || busy) return;
  const item = items.find(x => x.id === docId);
  if (!confirm('حذف «' + (item?.name || 'المنتج') + '» من الكتالوج؟ لن يعود مرئيًا في المتجر.')) return;
  try {
    setBusy(true, 'جاري الحذف...');
    await api.deleteDoc(api.doc(db, 'products', docId));
    editItem(null);
    showMessage('حُذف المنتج من الكتالوج. الصور القديمة ستبقى في التخزين حتى تحذفها يدويًا.', 'success');
  } catch (err) {
    showMessage('تعذّر حذف المنتج: ' + err.message, 'error');
  } finally { setBusy(false); }
});
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!auth) return;
  try {
    $('loginSubmit').disabled = true;
    clearMessage();
    await api.signInWithEmailAndPassword(auth, $('loginEmail').value.trim(), $('loginPassword').value);
    $('loginPassword').value = '';
  } catch (err) {
    showMessage('لم ينجح تسجيل الدخول. تحقق من البريد وكلمة المرور وصلاحية الحساب.', 'error');
  } finally { $('loginSubmit').disabled = false; }
});
$('logoutBtn').addEventListener('click', async () => {
  if (auth) await api.signOut(auth);
});

async function init() {
  if (!configReady) {
    $('configGate').hidden = false;
    return;
  }
  try {
    const SDK = 'https://www.gstatic.com/firebasejs/13.2.0/';
    const [appSdk, authSdk, dbSdk, storageSdk] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js'),
      import(SDK + 'firebase-storage.js')
    ]);
    const app = appSdk.initializeApp(config);
    auth = authSdk.getAuth(app);
    db = dbSdk.getFirestore(app);
    storage = config.storageBucket ? storageSdk.getStorage(app) : null;
    api = { ...authSdk, ...dbSdk,
      storageRef: storageSdk.ref,
      uploadBytes: storageSdk.uploadBytes,
      getDownloadURL: storageSdk.getDownloadURL
    };
    authSdk.onAuthStateChanged(auth, async user => {
      detach();
      if (!user) { $('authGate').hidden = false; return; }
      try {
        const permission = await api.getDoc(api.doc(db, 'admins', user.uid));
        if (!permission.exists() || permission.data().enabled !== true) {
          showMessage('هذا الحساب ليس مخوّلًا بإدارة المنتجات. يجب أن يمنح المالك الصلاحية لمعرّف UID.', 'error');
          await authSdk.signOut(auth);
          return;
        }
        clearMessage();
        openAuthorizedStore();
      } catch (err) {
        showMessage('تعذّر التحقق من صلاحية الحساب. راجع قواعد Firestore.', 'error');
        await authSdk.signOut(auth);
      }
    });
  } catch (err) {
    $('configGate').hidden = false;
    showMessage('فشل تحميل Firebase: ' + err.message, 'error');
  }
}
init();
