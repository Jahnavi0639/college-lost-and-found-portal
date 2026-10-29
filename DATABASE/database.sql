-- College Lost & Found Portal database
-- Run this entire file in Supabase SQL Editor for YOUR new project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('LOST', 'FOUND')),
  item_name text not null,
  category text not null,
  description text not null,
  location text not null,
  item_date date not null,
  image_url text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLAIMED', 'CLOSED')),
  created_at timestamptz not null default now()
);

create table if not exists public.claims (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  created_at timestamptz not null default now()
);

create index if not exists items_type_idx on public.items(item_type);
create index if not exists items_user_idx on public.items(user_id);
create index if not exists items_created_idx on public.items(created_at desc);
create index if not exists claims_item_idx on public.claims(item_id);

alter table public.profiles enable row level security;
alter table public.items enable row level security;
alter table public.claims enable row level security;

-- The application backend uses the server-side secret for database operations.
-- These policies still protect direct client access if the tables are ever accessed
-- through a normal Supabase client.

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Authenticated users can view items" on public.items;
create policy "Authenticated users can view items"
on public.items for select
to authenticated
using (true);

drop policy if exists "Users can insert own items" on public.items;
create policy "Users can insert own items"
on public.items for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own items" on public.items;
create policy "Users can update own items"
on public.items for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own items" on public.items;
create policy "Users can delete own items"
on public.items for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can view own claims" on public.claims;
create policy "Users can view own claims"
on public.claims for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can submit own claims" on public.claims;
create policy "Users can submit own claims"
on public.claims for insert
to authenticated
with check (auth.uid() = user_id);

-- Optional helper trigger: keep a profile row synchronized when a new Auth user is created.
-- The backend also upserts profiles during signup, so this is a safety net.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
