/** Injectable clock. Compliance rules depend on the hour in IST, so tests and rehearsals can pin it. */
export interface Clock {
  now(): Date;
}

export const IST_OFFSET_MINUTES = 330;

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid clock value: ${iso}`);
  return { now: () => new Date(d.getTime()) };
}

/** Clock from SAATHI_FAKE_NOW if set, else the system clock. */
export function clockFromEnv(env: NodeJS.ProcessEnv = process.env): Clock {
  const v = env.SAATHI_FAKE_NOW;
  return v && v.trim() ? fixedClock(v.trim()) : systemClock;
}

/** Shift a Date to IST wall time, represented as a UTC Date whose getUTC* fields are IST fields. */
export function toIst(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MINUTES * 60_000);
}

export function istHour(d: Date): number {
  const ist = toIst(d);
  return ist.getUTCHours() + ist.getUTCMinutes() / 60;
}

/** YYYY-MM-DD in IST. */
export function istDate(d: Date): string {
  return toIst(d).toISOString().slice(0, 10);
}

/** HH:MM in IST. */
export function istTime(d: Date): string {
  return toIst(d).toISOString().slice(11, 16);
}

/** Build an ISO instant for an IST wall-clock time on a given IST date. */
export function istInstant(dateYmd: string, hh: number, mm = 0): Date {
  const utc = Date.UTC(
    Number(dateYmd.slice(0, 4)),
    Number(dateYmd.slice(5, 7)) - 1,
    Number(dateYmd.slice(8, 10)),
    hh,
    mm,
  );
  return new Date(utc - IST_OFFSET_MINUTES * 60_000);
}

export function addDays(dateYmd: string, days: number): string {
  const d = new Date(`${dateYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.parse(`${fromYmd}T00:00:00Z`);
  const b = Date.parse(`${toYmd}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
