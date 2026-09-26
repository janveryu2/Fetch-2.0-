-- Migration: 20260926050001_scan_source_type.sql
-- Allow 'scan' as source_type in public.study_packs

alter table public.study_packs drop constraint if exists study_packs_source_type_check;
alter table public.study_packs add constraint study_packs_source_type_check check (source_type in ('text','pdf','url','manual','scan'));
