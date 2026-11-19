import type { ReactNode } from 'react';

/** Tiêu đề trang gọn một dòng: tên trang bên trái, nút thao tác bên phải. */
export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-1 pt-4 sm:px-8">
      <div className="min-w-0">
        <h1 className="text-base font-semibold text-brand-700">{title}</h1>
        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
