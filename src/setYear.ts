import { CARDSETS } from "./cardsets";

const YEAR_BY_SET = new Map<string, number>();

for (const s of CARDSETS) {
  const y = Number(String(s.tcg_date ?? "").slice(0, 4));
  if (!Number.isFinite(y)) continue;

  // ha duplikált a set_code, mindegy – ugyanaz az év nálad
  if (!YEAR_BY_SET.has(s.set_code)) YEAR_BY_SET.set(s.set_code, y);
}

export function getSetYearByCode(setCode: string): number | null {
  // "JUSH-EN001" -> "JUSH"
  const prefix = String(setCode).split("-")[0]?.trim();
  if (!prefix) return null;
  return YEAR_BY_SET.get(prefix) ?? null;
}
