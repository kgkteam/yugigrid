// engine.ts — pure logic, no UI

export type RNG = () => number;

export type RuleOp =
  | "eq" | "neq"
  | "lower" | "higher" | "lowerEq" | "higherEq"
  | "contains";

export type RuleKey =
  | "all" | "any"
  | "level" | "rank" | "linkRating"
  | "monsterType" | "type" | "race"
  | "spellType" | "trapType" | "kind"
  | "attribute" | "tuner" | "effect" | "ritual" | "pendulum" | "flip"
  | "xyz" | "fusion" | "synchro" | "link"
  | "desc"
  | string;

export interface Rule {
  key: RuleKey;
  op?: RuleOp;
  value?: unknown;
  value2?: unknown;
  label?: string;
}

export type CardKind = "monster" | "spell" | "trap";

export interface Card {
  id: number | string;
  name: string;
  desc: string;

  // API-ish / normalized fields (some optional)
  type?: string;
  race?: string | null;
  attribute?: string | null;
  monsterType?: string | null;

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

  effect?: boolean | null;
  normal?: boolean | null;

  kind?: CardKind;
  spellType?: string | null;
  trapType?: string | null;

  extraDeck?: boolean;
  mainDeck?: boolean;

  meta?: string;
  info?: string;

  // allow extra keys
  [k: string]: unknown;
}

export interface SeedObj {
  s: string;
  n: number;
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

export function dateSeed(): SeedObj {
  const params = new URLSearchParams(location.search);
  const forced = params.get("seed");
  if (forced) {
    const n = Number(forced);
    const s = String(forced);
    return { s, n: Number.isFinite(n) ? n : 123456 };
  }

  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const s = `${yyyy}${mm}${dd}`;
  return { s, n: Number(s) };
}

/* =========================
   DAY TYPE (single source of truth)
   ========================= */

/* =========================
   DAY TYPE (single source of truth)
   ========================= */

export type DayType = "Monster" | "Spell/Trap";

/**
 * 20% eséllyel Spell/Trap, különben Monster.
 * Determinisztikus: ugyanarra a seedre mindig ugyanaz.
 */
export function getSystemDayType(): DayType {
  const { n } = dateSeed();

  // ugyanaz a RNG, amit máshol is használsz
  const rand = mulberry32((Number.isFinite(n) ? n : 123456) >>> 0);

  return rand() < 0.20 ? "Spell/Trap" : "Monster";
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

/* =========================
   MATCHING
   ========================= */

function isSpellOrTrap(card: Card | null | undefined): boolean {
  return card?.type === "Spell Card" || card?.type === "Trap Card";
}

function unifiedLevel(card: Card | null | undefined): number | null {
  const v = (card?.level ?? card?.rank ?? card?.linkRating ?? null) as unknown;
  return typeof v === "number" ? v : null;
}

export function matches(card: Card, rule: Rule): boolean {
  if (!rule) return false;

  let v: unknown;

  switch (rule.key) {
    case "level":
      v = unifiedLevel(card);
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

    default:
      v = (card as Record<string, unknown>)[String(rule.key)];
  }

  if (v === undefined || v === null) return false;

  const op = rule.op;
  const value = rule.value;
  const value2 = rule.value2;

  // ===== OPERATORS =====
  if (op === "eq") return v === value;
  if (op === "neq") return v !== value;

  if (op === "lower") return typeof v === "number" && typeof value === "number" && v < value;
  if (op === "higher") return typeof v === "number" && typeof value === "number" && v > value;
  if (op === "lowerEq") return typeof v === "number" && typeof value === "number" && v <= value;
  if (op === "higherEq") return typeof v === "number" && typeof value === "number" && v >= value;

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
  if (rule.key === "kind" && rule.op === "eq" &&
      ((rule.value as unknown) === "spell" || (rule.value as unknown) === "trap")) return true;
  if (rule.key === "type" && rule.op === "eq" &&
      ((rule.value as unknown) === "Spell Card" || (rule.value as unknown) === "Trap Card")) return true;
  return false;
}

function rulesCompatibleSimple(a: Rule, b: Rule): boolean {
  if (!a || !b) return false;

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
