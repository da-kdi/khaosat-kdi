import { useMemo } from 'react';
import { prepareResponses, type SurveySchema } from '@core/index.ts';
import { api } from '@/data';
import { useAsync } from '@/lib/useAsync';
import { useSurvey } from './SurveyLayout';

/** Loads responses + builds version map. Responses are matched across versions by question CODE. */
export function useSurveyData() {
  const { survey, versions } = useSurvey();
  const res = useAsync(() => api.listResponses(survey.id), [survey.id]);
  const versionMap = useMemo(() => Object.fromEntries(versions.map((v) => [v.id, v.schema])) as Record<string, SurveySchema>, [versions]);
  const prepared = useMemo(() => prepareResponses(res.data ?? [], versionMap), [res.data, versionMap]);
  /** analytics uses the latest published structure (falls back to draft) for labels & question list */
  const schema: SurveySchema = versions[0]?.schema ?? survey.draftSchema;
  return { ...res, prepared, versionMap, schema };
}
