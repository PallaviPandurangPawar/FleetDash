import type { ReactNode } from 'react';

interface Props {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
}

export function DashboardLayout({ header, sidebar, children }: Props) {
  return (
    <div className="app-shell">
      {header}
      <div className="layout-body">
        {sidebar}
        <div className="main-content">{children}</div>
      </div>
    </div>
  );
}
