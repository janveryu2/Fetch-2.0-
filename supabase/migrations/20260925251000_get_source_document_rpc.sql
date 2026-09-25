-- Migration: 20260925251000_get_source_document_rpc.sql
-- RPC to fetch owned source document details securely

create or replace function public.get_source_document(p_doc_id uuid)
returns jsonb
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
  where id = p_doc_id and owner_id = v_uid;

  if not found then
    return null;
  end if;

  return pg_catalog.jsonb_build_object(
    'id', v_doc.id,
    'fileName', v_doc.file_name,
    'extractedText', v_doc.extracted_text,
    'pageCount', v_doc.page_count,
    'contentHash', v_doc.content_hash,
    'status', v_doc.extraction_status,
    'linkedPackId', v_doc.linked_pack_id
  );
end;
$$;

revoke all on function public.get_source_document(uuid) from public, anon;
grant execute on function public.get_source_document(uuid) to authenticated, service_role;
