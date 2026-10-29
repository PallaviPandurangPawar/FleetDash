// Frontend/src/components/layout/DashboardLayout.tsx
// Week 1: header + sidebar + map area layout

import { ReactNode } from 'react';

interface Props {
    header: ReactNode;
    sidebar: ReactNode;
    children: ReactNode;
}



export function DashboardLayout({ header, sidebar, children }: Props) {
    return (
        <div className="layout">
            {header}
            <div className="layout-body">{sidebar} {children}</div>
        </div>
    ); 
}