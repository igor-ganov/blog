const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

// "2026-05-31" -> "May 31, 2026". Falls back to the raw input on a bad month.
export const formatDate = (iso: string): string => {
  const [year, month, day] = iso.split('-');
  return `${months.at(Number(month) - 1) ?? iso} ${Number(day)}, ${year}`;
};
