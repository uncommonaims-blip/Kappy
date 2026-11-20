-- Private, team-scoped receipt images; no public URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('kappy-receipts','kappy-receipts',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create policy "kappy_receipt_upload_own" on storage.objects for insert to authenticated
with check (bucket_id='kappy-receipts'
 and (storage.foldername(name))[1] is not null
 and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
 and (storage.foldername(name))[2]=(select auth.uid())::text
 and kappy_private.is_member(((storage.foldername(name))[1])::uuid));
create policy "kappy_receipt_read_authorized" on storage.objects for select to authenticated
using (bucket_id='kappy-receipts'
 and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
 and ((storage.foldername(name))[2]=(select auth.uid())::text and kappy_private.is_member(((storage.foldername(name))[1])::uuid)
 or kappy_private.is_payroll_manager(((storage.foldername(name))[1])::uuid)));
alter table public.kappy_expenses add constraint kappy_expense_receipt_owner_path
check (receipt_path is null or (split_part(receipt_path,'/',1)=team_id::text and split_part(receipt_path,'/',2)=worker_id::text and split_part(receipt_path,'/',3)<>''));