const ROME = "Europe/Rome";

export function romeNow(date = new Date()): Date {
  return date;
}

export function romeDayBounds(date = new Date()): { start: Date; end: Date; key: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  // Convert Rome local midnight to UTC by probing offset at that civil date.
  const start = romeCivilToUtc(year, month, day, 0, 0, 0);
  const end = romeCivilToUtc(year, month, day + 1, 0, 0, 0);

  return { start, end, key };
}

function romeCivilToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = tzOffsetMs(new Date(utcGuess), ROME);
  return new Date(utcGuess - offsetMs);
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second,
  );
  return asUtc - date.getTime();
}

export function formatRomeDate(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export function formatRomeDay(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export const ROME_TZ = ROME;
