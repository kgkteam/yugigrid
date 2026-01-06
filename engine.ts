// engine.ts — pure logic, no UI
import { DEBUG_RULES_ENABLED, DEBUG_RULES } from "./debugRules";
import { getSetYearByCode } from "./src/setYear";
import { BANLIST_EVER_IDS } from "./src/data/banlistEver";


export type RNG = () => number;
export interface SeedObj {
  s: string;
  n: number;
}


export function dateSeed(): SeedObj {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const s = `${yyyy}${mm}${dd}`;
  return { s, n: Number(s) };
}



export type RuleOp =
  | "eq" | "neq"
  | "lower" | "higher" | "lowerEq" | "higherEq"
  | "contains" | "between" | "wordCount" | "special" ;

export type RuleKey =
  | "all" | "any"
  | "level" | "rank" | "linkRating"
  | "monsterType" | "type" | "race"
  | "spellType" | "trapType" | "kind"
  | "attribute" | "tuner" | "effect" | "ritual" | "pendulum" | "flip"
  | "xyz" | "fusion" | "synchro" | "link"
  | "desc" | "setYear" | "firstSetYear" | "hasRarity" | "banlistEver"
  | string;

export interface Rule {
  key: RuleKey;
  op?: RuleOp;
  value?: unknown;
  value2?: unknown;
  label?: string;
}

export type CardKind = "monster" | "spell" | "trap";

export interface CardSet {
  set_name?: string;
  set_code?: string;
  set_rarity?: string;
  set_rarity_code?: string;
  set_price?: string;
}

export interface Card {
  id: number | string;
  name: string;
  desc: string;

  // API-ish / normalized fields (some optional)
  type?: string;
  race?: string | null;
  attribute?: string | null;
  monsterType?: string | null;
  atk?: number | null;
  def?: number | null;

  level?: number | null;
  rank?: number | null;
  linkRating?: number | null;

  xyz?: boolean;
  fusion?: boolean;
  synchro?: boolean;
  link?: boolean;
  ritual?: boolean;
  pendulum?: boolean;
  tuner?: boolean;
  flip?: boolean;

  effect?: boolean | null;
  normal?: boolean | null;

  kind?: CardKind;
  spellType?: string | null;
  trapType?: string | null;

  extraDeck?: boolean;
  mainDeck?: boolean;

  meta?: string;
  info?: string;
  setYears?: number[];

  // ✅ rarity print-ek ehhez kellenek
  card_sets?: CardSet[];

  // allow extra keys
  [k: string]: unknown;
}


/* =========================
   RNG + SEED
   ========================= */

export function mulberry32(a: number): RNG {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* =========================
   DAY TYPE (single source of truth)
   ========================= */

export type DayType = "Monster" | "Spell/Trap";

/**
 * Egyetlen közös forrás arra, hogy Monster nap van-e vagy Spell/Trap nap.
 * Alap: a dateSeed().s (YYYYMMDD), tehát "a rendszer napja".
 *
 * Szabály (könnyen átírható):
 * - páros DD = Spell/Trap
 * - páratlan DD = Monster
 */
export function getSystemDayType(): DayType {
  const { s, n } = dateSeed();

  // Ha YYYYMMDD, akkor a nap számából döntünk
  if (/^\d{8}$/.test(s)) {
    const dd = Number(s.slice(6, 8));
    return (dd % 2 === 0) ? "Spell/Trap" : "Monster";
  }

  // Custom seed fallback: parity a számon
  return (Number.isFinite(n) && n % 2 === 0) ? "Spell/Trap" : "Monster";
}

export function isSpellTrapDay(): boolean {
  return getSystemDayType() === "Spell/Trap";
}

export function getSystemDayLabel(): string {
  // UI-hoz: pl. Monday/Tuesday...
  const { s } = dateSeed();
  if (/^\d{8}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    const dt = new Date(y, m - 1, d); // local, ugyanúgy mint dateSeed()
    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    return dayNames[dt.getDay()];
  }
  return "Day";
}
function isSpellOrTrap(card: Card | null | undefined): boolean {
  return card?.type === "Spell Card" || card?.type === "Trap Card";
}

/* =========================
   MATCHING
   ========================= */

export function matches(card: Card, rule: Rule): boolean {
  if (!rule) return false;

  let v: unknown;

  switch (rule.key) {
    case "level":
      v = card?.level;
      break;

    case "rank":
      v = card?.rank;
      break;

    case "linkRating":
      v = card?.linkRating;
      break;

    case "monsterType":
      v = card?.monsterType;
      break;

    case "type":
      v = card?.type;
      break;

    case "race":
      if (!isSpellOrTrap(card)) return false;
      v = card?.race;
      break;

    case "spellType":
      if (card?.type !== "Spell Card") return false;
      v = card?.race; // YGOPRODeck: spell "race" = Spell Type (Quick-Play, Field, etc.)
      break;

    case "trapType":
      if (card?.type !== "Trap Card") return false;
      v = card?.race; // YGOPRODeck: trap "race" = Trap Type (Normal, Counter, Continuous)
      break;


    case "nameLength":
      v = card?.name.length;
      break;

    case "descLength":
      v = card?.desc.length;
      break;

    case "ATK":
      v = card?.atk;
      break;

    case "DEF":
      v = card?.def;
      break;

    case "setYear":
      v = (card as any)?.setYears ?? null;
      break;

    case "firstSetYear": {
      const ys = (card as any)?.setYears;
      v = Array.isArray(ys) && ys.length ? ys[0] : null;
      break;
      }

    case "banlistEver": {
      const idNum = Number((card as any).id);
      if (!Number.isFinite(idNum)) return false;

      return rule.value === true
        ? BANLIST_EVER_IDS.has(idNum)
        : !BANLIST_EVER_IDS.has(idNum);

    }

    case "hasRarity": {
      const target = String(rule.value ?? "");
      const sets = (card as any).card_sets;

      if (!target || !Array.isArray(sets)) return false;

      // op eq / contains támogatás
      if (rule.op === "contains") {
        const t = target.toLowerCase();
        return sets.some((s: any) =>
          typeof s?.set_rarity === "string" &&
          s.set_rarity.toLowerCase().includes(t)
        );
      }

      // default: eq
      return sets.some((s: any) => s?.set_rarity === target);
    }

    


    default:
      v = (card as Record<string, unknown>)[String(rule.key)];
  }

  if (v === undefined || v === null) return false;

  const op = rule.op;
  const value = rule.value;
  const value2 = rule.value2;

  // ✅ setYear (setYears): elég ha BÁRMELYIK év passzol
  if (Array.isArray(v)) {
    const years = v as number[];

    return years.some((year) => {
      if (op === "eq") return year === value;
      if (op === "neq") return year !== value;

      if (op === "lower") return typeof value === "number" && year < value;
      if (op === "higher") return typeof value === "number" && year > value;
      if (op === "lowerEq") return typeof value === "number" && year <= value;
      if (op === "higherEq") return typeof value === "number" && year >= value;

      if (op === "between") {
        return (
          typeof value === "number" &&
          typeof value2 === "number" &&
          year >= value &&
          year <= value2
        );
      }

      return false;
    });
  }

  // ✅ innentől a “normál” (nem tömb) mezők
  if (op === "eq") return v === value;
  if (op === "neq") return v !== value;

  if (op === "lower") return typeof v === "number" && typeof value === "number" && v < value;
  if (op === "higher") return typeof v === "number" && typeof value === "number" && v > value;
  if (op === "lowerEq") return typeof v === "number" && typeof value === "number" && v <= value;
  if (op === "higherEq") return typeof v === "number" && typeof value === "number" && v >= value;

  if (op === "between") {
    return (
      typeof v === "number" &&
      typeof value === "number" &&
      typeof value2 === "number" &&
      v >= value &&
      v <= value2
    );
  }

  if (op === "wordCount") return typeof v === "string" && v.split(" ").length === value;

  if (op === "special") return typeof v === "string" && /[^a-zA-Z\s]/.test(v);

  if (op === "contains") {
    if (typeof v !== "string") return false;
    const t = v.toLowerCase();
    const v1 = String(value ?? "").toLowerCase();
    const v2 = value2 ? String(value2).toLowerCase() : null;
    return v2 ? t.includes(v1) || t.includes(v2) : t.includes(v1);
  }

  return false;
}


export function matchesCell(card: Card, rowRule: Rule, colRule: Rule): boolean {
  return matches(card, rowRule) && matches(card, colRule);
}

/* =========================
   SOLUTION COUNTS
   ========================= */

export function countSolutionsForCell(
  activeCards: Card[],
  rowRule: Rule,
  colRule: Rule
): number {
  let cnt = 0;
  for (const card of activeCards) {
    if (matchesCell(card, rowRule, colRule)) cnt++;
  }
  return cnt;
}

export function recomputeAllCellCounts(
  activeCards: Card[],
  rows: Rule[],
  cols: Rule[]
): number[][] {
  const out = Array.from({ length: 3 }, () => Array(3).fill(0)) as number[][];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r][c] = countSolutionsForCell(activeCards, rows[r], cols[c]);
    }
  }
  return out;
}

export function pickRules(rand: RNG, pool: Rule[], n: number): Rule[] {

  const idxs = pool.map((_, i) => i);
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  return idxs.slice(0, n).map((i) => pool[i]);
}

/* =========================
   RULE COMPATIBILITY
   ========================= */

function isTypeRule(rule: Rule, value: string): boolean {
  return rule.key === "type" && rule.op === "eq" && rule.value === value;
}

function isSpellTrapRule(rule: Rule): boolean {
  if (!rule) return false;
  if (rule.key === "race") return true;
  if (rule.key === "spellType" || rule.key === "trapType") return true;
  if (
    rule.key === "kind" &&
    rule.op === "eq" &&
    (rule.value === "spell" || rule.value === "trap")
  )
    return true;
  if (
    rule.key === "type" &&
    rule.op === "eq" &&
    (rule.value === "Spell Card" || rule.value === "Trap Card")
  )
    return true;
  return false;
}

/* ---------- overlap helpers (LEVEL) ---------- */

function levelInterval(rule: Rule): [number, number] | null {
  if (rule.key !== "level") return null;

  const op = rule.op;
  const v1 = typeof rule.value === "number" ? rule.value : null;
  const v2 = typeof rule.value2 === "number" ? rule.value2 : null;

  if (op === "eq" && v1 != null) return [v1, v1];
  if (op === "between" && v1 != null && v2 != null)
    return [Math.min(v1, v2), Math.max(v1, v2)];

  // nálad: "Level 5 or higher" = op:"higher", value:4
  if (op === "higher" && v1 != null) return [v1 + 1, Number.POSITIVE_INFINITY];
  if (op === "higherEq" && v1 != null) return [v1, Number.POSITIVE_INFINITY];

  if (op === "lower" && v1 != null) return [Number.NEGATIVE_INFINITY, v1 - 1];
  if (op === "lowerEq" && v1 != null) return [Number.NEGATIVE_INFINITY, v1];

  return null;
}

function intervalsOverlap(a: [number, number], b: [number, number]): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/* ---------- overlap helpers (ATK/DEF) ---------- */

function numInterval(rule: Rule, key: string): [number, number] | null {
  if (rule.key !== key) return null;

  const op = rule.op;
  const v1 = typeof rule.value === "number" ? rule.value : null;
  const v2 = typeof rule.value2 === "number" ? rule.value2 : null;

  if (op === "eq" && v1 != null) return [v1, v1];

  // between: inclusive
  if (op === "between" && v1 != null && v2 != null) {
    return [Math.min(v1, v2), Math.max(v1, v2)];
  }

  // IMPORTANT: nálad pl:
  // ATK higher 2999 => "3000 or higher" => [3000, +inf]
  if (op === "higher" && v1 != null) return [v1 + 1, Number.POSITIVE_INFINITY];
  if (op === "higherEq" && v1 != null) return [v1, Number.POSITIVE_INFINITY];

  // ATK lower 3001 => "3000 or lower" => [-inf, 3000]
  if (op === "lower" && v1 != null) return [Number.NEGATIVE_INFINITY, v1 - 1];
  if (op === "lowerEq" && v1 != null) return [Number.NEGATIVE_INFINITY, v1];

  return null;
}


/* ---------- main ---------- */

function rulesCompatibleSimple(a: Rule, b: Rule): boolean {
  if (!a || !b) return false;

  // ugyanaz a key alapból oké, kivéve ha teljesen ugyanaz a rule (duplikátum)
  if (a.key === b.key && a.op === b.op && a.value === b.value && a.value2 === b.value2) return false;


  if (a.key === "desc" || b.key === "desc") {
    return a.value !== b.value;
  }

  if (isTypeRule(a, "Spell Card") && isTypeRule(b, "Trap Card")) return false;
  if (isTypeRule(a, "Trap Card") && isTypeRule(b, "Spell Card")) return false;

  if (a.key === "race" || b.key === "race") return false;

  const A_isST = isSpellTrapRule(a);
  const B_isST = isSpellTrapRule(b);

  if (a.key === "level" && (b.key === "rank" || b.key === "linkRating" || B_isST)) return false;
  if (b.key === "level" && (a.key === "rank" || a.key === "linkRating" || A_isST)) return false;

  if (a.key === "monsterType" && (B_isST || b.key === "monsterType")) return false;
  if (b.key === "monsterType" && (A_isST || a.key === "monsterType")) return false;

  if (a.key === "attribute" && (B_isST || b.key === "attribute")) return false;
  if (b.key === "attribute" && (A_isST || a.key === "attribute")) return false;

  if (a.key === "tuner" && (b.key === "rank" || b.key === "linkRating" || b.key === "tuner" || B_isST)) return false;
  if (b.key === "tuner" && (a.key === "rank" || a.key === "linkRating" || a.key === "tuner" || A_isST)) return false;

  if (a.key === "linkRating" && (b.key === "rank" || b.key === "level" || b.key === "tuner" || B_isST)) return false;
  if (b.key === "linkRating" && (a.key === "rank" || a.key === "level" || a.key === "tuner" || A_isST)) return false;

  if (a.key === "effect" && B_isST) return false;
  if (b.key === "effect" && A_isST) return false;

  if (a.key === "ritual" && (b.key === "rank" || b.key === "tuner" || B_isST)) return false;
  if (b.key === "ritual" && (a.key === "rank" || a.key === "tuner" || A_isST)) return false;

  if (a.key === "pendulum" && B_isST) return false;
  if (b.key === "pendulum" && A_isST) return false;

  if (a.key === "flip" && b.key === "rank") return false;
  if (b.key === "flip" && a.key === "rank") return false;

  if (isTypeRule(a, "XYZ Monster") && (b.key === "level" || b.key === "linkRating")) return false;
  if (isTypeRule(b, "XYZ Monster") && (a.key === "level" || a.key === "linkRating")) return false;

  if (isTypeRule(a, "Link Monster") && (b.key === "level" || b.key === "rank")) return false;
  if (isTypeRule(b, "Link Monster") && (a.key === "level" || a.key === "rank")) return false;

  // setYear vs firstSetYear: ne ütközzenek ugyanabban a cellában
  if (a.key === "setYear" && b.key === "firstSetYear") return false;
  if (a.key === "firstSetYear" && b.key === "setYear") return false;

  // ✅ LEVEL vs LEVEL: csak átfedést tilt
  if (a.key === "level" && b.key === "level") {
    const ia = levelInterval(a);
    const ib = levelInterval(b);
    if (ia && ib && intervalsOverlap(ia, ib)) return false;
  }

    // ✅ ATK vs ATK: csak átfedést tilt
  if (a.key === "ATK" && b.key === "ATK") {
    const ia = numInterval(a, "ATK");
    const ib = numInterval(b, "ATK");
    if (ia && ib && intervalsOverlap(ia, ib)) return false;
  }

  // ✅ DEF vs DEF: csak átfedést tilt
  if (a.key === "DEF" && b.key === "DEF") {
    const ia = numInterval(a, "DEF");
    const ib = numInterval(b, "DEF");
    if (ia && ib && intervalsOverlap(ia, ib)) return false;
  }


  return true;
}


export function rulesCompatible(a: Rule, b: Rule): boolean {
  if (!rulesCompatibleSimple(a, b)) return false;
  return true;
}

/* =========================
   RULE POOLS
   ========================= */

function isSpellTrapishRule(rule: Rule): boolean {
  if (!rule) return false;

  if (rule.key === "desc") return true;
  if (rule.key === "race") return true;
  if (rule.key === "spellType") return true;
  if (rule.key === "trapType") return true;

  if (rule.key === "kind" && rule.op === "eq" &&
      (rule.value === "spell" || rule.value === "trap")) return true;

  if (rule.key === "type" && rule.op === "eq" &&
      (rule.value === "Spell Card" || rule.value === "Trap Card")) return true;

  return false;
}

export function buildRulePools(rulePool: Rule[]): { spellTrapPool: Rule[]; monsterPool: Rule[] } {
  const spellTrapPool = rulePool.filter((r) => r && isSpellTrapishRule(r));
  const monsterPool = rulePool.filter((r) => r && (!isSpellTrapishRule(r) || r.key === "desc"));
  return { spellTrapPool, monsterPool };
}

/* =========================
   GENERATION
   ========================= */

export interface PickNonCollidingOpts {
  rand: RNG;
  poolRows: Rule[];
  poolCols: Rule[];
  activeCards: Card[];
  minSolutionsPerCell?: number;
  maxTries?: number;
}

export interface PickNonCollidingResult {
  rows: Rule[];
  cols: Rule[];
  cellCounts: number[][];
  tries: number;
}

export function pickNonColliding({
  rand,
  poolRows,
  poolCols,
  activeCards,
  minSolutionsPerCell = 10,
  maxTries = 8000,
}: PickNonCollidingOpts): PickNonCollidingResult {
  for (let tries = 0; tries < maxTries; tries++) {

    const isLocalhost =
    typeof location !== "undefined" &&
    (location.hostname === "localhost" || location.hostname === "127.0.0.1");

  // ✅ csak localban engedjük, deployban véletlen se
    if (DEBUG_RULES_ENABLED && isLocalhost) {
    return {
      rows: DEBUG_RULES.rows,
      cols: DEBUG_RULES.cols,
      cellCounts: recomputeAllCellCounts(activeCards, DEBUG_RULES.rows, DEBUG_RULES.cols),
        tries,
    };
  }

    const rows = pickRules(rand, poolRows, 3);
    const cols = pickRules(rand, poolCols, 3);

    let ok = true;

    for (let r = 0; r < 3 && ok; r++) {
      for (let c = 0; c < 3; c++) {
        if (!rulesCompatible(rows[r], cols[c])) ok = false;
        else if (countSolutionsForCell(activeCards, rows[r], cols[c]) < minSolutionsPerCell) ok = false;
      }
    }

    if (ok) {
      return {
        rows,
        cols,
        cellCounts: recomputeAllCellCounts(activeCards, rows, cols),
        tries,
      };
    }
  }

  throw new Error("Rule generation failed");
}

export async function pickNonCollidingAsync(opts: PickNonCollidingOpts): Promise<PickNonCollidingResult> {
  for (let i = 0; i < 12000; i++) {
    if (i % 25 === 0) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    try {
      return pickNonColliding({ ...opts });
    } catch {
      // keep trying
    }
  }
  throw new Error("Rule generation failed (async)");
}
