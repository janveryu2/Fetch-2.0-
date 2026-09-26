# FETCH Polish & Learning Experience Expansion - Engineering Checkpoint

**Document Purpose:** Source of truth for autonomous execution state. Safe to resume from this file if execution is interrupted.  
**Plan Reference:** `IMPLEMENTATION PLAN V5` / `FETCH_POLISH_LEARNING_EXPERIENCE_IMPLEMENTATION_PLAN.md`

---

## 1. Phase Status Summary

- [x] **Phase 0 — Baseline and remote contract audit**: PASS
- [x] **Phase 1 — Critical truth and contract repairs**: PASS
- [x] **Phase 2 — Artifact model and creation choice**: PASS
- [x] **Phase 3 — Durable 50-question generation and review content**: PASS
- [x] **Phase 4 — Generated and manual flashcards with mastery**: PASS
- [x] **Phase 5 — Physical-paper Scan intake**: PASS
- [ ] **Phase 6 — Focused Tutor and safe answer rendering**: IN PROGRESS
- [ ] **Phase 7 — Friend profiles, messaging, and Live completion**: PENDING
- [ ] **Phase 8 — Timer audio, notifications, curated music, and identity polish**: PENDING
- [ ] **Phase 9 — Full regression, staged rollout, and production verification**: PENDING

---

## 2. Current Execution State

- **Current Phase:** Phase 6 — Focused Tutor and safe answer rendering
- **Next Safe Resume Point:** Phase 6 execution
- **Unresolved Blockers:** None

---

## 3. Phase 5 Verification & Summary

- **Status:** PASS
- **Implemented Changes:**
  1. Storage Bucket & Policies:
     - Configured private bucket `study-scans` (JPEG/PNG only, max 5 MiB per page, max 20 MiB per document).
     - Owner-only storage RLS policies for upload, read, and delete (`(storage.foldername(name))[1] = auth.uid()::text`).
  2. Database Schema & Migration:
     - Applied migrations `20260926050000_paper_scan_intake.sql` and `20260926050001_scan_source_type.sql` to remote Supabase DB.
     - `private.scan_documents`: `id`, `owner_id`, `status` (`draft`, `extracting`, `extracted`, `finalized`, `failed`), `combined_text`, `pack_id`, `page_count` (0..5), timestamps, with RLS.
     - `private.scan_pages`: `id`, `document_id`, `owner_id`, `position` (0..4), `storage_path`, `mime_type`, `file_size_bytes`, `dimensions`, `extracted_text`, `quality_flag` (`ok`, `blurry`, `low_contrast`, `rotated`, `unreadable`), timestamps, unique `(document_id, position)`, with RLS.
     - RPCs: `public.create_scan_document`, `public.register_scan_page`, `public.update_scan_page_text`, `public.update_scan_document_text`, `public.get_scan_document`, `public.delete_scan_document`, `public.reorder_scan_pages`.
  3. API Endpoints:
     - `POST /api/scan/upload`: Uploads page images to `study-scans`, rejects unsupported HEIC with explicit error, enforces 5 MiB limit, registers page in DB.
     - `POST /api/scan/extract`: Multimodal Gemini OCR extracts text and evaluates visual clarity (quality flags), stores per-page text, combines and saves document text.
     - `GET /api/scan/documents/[id]`: Owner-scoped scan document and page retrieval.
     - `PATCH /api/scan/documents/[id]`: Authoritative human review and edited text persistence.
     - `DELETE /api/scan/documents/[id]`: Deletes document record and removes physical image objects from `study-scans` storage bucket.
     - `POST /api/scan/reorder`: Updates ordered page positions.
     - `POST /api/generate/job`: Added `"scan"` to `jobRequestSchema` `sourceType`.
  4. Frontend UI:
     - `src/components/study/paper-scan-intake.tsx`: Camera capture (`capture="environment"`) & file upload, up to 5 ordered pages, image previews, reorder controls, deletion, extraction progress, quality warning alerts, and human-editable textarea with character count.
     - `src/components/study/create-pack-panel.tsx`: Added "Scan notes" tab with camera icon, connected to `PaperScanIntake` and seamless handoff to generation jobs.
- **Migrations Applied:**
  - `20260926010000_repair_contracts_and_live_schema.sql` (Phase 1)
  - `20260926020000_study_artifacts_model.sql` (Phase 2)
  - `20260926030000_durable_large_generation.sql` (Phase 3)
  - `20260926040000_flashcards_mastery.sql` (Phase 4)
  - `20260926050000_paper_scan_intake.sql` (Phase 5)
  - `20260926050001_scan_source_type.sql` (Phase 5)
- **Test Suite Results:** 31 test files passed (254 tests), 0 failures. Typecheck clean (0 errors).

---

## 4. Phase 6 Scope & Plan

- Focused Tutor and safe answer rendering:
  - Source chunk retrieval from relevant chunks instead of raw first 12,000 characters.
  - Bounded history and prompt budget.
  - Safe Markdown streaming and saved render path (sanitizing HTML and links, avoiding raw `**`, `//`, `||`).
  - Conversation-first UI with collapsible controls and focus mode.
