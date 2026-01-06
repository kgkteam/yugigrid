import fs from "node:fs";
import path from "node:path";

type CardApi = { id: number; name: string };

const OUT = path.resolve("src/data/cards_min.ts");

async function main() {
  const url = "https://db.ygoprodeck.com/api/v7/cardinfo.php";

  const res = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

  const json = (await res.json()) as { data: CardApi[] };
  if (!json?.data?.length) throw new Error("No cards returned from API");

  const min = json.data.map((c) => ({ id: Number(c.id), name: String(c.name) }));

  const OUT_JSON = path.resolve("src/data/cards_min.json");
    fs.writeFileSync(OUT_JSON, JSON.stringify(min), "utf8");
    console.log(`DONE → ${OUT_JSON}`);


  const content = `// ⚠️ AUTO-GENERATED FILE – DO NOT EDIT
// Generated at ${new Date().toISOString()}

export const CARDS_MIN: Array<{ id: number; name: string }> = ${JSON.stringify(min, null, 2)};
`;

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, content, "utf8");

  console.log(`DONE → ${OUT}`);
  console.log(`Cards: ${min.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
