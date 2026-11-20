create table public.kappy_payments (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.kappy_teams(id),
 worker_id uuid not null references auth.users(id),
 week_start date not null,
 amount numeric(12,2) not null check(amount>0),
 check_number text not null check(length(trim(check_number)) between 1 and 80),
 written_on date not null,
 delivery_note text not null check(length(trim(delivery_note)) between 1 and 300),
 recorded_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 received_at timestamptz,
 constraint kappy_payment_unique_check unique(team_id,check_number)
);
alter table public.kappy_payments enable row level security;
revoke all on public.kappy_payments from anon,authenticated;
grant select,insert on public.kappy_payments to authenticated;
grant update(received_at) on public.kappy_payments to authenticated;
create policy "payments_visible_to_worker_or_manager" on public.kappy_payments for select to authenticated
using ((worker_id=(select auth.uid()) and kappy_private.is_member(team_id)) or kappy_private.is_payroll_manager(team_id));
create policy "manager_records_written_checks" on public.kappy_payments for insert to authenticated
with check (recorded_by=(select auth.uid()) and kappy_private.is_payroll_manager(team_id)
 and exists(select 1 from public.kappy_members m where m.team_id=kappy_payments.team_id and m.user_id=kappy_payments.worker_id)
 and exists(select 1 from public.kappy_weekly_submissions s where s.team_id=kappy_payments.team_id and s.worker_id=kappy_payments.worker_id and s.week_start=kappy_payments.week_start));
create policy "worker_confirms_receipt" on public.kappy_payments for update to authenticated
using(worker_id=(select auth.uid()) and received_at is null and kappy_private.is_member(team_id))
with check(worker_id=(select auth.uid()) and received_at is not null and kappy_private.is_member(team_id));
create function kappy_private.lock_payment_receipt() returns trigger language plpgsql set search_path='' as $$
begin
 if old.received_at is not null then raise exception 'Receipt already acknowledged'; end if;
 if new.received_at is null then raise exception 'Receipt confirmation required'; end if;
 new.received_at := transaction_timestamp();
 return new;
end$$;
create trigger lock_payment_receipt before update on public.kappy_payments for each row execute function kappy_private.lock_payment_receipt();
