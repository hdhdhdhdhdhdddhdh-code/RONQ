/* RONQ public catalog. Runs only after real Firebase configuration is supplied. */
const cfg = window.RONQ_FIREBASE_CONFIG;
if (cfg && cfg.apiKey && cfg.projectId && cfg.appId) {
  try {
    const SDK = 'https://www.gstatic.com/firebasejs/13.2.0/';
    const [appModule, dbModule] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-firestore.js')
    ]);
    const app = appModule.initializeApp(cfg);
    const db = dbModule.getFirestore(app);
    const { collection, doc, where, query, onSnapshot } = dbModule;
    let catalogInitialized = false;
    let gotSettings = false;
    let gotProducts = false;
    let rows = [];
    const sync = () => {
      if (gotSettings && gotProducts && window.RONQ_CATALOG) {
        window.RONQ_CATALOG.applyRecords(rows, catalogInitialized)
          .catch(err => console.warn('تعذّر تحديث عرض المنتجات', err));
      }
    };
    onSnapshot(doc(db, 'storeSettings', 'catalog'), snapshot => {
      catalogInitialized = snapshot.exists() && snapshot.data().initialized === true;
      gotSettings = true;
      sync();
    }, error => console.warn('تعذّر قراءة إعدادات الكتالوج', error));
    onSnapshot(query(collection(db, 'products'), where('published', '==', true)), snapshot => {
      rows = snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
      rows.sort((a,b) => (Number(a.sortOrder)||0) - (Number(b.sortOrder)||0)
        || String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
      gotProducts = true;
      sync();
    }, error => console.warn('تعذّر قراءة المنتجات المنشورة', error));
  } catch (error) {
    console.error('تعذّر الاتصال بكتالوج RONQ؛ سيبقى العرض القديم', error);
  }
}
