SET local check_function_bodies = off;

CREATE SCHEMA "private";

CREATE TABLE "private"."question_keys" (
  "question_id"  uuid NOT NULL,
  "owner_id"     uuid NOT NULL,
  "answer"       text NOT NULL,
  "explanation"  text NOT NULL,
  "source_quote" text NOT NULL,
  CONSTRAINT "question_keys_pkey" PRIMARY KEY (question_id)
);

ALTER TABLE "private"."question_keys"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."study_sources" (
  "pack_id"      uuid                     NOT NULL,
  "owner_id"     uuid                     NOT NULL,
  "content"      text                     NOT NULL,
  "content_hash" text                     NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "study_sources_pkey" PRIMARY KEY (pack_id)
);

ALTER TABLE "private"."study_sources"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."tutor_conversations" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "owner_id"   uuid                     NOT NULL,
  "pack_id"    uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tutor_conversations_pkey" PRIMARY KEY (id)
);

ALTER TABLE "private"."tutor_conversations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."tutor_messages" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" uuid                     NOT NULL,
  "owner_id"        uuid                     NOT NULL,
  "role"            text                     NOT NULL,
  "content"         text                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tutor_messages_content_check" CHECK (((char_length(content) >= 1) AND (char_length(content) <= 8000))),
  CONSTRAINT "tutor_messages_pkey" PRIMARY KEY (id),
  CONSTRAINT "tutor_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text])))
);

ALTER TABLE "private"."tutor_messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "private"."tutor_rate_limits" (
  "owner_id"      uuid    NOT NULL,
  "window_bucket" bigint  NOT NULL,
  "request_count" integer NOT NULL,
  CONSTRAINT "tutor_rate_limits_pkey" PRIMARY KEY (owner_id, window_bucket),
  CONSTRAINT "tutor_rate_limits_request_count_check" CHECK (((request_count >= 1) AND (request_count <= 10)))
);

ALTER TABLE "private"."tutor_rate_limits"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."calendar_events" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"    uuid                     NOT NULL,
  "title"      text                     NOT NULL,
  "event_type" text                     NOT NULL,
  "starts_at"  timestamp with time zone NOT NULL,
  "ends_at"    timestamp with time zone NOT NULL,
  "event_date" date                     NOT NULL,
  "start_time" time without time zone,
  "end_time"   time without time zone,
  "all_day"    boolean                  NOT NULL DEFAULT false,
  "color"      text                     NOT NULL DEFAULT '#1065e6'::text,
  "subject"    text                     NOT NULL DEFAULT ''::text,
  "location"   text                     NOT NULL DEFAULT ''::text,
  "pack_id"    uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "calendar_events_check1" CHECK ((all_day OR ((start_time IS NOT NULL) AND (end_time IS NOT NULL) AND (end_time > start_time)))),
  CONSTRAINT "calendar_events_check" CHECK ((ends_at > starts_at)),
  CONSTRAINT "calendar_events_color_check" CHECK ((color ~ '^#[0-9a-fA-F]{6}$'::text)),
  CONSTRAINT "calendar_events_event_type_check" CHECK ((event_type = ANY (ARRAY['study'::text, 'exam'::text, 'deadline'::text]))),
  CONSTRAINT "calendar_events_location_check" CHECK ((char_length(location) <= 150)),
  CONSTRAINT "calendar_events_pkey" PRIMARY KEY (id),
  CONSTRAINT "calendar_events_subject_check" CHECK ((char_length(subject) <= 100)),
  CONSTRAINT "calendar_events_title_check" CHECK (((char_length(title) >= 1) AND (char_length(title) <= 100)))
);

ALTER TABLE "public"."calendar_events"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."conversation_members" (
  "conversation_id" uuid                     NOT NULL,
  "user_id"         uuid                     NOT NULL,
  "joined_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "conversation_members_pkey" PRIMARY KEY (conversation_id, user_id)
);

ALTER TABLE "public"."conversation_members"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."conversations" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "conversations_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."conversations"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."friend_requests" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "sender_id"    uuid                     NOT NULL,
  "recipient_id" uuid                     NOT NULL,
  "status"       text                     NOT NULL DEFAULT 'pending'::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "friend_requests_check" CHECK ((sender_id <> recipient_id)),
  CONSTRAINT "friend_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "friend_requests_sender_id_recipient_id_key" UNIQUE (sender_id, recipient_id),
  CONSTRAINT "friend_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text])))
);

ALTER TABLE "public"."friend_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."live_rooms" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "host_id"    uuid                     NOT NULL,
  "pack_id"    uuid                     NOT NULL,
  "join_code"  text                     NOT NULL,
  "status"     text                     NOT NULL DEFAULT 'lobby'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "live_rooms_join_code_check" CHECK ((join_code ~ '^[A-Z0-9]{6}$'::text)),
  CONSTRAINT "live_rooms_join_code_key" UNIQUE (join_code),
  CONSTRAINT "live_rooms_pkey" PRIMARY KEY (id),
  CONSTRAINT "live_rooms_status_check" CHECK ((status = ANY (ARRAY['lobby'::text, 'active'::text, 'complete'::text])))
);

ALTER TABLE "public"."live_rooms"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."messages" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" uuid                     NOT NULL,
  "sender_id"       uuid                     NOT NULL,
  "body"            text                     NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "messages_body_check" CHECK (((char_length(body) >= 1) AND (char_length(body) <= 4000))),
  CONSTRAINT "messages_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."messages"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"           uuid                     NOT NULL,
  "display_name" text                     NOT NULL,
  "username"     text,
  "avatar_url"   text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "profiles_display_name_check" CHECK (((char_length(display_name) >= 1) AND (char_length(display_name) <= 60))),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_username_check" CHECK ((username ~ '^[a-z0-9_]{3,24}$'::text)),
  CONSTRAINT "profiles_username_key" UNIQUE (username)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."questions" (
  "id"       uuid    NOT NULL DEFAULT gen_random_uuid(),
  "pack_id"  uuid    NOT NULL,
  "owner_id" uuid    NOT NULL,
  "position" integer NOT NULL,
  "kind"     text    NOT NULL,
  "prompt"   text    NOT NULL,
  "choices"  jsonb   NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT "questions_kind_check" CHECK ((kind = ANY (ARRAY['multiple_choice'::text, 'fill_blank'::text]))),
  CONSTRAINT "questions_pack_id_position_key" UNIQUE (pack_id, "position"),
  CONSTRAINT "questions_pkey" PRIMARY KEY (id),
  CONSTRAINT "questions_position_check" CHECK (("position" >= 0))
);

ALTER TABLE "public"."questions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."study_packs" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "owner_id"     uuid                     NOT NULL,
  "title"        text                     NOT NULL,
  "source_type"  text                     NOT NULL,
  "source_label" text                     NOT NULL,
  "status"       text                     NOT NULL DEFAULT 'ready'::text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "study_packs_pkey" PRIMARY KEY (id),
  CONSTRAINT "study_packs_source_type_check" CHECK ((source_type = ANY (ARRAY['text'::text, 'pdf'::text, 'url'::text]))),
  CONSTRAINT "study_packs_status_check" CHECK ((status = ANY (ARRAY['processing'::text, 'ready'::text, 'failed'::text]))),
  CONSTRAINT "study_packs_title_check" CHECK (((char_length(title) >= 2) AND (char_length(title) <= 80)))
);

ALTER TABLE "public"."study_packs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."study_sessions" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"        uuid                     NOT NULL,
  "pack_id"        uuid                     NOT NULL,
  "score"          integer                  NOT NULL,
  "correct_count"  integer                  NOT NULL,
  "question_count" integer                  NOT NULL,
  "completed_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "study_sessions_correct_count_check" CHECK ((correct_count >= 0)),
  CONSTRAINT "study_sessions_pkey" PRIMARY KEY (id),
  CONSTRAINT "study_sessions_question_count_check" CHECK ((question_count > 0)),
  CONSTRAINT "study_sessions_score_check" CHECK (((score >= 0) AND (score <= 100)))
);

ALTER TABLE "public"."study_sessions"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.complete_study_attempt (
  p_pack_id uuid,
  p_answers jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner uuid := (select auth.uid());
  v_question_count integer;
  v_correct_count integer;
  v_attempt_id uuid;
  v_completed_at timestamptz;
begin
  if v_owner is null or not exists (
    select 1 from public.study_packs where id = p_pack_id and owner_id = v_owner and status = 'ready'
  ) then
    raise exception 'StudyPack not found' using errcode = '42501';
  end if;
  if pg_catalog.jsonb_typeof(p_answers) is distinct from 'array' then
    raise exception 'Invalid answers' using errcode = '22023';
  end if;
  select pg_catalog.count(*)::integer into v_question_count
  from public.questions where pack_id = p_pack_id and owner_id = v_owner;
  if v_question_count = 0 or pg_catalog.jsonb_array_length(p_answers) <> v_question_count then
    raise exception 'Submit one answer per question' using errcode = '22023';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_answers) as submitted(question_id uuid, answer text)
    where submitted.question_id is null
      or submitted.answer is null
      or pg_catalog.char_length(pg_catalog.btrim(submitted.answer)) not between 1 and 1000
      or not exists (
        select 1 from public.questions as question
        where question.id = submitted.question_id
          and question.pack_id = p_pack_id
          and question.owner_id = v_owner
      )
  ) or exists (
    select submitted.question_id
    from pg_catalog.jsonb_to_recordset(p_answers) as submitted(question_id uuid, answer text)
    group by submitted.question_id having pg_catalog.count(*) <> 1
  ) then
    raise exception 'Answers do not match this StudyPack' using errcode = '22023';
  end if;

  select pg_catalog.count(*)::integer into v_correct_count
  from pg_catalog.jsonb_to_recordset(p_answers) as submitted(question_id uuid, answer text)
  join public.questions as question
    on question.id = submitted.question_id and question.pack_id = p_pack_id and question.owner_id = v_owner
  join private.question_keys as answer_key
    on answer_key.question_id = question.id and answer_key.owner_id = v_owner
  where pg_catalog.lower(pg_catalog.btrim(submitted.answer)) = pg_catalog.lower(pg_catalog.btrim(answer_key.answer));

  insert into public.study_sessions (user_id, pack_id, score, correct_count, question_count)
  values (v_owner, p_pack_id, pg_catalog.round((v_correct_count::numeric / v_question_count) * 100)::integer, v_correct_count, v_question_count)
  returning id, completed_at into v_attempt_id, v_completed_at;

  return pg_catalog.jsonb_build_object(
    'id', v_attempt_id,
    'packId', p_pack_id,
    'score', pg_catalog.round((v_correct_count::numeric / v_question_count) * 100)::integer,
    'correct', v_correct_count,
    'total', v_question_count,
    'completedAt', v_completed_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.consume_tutor_quota()
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner uuid := (select auth.uid());
  v_bucket bigint;
  v_count integer;
begin
  if v_owner is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  v_bucket := pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now()) / 600)::bigint;
  insert into private.tutor_rate_limits (owner_id, window_bucket, request_count)
  values (v_owner, v_bucket, 1)
  on conflict (owner_id, window_bucket) do update
    set request_count = private.tutor_rate_limits.request_count + 1
    where private.tutor_rate_limits.request_count < 10
  returning request_count into v_count;
  return v_count is not null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_owned_study_source (
  p_pack_id uuid
)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner uuid := (select auth.uid());
  v_content text;
begin
  select source.content into v_content
  from public.study_packs as pack
  join private.study_sources as source on source.pack_id = pack.id and source.owner_id = pack.owner_id
  where pack.id = p_pack_id and pack.owner_id = v_owner and source.owner_id = v_owner;
  if not found then
    raise exception 'StudyPack not found' using errcode = '42501';
  end if;
  return v_content;
end;
$function$;

CREATE OR REPLACE FUNCTION private.grade_study_answer (
  p_pack_id     uuid,
  p_question_id uuid,
  p_answer      text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner uuid := (select auth.uid());
  v_key private.question_keys%rowtype;
begin
  if v_owner is null or not exists (
    select 1 from public.study_packs where id = p_pack_id and owner_id = v_owner and status = 'ready'
  ) then
    raise exception 'StudyPack not found' using errcode = '42501';
  end if;
  if p_answer is null or pg_catalog.char_length(pg_catalog.btrim(p_answer)) not between 1 and 1000 then
    raise exception 'Invalid answer' using errcode = '22023';
  end if;
  select answer_key.* into v_key
  from private.question_keys as answer_key
  join public.questions as question on question.id = answer_key.question_id
  where question.id = p_question_id
    and question.pack_id = p_pack_id
    and question.owner_id = v_owner
    and answer_key.owner_id = v_owner;
  if not found then
    raise exception 'Question not found' using errcode = '42501';
  end if;
  return pg_catalog.jsonb_build_object(
    'correct', pg_catalog.lower(pg_catalog.btrim(p_answer)) = pg_catalog.lower(pg_catalog.btrim(v_key.answer)),
    'answer', v_key.answer,
    'explanation', v_key.explanation
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.list_tutor_conversations()
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner uuid := (select auth.uid());
  v_conversations jsonb;
begin
  if v_owner is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', conversation.id,
        'packId', conversation.pack_id,
        'updatedAt', conversation.updated_at,
        'preview', conversation.preview
      ) order by conversation.updated_at desc
    ),
    '[]'::jsonb
  ) into v_conversations
  from (
    select tutor.id, tutor.pack_id, tutor.updated_at,
      (
        select pg_catalog.left(message.content, 120)
        from private.tutor_messages as message
        where message.conversation_id = tutor.id
          and message.owner_id = v_owner
          and message.role = 'user'
        order by message.created_at desc
        limit 1
      ) as preview
    from private.tutor_conversations as tutor
    where tutor.owner_id = v_owner
    order by tutor.updated_at desc
    limit 20
  ) as conversation;
  return v_conversations;
end;
$function$;

CREATE OR REPLACE FUNCTION private.persist_study_pack (
  p_title          text,
  p_source_type    text,
  p_source_label   text,
  p_source_content text,
  p_content_hash   text,
  p_questions      jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner uuid := (select auth.uid());
  v_pack_id uuid := pg_catalog.gen_random_uuid();
  v_question_id uuid;
  v_item jsonb;
  v_position integer;
  v_kind text;
  v_prompt text;
  v_answer text;
  v_explanation text;
  v_source_quote text;
  v_choices jsonb;
  v_safe_questions jsonb := '[]'::jsonb;
begin
  if v_owner is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_title is null
    or p_source_type is null
    or p_source_label is null
    or p_source_content is null
    or p_content_hash is null
    or p_questions is null
    or pg_catalog.char_length(pg_catalog.btrim(p_title)) not between 2 and 80
    or p_source_type not in ('text', 'pdf', 'url')
    or pg_catalog.char_length(pg_catalog.btrim(p_source_label)) not between 1 and 120
    or pg_catalog.char_length(p_source_content) not between 80 and 20000
    or p_content_hash !~ '^[0-9a-f]{64}$'
    or pg_catalog.jsonb_typeof(p_questions) is distinct from 'array'
    or pg_catalog.jsonb_array_length(p_questions) not between 3 and 20 then
    raise exception 'Invalid StudyPack' using errcode = '22023';
  end if;

  insert into public.study_packs (id, owner_id, title, source_type, source_label, status)
  values (v_pack_id, v_owner, pg_catalog.btrim(p_title), p_source_type, pg_catalog.btrim(p_source_label), 'processing');

  for v_item, v_position in
    select item, (ordinality - 1)::integer
    from pg_catalog.jsonb_array_elements(p_questions) with ordinality as question(item, ordinality)
  loop
    v_kind := v_item->>'type';
    v_prompt := pg_catalog.btrim(v_item->>'prompt');
    v_answer := pg_catalog.btrim(v_item->>'answer');
    v_explanation := pg_catalog.btrim(v_item->>'explanation');
    v_source_quote := pg_catalog.btrim(coalesce(v_item->>'sourceQuote', v_item->>'explanation'));
    v_choices := coalesce(v_item->'choices', '[]'::jsonb);

    if v_kind is null
      or v_kind not in ('multiple_choice', 'fill_blank')
      or pg_catalog.char_length(v_prompt) not between 1 and 2000
      or pg_catalog.char_length(v_answer) not between 1 and 1000
      or pg_catalog.char_length(v_explanation) not between 1 and 4000
      or pg_catalog.char_length(v_source_quote) not between 1 and 2000
      or pg_catalog.jsonb_typeof(v_choices) is distinct from 'array'
      or pg_catalog.jsonb_array_length(v_choices) > 6
      or (v_kind = 'multiple_choice' and (
        pg_catalog.jsonb_array_length(v_choices) < 2
        or not exists (
          select 1 from pg_catalog.jsonb_array_elements(v_choices) as choice(value)
          where choice.value #>> '{}' = v_answer
        )
      ))
      or (v_kind = 'fill_blank' and pg_catalog.jsonb_array_length(v_choices) <> 0)
      or exists (
        select 1 from pg_catalog.jsonb_array_elements(v_choices) as choice(value)
        where pg_catalog.jsonb_typeof(choice.value) <> 'string'
          or pg_catalog.char_length(choice.value #>> '{}') > 300
      ) then
      raise exception 'Invalid StudyPack question' using errcode = '22023';
    end if;

    v_question_id := pg_catalog.gen_random_uuid();
    insert into public.questions (id, pack_id, owner_id, position, kind, prompt, choices)
    values (v_question_id, v_pack_id, v_owner, v_position, v_kind, v_prompt, v_choices);
    insert into private.question_keys (question_id, owner_id, answer, explanation, source_quote)
    values (v_question_id, v_owner, v_answer, v_explanation, v_source_quote);
    v_safe_questions := v_safe_questions || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'id', v_question_id,
        'type', v_kind,
        'prompt', v_prompt,
        'choices', v_choices
      )
    );
  end loop;

  insert into private.study_sources (pack_id, owner_id, content, content_hash)
  values (
    v_pack_id,
    v_owner,
    p_source_content,
    p_content_hash
  );
  update public.study_packs set status = 'ready', updated_at = pg_catalog.now()
  where id = v_pack_id and owner_id = v_owner;

  return pg_catalog.jsonb_build_object('id', v_pack_id, 'questions', v_safe_questions);
end;
$function$;

CREATE OR REPLACE FUNCTION private.read_tutor_conversation (
  p_conversation_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner uuid := (select auth.uid());
  v_messages jsonb;
begin
  if v_owner is null or not exists (
    select 1 from private.tutor_conversations
    where id = p_conversation_id and owner_id = v_owner
  ) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;
  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('role', recent.role, 'content', recent.content) order by recent.created_at),
    '[]'::jsonb
  ) into v_messages
  from (
    select message.role, message.content, message.created_at
    from private.tutor_messages as message
    where message.conversation_id = p_conversation_id and message.owner_id = v_owner
    order by message.created_at desc
    limit 12
  ) as recent;
  return v_messages;
end;
$function$;

CREATE OR REPLACE FUNCTION private.save_tutor_exchange (
  p_conversation_id   uuid,
  p_pack_id           uuid,
  p_user_content      text,
  p_assistant_content text
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner uuid := (select auth.uid());
  v_conversation_id uuid := p_conversation_id;
  v_existing_pack_id uuid;
begin
  if v_owner is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_user_content is null
    or p_assistant_content is null
    or pg_catalog.char_length(pg_catalog.btrim(p_user_content)) not between 1 and 4000
    or pg_catalog.char_length(pg_catalog.btrim(p_assistant_content)) not between 1 and 8000 then
    raise exception 'Invalid tutor message' using errcode = '22023';
  end if;
  if p_pack_id is not null and not exists (
    select 1 from public.study_packs where id = p_pack_id and owner_id = v_owner and status = 'ready'
  ) then
    raise exception 'StudyPack not found' using errcode = '42501';
  end if;
  if v_conversation_id is null then
    insert into private.tutor_conversations (owner_id, pack_id)
    values (v_owner, p_pack_id) returning id into v_conversation_id;
  else
    select pack_id into v_existing_pack_id
    from private.tutor_conversations
    where id = v_conversation_id and owner_id = v_owner
    for update;
    if not found or v_existing_pack_id is distinct from p_pack_id then
      raise exception 'Conversation not found' using errcode = '42501';
    end if;
  end if;
  insert into private.tutor_messages (conversation_id, owner_id, role, content)
  values (v_conversation_id, v_owner, 'user', pg_catalog.btrim(p_user_content));
  insert into private.tutor_messages (conversation_id, owner_id, role, content)
  values (v_conversation_id, v_owner, 'assistant', pg_catalog.btrim(p_assistant_content));
  update private.tutor_conversations set updated_at = pg_catalog.now()
  where id = v_conversation_id and owner_id = v_owner;
  return v_conversation_id;
end;
$function$;

CREATE OR REPLACE FUNCTION private.user_conversation_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select conversation_id from public.conversation_members where user_id = (select auth.uid())
$function$;

CREATE OR REPLACE FUNCTION public.complete_study_attempt (
  p_pack_id uuid,
  p_answers jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.complete_study_attempt(p_pack_id, p_answers); $function$;

CREATE OR REPLACE FUNCTION public.consume_tutor_quota()
  RETURNS boolean
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.consume_tutor_quota(); $function$;

CREATE OR REPLACE FUNCTION public.create_study_pack (
  p_title          text,
  p_source_type    text,
  p_source_label   text,
  p_source_content text,
  p_content_hash   text,
  p_questions      jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.persist_study_pack(p_title, p_source_type, p_source_label, p_source_content, p_content_hash, p_questions);
$function$;

CREATE OR REPLACE FUNCTION public.get_owned_study_source (
  p_pack_id uuid
)
  RETURNS text
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.get_owned_study_source(p_pack_id); $function$;

CREATE OR REPLACE FUNCTION public.grade_study_answer (
  p_pack_id     uuid,
  p_question_id uuid,
  p_answer      text
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.grade_study_answer(p_pack_id, p_question_id, p_answer); $function$;

CREATE OR REPLACE FUNCTION public.list_tutor_conversations()
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.list_tutor_conversations(); $function$;

CREATE OR REPLACE FUNCTION public.read_tutor_conversation (
  p_conversation_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.read_tutor_conversation(p_conversation_id); $function$;

CREATE OR REPLACE FUNCTION public.save_tutor_exchange (
  p_conversation_id   uuid,
  p_pack_id           uuid,
  p_user_content      text,
  p_assistant_content text
)
  RETURNS uuid
  LANGUAGE sql
  SET search_path TO ''
  AS $function$ select private.save_tutor_exchange(p_conversation_id, p_pack_id, p_user_content, p_assistant_content); $function$;

ALTER TABLE "private"."question_keys"
  ADD CONSTRAINT "question_keys_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "private"."study_sources"
  ADD CONSTRAINT "study_sources_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "private"."tutor_conversations"
  ADD CONSTRAINT "tutor_conversations_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "private"."tutor_messages"
  ADD CONSTRAINT "tutor_messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES private.tutor_conversations(id) ON DELETE CASCADE;

ALTER TABLE "private"."tutor_messages"
  ADD CONSTRAINT "tutor_messages_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "private"."tutor_rate_limits"
  ADD CONSTRAINT "tutor_rate_limits_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."calendar_events"
  ADD CONSTRAINT "calendar_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."conversation_members"
  ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."conversation_members"
  ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE "public"."friend_requests"
  ADD CONSTRAINT "friend_requests_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."friend_requests"
  ADD CONSTRAINT "friend_requests_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."live_rooms"
  ADD CONSTRAINT "live_rooms_host_id_fkey" FOREIGN KEY (host_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;

ALTER TABLE "public"."messages"
  ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."questions"
  ADD CONSTRAINT "questions_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "private"."question_keys"
  ADD CONSTRAINT "question_keys_question_id_fkey" FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

ALTER TABLE "public"."study_packs"
  ADD CONSTRAINT "study_packs_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "private"."study_sources"
  ADD CONSTRAINT "study_sources_pack_id_fkey" FOREIGN KEY (pack_id) REFERENCES public.study_packs(id) ON DELETE CASCADE;

ALTER TABLE "private"."tutor_conversations"
  ADD CONSTRAINT "tutor_conversations_pack_id_fkey" FOREIGN KEY (pack_id) REFERENCES public.study_packs(id) ON DELETE SET NULL;

ALTER TABLE "public"."calendar_events"
  ADD CONSTRAINT "calendar_events_pack_id_fkey" FOREIGN KEY (pack_id) REFERENCES public.study_packs(id) ON DELETE SET NULL;

ALTER TABLE "public"."live_rooms"
  ADD CONSTRAINT "live_rooms_pack_id_fkey" FOREIGN KEY (pack_id) REFERENCES public.study_packs(id) ON DELETE CASCADE;

ALTER TABLE "public"."questions"
  ADD CONSTRAINT "questions_pack_id_fkey" FOREIGN KEY (pack_id) REFERENCES public.study_packs(id) ON DELETE CASCADE;

ALTER TABLE "public"."study_sessions"
  ADD CONSTRAINT "study_sessions_pack_id_fkey" FOREIGN KEY (pack_id) REFERENCES public.study_packs(id) ON DELETE CASCADE;

ALTER TABLE "public"."study_sessions"
  ADD CONSTRAINT "study_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX tutor_conversations_owner_updated_idx ON private.tutor_conversations USING btree (owner_id, updated_at DESC);

CREATE INDEX tutor_messages_conversation_created_idx ON private.tutor_messages USING btree (conversation_id, created_at DESC);

CREATE INDEX events_user_date_idx ON public.calendar_events USING btree (user_id, event_date);

CREATE INDEX members_user_idx ON public.conversation_members USING btree (user_id);

CREATE INDEX messages_conversation_idx ON public.messages USING btree (conversation_id);

CREATE INDEX questions_owner_idx ON public.questions USING btree (owner_id);

CREATE INDEX questions_pack_idx ON public.questions USING btree (pack_id);

CREATE INDEX requests_recipient_idx ON public.friend_requests USING btree (recipient_id);

CREATE INDEX requests_sender_idx ON public.friend_requests USING btree (sender_id);

CREATE INDEX sessions_pack_idx ON public.study_sessions USING btree (pack_id);

CREATE INDEX sessions_user_completed_idx ON public.study_sessions USING btree (user_id, completed_at DESC);

CREATE INDEX study_packs_owner_idx ON public.study_packs USING btree (owner_id);

CREATE POLICY "events_delete_self" ON "public"."calendar_events"
  FOR DELETE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "events_insert_self" ON "public"."calendar_events"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND ((pack_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.study_packs pack
  WHERE ((pack.id = calendar_events.pack_id) AND (pack.owner_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "events_read_self" ON "public"."calendar_events"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "events_update_self" ON "public"."calendar_events"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) AND ((pack_id IS NULL) OR (EXISTS ( SELECT 1
   FROM public.study_packs pack
  WHERE ((pack.id = calendar_events.pack_id) AND (pack.owner_id = ( SELECT auth.uid() AS uid))))))));

CREATE POLICY "members_join_self" ON "public"."conversation_members"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

CREATE POLICY "members_read_members" ON "public"."conversation_members"
  FOR SELECT
  TO "authenticated"
  USING ((conversation_id IN ( SELECT private.user_conversation_ids() AS user_conversation_ids)));

CREATE POLICY "conversations_create" ON "public"."conversations"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (true);

CREATE POLICY "conversations_read_members" ON "public"."conversations"
  FOR SELECT
  TO "authenticated"
  USING ((id IN ( SELECT private.user_conversation_ids() AS user_conversation_ids)));

CREATE POLICY "requests_delete_participant" ON "public"."friend_requests"
  FOR DELETE
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = sender_id) OR (( SELECT auth.uid() AS uid) = recipient_id)));

CREATE POLICY "requests_insert_sender" ON "public"."friend_requests"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = sender_id));

CREATE POLICY "requests_read_participant" ON "public"."friend_requests"
  FOR SELECT
  TO "authenticated"
  USING (((( SELECT auth.uid() AS uid) = sender_id) OR (( SELECT auth.uid() AS uid) = recipient_id)));

CREATE POLICY "requests_update_recipient" ON "public"."friend_requests"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = recipient_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = recipient_id));

CREATE POLICY "rooms_create_host" ON "public"."live_rooms"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = host_id));

CREATE POLICY "rooms_read_authenticated" ON "public"."live_rooms"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "messages_read_members" ON "public"."messages"
  FOR SELECT
  TO "authenticated"
  USING ((conversation_id IN ( SELECT private.user_conversation_ids() AS user_conversation_ids)));

CREATE POLICY "messages_send_as_self" ON "public"."messages"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((( SELECT auth.uid() AS uid) = sender_id) AND (conversation_id IN ( SELECT private.user_conversation_ids() AS user_conversation_ids))));

CREATE POLICY "profiles_insert_self" ON "public"."profiles"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "profiles_read_authenticated" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING (true);

CREATE POLICY "profiles_update_self" ON "public"."profiles"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "questions_read_owner" ON "public"."questions"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = owner_id));

CREATE POLICY "packs_read_owner" ON "public"."study_packs"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = owner_id));

CREATE POLICY "sessions_read_self" ON "public"."study_sessions"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = user_id));

REVOKE ALL ON FUNCTION "private"."complete_study_attempt"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."complete_study_attempt"(uuid, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."consume_tutor_quota"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."consume_tutor_quota"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."get_owned_study_source"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."get_owned_study_source"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."grade_study_answer"(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."grade_study_answer"(uuid, uuid, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."list_tutor_conversations"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."list_tutor_conversations"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."persist_study_pack"(text, text, text, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."persist_study_pack"(text, text, text, text, text, jsonb) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."read_tutor_conversation"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."read_tutor_conversation"(uuid) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."save_tutor_exchange"(uuid, uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."save_tutor_exchange"(uuid, uuid, text, text) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."user_conversation_ids"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."user_conversation_ids"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "public"."complete_study_attempt"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."complete_study_attempt"(uuid, jsonb) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."consume_tutor_quota"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."consume_tutor_quota"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."create_study_pack"(text, text, text, text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."create_study_pack"(text, text, text, text, text, jsonb) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."get_owned_study_source"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."get_owned_study_source"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."grade_study_answer"(uuid, uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."grade_study_answer"(uuid, uuid, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."list_tutor_conversations"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."list_tutor_conversations"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."read_tutor_conversation"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."read_tutor_conversation"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."save_tutor_exchange"(uuid, uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."save_tutor_exchange"(uuid, uuid, text, text) TO "authenticated", "postgres", "service_role";

GRANT USAGE ON SCHEMA "private" TO "authenticated";

GRANT CREATE, USAGE ON SCHEMA "private" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."question_keys" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."study_sources" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."tutor_conversations" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."tutor_messages" TO "postgres";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "private"."tutor_rate_limits" TO "postgres";

REVOKE ALL ON TABLE "public"."calendar_events" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."calendar_events" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."calendar_events" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."conversation_members" FROM "authenticated";

GRANT INSERT, SELECT ON TABLE "public"."conversation_members" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."conversation_members" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."conversations" FROM "authenticated";

GRANT INSERT, SELECT ON TABLE "public"."conversations" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."conversations" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."friend_requests" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."friend_requests" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."friend_requests" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."live_rooms" FROM "authenticated";

GRANT INSERT, SELECT ON TABLE "public"."live_rooms" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."live_rooms" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."messages" FROM "authenticated";

GRANT INSERT, SELECT ON TABLE "public"."messages" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."messages" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."profiles" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."profiles" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."questions" FROM "authenticated";

GRANT SELECT ON TABLE "public"."questions" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."questions" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."study_packs" FROM "authenticated";

GRANT SELECT ON TABLE "public"."study_packs" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."study_packs" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."study_sessions" FROM "authenticated";

GRANT SELECT ON TABLE "public"."study_sessions" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."study_sessions" TO "postgres", "service_role";
