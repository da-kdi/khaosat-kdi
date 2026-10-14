-- ════════════════════════════════════════════════════════════════
-- Migration 003: stable analytics views (Power BI / SQL clients)
-- security_invoker = true → views respect the caller's RLS.
-- For Power BI, create a dedicated read-only Postgres role
-- (see docs/POWER_BI.md) and grant select on schema analytics.
-- ════════════════════════════════════════════════════════════════
create schema if not exists analytics;
grant usage on schema analytics to authenticated;

create or replace view analytics.v_survey_summary with (security_invoker = true) as
select s.id as survey_id, s.title, s.slug, s.category, s.status, p.name as project,
       s.created_at, s.start_at, s.end_at,
       (select count(*) from public.survey_versions v where v.survey_id = s.id) as versions,
       count(r.id) filter (where true)                         as started,
       count(r.id) filter (where r.status = 'submitted')       as submitted,
       count(r.id) filter (where r.status = 'in_progress')     as in_progress,
       count(r.id) filter (where r.flag is not null)           as flagged,
       round(100.0 * count(r.id) filter (where r.status = 'submitted') / nullif(count(r.id),0), 1) as completion_rate_pct,
       round(avg(r.duration_seconds) filter (where r.status = 'submitted'))  as avg_duration_seconds
from public.surveys s
left join public.projects p on p.id = s.project_id
left join public.survey_responses r on r.survey_id = s.id
group by s.id, p.name;

create or replace view analytics.v_response_status with (security_invoker = true) as
select r.id as response_id, r.response_code, r.survey_id, s.title as survey_title, v.version_number,
       r.status, r.flag, r.started_at, r.submitted_at, r.duration_seconds, r.last_section_id,
       (r.invitation_id is not null) as via_invitation
from public.survey_responses r
join public.surveys s on s.id = r.survey_id
join public.survey_versions v on v.id = r.version_id;

-- One row per answer (long format)
create or replace view analytics.v_answers_long with (security_invoker = true) as
select a.response_id, r.response_code, r.survey_id, v.version_number, r.status, r.flag,
       q.question_code, q.question_type, coalesce(q.report_label, q.title) as question_label, q.is_pii,
       case when q.is_pii then null else a.answer_text end as answer_text,
       a.answer_number, a.answer_date, r.submitted_at
from public.response_answers a
join public.survey_responses r on r.id = a.response_id
join public.survey_questions q on q.id = a.question_id
join public.survey_versions v on v.id = r.version_id;

-- One row per selected option / grid cell (labels resolved from the response's own version)
create or replace view analytics.v_choice_selections with (security_invoker = true) as
select o.response_id, r.response_code, r.survey_id, v.version_number, r.status, r.flag,
       o.question_code, q.question_type,
       o.row_code, rl.label as row_label,
       o.option_code, coalesce(ol.label, case when o.option_code = '__other' then 'Khác' end) as option_label,
       o.rank, o.quantity, o.other_text, r.submitted_at
from public.response_answer_options o
join public.survey_responses r on r.id = o.response_id
join public.survey_questions q on q.id = o.question_id
join public.survey_versions v on v.id = r.version_id
left join public.question_options ol on ol.question_id = o.question_id and ol.kind = 'option' and ol.option_code = o.option_code
left join public.question_options rl on rl.question_id = o.question_id and rl.kind = 'row' and rl.option_code = o.row_code;

-- Aggregated choice counts (submitted, unflagged) by stable codes — comparable across versions
create or replace view analytics.v_question_metrics with (security_invoker = true) as
select c.survey_id, c.question_code, c.row_code, c.option_code,
       max(c.option_label) as option_label, max(c.row_label) as row_label,
       count(*)                         as selections,
       count(distinct c.response_id)    as respondents,
       sum(c.quantity)                  as total_quantity
from analytics.v_choice_selections c
where c.status = 'submitted' and c.flag is null
group by c.survey_id, c.question_code, c.row_code, c.option_code;

create or replace view analytics.v_codebook with (security_invoker = true) as
select v.survey_id, v.version_number, sec.sort_order as section_order, sec.title as section_title,
       q.question_code, q.question_type, q.title as question_title, q.report_label, q.required, q.is_pii,
       o.kind as code_kind, o.option_code, o.label as option_label, o.sort_order as option_order, o.is_active
from public.survey_questions q
join public.survey_sections sec on sec.id = q.section_id
join public.survey_versions v on v.id = q.version_id
left join public.question_options o on o.question_id = q.id;

grant select on all tables in schema analytics to authenticated;
