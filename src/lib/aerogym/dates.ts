const INDIA_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getIndiaDayRange(date = new Date()) {
  const indiaDate = new Date(date.getTime() + INDIA_OFFSET_MS).toISOString().slice(0, 10);
  const start = new Date(`${indiaDate}T00:00:00.000+05:30`);
  const end = new Date(start.getTime() + DAY_MS);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    date: indiaDate,
  };
}
