// Presentation only. The existing authenticated report APIs remain authority.
export type ReportPinReviewControl = {
  onOpen: () => void;
  busy: boolean;
  flagStatus?: 'PENDING' | 'CONFIRMED';
};
