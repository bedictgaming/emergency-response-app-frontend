/* eslint-disable @next/next/no-img-element -- small local brand asset with fixed dimensions, no image optimization service needed */

// Adjacent brand text supplies the accessible name; don't announce it twice.
export function EmergencyLogo({ size = 40 }: { size?: 32 | 40 }) {
  return (
    <img
      src="/emergency-icon.png"
      alt=""
      aria-hidden="true"
      fetchPriority="low"
      width={size}
      height={size}
      className="shrink-0 rounded-full object-contain"
    />
  );
}
