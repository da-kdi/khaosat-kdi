import type { CSSProperties } from 'react';
import type { SurveyTheme } from '@core/index.ts';

export const THEME_PRESETS: Record<string, { label: string; primary: string; accent: string; background: string }> = {
  kdi: { label: 'KDI Default', primary: '#154b98', accent: '#faa934', background: '#f6f8fc' },
  education: { label: 'Education', primary: '#154b98', accent: '#faa934', background: '#fdf8ef' },
  professional: { label: 'Professional', primary: '#1e293b', accent: '#2563eb', background: '#f8fafc' },
  feedback: { label: 'Customer Feedback', primary: '#0f766e', accent: '#f59e0b', background: '#f0fdfa' },
  event: { label: 'Event Registration', primary: '#7c3aed', accent: '#f97316', background: '#faf5ff' },
  research: { label: 'Research', primary: '#334155', accent: '#0ea5e9', background: '#ffffff' },
  minimal: { label: 'Minimal', primary: '#111827', accent: '#111827', background: '#ffffff' },
};

export function resolveTheme(t: SurveyTheme = {}) {
  const base = THEME_PRESETS[t.preset ?? 'kdi'] ?? THEME_PRESETS.kdi;
  return {
    primary: t.primary || base.primary,
    accent: t.accent || base.accent,
    background: t.background || base.background,
    logoUrl: t.logoUrl || '/brand/kdi-logo.png',
    coverUrl: t.coverUrl || '',
    font: t.font ?? 'be-vietnam',
  };
}

export function themeStyle(t: SurveyTheme = {}): CSSProperties {
  const r = resolveTheme(t);
  return {
    ['--survey-primary' as string]: r.primary,
    ['--survey-accent' as string]: r.accent,
    ['--survey-bg' as string]: r.background,
    background: r.background,
    fontFamily: r.font === 'serif' ? 'Georgia, "Times New Roman", serif' : r.font === 'system' ? 'system-ui, sans-serif' : undefined,
  };
}

/** Embeddable video sources (allowlist). Anything else renders as a link. */
export function parseVideo(url: string): { kind: 'youtube' | 'vimeo' | 'file' | 'link'; id?: string; embed?: string; thumb?: string } {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
      const id = host === 'youtu.be' ? u.pathname.slice(1) : u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
      if (id && /^[\w-]{6,20}$/.test(id)) return { kind: 'youtube', id, embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
      const id = u.pathname.split('/').filter(Boolean).pop();
      if (id && /^\d+$/.test(id)) return { kind: 'vimeo', id, embed: `https://player.vimeo.com/video/${id}?autoplay=1` };
    }
    if (/\.(mp4|webm|ogg)$/i.test(u.pathname) && u.protocol === 'https:') return { kind: 'file', embed: url };
  } catch { /* not a URL */ }
  return { kind: 'link' };
}

export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:' || u.protocol === 'tel:';
  } catch {
    return url.startsWith('data:image/');
  }
}
