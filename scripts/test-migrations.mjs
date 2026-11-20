// Applies all migrations + seed to an in-memory Postgres (PGlite) with stubbed
// Supabase schemas, then exercises publish / status / finalize / RLS helpers.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFileSync, readdirSync } from 'node:fs';

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
  create schema auth; create schema storage; create schema extensions;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
  create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
  create or replace function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;
  create role anon; create role authenticated; create role service_role;
`);
for (const f of readdirSync('supabase/migrations').sort()) {
  try { await db.exec(readFileSync(`supabase/migrations/${f}`, 'utf8')); console.log('✓', f); }
  catch (e) { console.error('✗', f, e.message); process.exit(1); }
}
await db.exec(readFileSync('supabase/seed.sql', 'utf8')); console.log('✓ seed.sql');

const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users(id,email) values ('${U1}','admin@kdi.vn'),('${U2}','gv@kdi.vn')`);
const roles = await db.query(`select email, role from profiles order by email`);
console.log('profiles:', roles.rows);
const as = (uid) => db.exec(`select set_config('test.uid','${uid}',false)`);

// U2 (member) creates survey from the STEM template
await as(U2);
const { rows: [t] } = await db.query(`select schema_json from survey_templates where key='stem-needs'`);
const { rows: [s] } = await db.query(`insert into surveys(title, slug, owner_id, draft_schema) values ('STEM HP','stem-hp',$1,$2) returning id`, [U2, t.schema_json]);
console.log('owner member row:', (await db.query(`select role from survey_members where survey_id=$1`, [s.id])).rows);

// direct status change must fail
try { await db.query(`update surveys set status='published' where id=$1`, [s.id]); console.log('✗ direct status update allowed'); process.exit(1); }
catch (e) { console.log('✓ direct status change blocked:', e.message); }

const { rows: [{ publish_survey: v1 }] } = await db.query(`select publish_survey($1)`, [s.id]);
const counts = await db.query(`select (select count(*) from survey_sections where version_id=$1) s, (select count(*) from survey_questions where version_id=$1) q, (select count(*) from question_options q2 join survey_questions q on q.id=q2.question_id where q.version_id=$1) o`, [v1]);
console.log('✓ published v1, materialised', counts.rows[0]);
await db.query(`select set_survey_status($1,'paused')`, [s.id]);
try { await db.query(`select set_survey_status($1,'draft')`, [s.id]); console.log('✗ bad transition allowed'); process.exit(1); } catch (e) { console.log('✓ invalid transition blocked:', e.message); }
await db.query(`select set_survey_status($1,'published')`, [s.id]);

// editing draft then republishing creates v2 and keeps v1 intact
await db.query(`update surveys set draft_schema = jsonb_set(draft_schema,'{sections,1,questions,0,title}','"Tên đơn vị"') where id=$1`, [s.id]);
const { rows: [{ publish_survey: v2 }] } = await db.query(`select publish_survey($1)`, [s.id]);
const titles = await db.query(`select v.version_number, q.title from survey_questions q join survey_versions v on v.id=q.version_id where q.question_code='SCHOOL_NAME' order by 1`);
console.log('✓ versioning:', titles.rows);

// invitations
const inv = await db.query(`select * from create_invitations($1, '[{"name":"THCS A","organization":"THCS A"}]'::jsonb)`, [s.id]);
console.log('✓ invitation token length', inv.rows[0].token.length);

// finalize (service role path) on v1
const { rows: [r] } = await db.query(`insert into survey_responses(survey_id, version_id, response_code) values ($1,$2,'KDI-TEST') returning id`, [s.id, v1]);
const rowsJson = JSON.stringify([{ question_client_id: 'q_level', question_code: 'SCHOOL_LEVEL', answer_text: 'thcs', answer_number: null, answer_date: null, answer_json: 'thcs', options: [{ option_code: 'thcs', row_code: null, rank: null, quantity: null, other_text: null }] },
  { question_client_id: 'q_topics', question_code: 'STEM_TOPICS', answer_text: null, answer_number: 5, answer_date: null, answer_json: { robot: { thcs: 3 }, ai: { thcs: 2 } }, options: [{ option_code: 'thcs', row_code: 'robot', rank: null, quantity: 3, other_text: null }, { option_code: 'thcs', row_code: 'ai', rank: null, quantity: 2, other_text: null }] }]);
const code1 = await db.query(`select finalize_response($1,'{}'::jsonb,$2::jsonb,'[]'::jsonb) c`, [r.id, rowsJson]);
const code2 = await db.query(`select finalize_response($1,'{}'::jsonb,$2::jsonb,'[]'::jsonb) c`, [r.id, rowsJson]);
console.log('✓ finalize idempotent:', code1.rows[0].c, code2.rows[0].c, (await db.query(`select count(*) from response_answers where response_id=$1`, [r.id])).rows[0]);

console.log('v_question_metrics:', (await db.query(`select question_code,row_code,option_code,option_label,row_label,respondents,total_quantity from analytics.v_question_metrics order by 1,2`)).rows);
console.log('v_survey_summary:', (await db.query(`select title,status,versions,started,submitted,completion_rate_pct from analytics.v_survey_summary`)).rows);

// permissions: U1 is super_admin (first user), a 3rd stranger sees nothing
await db.exec(`insert into auth.users(id,email) values ('33333333-3333-3333-3333-333333333333','x@x.vn')`);
await as('33333333-3333-3333-3333-333333333333');
console.log('stranger can_view:', (await db.query(`select can_view_survey($1) v`, [s.id])).rows[0].v);
try { await db.query(`select publish_survey($1)`, [s.id]); console.log('✗ stranger published'); process.exit(1); } catch (e) { console.log('✓ stranger publish blocked:', e.message); }
await as(U1);
console.log('admin can_edit:', (await db.query(`select can_edit_survey($1) v`, [s.id])).rows[0].v);
// delete draft: published survey refused; never-published draft removed with its members
try { await db.query(`select delete_draft_survey($1)`, [s.id]); console.log('✗ published survey deleted'); process.exit(1); } catch (e) { console.log('✓ delete published blocked:', e.message); }
await as(U2);
const { rows: [d] } = await db.query(`insert into surveys(title, slug, owner_id, draft_schema) values ('Nháp','nhap-xoa',$1,'{"sections":[]}'::jsonb) returning id`, [U2]);
await as('33333333-3333-3333-3333-333333333333');
try { await db.query(`select delete_draft_survey($1)`, [d.id]); console.log('✗ stranger deleted'); process.exit(1); } catch (e) { console.log('✓ stranger delete blocked:', e.message); }
await as(U2);
await db.query(`select delete_draft_survey($1)`, [d.id]);
const left = (await db.query(`select (select count(*) from surveys where id=$1)::int s, (select count(*) from survey_members where survey_id=$1)::int m`, [d.id])).rows[0];
if (left.s || left.m) { console.log('✗ draft not removed', left); process.exit(1); }
console.log('✓ draft deleted');
await as(U1);
console.log('audit entries:', (await db.query(`select action from audit_logs order by id`)).rows.map((x) => x.action).join(', '));
console.log('\nALL MIGRATION CHECKS PASSED');
