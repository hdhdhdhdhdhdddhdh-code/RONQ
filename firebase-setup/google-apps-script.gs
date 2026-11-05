/* =====================================================================
   google-apps-script.gs — يستقبل طلبات موقع RONQ ويضيفها صفاً في Google Sheets
   (هذا الملف لا يوضع في مجلد الموقع، بل يُلصق داخل Google Apps Script)

   خطوات الربط (مرة واحدة):
   1) أنشئ ملف Google Sheets جديداً (فارغاً) وسمّه مثلاً "طلبات RONQ".
   2) من القائمة: الإضافات (Extensions) ← Apps Script.
   3) احذف الكود الموجود والصق هذا الملف كاملاً ثم احفظ.
   4) اضغط نشر (Deploy) ← نشر جديد (New deployment) ← النوع: تطبيق ويب (Web app):
        - Execute as (تنفيذ كـ): Me (أنا)
        - Who has access (من لديه حق الوصول): Anyone (أي شخص)
      ثم Deploy ووافق على الصلاحيات (قد تظهر "Google hasn't verified this app":
      اضغط Advanced ← Go to ... (unsafe) لأن الكود كودك أنت).
   5) انسخ رابط Web app (ينتهي بـ /exec) والصقه في ronq.js مكان:
        const SHEET_URL = '';
   6) افتح الرابط في المتصفح: يجب أن ترى {"ok":true,...}. ثم جرّب طلباً من الموقع.

   مهم: عند أي تعديل لاحق على هذا الكود يجب نشر "إصدار جديد" (Manage deployments ← Edit ← New version)
   وإلا يبقى الرابط يعمل بالنسخة القديمة.
   ===================================================================== */

// اتركه فارغاً إن أنشأت السكربت من داخل الجدول (الإضافات ← Apps Script).
// وإن أنشأته من script.google.com مستقلاً فضع هنا معرّف الجدول (الجزء الطويل في رابطه بين /d/ و /edit).
const SHEET_ID = '';

const SHEET_NAME = 'الطلبات';
const HEADERS = ['التاريخ', 'الاسم', 'الهاتف', 'المحافظة', 'المدينة', 'العنوان', 'المنتج', 'الكمية', 'الإجمالي $', 'الإجمالي ل.س', 'سعر الصرف'];

// يمنع تحويل نص يبدأ بـ = أو + أو - أو @ إلى صيغة داخل الجدول (حماية من الحقن)
function safe(v) {
  const t = String(v == null ? '' : v);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);                                   // طلبان في نفس اللحظة لا يكتبان فوق بعضهما
    const o = JSON.parse(e.postData.contents);
    if (!o.name || !o.phone) return out({ ok: false, error: 'missing name/phone' });

    const ss = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return out({ ok: false, error: 'no spreadsheet: ضع SHEET_ID' });
    let sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

    if (sh.getLastRow() === 0) {                            // أول طلب: نكتب سطر العناوين
      sh.appendRow(HEADERS);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
      sh.setRightToLeft(true);
    }

    const row = sh.getLastRow() + 1;
    sh.getRange(row, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    sh.getRange(row, 3).setNumberFormat('@');               // الهاتف كنص حتى لا يُحذف الـ + أو الصفر
    sh.getRange(row, 1, 1, HEADERS.length).setValues([[
      new Date(),
      safe(o.name),
      String(o.phoneDisplay || o.phone),
      safe(o.governorate),
      safe(o.city),
      safe(o.address),
      safe(o.product),
      Number(o.quantity) || 0,
      Number(o.totalUsd) || 0,
      Number(o.totalSyp) || 0,
      Number(o.rate) || 0
    ]]);

    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// لفحص أن الرابط يعمل: افتحه في المتصفح
function doGet() {
  return out({ ok: true, msg: 'RONQ orders endpoint is running' });
}