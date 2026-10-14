import type { ResponseRecord, SurveySchema, SurveySettings, SurveyStatus, SurveyTheme, ResponseFlag, PublicApi } from '@core/index.ts';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin' | 'admin' | 'member';
}

export interface Project { id: string; name: string; description?: string | null }

export interface SurveyRow {
  id: string;
  projectId: string | null;
  title: string;
  slug: string;
  description: string | null;
  category: string | null;
  purpose: string | null;
  status: SurveyStatus;
  ownerId: string;
  ownerName?: string;
  draftSchema: SurveySchema;
  settings: SurveySettings;
  theme: SurveyTheme;
  startAt: string | null;
  endAt: string | null;
  currentVersionId: string | null;
  hasUnpublishedChanges: boolean;
  createdAt: string;
  updatedAt: string;
  /** role of current user on this survey */
  myRole?: 'admin' | 'owner' | 'editor' | 'analyst' | null;
  stats?: { started: number; submitted: number; inProgress: number };
}

export interface VersionRow {
  id: string;
  surveyId: string;
  versionNumber: number;
  schema: SurveySchema;
  settings: SurveySettings;
  theme: SurveyTheme;
  publishedAt: string;
}

export interface InvitationRow {
  id: string;
  surveyId: string;
  recipientName: string | null;
  recipientEmail: string | null;
  organization: string | null;
  tokenHint: string | null;
  status: 'pending' | 'opened' | 'started' | 'completed' | 'revoked' | 'expired';
  invitedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  /** only present right after creation */
  token?: string;
}

export interface TemplateRow {
  id: string;
  key: string | null;
  title: string;
  description: string | null;
  category: string | null;
  schema: SurveySchema;
  theme: SurveyTheme;
  settings: SurveySettings;
  visibility: 'private' | 'organization' | 'system';
}

export interface AuditRow { id: string; actor: string | null; action: string; entityType: string; surveyId: string | null; surveyTitle?: string; createdAt: string; after?: unknown }

export interface MemberRow { userId: string; email: string; name: string; role: 'owner' | 'editor' | 'analyst' }

export interface NewSurveyInput {
  title: string;
  slug: string;
  description?: string;
  category?: string;
  purpose?: string;
  projectId?: string | null;
  schema: SurveySchema;
  settings?: SurveySettings;
  theme?: SurveyTheme;
}

export type SurveyPatch = Partial<Pick<SurveyRow, 'title' | 'slug' | 'description' | 'category' | 'purpose' | 'projectId' | 'draftSchema' | 'settings' | 'theme' | 'startAt' | 'endAt'>>;

export interface AdminApi {
  mode: 'demo' | 'supabase';
  // auth
  currentUser(): Promise<AppUser | null>;
  signIn(email: string, password: string): Promise<AppUser>;
  signUp(email: string, password: string, name: string): Promise<{ needsConfirmation: boolean }>;
  signOut(): Promise<void>;
  // workspace
  listProjects(): Promise<Project[]>;
  createProject(name: string): Promise<Project>;
  listSurveys(): Promise<SurveyRow[]>;
  getSurvey(id: string): Promise<SurveyRow>;
  createSurvey(input: NewSurveyInput): Promise<SurveyRow>;
  updateSurvey(id: string, patch: SurveyPatch): Promise<void>;
  duplicateSurvey(id: string, title: string, slug: string): Promise<string>;
  publish(id: string): Promise<string>;
  setStatus(id: string, status: SurveyStatus): Promise<void>;
  listVersions(surveyId: string): Promise<VersionRow[]>;
  // responses
  listResponses(surveyId: string): Promise<ResponseRecord[]>;
  flagResponse(responseId: string, flag: ResponseFlag, reason: string | null, note?: string | null): Promise<void>;
  getFileUrl(path: string): Promise<string | null>;
  // distribution
  listInvitations(surveyId: string): Promise<InvitationRow[]>;
  createInvitations(surveyId: string, recipients: { name?: string; email?: string; organization?: string }[], expiresAt?: string | null): Promise<InvitationRow[]>;
  revokeInvitation(id: string): Promise<void>;
  // templates
  listTemplates(): Promise<TemplateRow[]>;
  saveTemplate(t: Omit<TemplateRow, 'id' | 'key' | 'visibility'>): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  // admin
  listAudit(surveyId?: string, limit?: number): Promise<AuditRow[]>;
  listMembers(surveyId: string): Promise<MemberRow[]>;
  addMember(surveyId: string, email: string, role: 'editor' | 'analyst'): Promise<void>;
  removeMember(surveyId: string, userId: string): Promise<void>;
  listUsers(): Promise<AppUser[]>;
  setUserRole(userId: string, role: AppUser['role']): Promise<void>;
  uploadMedia(file: File): Promise<string>;
}

export type { PublicApi };
