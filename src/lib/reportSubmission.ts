import type { Incident } from './services/incidentService';
export type SubmissionStage = 'checking-session' | 'nearby-check' | 'photo-signature' | 'photo-upload' | 'photo-fallback' | 'verify-save';
export const submissionLabels: Record<SubmissionStage, string> = {
  'checking-session': 'Checking your session…', 'nearby-check': 'Checking the reported location…',
  'photo-signature': 'Preparing secure photo upload…', 'photo-upload': 'Uploading your proof photo…',
  'photo-fallback': 'Uploading through the secure fallback…', 'verify-save': 'Verifying the photo and saving your report…',
};
export function submissionIdentity(userId: string, storage?: Pick<Storage, 'getItem'>): string | null {
  try {
    const source = storage ?? localStorage, user = JSON.parse(source.getItem('user') || 'null');
    return user?.id === userId && user.role === 'USER'
      ? JSON.stringify([userId, source.getItem('emergency-session-generation'), source.getItem('emergency-logout-epoch')]) : null;
  } catch { return null; }
}
export function confirmedOwnReport(report: Incident, userId: string) {
  return Boolean(report && report.reportedBy === userId && typeof report.incidentId === 'string' && report.incidentId
    && typeof report.title === 'string' && Number.isFinite(Date.parse(report.reportedAt))
    && ['OPEN','ACTIVE','RESPONDING','RESOLVED','CLOSED','CANCELLED'].includes(report.status));
}
const stages: (SubmissionStage | 'submit-to-confirm' | 'list-refresh')[] = ['checking-session','nearby-check','photo-signature','photo-upload','photo-fallback','verify-save','submit-to-confirm','list-refresh'];
/** Fixed names and durations only, bounded to the latest measure per stage.
 * Never report IDs, GPS, filenames, notes, provider URLs or credentials. */
export function recordSubmissionDuration(stage: typeof stages[number], start: number) {
  try {
    const name = `citizen-report:${stage}`; performance.clearMeasures(name);
    performance.measure(name, { start, end: performance.now() });
  } catch { /* Optional local diagnostics cannot change submission outcome. */ }
}
export function startSubmissionTiming(onStage: (stage: SubmissionStage) => void) {
  const started = performance.now();
  for (const stage of stages) { try { performance.clearMeasures(`citizen-report:${stage}`); } catch {} }
  let current: SubmissionStage | null = null, stepStart = started;
  return {
    move(stage: SubmissionStage) {
      if (current) recordSubmissionDuration(current, stepStart);
      current = stage; stepStart = performance.now(); onStage(stage);
    },
    finish(confirmed = false) {
      if (current) recordSubmissionDuration(current, stepStart);
      current = null;
      if (confirmed) recordSubmissionDuration('submit-to-confirm', started);
    },
  };
}
