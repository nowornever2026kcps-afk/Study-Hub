-- StudyHub v2 database setup. Run this entire file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Student',
  friend_code text unique not null,
  xp integer not null default 0 check (xp >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.study_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique(sender_id, receiver_id),
  check(sender_id <> receiver_id)
);

-- Store one directed row for each direction so each user's friend list is simple to query.
create table if not exists public.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(user_id, friend_id),
  check(user_id <> friend_id)
);

create or replace function public.make_friend_code()
returns text language plpgsql as $$
declare v_code text;
begin
  loop
    v_code := upper(substr(encode(gen_random_bytes(8),'hex'),1,8));
    exit when not exists(select 1 from public.profiles where friend_code=v_code);
  end loop;
  return v_code;
end; $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,display_name,friend_code)
  values(new.id, coalesce(nullif(new.raw_user_meta_data->>'full_name',''), nullif(new.raw_user_meta_data->>'name',''), 'Student'), public.make_friend_code())
  on conflict(id) do nothing;
  insert into public.study_data(user_id,data) values(new.id,'{}'::jsonb) on conflict(user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_studyhub on auth.users;
create trigger on_auth_user_created_studyhub after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.study_data enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

drop policy if exists "Read own and friends profiles" on public.profiles;
create policy "Read own and friends profiles" on public.profiles for select to authenticated
using (id = auth.uid() or exists(select 1 from public.friendships f where f.user_id=auth.uid() and f.friend_id=profiles.id) or exists(select 1 from public.friend_requests r where r.sender_id=profiles.id and r.receiver_id=auth.uid() and r.status='pending'));
drop policy if exists "Update own profile" on public.profiles;
create policy "Update own profile" on public.profiles for update to authenticated
using (id=auth.uid()) with check (id=auth.uid());
drop policy if exists "Read own study data" on public.study_data;
create policy "Read own study data" on public.study_data for select to authenticated using(user_id=auth.uid());
drop policy if exists "Insert own study data" on public.study_data;
create policy "Insert own study data" on public.study_data for insert to authenticated with check(user_id=auth.uid());
drop policy if exists "Update own study data" on public.study_data;
create policy "Update own study data" on public.study_data for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "Read requests sent or received" on public.friend_requests;
create policy "Read requests sent or received" on public.friend_requests for select to authenticated using(sender_id=auth.uid() or receiver_id=auth.uid());
drop policy if exists "Send friend requests" on public.friend_requests;
create policy "Send friend requests" on public.friend_requests for insert to authenticated with check(sender_id=auth.uid() and status='pending');
drop policy if exists "Receiver can update request" on public.friend_requests;
create policy "Receiver can update request" on public.friend_requests for update to authenticated using(receiver_id=auth.uid()) with check(receiver_id=auth.uid());
drop policy if exists "Read own friendships" on public.friendships;
create policy "Read own friendships" on public.friendships for select to authenticated using(user_id=auth.uid());

create or replace function public.send_friend_request(p_friend_code text)
returns void language plpgsql security definer set search_path=public as $$
declare v_receiver uuid;
begin
  select id into v_receiver from public.profiles where friend_code=upper(trim(p_friend_code));
  if v_receiver is null then raise exception 'No student found with that friend code.'; end if;
  if v_receiver=auth.uid() then raise exception 'You cannot add yourself.'; end if;
  if exists(select 1 from public.friendships where user_id=auth.uid() and friend_id=v_receiver) then raise exception 'You are already friends.'; end if;
  insert into public.friend_requests(sender_id,receiver_id,status) values(auth.uid(),v_receiver,'pending')
  on conflict(sender_id,receiver_id) do update set status='pending',created_at=now();
end; $$;

create or replace function public.accept_friend_request(p_request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_sender uuid;
begin
  update public.friend_requests set status='accepted' where id=p_request_id and receiver_id=auth.uid() and status='pending' returning sender_id into v_sender;
  if v_sender is null then raise exception 'Request not found or already handled.'; end if;
  insert into public.friendships(user_id,friend_id) values(auth.uid(),v_sender),(v_sender,auth.uid()) on conflict do nothing;
end; $$;

create or replace function public.decline_friend_request(p_request_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.friend_requests set status='declined' where id=p_request_id and receiver_id=auth.uid() and status='pending';
  if not found then raise exception 'Request not found or already handled.'; end if;
end; $$;

revoke all on function public.send_friend_request(text) from public;
revoke all on function public.accept_friend_request(uuid) from public;
revoke all on function public.decline_friend_request(uuid) from public;
grant execute on function public.send_friend_request(text) to authenticated;
grant execute on function public.accept_friend_request(uuid) to authenticated;
grant execute on function public.decline_friend_request(uuid) to authenticated;

grant select on public.profiles to authenticated;
grant update(display_name, xp) on public.profiles to authenticated;
grant select, insert, update on public.study_data to authenticated;
grant select, insert, update on public.friend_requests to authenticated;
grant select on public.friendships to authenticated;
