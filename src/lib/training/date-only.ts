export function formatDateOnly(value: string | null) {
  if (!value) return "—";
  const calendar = value.slice(0, 10);
  const [year, month, day] = calendar.split("-").map(Number);
  if (!year || !month || !day) return calendar;
  return `${month}/${day}/${year}`;
}
