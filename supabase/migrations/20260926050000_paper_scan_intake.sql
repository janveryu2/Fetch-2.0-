-- Migration: 20260926050000_paper_scan_intake.sql
-- Phase 5: Physical-paper scan intake with private storage, ordered pages, OCR review, and cleanup.

-- Storage Bucket setup for study-scans
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-scans', 'study-scans', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png'];

-- Storage RLS Policies for study-scans
drop policy if exists "Users can upload their own scans" on storage.objects;
create policy "Users can upload their own scans"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'study-scans' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can read their own scans" on storage.objects;
create policy "Users can read their own scans"
on storage.objects for select
to authenticated
using (
  bucket_id = 'study-scans' and
  (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete their own scans" on storage.objects;
create policy "Users can delete their own scans"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'study-scans' and
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Tables for scan documents and pages
create table if not exists private.scan_documents (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'extracting', 'extracted', 'finalized', 'failed')),
  combined_text text not null default '',
  pack_id uuid references public.study_packs(id) on delete set null,
  page_count integer not null default 0 check (page_count >= 0 and page_count <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.scan_pages (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  document_id uuid not null references private.scan_documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0 and position < 5),
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png')),
  file_size_bytes bigint not null check (file_size_bytes > 0 and file_size_bytes <= 5242880),
  dimensions jsonb default null,
  extracted_text text not null default '',
  quality_flag text not null default 'ok' check (quality_flag in ('ok', 'blurry', 'low_contrast', 'rotated', 'unreadable')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, position)
);

create index if not exists idx_scan_documents_owner on private.scan_documents(owner_id, created_at desc);
create index if not exists idx_scan_documents_pack on private.scan_documents(pack_id) where pack_id is not null;
create index if not exists idx_scan_pages_doc_pos on private.scan_pages(document_id, position);
create index if not exists idx_scan_pages_owner on private.scan_pages(owner_id);

alter table private.scan_documents enable row level security;
alter table private.scan_pages enable row level security;

drop policy if exists scan_documents_owner_policy on private.scan_documents;
create policy scan_documents_owner_policy on private.scan_documents
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists scan_pages_owner_policy on private.scan_pages;
create policy scan_pages_owner_policy on private.scan_pages
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- RPCs for Scan lifecycle

create or replace function public.create_scan_document()
returns jsonb
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

  insert into private.scan_documents (owner_id, status, combined_text, page_count)
  values (v_uid, 'draft', '', 0)
  returning id into v_doc_id;

  return pg_catalog.jsonb_build_object(
    'id', v_doc_id,
    'status', 'draft',
    'pageCount', 0
  );
end;
$$;

revoke all on function public.create_scan_document() from public, anon;
grant execute on function public.create_scan_document() to authenticated, service_role;

create or replace function public.register_scan_page(
  p_document_id uuid,
  p_position integer,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_dimensions jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc private.scan_documents%rowtype;
  v_page_id uuid;
  v_total_pages integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_doc
  from private.scan_documents
  where id = p_document_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Scan document not found' using errcode = '42501';
  end if;

  if p_position < 0 or p_position >= 5 then
    raise exception 'Page position must be between 0 and 4' using errcode = '22023';
  end if;

  if p_mime_type not in ('image/jpeg', 'image/png') then
    raise exception 'Unsupported image type. JPEG and PNG are supported.' using errcode = '22023';
  end if;

  if p_file_size <= 0 or p_file_size > 5242880 then
    raise exception 'Page image size exceeds 5 MiB limit' using errcode = '22023';
  end if;

  insert into private.scan_pages (
    document_id, owner_id, position, storage_path, mime_type, file_size_bytes, dimensions
  )
  values (
    p_document_id, v_uid, p_position, p_storage_path, p_mime_type, p_file_size, p_dimensions
  )
  on conflict (document_id, position) do update set
    storage_path = excluded.storage_path,
    mime_type = excluded.mime_type,
    file_size_bytes = excluded.file_size_bytes,
    dimensions = excluded.dimensions,
    extracted_text = '',
    quality_flag = 'ok',
    updated_at = now()
  returning id into v_page_id;

  select count(*)::integer into v_total_pages
  from private.scan_pages
  where document_id = p_document_id;

  update private.scan_documents
  set page_count = v_total_pages, updated_at = now()
  where id = p_document_id;

  return pg_catalog.jsonb_build_object(
    'id', v_page_id,
    'documentId', p_document_id,
    'position', p_position,
    'pageCount', v_total_pages
  );
end;
$$;

revoke all on function public.register_scan_page(uuid, integer, text, text, bigint, jsonb) from public, anon;
grant execute on function public.register_scan_page(uuid, integer, text, text, bigint, jsonb) to authenticated, service_role;

create or replace function public.update_scan_page_text(
  p_page_id uuid,
  p_extracted_text text,
  p_quality_flag text default 'ok'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_page private.scan_pages%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_page
  from private.scan_pages
  where id = p_page_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Scan page not found' using errcode = '42501';
  end if;

  update private.scan_pages
  set extracted_text = coalesce(p_extracted_text, ''),
      quality_flag = coalesce(p_quality_flag, 'ok'),
      updated_at = now()
  where id = p_page_id;

  return pg_catalog.jsonb_build_object(
    'id', p_page_id,
    'documentId', v_page.document_id,
    'position', v_page.position,
    'qualityFlag', coalesce(p_quality_flag, 'ok')
  );
end;
$$;

revoke all on function public.update_scan_page_text(uuid, text, text) from public, anon;
grant execute on function public.update_scan_page_text(uuid, text, text) to authenticated, service_role;

create or replace function public.update_scan_document_text(
  p_document_id uuid,
  p_combined_text text,
  p_status text default 'extracted',
  p_pack_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc private.scan_documents%rowtype;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_doc
  from private.scan_documents
  where id = p_document_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Scan document not found' using errcode = '42501';
  end if;

  update private.scan_documents
  set combined_text = coalesce(p_combined_text, combined_text),
      status = coalesce(p_status, status),
      pack_id = coalesce(p_pack_id, pack_id),
      updated_at = now()
  where id = p_document_id;

  return pg_catalog.jsonb_build_object(
    'id', p_document_id,
    'status', coalesce(p_status, v_doc.status),
    'characterCount', length(coalesce(p_combined_text, v_doc.combined_text))
  );
end;
$$;

revoke all on function public.update_scan_document_text(uuid, text, text, uuid) from public, anon;
grant execute on function public.update_scan_document_text(uuid, text, text, uuid) to authenticated, service_role;

create or replace function public.get_scan_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc private.scan_documents%rowtype;
  v_pages jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_doc
  from private.scan_documents
  where id = p_document_id and owner_id = v_uid;

  if not found then
    raise exception 'Scan document not found' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'position', p.position,
        'storagePath', p.storage_path,
        'mimeType', p.mime_type,
        'fileSizeBytes', p.file_size_bytes,
        'dimensions', p.dimensions,
        'extractedText', p.extracted_text,
        'qualityFlag', p.quality_flag,
        'createdAt', p.created_at
      ) order by p.position asc
    ),
    '[]'::jsonb
  ) into v_pages
  from private.scan_pages p
  where p.document_id = p_document_id;

  return pg_catalog.jsonb_build_object(
    'id', v_doc.id,
    'status', v_doc.status,
    'combinedText', v_doc.combined_text,
    'packId', v_doc.pack_id,
    'pageCount', v_doc.page_count,
    'pages', v_pages,
    'createdAt', v_doc.created_at,
    'updatedAt', v_doc.updated_at
  );
end;
$$;

revoke all on function public.get_scan_document(uuid) from public, anon;
grant execute on function public.get_scan_document(uuid) to authenticated, service_role;

create or replace function public.delete_scan_document(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_paths text[];
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select array_agg(storage_path) into v_paths
  from private.scan_pages
  where document_id = p_document_id and owner_id = v_uid;

  delete from private.scan_documents
  where id = p_document_id and owner_id = v_uid;

  if not found then
    raise exception 'Scan document not found' using errcode = '42501';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', p_document_id,
    'storagePaths', coalesce(v_paths, array[]::text[])
  );
end;
$$;

revoke all on function public.delete_scan_document(uuid) from public, anon;
grant execute on function public.delete_scan_document(uuid) to authenticated, service_role;

create or replace function public.reorder_scan_pages(
  p_document_id uuid,
  p_page_order uuid[]
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_doc private.scan_documents%rowtype;
  v_page_count integer;
  i integer;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_doc
  from private.scan_documents
  where id = p_document_id and owner_id = v_uid
  for update;

  if not found then
    raise exception 'Scan document not found' using errcode = '42501';
  end if;

  v_page_count := array_length(p_page_order, 1);
  if v_page_count is null or v_page_count > 5 then
    raise exception 'Invalid page count for reordering' using errcode = '22023';
  end if;

  -- Temporary offset to prevent unique constraint conflicts during swap
  update private.scan_pages
  set position = position + 100
  where document_id = p_document_id and owner_id = v_uid;

  for i in 1..v_page_count loop
    update private.scan_pages
    set position = i - 1, updated_at = now()
    where id = p_page_order[i] and document_id = p_document_id and owner_id = v_uid;
  end loop;

  return public.get_scan_document(p_document_id);
end;
$$;

revoke all on function public.reorder_scan_pages(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_scan_pages(uuid, uuid[]) to authenticated, service_role;
