/** Only a safe dialer target, not validation that the number exists or belongs
 * to the reporter. Never infer a profile phone or alter the saved report. */
export function reportContactHref(phone?: string | null): string | null {
  const value = phone?.trim();
  if (!value || value.length > 64 || !/^\+?[0-9 ()-]+$/.test(value)) return null;
  const number = value.replace(/[ ()-]/g, '');
  return /^\+?[0-9]{1,15}$/.test(number) ? `tel:${number}` : null;
}
