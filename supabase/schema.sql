-- Kappy multi-team foundation. Run in Supabase SQL editor after reviewing.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
-- Private helper functions are intentionally not exposed through the Data API.
create table public.teams (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(trim(name)) between 1 and 100),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.team_members (
 team_id uuid not null references public.teams(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','caregiver','family')),
 joined_at timestamptz not null default now(),
 primary key(team_id,user_id)
);
create table public.team_invitations (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id) on delete cascade,
 email text not null check (char_length(trim(email)) > 3),
 role text not null check (role in ('admin','caregiver','family')),
 token_hash text not null unique,
 expires_at timestamptz not null default (now()+interval '7 days'),
 accepted_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.calendar_entries (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id) on delete cascade,
 created_by uuid not null references auth.users(id),
 assigned_to uuid references auth.users(id),
 kind text not null check (kind in ('shift','available','unavailable','request','event')),
 starts_at timestamptz not null,
 ends_at timestamptz not null,
 title text not null default '',
 details text not null default '',
 status text not null default 'recorded' check (status in ('recorded','pending','approved','declined')),
 created_at timestamptz not null default now(),
 check (ends_at > starts_at)
);
create index calendar_entries_team_time_idx on public.calendar_entries(team_id,starts_at,ends_at);
create index team_invitations_team_idx on public.team_invitations(team_id);
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;
alter table public.calendar_entries enable row level security;

-- SECURITY DEFINER avoids recursive membership-policy evaluation.
create function private.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null and exists(select 1 from public.team_members m where m.team_id=p_team and m.user_id=(select auth.uid()));
$$;
create function private.is_team_admin(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null and exists(select 1 from public.team_members m where m.team_id=p_team and m.user_id=(select auth.uid()) and m.role='admin');
$$;
revoke all on function private.is_team_member(uuid) from public, anon;
revoke all on function private.is_team_admin(uuid) from public, anon;
grant execute on function private.is_team_member(uuid), private.is_team_admin(uuid) to authenticated;

create policy teams_read on public.teams for select to authenticated using (private.is_team_member(id));
create policy members_read on public.team_members for select to authenticated using (private.is_team_member(team_id));
create policy invites_read on public.team_invitations for select to authenticated using (private.is_team_admin(team_id));
create policy entries_read on public.calendar_entries for select to authenticated using (private.is_team_member(team_id));
create policy entries_insert on public.calendar_entries for insert to authenticated
 with check (private.is_team_member(team_id) and created_by=(select auth.uid())
 and (assigned_to is null or exists(select 1 from public.team_members m where m.team_id=calendar_entries.team_id and m.user_id=assigned_to))
 and (kind <> 'shift' or private.is_team_admin(team_id)));
create policy entries_update on public.calendar_entries for update to authenticated
 using (private.is_team_admin(team_id)) with check (private.is_team_admin(team_id));
create policy entries_delete on public.calendar_entries for delete to authenticated using (private.is_team_admin(team_id));

-- No direct table INSERT on teams/members/invitations: use audited RPCs.
create function public.create_team(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if length(trim(p_name)) not between 1 and 100 then raise exception 'Invalid team name'; end if;
 insert into public.teams(name,created_by) values(trim(p_name),auth.uid()) returning id into v_id;
 insert into public.team_members(team_id,user_id,role) values(v_id,auth.uid(),'admin');
 return v_id;
end; $$;
create function public.invite_member(p_team uuid,p_email text,p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_email text; begin
 if not private.is_team_admin(p_team) then raise exception 'Not authorized'; end if;
 if p_role not in ('admin','caregiver','family') then raise exception 'Invalid role'; end if;
 v_email:=lower(trim(p_email));
 if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$' then raise exception 'Invalid email'; end if;
 v_token:=encode(gen_random_bytes(32),'hex');
 insert into public.team_invitations(team_id,email,role,token_hash,created_by)
 values(p_team,v_email,p_role,encode(digest(v_token,'sha256'),'hex'),auth.uid());
 return v_token;
end; $$;
create function public.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_inv public.team_invitations%rowtype; v_email text; begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select lower(email) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then raise exception 'Verified email required'; end if;
 select * into v_inv from public.team_invitations
 where token_hash=encode(digest(p_token,'sha256'),'hex') and accepted_at is null and expires_at>now() for update;
 if not found or v_inv.email<>v_email then raise exception 'Invalid invitation'; end if;
 insert into public.team_members(team_id,user_id,role) values(v_inv.team_id,auth.uid(),v_inv.role)
 on conflict(team_id,user_id) do nothing;
 update public.team_invitations set accepted_at=now() where id=v_inv.id;
 return v_inv.team_id;
end; $$;
revoke all on function public.create_team(text), public.invite_member(uuid,text,text), public.accept_invitation(text) from public;
grant execute on function public.create_team(text), public.invite_member(uuid,text,text), public.accept_invitation(text) to authenticated;
-- Never publish a service_role key in GitHub Pages. Only publish a Supabase anon/publishable key.
