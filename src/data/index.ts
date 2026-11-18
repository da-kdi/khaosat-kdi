import type { AdminApi, PublicApi } from './types';
import { demoAdmin, demoPublic } from './demo';
import { createSupabaseApis } from './supabase';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isDemo = !(url && key);

const apis = isDemo ? { admin: demoAdmin, pub: demoPublic } : createSupabaseApis(url!, key!);

export const api: AdminApi = apis.admin;
export const publicApi: PublicApi = apis.pub;

export function publicSurveyUrl(slug: string, token?: string): string {
  const base = (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined) || window.location.origin + import.meta.env.BASE_URL;
  return `${base.replace(/\/$/, '')}/s/${slug}${token ? `?t=${encodeURIComponent(token)}` : ''}`;
}

export * from './types';
