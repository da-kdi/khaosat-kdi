-- Migration 004: delete a draft survey that was never published.
-- Only owner / admin; refuses once a version exists or any response was recorded.
create or replace function public.delete_draft_survey(p_survey uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if not public.can_manage_survey(p_survey) then
    raise exception 'Chỉ chủ sở hữu hoặc quản trị viên được xóa khảo sát';
  end if;
  select * into s from surveys where id = p_survey for update;
  if s.id is null then raise exception 'Không tìm thấy khảo sát'; end if;
  if s.status <> 'draft' or s.current_version_id is not null
     or exists (select 1 from survey_versions where survey_id = p_survey) then
    raise exception 'Chỉ xóa được bản nháp chưa từng xuất bản';
  end if;
  if exists (select 1 from survey_responses where survey_id = p_survey) then
    raise exception 'Khảo sát đã có phản hồi, không thể xóa';
  end if;
  perform audit('survey.delete', 'survey', p_survey, p_survey,
    jsonb_build_object('title', s.title, 'slug', s.slug), null);
  delete from surveys where id = p_survey;
end $$;

revoke execute on function public.delete_draft_survey(uuid) from public, anon;
grant execute on function public.delete_draft_survey(uuid) to authenticated;
