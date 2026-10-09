import { Mail, User } from 'lucide-react';

/** Display only the reporter returned by the existing scoped incident API. */
export default function ReporterIdentity({ name, email }: { name?: string | null; email?: string | null }) {
  return (
    <div className="min-w-0 space-y-1.5 text-sm text-gray-600" data-reporter-identity>
      <div className="flex items-start gap-2.5">
        <User size={14} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
        <span className="min-w-0 [overflow-wrap:anywhere]">Reporter: <strong>{name?.trim() || 'Citizen'}</strong></span>
      </div>
      <div className="flex items-start gap-2.5">
        <Mail size={14} className="mt-0.5 shrink-0 text-gray-400" aria-hidden="true" />
        <span className="min-w-0 [overflow-wrap:anywhere]">Email: <span className="text-gray-800" data-reporter-email>{email?.trim() || 'Not provided'}</span></span>
      </div>
    </div>
  );
}
