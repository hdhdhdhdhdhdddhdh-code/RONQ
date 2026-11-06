const input = document.getElementById('x');

/* =====================================================
   قائمة الدول: رمز الدولة (ISO) : مفتاح الاتصال
   أسماء الدول بالعربية تأتي من المتصفح تلقائياً (Intl.DisplayNames)
   لإضافة دولة أو تعديل مفتاح: عدّل هذا النص فقط
   ===================================================== */
const COUNTRY_DATA =
  'SY:963,TR:90,LB:961,JO:962,IQ:964,SA:966,AE:971,QA:974,KW:965,EG:20,DE:49,' +
  'AF:93,AL:355,DZ:213,AS:1684,AD:376,AO:244,AI:1264,AG:1268,AR:54,AM:374,AW:297,AU:61,AT:43,AZ:994,' +
  'BS:1242,BH:973,BD:880,BB:1246,BY:375,BE:32,BZ:501,BJ:229,BM:1441,BT:975,BO:591,BA:387,BW:267,BR:55,' +
  'IO:246,VG:1284,BN:673,BG:359,BF:226,BI:257,KH:855,CM:237,CA:1,CV:238,KY:1345,CF:236,TD:235,CL:56,' +
  'CN:86,CO:57,KM:269,CG:242,CD:243,CK:682,CR:506,CI:225,HR:385,CU:53,CW:599,CY:357,CZ:420,DK:45,' +
  'DJ:253,DM:1767,DO:1809,EC:593,SV:503,GQ:240,ER:291,EE:372,SZ:268,ET:251,FK:500,FO:298,FJ:679,FI:358,' +
  'FR:33,GF:594,PF:689,GA:241,GM:220,GE:995,GH:233,GI:350,GR:30,GL:299,GD:1473,GP:590,GU:1671,GT:502,' +
  'GG:44,GN:224,GW:245,GY:592,HT:509,HN:504,HK:852,HU:36,IS:354,IN:91,ID:62,IR:98,IE:353,IM:44,IL:972,' +
  'IT:39,JM:1876,JP:81,JE:44,KZ:7,KE:254,KI:686,XK:383,KG:996,LA:856,LV:371,LS:266,LR:231,LY:218,LI:423,' +
  'LT:370,LU:352,MO:853,MG:261,MW:265,MY:60,MV:960,ML:223,MT:356,MH:692,MQ:596,MR:222,MU:230,YT:262,' +
  'MX:52,FM:691,MD:373,MC:377,MN:976,ME:382,MS:1664,MA:212,MZ:258,MM:95,NA:264,NR:674,NP:977,NL:31,' +
  'NC:687,NZ:64,NI:505,NE:227,NG:234,NU:683,NF:672,KP:850,MK:389,MP:1670,NO:47,OM:968,PK:92,PW:680,' +
  'PS:970,PA:507,PG:675,PY:595,PE:51,PH:63,PL:48,PT:351,PR:1787,RE:262,RO:40,RU:7,RW:250,BL:590,SH:290,' +
  'KN:1869,LC:1758,MF:590,PM:508,VC:1784,WS:685,SM:378,ST:239,SN:221,RS:381,SC:248,SL:232,SG:65,SX:1721,' +
  'SK:421,SI:386,SB:677,SO:252,ZA:27,KR:82,SS:211,ES:34,LK:94,SD:249,SR:597,SE:46,CH:41,TW:886,TJ:992,' +
  'TZ:255,TH:66,TL:670,TG:228,TK:690,TO:676,TT:1868,TN:216,TM:993,TC:1649,TV:688,UG:256,UA:380,GB:44,' +
  'US:1,UY:598,UZ:998,VU:678,VA:39,VE:58,VN:84,VI:1340,WF:681,YE:967,ZM:260,ZW:263';

// دول تظهر في أول القائمة قبل بقية الدول
const PINNED = ['SY', 'TR', 'LB', 'JO', 'IQ', 'SA', 'AE', 'QA', 'KW', 'EG', 'DE'];

function flagEmoji(iso) {
  return String.fromCodePoint(...[...iso].map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

function makeNames(lang) {
  try { return new Intl.DisplayNames([lang], { type: 'region' }); } catch (e) { return null; }
}
const namesAr = makeNames('ar');
const namesEn = makeNames('en');

const countries = COUNTRY_DATA.split(',').map(s => {
  const [iso, code] = s.split(':');
  return {
    iso, code,
    ar: (namesAr && namesAr.of(iso)) || iso,
    en: (namesEn && namesEn.of(iso)) || iso,
    flag: flagEmoji(iso)
  };
});
const byIso = Object.fromEntries(countries.map(c => [c.iso, c]));
const pinned = PINNED.map(i => byIso[i]).filter(Boolean);
const others = countries
  .filter(c => !PINNED.includes(c.iso))
  .sort((a, b) => a.ar.localeCompare(b.ar, 'ar'));


/* ---------- الإطار: [ علم ▾ + رمز الدولة ] [ رقم الهاتف ] ---------- */

const box = document.createElement('div');
box.style.cssText = 'position:relative;';

// لون الإطار الطبيعي، ويتحول للأحمر عند الخطأ
const BORDER_OK = 'rgba(255,255,255,.3)';

const wrapper = document.createElement('div');
wrapper.className = 'phone-wrap';
wrapper.dir = 'ltr';
wrapper.style.cssText =
  'display:flex;align-items:center;border:1px solid ' + BORDER_OK + ';border-radius:12px;overflow:hidden;background:rgba(255,255,255,.12);';

const prefix = document.createElement('div');
prefix.style.cssText =
  'display:flex;align-items:center;padding:0 8px 0 4px;background:rgba(255,255,255,.15);color:#fff;align-self:stretch;border-right:1px solid rgba(255,255,255,.3);font-size:16px;';

// زر القائمة: علم الدولة + سهم
const pickBtn = document.createElement('button');
pickBtn.type = 'button';
pickBtn.setAttribute('aria-haspopup', 'listbox');
pickBtn.setAttribute('aria-expanded', 'false');
pickBtn.setAttribute('aria-label', 'اختيار الدولة');
pickBtn.style.cssText =
  'display:flex;align-items:center;gap:4px;border:0;background:transparent;cursor:pointer;padding:0 6px;align-self:stretch;font-size:18px;color:inherit;';
const flagEl = document.createElement('span');
flagEl.style.cssText = 'font-size:20px;line-height:1;';
const caret = document.createElement('span');
caret.textContent = '▾';
caret.style.cssText = 'font-size:12px;opacity:.7;transition:transform .2s;';
pickBtn.append(flagEl, caret);

const plus = document.createElement('span');
plus.textContent = '+';

const code = document.createElement('input');
code.type = 'tel';
code.inputMode = 'numeric';
code.dir = 'ltr';
code.value = '963';
code.readOnly = true;
code.setAttribute('aria-label', 'رمز الدولة');
code.style.cssText =
  'width:3ch;border:0;outline:none;background:transparent;font-size:16px;color:inherit;padding:10px 0;';

prefix.append(pickBtn, plus, code);

input.parentNode.insertBefore(box, input);
box.appendChild(wrapper);
wrapper.append(prefix, input);

input.type = 'tel';
input.inputMode = 'numeric';
input.placeholder = '933 123 456';
input.dir = 'ltr';
input.style.cssText = 'flex:1;border:0;outline:none;padding:11px 10px;font-size:16px;min-width:0;background:transparent;color:#fff;';


/* ---------- رسالة الخطأ ---------- */

const msg = document.createElement('small');
msg.style.cssText = 'color:#ffb3b3;display:block;margin-top:4px;font-size:13px;';
box.appendChild(msg);


/* ---------- القائمة المنسدلة للدول ---------- */

const panel = document.createElement('div');
panel.hidden = true;
panel.dir = 'rtl';
panel.style.cssText =
  'position:absolute;left:0;right:0;z-index:1000;background:#fff;color:#222;border:1px solid #ccc;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);overflow:hidden;';

const search = document.createElement('input');
search.type = 'search';
search.placeholder = 'ابحث عن دولة أو رمز';
search.setAttribute('aria-label', 'بحث عن دولة');
search.style.cssText =
  'display:block;width:100%;border:0;border-bottom:1px solid #e5e5e5;outline:none;padding:10px 12px;font-size:15px;box-sizing:border-box;';

const list = document.createElement('div');
list.setAttribute('role', 'listbox');
list.style.cssText = 'max-height:min(260px,45vh);overflow-y:auto;overscroll-behavior:contain;';

panel.append(search, list);
box.appendChild(panel);

let selectedIso = 'SY';
let visible = [];      // العناصر الظاهرة حالياً: { el, c }
let activeIdx = -1;

function normQuery(s) {
  return toLatinDigits(s) && /^[\d+\s]+$/.test(s.trim())
    ? toLatinDigits(s)
    : s.trim().toLowerCase();
}

function makeItem(c) {
  const el = document.createElement('div');
  el.setAttribute('role', 'option');
  el.style.cssText =
    'display:flex;align-items:center;gap:10px;padding:9px 12px;cursor:pointer;font-size:15px;';
  const f = document.createElement('span');
  f.textContent = c.flag;
  f.style.fontSize = '19px';
  const n = document.createElement('span');
  n.textContent = c.ar;
  n.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
  const k = document.createElement('span');
  k.textContent = '+' + c.code;
  k.dir = 'ltr';
  k.style.cssText = 'color:#666;font-variant-numeric:tabular-nums;';
  el.append(f, n, k);
  el.addEventListener('mouseenter', () => setActive(visible.findIndex(v => v.el === el), false));
  el.addEventListener('click', () => selectCountry(c));
  return el;
}

function renderList(q) {
  list.replaceChildren();
  visible = [];
  const query = q ? normQuery(q) : '';

  const add = (arr) => arr.forEach(c => {
    const el = makeItem(c);
    list.appendChild(el);
    visible.push({ el, c });
  });

  if (!query) {
    add(pinned);
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:#e5e5e5;margin:4px 0;';
    list.appendChild(sep);
    add(others);
  } else {
    const codeQ = query.replace(/\D/g, '');
    const isNum = /^\d+$/.test(query.replace(/[+\s]/g, ''));
    add([...pinned, ...others].filter(c =>
      isNum ? c.code.startsWith(codeQ)
            : c.ar.includes(query) || c.en.toLowerCase().includes(query) || c.iso.toLowerCase() === query
    ));
    if (!visible.length) {
      const none = document.createElement('div');
      none.textContent = 'لا توجد نتائج';
      none.style.cssText = 'padding:12px;color:#888;font-size:14px;text-align:center;';
      list.appendChild(none);
    }
  }

  // نحدد الدولة المختارة حالياً
  visible.forEach(v => {
    const on = v.c.iso === selectedIso;
    v.el.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on) v.el.style.fontWeight = '700';
  });
  const cur = visible.findIndex(v => v.c.iso === selectedIso);
  setActive(cur >= 0 ? cur : (visible.length ? 0 : -1), true);
}

function setActive(i, scroll) {
  visible.forEach((v, k) => { v.el.style.background = k === i ? '#eef4ff' : ''; });
  activeIdx = i;
  if (scroll && i >= 0 && visible[i]) visible[i].el.scrollIntoView({ block: 'nearest' });
}

function openPanel() {
  if (!panel.hidden) return;
  panel.style.top = (wrapper.offsetTop + wrapper.offsetHeight + 4) + 'px';
  search.value = '';
  renderList('');
  panel.hidden = false;
  pickBtn.setAttribute('aria-expanded', 'true');
  caret.style.transform = 'rotate(180deg)';
  // في الجوال لا نفتح لوحة المفاتيح تلقائياً
  if (!window.matchMedia('(pointer: coarse)').matches) search.focus();
}

function closePanel() {
  if (panel.hidden) return;
  panel.hidden = true;
  pickBtn.setAttribute('aria-expanded', 'false');
  caret.style.transform = '';
}

pickBtn.addEventListener('click', () => (panel.hidden ? openPanel() : closePanel()));
pickBtn.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); openPanel(); }
});

search.addEventListener('input', () => renderList(search.value));
search.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); if (visible.length) setActive((activeIdx + 1) % visible.length, true); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); if (visible.length) setActive((activeIdx - 1 + visible.length) % visible.length, true); }
  else if (e.key === 'Enter') { e.preventDefault(); if (visible[activeIdx]) selectCountry(visible[activeIdx].c); }
  else if (e.key === 'Escape') { e.preventDefault(); closePanel(); pickBtn.focus(); }
});

// إغلاق القائمة عند الضغط خارجها
document.addEventListener('pointerdown', e => {
  if (!panel.hidden && !box.contains(e.target)) closePanel();
});

// العلم الظاهر على الزر حسب رمز الدولة الحالي
function updateFlag() {
  let c;
  if (!isIntl()) {
    c = byIso.SY;
  } else {
    const cur = toLatinDigits(code.value);
    const sel = byIso[selectedIso];
    c = (sel && sel.code === cur) ? sel : countries.find(x => x.code === cur);
  }
  flagEl.textContent = c ? c.flag : '🌐';
  if (c) selectedIso = c.iso;
}

function selectCountry(c) {
  closePanel();
  selectedIso = c.iso;

  if (c.iso === 'SY') {
    if (isIntl()) { intlMode = false; setMode(); }
    input.focus();
    return;
  }

  if (!isIntl()) {
    intlMode = true;             // اختيار دولة غير سوريا يفعّل الوضع الدولي تلقائياً
    setMode(c.code);
  } else {
    code.value = c.code;
    refresh();
    input.focus();
  }
}


/* ---------- أدوات التنظيف ---------- */

function toLatinDigits(value) {
  return value
    .replace(/[٠-٩]/g, c => c.charCodeAt(0) - 1632)
    .replace(/[۰-۹]/g, c => c.charCodeAt(0) - 1776)
    .replace(/\D/g, '');
}

// الرقم السوري: يقبل 0933... و933... و+963933... و00963933...
function normalizeSy(value) {
  let d = toLatinDigits(value);

  if (d.startsWith('00963')) d = d.slice(5);
  else if (d.startsWith('963') && d.length > 9) d = d.slice(3);   // 963 رمز دولة فقط إذا زاد الطول عن 9

  if (d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 9);
}

function formatSy(d) {
  return d.replace(/(\d{3})(?=\d)/g, '$1 ');
}

// رقم دولي: أرقام فقط، والمجموع مع رمز الدولة لا يتجاوز 15 رقماً (معيار E.164)
function normalizeIntl(value, codeLen) {
  let d = toLatinDigits(value);
  if (d.startsWith('00')) d = d.replace(/^0+/, '');
  return d.slice(0, 15 - codeLen);
}

function formatIntl(d) {
  return d.replace(/(\d{3})(?=\d)/g, '$1 ');
}

// الوضع الدولي يتفعّل باختيار دولة غير سوريا من القائمة، ويعود الوضع السوري باختيار سوريا
let intlMode = false;

function isIntl() {
  return intlMode;
}


/* ---------- التحقق وعرض الرسائل ---------- */

function validate() {
  if (!isIntl()) {
    const d = normalizeSy(input.value);
    if (d.length === 0) return '';
    if (d[0] !== '9') return 'الرقم خاطئ: الرقم السوري الجوال يبدأ بالرقم 9';
    if (d.length < 9) return 'الرقم ناقص: أدخلت ' + d.length + ' أرقام والمطلوب 9 أرقام';
    return '';
  }

  const c = toLatinDigits(code.value);
  const d = normalizeIntl(input.value, c.length);
  if (!c && !d) return '';
  if (!c || c[0] === '0') return 'اكتب رمز الدولة أو اختره من القائمة';
  if (!d) return '';
  if (d.length < 6) return 'الرقم ناقص أو قصير جداً';
  return '';
}

function refresh() {
  if (isIntl()) {
    const c = toLatinDigits(code.value).slice(0, 4);
    code.value = c;
    input.value = formatIntl(normalizeIntl(input.value, c.length));
  } else {
    input.value = formatSy(normalizeSy(input.value));
  }
  updateFlag();
  const m = validate();
  msg.textContent = m;
  wrapper.style.borderColor = m ? '#ff9b9b' : BORDER_OK;
}

// لصق أو كتابة رقم دولي يبدأ بـ + أو 00 لدولة غير سوريا: نتعرف على رمز الدولة
function detectIntl(raw) {
  const t = raw.trim();
  if (!/^(\+|00)/.test(t)) return null;
  const d = toLatinDigits(t).replace(/^0{2}/, '');
  if (d.startsWith('963')) return null;
  for (let len = Math.min(4, d.length); len >= 1; len--) {
    const c = countries.find(x => x.code === d.slice(0, len));
    if (c) return { c, rest: d.slice(len) };
  }
  return null;
}

input.addEventListener('input', () => {
  if (!isIntl()) {
    const hit = detectIntl(input.value);
    if (hit) {
      intlMode = true;
      selectedIso = hit.c.iso;
      setMode(hit.c.code);
      input.value = hit.rest;
    }
  }
  refresh();
});
code.addEventListener('input', refresh);

code.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); input.focus(); }
});


/* ---------- تبديل الوضع ---------- */

// codeArg: رمز دولة يُكتب مباشرة عند التفعيل (يأتي من اختيار دولة في القائمة)
function setMode(codeArg) {
  const intl = isIntl();

  if (intl) {
    code.readOnly = false;
    code.value = codeArg || '';
    code.style.width = '4ch';
    prefix.style.background = 'rgba(255,255,255,.3)';
    code.placeholder = '000';
    input.placeholder = '555 123 456';
    input.value = '';
    (codeArg ? input : code).focus();
  } else {
    code.readOnly = true;
    code.value = '963';
    code.style.width = '3ch';
    prefix.style.background = 'rgba(255,255,255,.15)';
    code.placeholder = '';
    input.placeholder = '933 123 456';
    input.value = '';
    selectedIso = 'SY';
  }
  msg.textContent = '';
  wrapper.style.borderColor = BORDER_OK;
  updateFlag();
}

updateFlag();


/* ---------- النتيجة النهائية ---------- */

// الرقم بصيغة موحدة للعرض، مثل "+963 933 123 456" أو "+90 555 123 456" (أو null إن كان غير صالح)
function getFinalPhone() {
  if (!isIntl()) {
    const d = normalizeSy(input.value);
    return /^9\d{8}$/.test(d) ? '+963 ' + formatSy(d) : null;
  }
  const c = toLatinDigits(code.value);
  const d = normalizeIntl(input.value, c.length);
  return (c && c[0] !== '0' && d.length >= 6) ? '+' + c + ' ' + formatIntl(d) : null;
}

// الرقم بصيغة E.164 بدون مسافات، مثل "+963933123456" (مناسب للواتساب أو الـ API)
function getE164() {
  const p = getFinalPhone();
  return p ? p.replace(/\s/g, '') : null;
}

// هل الرقم المُدخل سوري؟ مفيد لتشغيل فحوصات خاصة بسوريا فقط (مثل فحص الشبكة HLR)
function isSyrianPhone() {
  return !isIntl();
}

// يُستدعى عند الضغط على "تأكيد الطلب": يعرض الخطأ ويلوّن الإطار، ويعيد true إذا كان الرقم صالحاً
function checkPhone() {
  const m = validate() || (getE164() ? '' : 'اكتب رقم الهاتف');
  msg.textContent = m;
  wrapper.style.borderColor = m ? '#ff9b9b' : BORDER_OK;
  return !m;
}
