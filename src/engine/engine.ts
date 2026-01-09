// engine.ts — pure logic, no UI
import { getSetYearByCode } from "../setYear";
import { BANLIST_EVER_IDS } from "../data/banlistEver";

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
  | "contains" | "between" | "wordCount" | "special";

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
  value3?: unknown;
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
  desc?: string;

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

  card_sets?: CardSet[];

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

export function getSystemDayType(): DayType {
  const { s, n } = dateSeed();

  if (/^\d{8}$/.test(s)) {
    const dd = Number(s.slice(6, 8));
    return (dd % 2 === 0) ? "Spell/Trap" : "Monster";
  }

  return (Number.isFinite(n) && n % 2 === 0) ? "Spell/Trap" : "Monster";
}

export function isSpellTrapDay(): boolean {
  return getSystemDayType() === "Spell/Trap";
}

export function getSystemDayLabel(): string {
  const { s } = dateSeed();
  if (/^\d{8}$/.test(s)) {
    const y = Number(s.slice(0, 4));
    const m = Number(s.slice(4, 6));
    const d = Number(s.slice(6, 8));
    const dt = new Date(y, m - 1, d);
    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    return dayNames[dt.getDay()];
  }
  return "Day";
}

function isSpellOrTrap(card: Card | null | undefined): boolean {
  return card?.kind === "spell" || card?.kind === "trap";
}


/* =========================
   MATCHING
   ========================= */

function toNum(x: unknown): number {
  if (typeof x === "number") return x;
  if (typeof x === "string") {
    const s = x.trim();
    if (!s) return NaN;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

export function matches(card: Card, rule: Rule): boolean {
  if (!rule) return false;

  // SPELL/TRAP ONLY GATE
  if (isSpellOrTrap(card)) {
    const allowedST = new Set<Rule["key"]>([
      "desc",
      "descLength",
      "banlistEver",
      "setYear",
      "firstSetYear",
      "race",
      "spellType",
      "trapType",
      "hasRarity",
      "nameLength",
      "descLength",
      "name"
    ]);

    if (!allowedST.has(rule.key)) return false;
  }

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
      v = (card as any)?.monsterType ?? (card as any)?.race ?? null;
      break;

    case "type":
      v = card?.type;
      break;

    case "desc":
      v = card?.desc ?? null;
      break;

    case "race":
      if (!isSpellOrTrap(card)) return false;
      v = card?.race;
      break;

    case "spellType":
      if (card?.type !== "Spell Card") return false;
      v = card?.race;
      break;

    case "trapType":
      if (card?.type !== "Trap Card") return false;
      v = card?.race;
      break;

    case "nameLength":
      v = card?.name?.length ?? null;
      break;

    case "descLength":
      v = card?.desc?.length ?? null;
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

      if (rule.op === "contains") {
        const t = target.toLowerCase();
        return sets.some((s: any) =>
          typeof s?.set_rarity === "string" &&
          s.set_rarity.toLowerCase().includes(t)
        );
      }

      return sets.some((s: any) => s?.set_rarity === target);
    }

    default:
      v = (card as Record<string, unknown>)[String(rule.key)];
  }

  if (v === undefined || v === null) return false;

  const op = rule.op;
  const value = rule.value;
  const value2 = rule.value2;
  const value3= rule.value3;

  // ✅ setYear: v = number[]
  if (Array.isArray(v)) {
    const years = v as unknown[];

    const v1 = typeof value === "number" ? value : Number(value);
    const v2 = typeof value2 === "number" ? value2 : Number(value2);
    const v3 = typeof value3 === "number" ? value3 : Number(value3);

    return years.some((y) => {
      const year = typeof y === "number" ? y : Number(y);
      if (!Number.isFinite(year)) return false;

      if (op === "eq") return Number.isFinite(v1) && year === v1;
      if (op === "neq") return Number.isFinite(v1) && year !== v1;

      if (op === "lower") return Number.isFinite(v1) && year < v1;
      if (op === "higher") return Number.isFinite(v1) && year > v1;
      if (op === "lowerEq") return Number.isFinite(v1) && year <= v1;
      if (op === "higherEq") return Number.isFinite(v1) && year >= v1;

      if (op === "between") {
        return Number.isFinite(v1) && Number.isFinite(v2) && year >= v1 && year <= v2;
      }

      return false;
    });
  }

  /* =========================
     ✅ NUMERIC-SAFE COMPARISONS
     (fix: "1" vs 1, string atk/def/level/rank is)
     ========================= */

  const vn = toNum(v);
  const n1 = toNum(value);
  const n2 = toNum(value2);
  const n3 = toNum(value3);

  if (op === "eq") {
    if (Number.isFinite(vn) && Number.isFinite(n1)) return vn === n1;
    return v === value;
  }

  if (op === "neq") {
    if (Number.isFinite(vn) && Number.isFinite(n1)) return vn !== n1;
    return v !== value;
  }

  if (op === "lower") return Number.isFinite(vn) && Number.isFinite(n1) && vn < n1;
  if (op === "higher") return Number.isFinite(vn) && Number.isFinite(n1) && vn > n1;
  if (op === "lowerEq") return Number.isFinite(vn) && Number.isFinite(n1) && vn <= n1;
  if (op === "higherEq") return Number.isFinite(vn) && Number.isFinite(n1) && vn >= n1;

  if (op === "between") {
    return Number.isFinite(vn) && Number.isFinite(n1) && Number.isFinite(n2) && vn >= n1 && vn <= n2;
  }

  if (op === "wordCount") return typeof v === "string" && v.trim().split(/\s+/).length === value;

  if (op === "special") return typeof v === "string" && /[^a-zA-Z\s]/.test(v);

  if (op === "contains") {
    if (typeof v !== "string") return false;

    const t = v.toLowerCase();

    const values = [value, value2, value3]
      .filter(Boolean)
      .map(v => String(v).toLowerCase());

    return values.some(val => t.includes(val));
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
  ) return true;
  if (
    rule.key === "type" &&
    rule.op === "eq" &&
    (rule.value === "Spell Card" || rule.value === "Trap Card")
  ) return true;
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

  if (op === "between" && v1 != null && v2 != null) {
    return [Math.min(v1, v2), Math.max(v1, v2)];
  }

  if (op === "higher" && v1 != null) return [v1 + 1, Number.POSITIVE_INFINITY];
  if (op === "higherEq" && v1 != null) return [v1, Number.POSITIVE_INFINITY];

  if (op === "lower" && v1 != null) return [Number.NEGATIVE_INFINITY, v1 - 1];
  if (op === "lowerEq" && v1 != null) return [Number.NEGATIVE_INFINITY, v1];

  return null;
}

/* ---------- main ---------- */

function rulesCompatibleSimple(a: Rule, b: Rule): boolean {
  if (!a || !b) return false;

  if (a.key === b.key && a.op === b.op && a.value === b.value && a.value2 === b.value2 && a.value3 === b.value3)  return false;

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

  if (a.key === "setYear" && b.key === "firstSetYear") return false;
  if (a.key === "firstSetYear" && b.key === "setYear") return false;

  if (a.key === "level" && b.key === "level") {
    const ia = levelInterval(a);
    const ib = levelInterval(b);
    if (ia && ib && !intervalsOverlap(ia, ib)) return false;
  }

  if (a.key === "ATK" && b.key === "ATK") {
    const ia = numInterval(a, "ATK");
    const ib = numInterval(b, "ATK");
    if (ia && ib && !intervalsOverlap(ia, ib)) return false;
  }

  if (a.key === "DEF" && b.key === "DEF") {
    const ia = numInterval(a, "DEF");
    const ib = numInterval(b, "DEF");
    if (ia && ib && !intervalsOverlap(ia, ib)) return false;
  }

  return true;
}

export function rulesCompatible(a: Rule, b: Rule): boolean {
  return rulesCompatibleSimple(a, b);
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

let banlistCooldown = 0;

function isBanlistRule(r: Rule) {
  return r.key === "banlist";
}

function canPickRule(r: Rule) {
  if (isBanlistRule(r) && banlistCooldown > 0) return false;
  return true;
}
