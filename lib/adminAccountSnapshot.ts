// This is only for discarding stale UI results after a browser-profile account
// switch. API authorization still comes exclusively from the backend session.
export function adminAccountSnapshot(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const user = JSON.parse(localStorage.getItem('user') ?? 'null');
    if (typeof user?.id !== 'string') return null;
    return `${user.id}:${user.role ?? ''}:${user.department ?? ''}`;
  } catch {
    return null;
  }
}
