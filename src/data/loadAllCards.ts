import type { Card } from "../engine/engine";

function toNum(x: any): number | null {
  if (x === null || x === undefined || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

const API_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php";

// egyszerű cache (session) + localStorage, hogy ne töltsd le újra minden reloadnál
const LS_KEY = "yugigrid_cards_cache_v1";

export async function loadAllCards(): Promise<Card[]> {
  // 1) próbáljuk localStorage-ból
  try {
    const cached = localStorage.getItem(LS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length) return parsed as Card[];
    }
  } catch {
    // ignore
  }

  // 2) API fetch
  const res = await fetch(API_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("YGOPRODeck API failed");

  const raw = await res.json();
  const arr: any[] = Array.isArray(raw?.data) ? raw.data : [];

  // 3) normalizált, KICSI Card objektum (ne tartsd meg az egész raw-ot)
  const cards: Card[] = arr.map((c) => {
    const typeStr = String(c.type ?? "");
    const kind: Card["kind"] =
      typeStr === "Spell Card" ? "spell" :
      typeStr === "Trap Card" ? "trap" :
      "monster";

    return {
      id: c.id,
      name: String(c.name ?? ""),
      desc: c.desc ?? "",

      type: c.type ?? null,
      race: c.race ?? null,
      attribute: c.attribute ?? null,

      // monsterType rule-hoz (nálad engine.ts fallbackel race-re is)
      monsterType: kind === "monster" ? (c.monsterType ?? c.race ?? null) : null,

      atk: toNum(c.atk),
      def: toNum(c.def),
      level: toNum(c.level),
      rank: toNum(c.rank),
      linkRating: toNum(c.linkval ?? c.linkRating),

      xyz: typeStr.includes("Xyz"),
      fusion: typeStr.includes("Fusion"),
      synchro: typeStr.includes("Synchro"),
      link: typeStr.includes("Link"),
      ritual: typeStr.includes("Ritual"),
      pendulum: typeStr.includes("Pendulum"),
      tuner: typeStr.includes("Tuner"),
      effect: typeStr.includes("Effect"),

      kind,

      // rarity rule-hoz elég ennyi (ne tartsd a teljes set objektumot)
      card_sets: Array.isArray(c.card_sets)
        ? c.card_sets.map((s: any) => ({
            set_code: s?.set_code,
            set_rarity: s?.set_rarity,
          }))
        : [],
    } as Card;
  });

  // 4) cache localStorage-ba (ha túl nagy lenne, try/catch úgyis megfogja)
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(cards));
  } catch {
    // ignore (quota)
  }

  return cards;
}
