-- Kappy work records beta: weekly coverage, paid extras and grocery reimbursements.
create table if not exists public.kappy_work_entries (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.kappy_teams(id) on delete cascade,
 worker_id uuid not null references auth.users(id),
 work_date date not null,
 category text not null check (category in ('coverage','groceries','errand','other')),
 hours numeric(7,2) not null check (hours > 0 and hours <= 24),
 hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
 notes text not null default '',
 created_at timestamptz not null default now(),
 unique(id,team_id)
);
create table if not exists public.kappy_expenses (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.kappy_teams(id) on delete cascade,
 worker_id uuid not null references auth.users(id),
 spent_on date not null,
 category text not null check (category in ('groceries','supplies','other')),
 amount numeric(10,2) not null check(amount >= 0),
 description text not null default '',
 receipt_path text,
 created_at timestamptz not null default now()
);
create table if not exists public.kappy_weekly_submissions (
 team_id uuid not null references public.kappy_teams(id) on delete cascade,
 worker_id uuid not null references auth.users(id),
 week_start date not null,
 submitted_at timestamptz not null default now(),
 primary key(team_id,worker_id,week_start)
);
create or replace function kappy_private.is_payroll_manager(p_team uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.kappy_members m where m.team_id=p_team and m.user_id=(select auth.uid()) and m.role in ('admin','payroll_manager'))
$$;
grant execute on function kappy_private.is_payroll_manager(uuid) to authenticated;
alter table public.kappy_work_entries enable row level security;
alter table public.kappy_expenses enable row level security;
alter table public.kappy_weekly_submissions enable row level security;
create policy work_read on public.kappy_work_entries for select to authenticated using ((worker_id=(select auth.uid()) and kappy_private.is_member(team_id)) or kappy_private.is_payroll_manager(team_id));
create policy work_add on public.kappy_work_entries for insert to authenticated with check(worker_id=(select auth.uid()) and kappy_private.is_member(team_id));
create policy expense_read on public.kappy_expenses for select to authenticated using ((worker_id=(select auth.uid()) and kappy_private.is_member(team_id)) or kappy_private.is_payroll_manager(team_id));
create policy expense_add on public.kappy_expenses for insert to authenticated with check(worker_id=(select auth.uid()) and kappy_private.is_member(team_id));
create policy submission_read on public.kappy_weekly_submissions for select to authenticated using ((worker_id=(select auth.uid()) and kappy_private.is_member(team_id)) or kappy_private.is_payroll_manager(team_id));
create policy submission_add on public.kappy_weekly_submissions for insert to authenticated with check(worker_id=(select auth.uid()) and kappy_private.is_member(team_id));
grant select,insert on public.kappy_work_entries,public.kappy_expenses,public.kappy_weekly_submissions to authenticated;
revoke all on public.kappy_work_entries,public.kappy_expenses,public.kappy_weekly_submissions from anon;
