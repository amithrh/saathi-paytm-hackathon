/**
 * Spoken-number audit. The model may phrase amounts, never compute them: every integer of 100 or more
 * that Saathi speaks must appear somewhere in a tool result it has seen on this call.
 */

/** Integers >= 100 in the text, with Indian or Western digit grouping removed. Years embedded in ISO dates are ignored. */
export function spokenAmounts(text: string): number[] {
  const cleaned = text.replace(/\d{4}-\d{2}-\d{2}/g, " ");
  const out: number[] = [];
  for (const m of cleaned.matchAll(/(?<![\d.])\d{1,3}(?:,\d{2,3})+|\d+/g)) {
    const n = Number(m[0].replace(/,/g, ""));
    if (Number.isFinite(n) && n >= 100) out.push(n);
  }
  return out;
}

/** Every number reachable in a tool result: numeric values, numeric strings, numbers inside strings. */
export function numbersInResult(result: unknown, acc = new Set<number>()): Set<number> {
  if (typeof result === "number") {
    if (Number.isFinite(result)) acc.add(Math.round(result));
  } else if (typeof result === "string") {
    for (const n of spokenAmounts(result)) acc.add(n);
  } else if (Array.isArray(result)) {
    for (const v of result) numbersInResult(v, acc);
  } else if (result && typeof result === "object") {
    for (const v of Object.values(result as Record<string, unknown>)) numbersInResult(v, acc);
  }
  return acc;
}

export interface NumberAudit {
  spoken: number[];
  unbacked: number[];
}

export function auditSpokenNumbers(speech: string, backing: Set<number>): NumberAudit {
  const spoken = [...new Set(spokenAmounts(speech))];
  return { spoken, unbacked: spoken.filter((n) => !backing.has(n)) };
}
