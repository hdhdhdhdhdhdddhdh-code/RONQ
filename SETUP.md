# تشغيل لوحة التحكم (مرة واحدة، ~10 دقائق)

اللوحة تعمل على **Supabase** (مجاني): دخول بالبريد وكلمة المرور + قاعدة بيانات + تخزين الصور.
الموقع يبقى ملفات ثابتة كما هو، ولا يتعطل لو توقفت الخدمة (يعرض ما في index.html).

## 1) أنشئ المشروع
1. ادخل إلى supabase.com ← سجّل ← **New project** (اختر أي اسم وكلمة مرور لقاعدة البيانات، والمنطقة الأقرب لك).
2. من **Project Settings ← API** انسخ: **Project URL** و **anon public key**.
3. افتح `config.js` والصقهما:
   ```js
   SUPABASE_URL: 'https://xxxx.supabase.co',
   SUPABASE_ANON_KEY: 'eyJ...'
   ```

## 2) أنشئ الجداول والصلاحيات
**SQL Editor ← New query** ← الصق كامل ملف `supabase-setup.sql` ← **Run**.

## 3) أنشئ حساب المشرف
1. **Authentication ← Users ← Add user ← Create new user**: اكتب بريد المشرف وكلمة مرور قوية، وفعّل **Auto Confirm User**.
2. **Authentication ← Sign In / Providers ← Email**: أطفئ **Allow new users to sign up** (حتى لا يسجّل غريب).
3. ارجع إلى SQL Editor وشغّل هذا السطر (بدّل البريد):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'بريد-المشرف@gmail.com';
   ```
   لإضافة مشرف ثانٍ كرر الخطوتين 1 و3 ببريده.

## 4) ارفع الملفات
ارفع إلى الاستضافة (بجانب index.html): `config.js` `store.js` `admin.html` `admin.css` `admin.js` والملفات المعدّلة.
المشرف يفتح `رابط-موقعك/admin.html` ويدخل ببريده.

## كيف يعمل
- **المنتج الرئيسي** يظهر عند فتح الموقع. ولكل منتج رابط خاص: `index.html?p=رابط-المنتج` (مناسب للإعلانات).
- الصور: الأولى رئيسية والبقية زوايا (المعرض). تُرفع وتُرتّب وتُحذف من اللوحة.
- الألوان: افتراضي، أو مخصص (توهج + أطراف).
- المنتجات المخفية لا يراها الزوار.
- إن تركت `config.js` فارغاً يعمل الموقع كما كان من index.html و products.js.

## ملاحظة عن خانة المحافظة
السكربت `google-apps-script.gs` عندك يقرأ `governorate` أصلاً ويكتبها في عمود «المحافظة»، فلا يحتاج تعديلاً. عمود «المدينة» سيبقى فارغاً لأن العنوان يُكتب بالتفصيل في عمود «العنوان».
