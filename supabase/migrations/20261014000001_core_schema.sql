-- ════════════════════════════════════════════════════════════════
-- Hệ thống khảo sát STEM — KDI Education
-- Migration 001: core schema
-- ════════════════════════════════════════════════════════════════
create extension if not exists pgcrypto;

-- ───────────── Identity & organisation ─────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'member' check (role in ('super_admin','admin','member')),
  created_at  timestamptz not null default now()
);

create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);

-- ───────────── Surveys ─────────────
create table public.surveys (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid references public.projects(id) on delete set null,
  title              text not null,
  slug               text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  description        text,
  category           text,
  purpose            text,
  status             text not null default 'draft' check (status in ('draft','published','paused','closed','archived')),
  owner_id           uuid not null references public.profiles(id),
  draft_schema       jsonb not null default '{"schemaVersion":1,"sections":[]}'::jsonb,
  settings           jsonb not null default '{}'::jsonb,
  theme              jsonb not null default '{}'::jsonb,
  start_at           timestamptz,
  end_at             timestamptz,
  current_version_id uuid,
  has_unpublished_changes boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index on public.surveys (status);
create index on public.surveys (project_id);
create index on public.surveys (owner_id);

create table public.survey_members (
  survey_id  uuid not null references public.surveys(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('owner','editor','analyst')),
  created_at timestamptz not null default now(),
  primary key (survey_id, user_id)
);

-- Immutable published versions + materialised structure (for joins & BI)
create table public.survey_versions (
  id             uuid primary key default gen_random_uuid(),
  survey_id      uuid not null references public.surveys(id) on delete cascade,
  version_number int  not null,
  schema_json    jsonb not null,
  settings_json  jsonb not null default '{}'::jsonb,
  theme_json     jsonb not null default '{}'::jsonb,
  published_at   timestamptz not null default now(),
  created_by     uuid references public.profiles(id),
  unique (survey_id, version_number)
);
alter table public.surveys add constraint surveys_current_version_fk
  foreign key (current_version_id) references public.survey_versions(id) on delete set null;

create table public.survey_sections (
  id          uuid primary key default gen_random_uuid(),
  version_id  uuid not null references public.survey_versions(id) on delete cascade,
  client_id   text not null,
  title       text,
  description text,
  sort_order  int not null,
  logic_json  jsonb,
  unique (version_id, client_id)
);

create table public.survey_questions (
  id              uuid primary key default gen_random_uuid(),
  version_id      uuid not null references public.survey_versions(id) on delete cascade,
  section_id      uuid not null references public.survey_sections(id) on delete cascade,
  client_id       text not null,
  question_code   text not null,
  question_type   text not null,
  title           text,
  description     text,
  required        boolean not null default false,
  report_label    text,
  is_pii          boolean not null default false,
  settings_json   jsonb,
  validation_json jsonb,
  logic_json      jsonb,
  media_json      jsonb,
  sort_order      int not null,
  unique (version_id, client_id),
  unique (version_id, question_code)
);
create index on public.survey_questions (question_code);

create table public.question_options (
  id           uuid primary key default gen_random_uuid(),
  question_id  uuid not null references public.survey_questions(id) on delete cascade,
  kind         text not null default 'option' check (kind in ('option','row')),
  option_code  text not null,
  label        text not null,
  sort_order   int not null,
  is_active    boolean not null default true,
  unique (question_id, kind, option_code)
);

-- ───────────── Distribution ─────────────
create table public.survey_invitations (
  id              uuid primary key default gen_random_uuid(),
  survey_id       uuid not null references public.surveys(id) on delete cascade,
  recipient_name  text,
  recipient_email text,
  organization    text,
  token_hash      text not null unique,
  token_hint      text,           -- last 4 chars only, for support
  status          text not null default 'pending' check (status in ('pending','opened','started','completed','revoked','expired')),
  invited_at      timestamptz not null default now(),
  opened_at       timestamptz,
  completed_at    timestamptz,
  expires_at      timestamptz,
  created_by      uuid references public.profiles(id)
);
create index on public.survey_invitations (survey_id, status);

-- ───────────── Collection ─────────────
create table public.survey_responses (
  id                uuid primary key default gen_random_uuid(),
  survey_id         uuid not null references public.surveys(id) on delete cascade,
  version_id        uuid not null references public.survey_versions(id),
  response_code     text not null unique,
  invitation_id     uuid references public.survey_invitations(id),
  respondent_ref    text,
  status            text not null default 'in_progress' check (status in ('in_progress','submitted')),
  started_at        timestamptz not null default now(),
  submitted_at      timestamptz,
  duration_seconds  int,
  last_section_id   text,
  answers           jsonb not null default '{}'::jsonb,   -- canonical raw answers (sanitised on submit)
  resume_token_hash text,
  ip_hash           text,
  metadata          jsonb not null default '{}'::jsonb,
  flag              text check (flag in ('needs_review','invalid','spam')),
  flag_reason       text,
  note              text,
  updated_at        timestamptz not null default now()
);
create index on public.survey_responses (survey_id, status, submitted_at);
create index on public.survey_responses (survey_id, ip_hash, started_at);

create table public.response_answers (
  id                 uuid primary key default gen_random_uuid(),
  response_id        uuid not null references public.survey_responses(id) on delete cascade,
  question_id        uuid not null references public.survey_questions(id),
  question_client_id text not null,
  question_code      text not null,
  answer_text        text,
  answer_number      numeric,
  answer_date        text,
  answer_json        jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (response_id, question_id)
);
create index on public.response_answers (question_id);
create index on public.response_answers (question_code);
create index on public.response_answers using gin (answer_json jsonb_path_ops);
create index response_answers_fts on public.response_answers using gin (to_tsvector('simple', coalesce(answer_text,'')));

create table public.response_answer_options (
  id            uuid primary key default gen_random_uuid(),
  response_id   uuid not null references public.survey_responses(id) on delete cascade,
  answer_id     uuid not null references public.response_answers(id) on delete cascade,
  question_id   uuid not null references public.survey_questions(id),
  question_code text not null,
  option_code   text not null,
  row_code      text,
  rank          int,
  quantity      numeric,
  other_text    text
);
create index on public.response_answer_options (question_id, option_code);
create index on public.response_answer_options (response_id);

create table public.response_events (
  id                bigint generated always as identity primary key,
  response_id       uuid not null references public.survey_responses(id) on delete cascade,
  event_type        text not null check (event_type in ('started','section_reached','submitted','resumed')),
  section_client_id text,
  created_at        timestamptz not null default now()
);
create index on public.response_events (response_id);

create table public.response_files (
  id                uuid primary key default gen_random_uuid(),
  response_id       uuid not null references public.survey_responses(id) on delete cascade,
  question_id       uuid references public.survey_questions(id),
  storage_path      text not null,
  original_filename text,
  mime_type         text,
  size_bytes        bigint,
  uploaded_at       timestamptz not null default now()
);

-- ───────────── Templates & audit ─────────────
create table public.survey_templates (
  id            uuid primary key default gen_random_uuid(),
  key           text unique,
  title         text not null,
  description   text,
  category      text,
  schema_json   jsonb not null,
  theme_json    jsonb not null default '{}'::jsonb,
  settings_json jsonb not null default '{}'::jsonb,
  visibility    text not null default 'organization' check (visibility in ('private','organization','system')),
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles(id),
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  survey_id   uuid,
  before_data jsonb,
  after_data  jsonb,
  created_at  timestamptz not null default now()
);
create index on public.audit_logs (survey_id, created_at desc);
create index on public.audit_logs (created_at desc);
