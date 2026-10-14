-- ════════════════════════════════════════════════════════════════
-- Migration 002: permission helpers, triggers, RLS, RPCs
-- Writes that change meaning (publish, status, flags, invitations)
-- go through SECURITY DEFINER functions that check permission and
-- write the audit log. Public respondents never touch tables directly:
-- they go through the `survey-public` Edge Function (service role).
-- ════════════════════════════════════════════════════════════════

-- ───────────── Permission helpers ─────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('super_admin','admin'));
$$;

create or replace function public.survey_role(p_survey uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then 'admin'
              else (select role from survey_members where survey_id = p_survey and user_id = auth.uid()) end;
$$;

create or replace function public.can_view_survey(p_survey uuid) returns boolean
language sql stable as $$ select coalesce(public.survey_role(p_survey) is not null, false) $$;

create or replace function public.can_edit_survey(p_survey uuid) returns boolean
language sql stable as $$ select coalesce(public.survey_role(p_survey) in ('admin','owner','editor'), false) $$;

create or replace function public.can_manage_survey(p_survey uuid) returns boolean
language sql stable as $$ select coalesce(public.survey_role(p_survey) in ('admin','owner'), false) $$;

create or replace function public.audit(p_action text, p_entity text, p_entity_id uuid, p_survey uuid, p_before jsonb, p_after jsonb)
returns void language sql security definer set search_path = public as $$
  insert into audit_logs(actor_id, action, entity_type, entity_id, survey_id, before_data, after_data)
  values (auth.uid(), p_action, p_entity, p_entity_id, p_survey, p_before, p_after);
$$;

-- ───────────── Triggers ─────────────
-- New auth user → profile. The very first user becomes super_admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when not exists (select 1 from profiles) then 'super_admin' else 'member' end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Members cannot change their own role
create or replace function public.protect_profile_role() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Chỉ quản trị viên được đổi vai trò';
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Creator becomes owner member
create or replace function public.survey_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into survey_members(survey_id, user_id, role) values (new.id, new.owner_id, 'owner') on conflict do nothing;
  perform audit('survey.create', 'survey', new.id, new.id, null, jsonb_build_object('title', new.title));
  return new;
end $$;
create trigger surveys_after_insert after insert on public.surveys
  for each row execute function public.survey_after_insert();

-- Direct table updates may not change status / version (use RPCs). Track unpublished edits.
create or replace function public.survey_before_update() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('kdi.rpc', true), '') <> 'on' then
    if new.status is distinct from old.status or new.current_version_id is distinct from old.current_version_id or new.owner_id is distinct from old.owner_id then
      raise exception 'Đổi trạng thái/phiên bản phải dùng chức năng tương ứng';
    end if;
    if new.draft_schema is distinct from old.draft_schema then new.has_unpublished_changes := true; end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger surveys_before_update before update on public.surveys
  for each row execute function public.survey_before_update();

-- ───────────── RLS ─────────────
alter table public.profiles               enable row level security;
alter table public.projects               enable row level security;
alter table public.surveys                enable row level security;
alter table public.survey_members         enable row level security;
alter table public.survey_versions        enable row level security;
alter table public.survey_sections        enable row level security;
alter table public.survey_questions       enable row level security;
alter table public.question_options       enable row level security;
alter table public.survey_invitations     enable row level security;
alter table public.survey_responses       enable row level security;
alter table public.response_answers       enable row level security;
alter table public.response_answer_options enable row level security;
alter table public.response_events        enable row level security;
alter table public.response_files         enable row level security;
alter table public.survey_templates       enable row level security;
alter table public.audit_logs             enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin());

-- projects
create policy projects_select on public.projects for select to authenticated using (true);
create policy projects_insert on public.projects for insert to authenticated with check (created_by = auth.uid());
create policy projects_update on public.projects for update to authenticated using (created_by = auth.uid() or public.is_admin());

-- surveys
create policy surveys_select on public.surveys for select to authenticated using (owner_id = auth.uid() or public.can_view_survey(id));
create policy surveys_insert on public.surveys for insert to authenticated with check (owner_id = auth.uid() and status = 'draft');
create policy surveys_update on public.surveys for update to authenticated using (public.can_edit_survey(id));

-- members
create policy members_select on public.survey_members for select to authenticated using (public.can_view_survey(survey_id));
create policy members_insert on public.survey_members for insert to authenticated with check (public.can_manage_survey(survey_id) and role <> 'owner');
create policy members_update on public.survey_members for update to authenticated using (public.can_manage_survey(survey_id) and role <> 'owner');
create policy members_delete on public.survey_members for delete to authenticated using (public.can_manage_survey(survey_id) and role <> 'owner');

-- versions & materialised structure: read-only for members
create policy versions_select on public.survey_versions for select to authenticated using (public.can_view_survey(survey_id));
create policy sections_select on public.survey_sections for select to authenticated
  using (exists (select 1 from survey_versions v where v.id = version_id and public.can_view_survey(v.survey_id)));
create policy questions_select on public.survey_questions for select to authenticated
  using (exists (select 1 from survey_versions v where v.id = version_id and public.can_view_survey(v.survey_id)));
create policy options_select on public.question_options for select to authenticated
  using (exists (select 1 from survey_questions q join survey_versions v on v.id = q.version_id where q.id = question_id and public.can_view_survey(v.survey_id)));

-- invitations
create policy invitations_select on public.survey_invitations for select to authenticated using (public.can_edit_survey(survey_id));

-- responses & answers: members read; no direct writes (Edge Function / RPC only)
create policy responses_select on public.survey_responses for select to authenticated using (public.can_view_survey(survey_id));
create policy answers_select on public.response_answers for select to authenticated
  using (exists (select 1 from survey_responses r where r.id = response_id and public.can_view_survey(r.survey_id)));
create policy answer_options_select on public.response_answer_options for select to authenticated
  using (exists (select 1 from survey_responses r where r.id = response_id and public.can_view_survey(r.survey_id)));
create policy events_select on public.response_events for select to authenticated
  using (exists (select 1 from survey_responses r where r.id = response_id and public.can_view_survey(r.survey_id)));
create policy files_select on public.response_files for select to authenticated
  using (exists (select 1 from survey_responses r where r.id = response_id and public.can_view_survey(r.survey_id)));

-- templates
create policy templates_select on public.survey_templates for select to authenticated
  using (visibility in ('system','organization') or created_by = auth.uid());
create policy templates_insert on public.survey_templates for insert to authenticated with check (created_by = auth.uid() and visibility <> 'system');
create policy templates_update on public.survey_templates for update to authenticated using (created_by = auth.uid() or public.is_admin());
create policy templates_delete on public.survey_templates for delete to authenticated using ((created_by = auth.uid() and visibility <> 'system') or public.is_admin());

-- audit
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_admin() or (survey_id is not null and public.can_view_survey(survey_id)));

-- ───────────── RPC: publish ─────────────
create or replace function public.publish_survey(p_survey uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s record; v_id uuid; v_no int; sec jsonb; q jsonb; o jsonb; sec_id uuid; q_id uuid; si int; qi int; oi int;
begin
  if not public.can_edit_survey(p_survey) then raise exception 'Không có quyền xuất bản'; end if;
  select * into s from surveys where id = p_survey for update;
  if s.status = 'archived' then raise exception 'Khảo sát đã lưu trữ'; end if;
  if jsonb_array_length(coalesce(s.draft_schema->'sections','[]'::jsonb)) = 0 then raise exception 'Khảo sát chưa có nội dung'; end if;

  select coalesce(max(version_number),0) + 1 into v_no from survey_versions where survey_id = p_survey;
  insert into survey_versions(survey_id, version_number, schema_json, settings_json, theme_json, created_by)
  values (p_survey, v_no, s.draft_schema, s.settings, s.theme, auth.uid()) returning id into v_id;

  si := 0;
  for sec in select * from jsonb_array_elements(s.draft_schema->'sections') loop
    si := si + 1;
    insert into survey_sections(version_id, client_id, title, description, sort_order, logic_json)
    values (v_id, sec->>'id', sec->>'title', sec->>'description', si, sec->'logic') returning id into sec_id;
    qi := 0;
    for q in select * from jsonb_array_elements(coalesce(sec->'questions','[]'::jsonb)) loop
      qi := qi + 1;
      insert into survey_questions(version_id, section_id, client_id, question_code, question_type, title, description, required,
                                   report_label, is_pii, settings_json, validation_json, logic_json, media_json, sort_order)
      values (v_id, sec_id, q->>'id', q->>'code', q->>'type', q->>'title', q->>'description', coalesce((q->>'required')::boolean,false),
              q->>'reportLabel', coalesce((q->>'isPII')::boolean,false), q->'settings', q->'validation', q->'logic', q->'media', si*1000+qi)
      returning id into q_id;
      oi := 0;
      for o in select * from jsonb_array_elements(coalesce(q->'options','[]'::jsonb)) loop
        oi := oi + 1;
        insert into question_options(question_id, kind, option_code, label, sort_order, is_active)
        values (q_id, 'option', o->>'code', o->>'label', oi, coalesce((o->>'active')::boolean, true));
      end loop;
      oi := 0;
      for o in select * from jsonb_array_elements(coalesce(q->'rows','[]'::jsonb)) loop
        oi := oi + 1;
        insert into question_options(question_id, kind, option_code, label, sort_order, is_active)
        values (q_id, 'row', o->>'code', o->>'label', oi, coalesce((o->>'active')::boolean, true));
      end loop;
    end loop;
  end loop;

  perform set_config('kdi.rpc', 'on', true);
  update surveys set current_version_id = v_id, has_unpublished_changes = false,
    status = case when status in ('draft','closed') then 'published' else status end
  where id = p_survey;
  perform audit('survey.publish', 'survey_version', v_id, p_survey, null, jsonb_build_object('version', v_no));
  return v_id;
end $$;

-- ───────────── RPC: status transitions ─────────────
create or replace function public.set_survey_status(p_survey uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare cur text; ok boolean;
begin
  if not public.can_edit_survey(p_survey) then raise exception 'Không có quyền'; end if;
  select status into cur from surveys where id = p_survey for update;
  ok := (cur, p_status) in (
    ('published','paused'), ('paused','published'), ('published','closed'), ('paused','closed'),
    ('closed','published'), ('closed','archived'), ('draft','archived'), ('archived','draft'));
  if not ok then raise exception 'Không thể chuyển % → %', cur, p_status; end if;
  if p_status = 'published' and (select current_version_id from surveys where id = p_survey) is null then
    raise exception 'Cần xuất bản phiên bản trước';
  end if;
  if p_status = 'archived' and not public.can_manage_survey(p_survey) then raise exception 'Chỉ chủ sở hữu được lưu trữ'; end if;
  perform set_config('kdi.rpc', 'on', true);
  update surveys set status = p_status where id = p_survey;
  perform audit('survey.status', 'survey', p_survey, p_survey, jsonb_build_object('status', cur), jsonb_build_object('status', p_status));
end $$;

-- ───────────── RPC: duplicate ─────────────
create or replace function public.duplicate_survey(p_survey uuid, p_title text, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare s record; new_id uuid;
begin
  if not public.can_view_survey(p_survey) then raise exception 'Không có quyền'; end if;
  select * into s from surveys where id = p_survey;
  insert into surveys(project_id, title, slug, description, category, purpose, owner_id, draft_schema, settings, theme)
  values (s.project_id, p_title, p_slug, s.description, s.category, s.purpose, auth.uid(), s.draft_schema, s.settings, s.theme)
  returning id into new_id;
  perform audit('survey.duplicate', 'survey', new_id, new_id, jsonb_build_object('from', p_survey), null);
  return new_id;
end $$;

-- ───────────── RPC: invitations (raw tokens returned ONCE) ─────────────
create or replace function public.create_invitations(p_survey uuid, p_recipients jsonb, p_expires_at timestamptz default null)
returns table (id uuid, token text, recipient_name text, recipient_email text, organization text)
language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb; t text; new_id uuid;
begin
  if not public.can_edit_survey(p_survey) then raise exception 'Không có quyền'; end if;
  for r in select * from jsonb_array_elements(p_recipients) loop
    t := encode(gen_random_bytes(18), 'base64');
    t := translate(t, '+/=', '-_');
    insert into survey_invitations(survey_id, recipient_name, recipient_email, organization, token_hash, token_hint, expires_at, created_by)
    values (p_survey, r->>'name', r->>'email', r->>'organization', encode(digest(t, 'sha256'), 'hex'), right(t, 4), p_expires_at, auth.uid())
    returning survey_invitations.id into new_id;
    id := new_id; token := t; recipient_name := r->>'name'; recipient_email := r->>'email'; organization := r->>'organization';
    return next;
  end loop;
  perform audit('invitation.create', 'survey', p_survey, p_survey, null, jsonb_build_object('count', jsonb_array_length(p_recipients)));
end $$;

create or replace function public.revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select survey_id into sid from survey_invitations where id = p_invitation;
  if not public.can_edit_survey(sid) then raise exception 'Không có quyền'; end if;
  update survey_invitations set status = 'revoked' where id = p_invitation and status <> 'completed';
  perform audit('invitation.revoke', 'survey_invitation', p_invitation, sid, null, null);
end $$;

-- ───────────── RPC: flag / note a response (never deletes) ─────────────
create or replace function public.flag_response(p_response uuid, p_flag text, p_reason text, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid; before jsonb;
begin
  select survey_id, jsonb_build_object('flag', flag, 'reason', flag_reason, 'note', note) into sid, before from survey_responses where id = p_response;
  if not public.can_view_survey(sid) then raise exception 'Không có quyền'; end if;
  if p_flag is not null and p_flag not in ('needs_review','invalid','spam') then raise exception 'Cờ không hợp lệ'; end if;
  update survey_responses set flag = p_flag, flag_reason = p_reason, note = coalesce(p_note, note), updated_at = now() where id = p_response;
  perform audit('response.flag', 'survey_response', p_response, sid, before, jsonb_build_object('flag', p_flag, 'reason', p_reason, 'note', p_note));
end $$;

-- ───────────── RPC used ONLY by the Edge Function (service role) ─────────────
-- Writes a submitted response atomically: answers + option rows + files + status.
create or replace function public.finalize_response(p_response uuid, p_answers jsonb, p_rows jsonb, p_files jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare r record; a jsonb; o jsonb; f jsonb; qid uuid; aid uuid;
begin
  select * into r from survey_responses where id = p_response for update;
  if r.status = 'submitted' then return r.response_code; end if;   -- idempotent

  for a in select * from jsonb_array_elements(p_rows) loop
    select id into qid from survey_questions where version_id = r.version_id and client_id = a->>'question_client_id';
    if qid is null then raise exception 'Câu hỏi không tồn tại: %', a->>'question_code'; end if;
    insert into response_answers(response_id, question_id, question_client_id, question_code, answer_text, answer_number, answer_date, answer_json)
    values (p_response, qid, a->>'question_client_id', a->>'question_code', a->>'answer_text',
            nullif(a->>'answer_number','')::numeric, a->>'answer_date', a->'answer_json')
    returning id into aid;
    for o in select * from jsonb_array_elements(coalesce(a->'options','[]'::jsonb)) loop
      insert into response_answer_options(response_id, answer_id, question_id, question_code, option_code, row_code, rank, quantity, other_text)
      values (p_response, aid, qid, a->>'question_code', o->>'option_code', o->>'row_code',
              nullif(o->>'rank','')::int, nullif(o->>'quantity','')::numeric, o->>'other_text');
    end loop;
  end loop;

  for f in select * from jsonb_array_elements(coalesce(p_files,'[]'::jsonb)) loop
    insert into response_files(response_id, question_id, storage_path, original_filename, mime_type, size_bytes)
    values (p_response, (select id from survey_questions where version_id = r.version_id and client_id = f->>'question_client_id'),
            f->>'path', f->>'name', f->>'type', nullif(f->>'size','')::bigint);
  end loop;

  update survey_responses set status = 'submitted', answers = p_answers, submitted_at = now(),
    duration_seconds = greatest(0, extract(epoch from now() - started_at))::int, updated_at = now()
  where id = p_response;
  insert into response_events(response_id, event_type) values (p_response, 'submitted');
  if r.invitation_id is not null then
    update survey_invitations set status = 'completed', completed_at = now() where id = r.invitation_id;
  end if;
  return r.response_code;
end $$;
revoke execute on function public.finalize_response(uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;

-- ───────────── Storage buckets ─────────────
insert into storage.buckets (id, name, public) values ('survey-media', 'survey-media', true) on conflict do nothing;
insert into storage.buckets (id, name, public, file_size_limit) values ('response-files', 'response-files', false, 26214400) on conflict do nothing;

create policy "media read" on storage.objects for select using (bucket_id = 'survey-media');
create policy "media write" on storage.objects for insert to authenticated with check (bucket_id = 'survey-media');
-- response files: path = <survey_id>/<response_id>/<file>; readable by survey members via signed URL
create policy "response files read" on storage.objects for select to authenticated
  using (bucket_id = 'response-files' and public.can_view_survey(((storage.foldername(name))[1])::uuid));
