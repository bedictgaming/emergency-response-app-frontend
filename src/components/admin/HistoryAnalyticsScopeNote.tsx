/** Rankings and monthly analytics are independent of paginated history filters. */
export default function HistoryAnalyticsScopeNote() {
  return (
    <p className="text-sm text-muted-foreground">
      Rankings cover all-time verified reports in your authorized scope. Unverified, rejected, cancelled and confirmed-false reports are excluded.
      {" "}Report month changes only the monthly card; history filters change only the report list.
    </p>
  );
}
