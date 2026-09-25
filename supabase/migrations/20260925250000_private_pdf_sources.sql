-- Migration: 20260925250000_private_pdf_sources.sql
-- Phase 6: Private PDF Ingestion, Storage Bucket, and Source Document Lifecycle

-- 1. Add missing fields to existing private.source_documents table
alter table private.source_documents
  add column if not exists file_name text,
  add column if not exists extracted_text text,
  add column if not exists page_count integer,
  add column if not exists failure_reason text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_source_documents_linked_pack
  on private.source_documents(linked_pack_id)
  where linked_pack_id is not null;

-- 2. Storage Bucket setup for study-sources
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-sources', 'study-sources', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

-- 3. Storage RLS Policies
drop policy if exists "Users can upload their own source documents" on storage.objects;
create policy "Users can upload their own source documents"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'study-sources' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read their own source documents" on storage.objects;
create policy "Users can read their own source documents"
on storage.objects for select
to authenticated
using (
  bucket_id = 'study-sources' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own source documents" on storage.objects;
create policy "Users can delete their own source documents"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'study-sources' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. Document Registration RPCs
create or replace function public.register_source_document(
  p_storage_path text,
  p_file_name text,
  p_file_size bigint,
  p_content_hash text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into private.source_documents (
    owner_id, storage_path, file_name, file_size_bytes, content_hash, extraction_status
  )
  values (
    v_uid, p_storage_path, p_file_name, p_file_size, p_content_hash, 'pending'
  )
  returning id into v_doc_id;

  return pg_catalog.jsonb_build_object('id', v_doc_id, 'status', 'pending');
end;
$$;

revoke all on function public.register_source_document(text, text, bigint, text) from public, anon;
grant execute on function public.register_source_document(text, text, bigint, text) to authenticated, service_role;

create or replace function public.update_source_document(
  p_doc_id uuid,
  p_extraction_status text,
  p_extracted_text text default null,
  p_page_count integer default null,
  p_linked_pack_id uuid default null,
  p_failure_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc private.source_documents%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_doc from private.source_documents
  where id = p_doc_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Source document not found' using errcode = '42501';
  end if;

  update private.source_documents
  set extraction_status = p_extraction_status,
      extracted_text = coalesce(p_extracted_text, extracted_text),
      page_count = coalesce(p_page_count, page_count),
      linked_pack_id = coalesce(p_linked_pack_id, linked_pack_id),
      failure_reason = coalesce(p_failure_reason, failure_reason),
      updated_at = now()
  where id = p_doc_id;

  return pg_catalog.jsonb_build_object('id', p_doc_id, 'status', p_extraction_status);
end;
$$;

revoke all on function public.update_source_document(uuid, text, text, integer, uuid, text) from public, anon;
grant execute on function public.update_source_document(uuid, text, text, integer, uuid, text) to authenticated, service_role;
