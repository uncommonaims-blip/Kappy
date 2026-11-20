create table public.kappy_notifications (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.kappy_teams(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('schedule_request','timesheet_submitted','timesheet_reminder','schedule_decision')),
 title text not null check(length(title) between 1 and 180),
 body text not null default '',
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create index kappy_notifications_inbox on public.kappy_notifications(recipient_id,created_at desc);
alter table public.kappy_notifications enable row level security;
revoke all on public.kappy_notifications from anon,authenticated;
grant select on public.kappy_notifications to authenticated;
grant update(read_at) on public.kappy_notifications to authenticated;
create policy "notification_recipient_read" on public.kappy_notifications for select to authenticated using(recipient_id=(select auth.uid()) and kappy_private.is_member(team_id));
create policy "notification_recipient_acknowledge" on public.kappy_notifications for update to authenticated using(recipient_id=(select auth.uid()) and read_at is null and kappy_private.is_member(team_id)) with check(recipient_id=(select auth.uid()) and read_at is not null and kappy_private.is_member(team_id));
create function kappy_private.notification_read_timestamp() returns trigger language plpgsql set search_path='' as $$
begin
 if old.read_at is not null then raise exception 'Already read'; end if;
 if (new.id,new.team_id,new.recipient_id,new.kind,new.title,new.body,new.created_at) is distinct from (old.id,old.team_id,old.recipient_id,old.kind,old.title,old.body,old.created_at) then raise exception 'Notification is immutable'; end if;
 new.read_at:=transaction_timestamp();return new;
end $$;
create trigger notification_read_timestamp before update on public.kappy_notifications for each row execute function kappy_private.notification_read_timestamp();
create function kappy_private.notify_schedule_request() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='request' then
 insert into public.kappy_notifications(team_id,recipient_id,kind,title,body)
 select new.team_id,m.user_id,'schedule_request','Schedule request awaiting review',coalesce(new.title,'Schedule request')
 from public.kappy_members m where m.team_id=new.team_id and m.role='admin' and m.user_id<>new.created_by;
 end if;
 return new;
end $$;
create trigger notify_schedule_request after insert on public.kappy_calendar_entries for each row execute function kappy_private.notify_schedule_request();
create function kappy_private.notify_timesheet_submission() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.kappy_notifications(team_id,recipient_id,kind,title,body)
 select new.team_id,m.user_id,'timesheet_submitted','Weekly timesheet submitted','Week starting '||new.week_start::text
 from public.kappy_members m where m.team_id=new.team_id and m.role in ('admin','payroll_manager') and m.user_id<>new.worker_id;
 return new;
end $$;
create trigger notify_timesheet_submission after insert on public.kappy_weekly_submissions for each row execute function kappy_private.notify_timesheet_submission();
create function kappy_private.notify_schedule_decision() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.kind='request' and new.status is distinct from old.status and new.status in ('approved','declined') then
 insert into public.kappy_notifications(team_id,recipient_id,kind,title,body)
 values(new.team_id,new.created_by,'schedule_decision','Schedule request '||new.status,coalesce(new.title,'Schedule request'));
 end if;
 return new;
end $$;
create trigger notify_schedule_decision after update of status on public.kappy_calendar_entries for each row execute function kappy_private.notify_schedule_decision();
