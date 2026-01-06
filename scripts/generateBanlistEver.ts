// scripts/generateBanlistEver.ts
import fs from "node:fs";
import path from "node:path";
import { load } from "cheerio";
import type { Element } from "domhandler";

const OUT = path.resolve("src/data/banlistEver.ts");

// ⬇️ Local Yugipedia HTML-ek (browserből lementve)
const FILES = [
  path.resolve("scripts/yugipedia/tcg_2002_2010.html"),
  path.resolve("scripts/yugipedia/tcg_2011_2020.html"),
  path.resolve("scripts/yugipedia/tcg_2021_now.html"),
];

// cards_min.json-t a buildCardsMin script generálja
const CARDS_PATH = path.resolve("src/data/cards_min.json");
const CARDS_MIN = JSON.parse(fs.readFileSync(CARDS_PATH, "utf8")) as Array<{
  id: number;
  name: string;
}>;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const nameToId = new Map<string, number>();
for (const c of CARDS_MIN) nameToId.set(norm(c.name), Number(c.id));

function readLocalHtml(filePath: string): string {
  if (!fs.existsSync(filePath)) throw new Error(`Missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} @ ${url}`);
  return res.text();
}

/**
 * Yugipedia "Historic TCG Limitations Chart" (local HTML export)
 * - a táblában soronként egy kártya, oszlopokban évek
 * - cellák jelölése lehet:
 *   - class: status-0/status-1/status-2/status-3 (régi)
 *   - vagy class: status-forbidden/status-limited/status-semi-limited (újabb)
 *   - vagy text: 0/1/2 (néha)
 */
function parseEverBanlistedNamesFromYugipedia(html: string): string[] {
  const $ = load(html);

  // legnagyobb wikitable kiválasztása (chart)
  let bestTable: ReturnType<typeof $> | null = null;
  let bestScore = -1;

  $("table.wikitable").each((_i: number, tbl: Element) => {
    const $tbl = $(tbl);
    const rows = $tbl.find("tr").length;
    const cols = $tbl.find("tr").first().find("th,td").length;
    const score = rows * cols;
    if (score > bestScore) {
      bestScore = score;
      bestTable = $tbl;
    }
  });

  if (!bestTable) throw new Error("No wikitable found.");
  const $table = bestTable;

  const everNames: string[] = [];

  $table.find("tr").each((_i: number, tr: Element) => {
    const $tr = $(tr);

    // kártyanév: sor első TH-ja (row header)
    const nameRaw = $tr.find("th").first().text();
    const name = nameRaw.replace(/\s+/g, " ").trim();

    // státusz cellák: a TD-k (év oszlopok)
    const tds = $tr.find("td");
    if (!name || !tds.length) return;

    let hit = false;

    tds.each((_j: number, td: Element) => {
      const $cell = $(td);
      const cls = ($cell.attr("class") || "").toLowerCase();
      const text = $cell.text().trim();

      // NUMERIC STATUS CLASSES (régi chartok)
      if (
        cls.includes("status-0") || // Forbidden
        cls.includes("status-1") || // Limited
        cls.includes("status-2") // Semi-Limited
      ) {
        hit = true;
        return false; // break
      }

      // TEXT / NAMED CLASSES (újabb chartok)
      if (
        text === "0" ||
        text === "1" ||
        text === "2" ||
        cls.includes("status-forbidden") ||
        cls.includes("status-limited") ||
        cls.includes("status-semi-limited")
      ) {
        hit = true;
        return false; // break
      }
    });

    if (hit) everNames.push(name);
  });

  return everNames;
}

/**
 * Konami DB (online) 2012+ dátum listákból próbál "ever" halmazt bővíteni.
 * NOTE: nálad látszott, hogy a listák oldalán nincs érdemi card link (cid links: 0),
 * de ez a rész maradhat, ha később működni kezd / más locale-lal működik.
 */
async function addKonami2012PlusEverIds(everIds: Set<number>, missing: string[]) {
  const BASE =
    "https://www.db.yugioh-card.com/yugiohdb/forbidden_limited.action?request_locale=en";

  console.log("Fetching Konami DB base page (2012+ dates)...");
  const baseHtml = await fetchText(BASE);
  const $ = load(baseHtml);

  const dates = new Set<string>();
  $("option").each((_i: number, el: Element) => {
    const v = $(el).attr("value");
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) dates.add(v);
  });

  const dateList = [...dates];
  console.log("Konami dates found:", dateList.length);

  for (const d of dateList) {
    console.log("Konami →", d);

    const html = await fetchText(`${BASE}&forbiddenLimitedDate=${d}`);
    const $$ = load(html);

    // Konami oldalon jellemzően "cid=" (ha van)
    let $links = $$('a[href*="cid="]');
    console.log("  cid links:", $links.length);

    if ($links.length > 500) {
      $links = $links.filter((_i: number, a: Element) => {
        const href = $$(a).attr("href") || "";
        return href.includes("cid=");
      });
      console.log("  refined cid links:", $links.length);
    }

    // fallback: ha 0, próbáljuk a card_search.action linkeket
    if ($links.length === 0) {
      $links = $$('a[href*="card_search.action"]');
      console.log("  fallback card_search.action links:", $links.length);
    }

    $links.each((_i: number, a: Element) => {
      const nm = $$(a).text().replace(/\s+/g, " ").trim();
      if (!nm) return;

      const id = nameToId.get(norm(nm));
      if (id) everIds.add(id);
      else missing.push(nm);
    });

    // throttle (stabil)
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
  }
}

async function main() {
  console.log("Loading cards_min.json:", CARDS_MIN.length);

  const everIds = new Set<number>();
  const missing: string[] = [];

  // 1) Yugipedia (local) — 2002–>
  for (const filePath of FILES) {
    console.log("Reading:", filePath);
    const html = readLocalHtml(filePath);

    const names = parseEverBanlistedNamesFromYugipedia(html);
    console.log("  names (ever hit):", names.length);

    for (const name of names) {
      const id = nameToId.get(norm(name));
      if (id) everIds.add(id);
      else missing.push(name);
    }
  }

  // 2) Konami DB (online) — 2012+ dátumos listák (opcionális bővítés)
  await addKonami2012PlusEverIds(everIds, missing);

  const sorted = [...everIds].sort((a, b) => a - b);

  const content = `// ⚠️ AUTO-GENERATED FILE – DO NOT EDIT
// Generated at ${new Date().toISOString()}
// Sources: Yugipedia Historic TCG Limitations Chart (local HTML) + Konami DB (2012+)

export const BANLIST_EVER_IDS = new Set<number>([
${sorted.map((id) => `  ${id},`).join("\n")}
]);
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, content, "utf8");

  console.log(`DONE → ${OUT}`);
  console.log(`IDs: ${sorted.length}`);
  console.log(`Missing count: ${missing.length}`);
  if (missing.length) console.log("Missing sample:", missing.slice(0, 30));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
