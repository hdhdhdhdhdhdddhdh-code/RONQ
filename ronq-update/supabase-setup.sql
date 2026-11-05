-- =====================================================================
-- supabase-setup.sql — شغّله مرة واحدة: Supabase ← SQL Editor ← New query ← الصق ← Run
-- يُنشئ جدول المنتجات + مجلد الصور + صلاحيات: الزائر يقرأ المنشور فقط، والمشرف وحده يعدّل
-- =====================================================================

-- 1) المشرفون (المستخدم المذكور هنا فقط يستطيع التعديل، حتى لو أنشأ غيره حساباً)
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- المشرف يرى جدول المشرفين فقط لنفسه (للتحقق عند الدخول)
drop policy if exists "admins read own" on public.admins;
create policy "admins read own" on public.admins for select to authenticated using (user_id = auth.uid());

-- 2) جدول المنتجات
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,60}$'),
  name        text not null,
  description text not null default '',
  price       numeric(10,2) not null check (price > 0),
  old_price   numeric(10,2) check (old_price is null or old_price > 0),
  features    jsonb not null default '[]'::jsonb,
  images      jsonb not null default '[]'::jsonb,   -- روابط الصور، الأولى هي الرئيسية
  glow        text,                                  -- لون التوهج (اختياري)
  base        text,                                  -- لون الحواف (اختياري)
  offer_text  text,
  offer_label text,
  published   boolean not null default true,
  featured    boolean not null default false,
  sort        integer not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists one_featured on public.products (featured) where featured;

alter table public.products enable row level security;

drop policy if exists "public read published" on public.products;
create policy "public read published" on public.products for select to anon, authenticated using (published or public.is_admin());

drop policy if exists "admin insert" on public.products;
create policy "admin insert" on public.products for insert to authenticated with check (public.is_admin());
drop policy if exists "admin update" on public.products;
create policy "admin update" on public.products for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin delete" on public.products;
create policy "admin delete" on public.products for delete to authenticated using (public.is_admin());

-- 3) مجلد صور المنتجات (عام للقراءة، والكتابة للمشرف فقط)
insert into storage.buckets (id, name, public) values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "images admin insert" on storage.objects;
create policy "images admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "images admin update" on storage.objects;
create policy "images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_admin());
drop policy if exists "images admin delete" on storage.objects;
create policy "images admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- 4) عيّن المشرف: أنشئ المستخدم أولاً من Authentication ← Users ← Add user (بريد + كلمة مرور)،
--    ثم بدّل البريد أدناه وشغّل هذا السطر وحده:
-- insert into public.admins (user_id) select id from auth.users where email = 'admin@example.com';
