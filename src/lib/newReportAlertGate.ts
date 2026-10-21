type Report = { incidentId: string; reportedAt: string; pendingNearbyReview?: boolean };

// A presentation-only gate, not acknowledgement or authorization. The server's
// first successful observation establishes a quiet baseline, including older
// records that may only become visible later in the bounded attention queue.
export class NewReportAlertGate {
  private baseline: number | null = null;
  private seen = new Set<string>();

  observe(items: Report[], observedAt?: string): Set<string> {
    if (this.baseline === null) {
      const time = Date.parse(observedAt ?? '');
      if (!Number.isFinite(time)) return new Set();
      this.baseline = time;
      items.forEach(item => this.seen.add(item.incidentId));
      return new Set();
    }
    const arrived = new Set<string>();
    for (const item of items) {
      // Status/version changes, disappearing/reappearing rows and catch-up
      // pagination are not new citizen submissions. Never use the device clock.
      if (!item.pendingNearbyReview && !this.seen.has(item.incidentId) && Date.parse(item.reportedAt) > this.baseline) arrived.add(item.incidentId);
      this.seen.add(item.incidentId);
    }
    return arrived;
  }
}
