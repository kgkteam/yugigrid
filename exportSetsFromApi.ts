import fs from "fs";

const API_URL = "https://db.ygoprodeck.com/api/v7/cardsets.php";

type ApiSetRow = {
  set_name: string;
  set_code: string;   // pl. "LOB", "JUSH"
  num_of_cards: number;
  tcg_date: string;   // "YYYY-MM-DD"
};

type YugiohSet = { code: string; year: number };

function yearFromTcgDate(s: string): number | null {
  if (!s || s.length < 4) return null;
  const y = Number(s.slice(0, 4));
  return Number.isFinite(y) && y > 0 ? y : null;
}

(async () => {
  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);

  const rows = (await res.json()) as ApiSetRow[];

  const map = new Map<string, number>();

  for (const r of rows) {
    const code = r.set_code.split("-")[0].trim();
    const year = yearFromTcgDate(r.tcg_date);
    if (!code || !year) continue;

    const prev = map.get(code);
    if (prev === undefined || year < prev) {
      map.set(code, year);
    }
  }

  const result: YugiohSet[] = Array.from(map.entries())
    .map(([code, year]) => ({ code, year }))
    .sort((a, b) => a.year - b.year || a.code.localeCompare(b.code));

  const out =
`export type YugiohSet = { code: string; year: number };

export const YUGIOH_SETS: YugiohSet[] = ${JSON.stringify(result, null, 2)};
`;

  fs.writeFileSync("yugiohSets.ts", out, "utf8");
  console.log(`✔ ${result.length} set kiírva -> yugiohSets.ts`);
})();
