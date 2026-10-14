import { uid, type Question, type Section, type SurveySchema } from '@core/index.ts';

export function locate(schema: SurveySchema, qid: string): { si: number; qi: number } | null {
  for (let si = 0; si < schema.sections.length; si++) {
    const qi = schema.sections[si].questions.findIndex((q) => q.id === qid);
    if (qi >= 0) return { si, qi };
  }
  return null;
}

const withSections = (schema: SurveySchema, sections: Section[]): SurveySchema => ({ ...schema, sections });

export function updateQuestion(schema: SurveySchema, qid: string, patch: Partial<Question> | ((q: Question) => Question)): SurveySchema {
  return withSections(schema, schema.sections.map((s) => ({
    ...s,
    questions: s.questions.map((q) => (q.id === qid ? (typeof patch === 'function' ? patch(q) : { ...q, ...patch }) : q)),
  })));
}

export function insertQuestion(schema: SurveySchema, sectionId: string, index: number, q: Question): SurveySchema {
  return withSections(schema, schema.sections.map((s) => {
    if (s.id !== sectionId) return s;
    const qs = [...s.questions];
    qs.splice(Math.max(0, Math.min(index, qs.length)), 0, q);
    return { ...s, questions: qs };
  }));
}

export function removeQuestion(schema: SurveySchema, qid: string): SurveySchema {
  return withSections(schema, schema.sections.map((s) => ({ ...s, questions: s.questions.filter((q) => q.id !== qid) })));
}

export function moveQuestion(schema: SurveySchema, qid: string, toSectionId: string, toIndex: number): SurveySchema {
  const loc = locate(schema, qid);
  if (!loc) return schema;
  const q = schema.sections[loc.si].questions[loc.qi];
  let next = removeQuestion(schema, qid);
  // adjust index when moving down within the same section
  const sameSection = schema.sections[loc.si].id === toSectionId;
  const idx = sameSection && toIndex > loc.qi ? toIndex - 1 : toIndex;
  next = insertQuestion(next, toSectionId, idx, q);
  return next;
}

export function duplicateQuestion(schema: SurveySchema, qid: string, existingCodes: string[]): { schema: SurveySchema; newId: string } {
  const loc = locate(schema, qid)!;
  const src = schema.sections[loc.si].questions[loc.qi];
  const copy: Question = JSON.parse(JSON.stringify(src));
  copy.id = uid('q');
  let n = 2;
  let code = `${src.code}_${n}`;
  while (existingCodes.includes(code)) code = `${src.code}_${++n}`;
  copy.code = code;
  copy.title = src.title + ' (bản sao)';
  copy.options = copy.options?.map((o) => ({ ...o, id: uid('opt') }));
  copy.rows = copy.rows?.map((o) => ({ ...o, id: uid('row') }));
  return { schema: insertQuestion(schema, schema.sections[loc.si].id, loc.qi + 1, copy), newId: copy.id };
}

export function addSection(schema: SurveySchema, afterIndex?: number): { schema: SurveySchema; id: string } {
  const sec: Section = { id: uid('s'), title: `Phần ${schema.sections.length + 1}`, questions: [] };
  const sections = [...schema.sections];
  sections.splice(afterIndex === undefined ? sections.length : afterIndex + 1, 0, sec);
  return { schema: withSections(schema, sections), id: sec.id };
}

export function updateSection(schema: SurveySchema, sid: string, patch: Partial<Section>): SurveySchema {
  return withSections(schema, schema.sections.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
}

export function removeSection(schema: SurveySchema, sid: string): SurveySchema {
  return withSections(schema, schema.sections.filter((s) => s.id !== sid));
}

export function moveSection(schema: SurveySchema, sid: string, dir: -1 | 1): SurveySchema {
  const i = schema.sections.findIndex((s) => s.id === sid);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= schema.sections.length) return schema;
  const sections = [...schema.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  return withSections(schema, sections);
}

export function allCodes(schema: SurveySchema): string[] {
  return schema.sections.flatMap((s) => s.questions.map((q) => q.code));
}
