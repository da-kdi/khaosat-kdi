// Request/response contract of the public respondent API.
// Implemented by supabase/functions/survey-public (production) and
// src/data/demo (browser demo mode). Keep both in sync with this file.
import type { Answers, SurveySchema, SurveySettings, SurveyTheme } from './types.ts';
import type { Availability } from './availability.ts';

export interface PublicSurvey {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  theme: SurveyTheme;
  settings: SurveySettings; // secrets stripped
  versionId: string;
  schema: SurveySchema;
}

export type GetSurveyResult =
  | { state: 'open'; survey: PublicSurvey }
  | { state: Exclude<Availability, 'open'>; title?: string; message: string }
  | { state: 'requires_code'; title: string; theme: SurveyTheme }
  | { state: 'invalid_invitation'; message: string };

export interface StartResult { responseId: string; responseCode: string; resumeToken: string }
export interface ResumeResult { responseId: string; responseCode: string; answers: Answers; lastSectionId: string | null; survey: PublicSurvey }
export interface SubmitResult { ok: true; responseCode: string }
export interface UploadTicket { path: string; signedUrl?: string; token?: string }

export interface PublicApi {
  get(slug: string, opts?: { token?: string; code?: string }): Promise<GetSurveyResult>;
  start(slug: string, opts?: { token?: string; code?: string }): Promise<StartResult>;
  save(responseId: string, resumeToken: string, answers: Answers, sectionId: string | null): Promise<void>;
  resume(slug: string, resumeToken: string): Promise<ResumeResult>;
  uploadFile(responseId: string, resumeToken: string, questionId: string, file: File): Promise<{ path: string }>;
  submit(responseId: string, resumeToken: string, answers: Answers): Promise<SubmitResult>;
}

export class PublicApiError extends Error {
  constructor(message: string, public code: string = 'error', public fieldErrors?: Record<string, string>) {
    super(message);
  }
}
