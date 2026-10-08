import type { ReactNode } from 'react';
import { EmergencyLogo } from './EmergencyLogo';

// Original presentation inspired by the public Sign-in preview on 21st.dev.
// Authentication, navigation and request state remain in LoginPage.
export function AccountPanel({ title, description, children }: {
  title: string; description: string; children: ReactNode;
}) {
  return (
    <section data-auth-panel="original" className="rounded-xl border border-border bg-card px-5 py-7 text-card-foreground sm:px-7 sm:py-8">
      <div className="mb-6 text-center">
        <div className="mb-4 flex justify-center"><EmergencyLogo /></div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}
