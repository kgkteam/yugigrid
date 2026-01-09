// src/modes/chain/chain.ts

import {
  matches,
  rulesCompatible,
  type Rule,
  type Card,
  type RuleKey,
} from "../../engine/engine";
import { renderChainUI, updateChainUI, closeChainUI } from "./chainUI";

/* =========================
   TYPES
   ========================= */

export type ChainCtx = {
  cards: Card[];
  rulePool: Rule[];
  dayIsSpellTrap: boolean;
};

/* =========================
   STATE
   ========================= */

let ctx: ChainCtx | null = null;

const ROUND_MS = 30_000;

// ha túl kevés megoldás van, dobjuk és pickeljünk újat
const MIN_SOLUTIONS = 5;
const MAX_PICK_TRIES = 400;

let running = false;
let score = 0;
let timeLeftMs = 0;

let currentRowRule: Rule | null = null;
let currentColRule: Rule | null = null;

// picker list (nap típusa szerint)
let activeCards: Card[] = [];

// UI status
let lastStatus = "";

// internal timer (chain.html esetén)
let rafId: number | null = null;
let lastT = 0;

// ✅ prevents double-submit on game over
let gameEnded = false;

/* =========================
   LEADERBOARD (Netlify Function)
   ========================= */

async function fetchJsonSafe(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 120)}`);
  }
  if (!ct.includes("application/json")) {
    throw new Error(`Expected JSON, got "${ct}". First chars: ${text.slice(0, 80)}`);
  }

  return JSON.parse(text);
}

async function submitScore(points: number) {
  // ✅ don't submit 0 or negative
  if (!Number.isFinite(points) || points <= 0) return;

  try {
    await fetchJsonSafe("/.netlify/functions/chainTop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ points }),
    });
  } catch (e) {
    console.error("[chain] submitScore failed:", e);
  }
}

/* =========================
   CHAIN RULE POOLS (GRID-LIKE)
   ========================= */

// Ezeket finomíthatod később, de a lényeg: ne ugyanabból húzzunk kétszer
const ROW_KEYS: RuleKey[] = [
  "attribute",
  "monsterType",
  "type",
  "banlist",
  "desc",
];

const COL_KEYS: RuleKey[] = [
  "level",
  "rank",
  "linkRating",
  "atk",
  "def",
  "nameLength",
  "wordCount",
];

let rowPool: Rule[] = [];
let colPool: Rule[] = [];

/* =========================
   HELPERS
   ========================= */

function requireCtx(): ChainCtx {
  if (!ctx) throw new Error("Chain ctx missing – startChainMode() not called");
  return ctx;
}

function computeActiveCards(c: ChainCtx): Card[] {
  const list = c.cards.filter((card) =>
    c.dayIsSpellTrap ? card.kind !== "monster" : card.kind === "monster"
  );
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function pickRandom<T>(arr: T[]): T {
  const i = Math.floor(Math.random() * arr.length);
  return arr[i]!;
}

function buildPools(c: ChainCtx): void {
  const all = c.rulePool;

  rowPool = all
    .filter((r) => ROW_KEYS.includes(r.key))
    .filter((r) => !COL_KEYS.includes(r.key));

  colPool = all
    .filter((r) => COL_KEYS.includes(r.key))
    .filter((r) => !ROW_KEYS.includes(r.key));

  if (!c.dayIsSpellTrap) {
    rowPool = rowPool.filter((r) => r.key !== "race");
    colPool = colPool.filter((r) => r.key !== "race");
  }

  if (!rowPool.length) rowPool = all.slice();
  if (!colPool.length) colPool = all.slice();
}

// gyors: csak addig számol, amíg eléri a minimumot
function countSolutionsAtLeast(cards: Card[], a: Rule, b: Rule, min: number): boolean {
  let n = 0;
  for (const card of cards) {
    if (matches(card, a) && matches(card, b)) {
      n++;
      if (n >= min) return true;
    }
  }
  return false;
}

function pickRulePair(c: ChainCtx): { row: Rule; col: Rule } {
  for (let t = 0; t < MAX_PICK_TRIES; t++) {
    const row = pickRandom(rowPool);

    const candidates = colPool.filter((col) => {
      if (col.key === row.key) return false;
      return rulesCompatible(row, col);
    });

    if (!candidates.length) continue;

    const col = pickRandom(candidates);

    if (!countSolutionsAtLeast(c.cards, row, col, MIN_SOLUTIONS)) continue;

    return { row, col };
  }

  const row = pickRandom(rowPool);

  const colCandidates = colPool.filter((x) => x.key !== row.key);
  const safeColPool = colCandidates.length ? colCandidates : colPool;

  let col = pickRandom(safeColPool);

  if (col.key === row.key) {
    const alt = colPool.find((x) => x.key !== row.key) ?? col;
    col = alt;
  }

  return { row, col };
}

function emitUI(): void {
  const label =
    currentRowRule && currentColRule
      ? `${currentRowRule.label}  •  ${currentColRule.label}`
      : "—";

  updateChainUI({
    running,
    score,
    ruleLabel: label,
    timeLeft: Math.ceil(timeLeftMs / 1000),
    status: lastStatus,
    cards: activeCards,
  });
}

function stopLocalLoop(): void {
  if (rafId != null) cancelAnimationFrame(rafId);
  rafId = null;
  lastT = 0;
}

function localLoop(t: number): void {
  if (!running) {
    stopLocalLoop();
    return;
  }

  if (!lastT) lastT = t;
  const dt = Math.min(200, t - lastT);
  lastT = t;

  tickChain(dt);

  rafId = requestAnimationFrame(localLoop);
}

/* =========================
   GAME OVER
   ========================= */

async function endGame(reason: "time" | "close" = "time"): Promise<void> {
  if (gameEnded) return;
  gameEnded = true;

  running = false;
  stopLocalLoop();

  lastStatus =
    reason === "time"
      ? `⏱ Time's up – Game Over • Score: ${score}`
      : `⛔ Closed • Score: ${score}`;

  emitUI();

  // ✅ submit to global leaderboard (non-blocking for UI)
  await submitScore(score);

  // If you later add Top10 into chainUI, you can refresh it here.
  // e.g. await refreshTop10InUI?.();
}

/* =========================
   PUBLIC API
   ========================= */

/**
 * app.ts-ből hívod (Chain gomb / overlay)
 */
export function startChainMode(input: ChainCtx): void {
  ctx = input;

  const c = requireCtx();

  running = true;
  gameEnded = false;
  score = 0;
  timeLeftMs = ROUND_MS;
  lastStatus = "Pick a card that matches BOTH rules";

  activeCards = computeActiveCards(c);

  buildPools(c);
  const pair = pickRulePair(c);
  currentRowRule = pair.row;
  currentColRule = pair.col;

  renderChainUI({
    onPick: (card) => {
      pickCardById(card.id);
    },
    onClose: () => {
      // ✅ close counts as end (optional)
      endGame("close").finally(() => stopChainMode());
    },
  });

  emitUI();

  if (isChainPage()) {
    stopLocalLoop();
    rafId = requestAnimationFrame(localLoop);
  }
}

/**
 * 200ms-onként hívható (app.ts setIntervalből)
 */
export function tickChain(dtMs: number): void {
  if (!running) return;

  timeLeftMs = Math.max(0, timeLeftMs - dtMs);

  if (timeLeftMs <= 0) {
    // ✅ submit once + freeze
    void endGame("time");
    return;
  }

  emitUI();
}

/**
 * UI hívja picknél (id alapján)
 */
export function pickCardById(cardId: number | string): boolean {
  if (!running) return false;

  const c = requireCtx();
  if (!currentRowRule || !currentColRule) return false;

  const card = c.cards.find((x) => String(x.id) === String(cardId)) ?? null;
  if (!card) return false;

  if (c.dayIsSpellTrap) {
    if (card.kind === "monster") return false;
  } else {
    if (card.kind !== "monster") return false;
  }

  const ok = matches(card, currentRowRule) && matches(card, currentColRule);

  if (ok) {
    score += 100;
    lastStatus = "✅ Correct! +100";
    nextChainStep();
  } else {
    score = Math.max(0, score - 20);
    lastStatus = "❌ Wrong! -20";
    nextChainStep();
  }

  emitUI();
  return ok;
}

/**
 * Következő feladvány
 */
export function nextChainStep(): void {
  const c = requireCtx();
  const pair = pickRulePair(c);
  currentRowRule = pair.row;
  currentColRule = pair.col;
  timeLeftMs = ROUND_MS;
}

/**
 * Kilépés
 */
export function stopChainMode(): void {
  running = false;
  currentRowRule = null;
  currentColRule = null;
  timeLeftMs = 0;
  lastStatus = "";
  stopLocalLoop();
  closeChainUI();
}

/* =========================
   CHAIN.HTML AUTO-BOOT
   ========================= */

function isChainPage(): boolean {
  const p = window.location.pathname.toLowerCase();
  return p.endsWith("/chain") || p.endsWith("/chain.html");
}

function getGlobalCards(): Card[] | null {
  const w = window as any;
  const candidates = [
    w.__YUGIGRID_CARDS__,
    w.cards,
    w.CARDS,
    (globalThis as any).__YUGIGRID_CARDS__,
  ];
  for (const v of candidates) {
    if (Array.isArray(v) && v.length) return v as Card[];
  }
  return null;
}

function getGlobalRules(): Rule[] | null {
  const w = window as any;
  const candidates = [
    w.__YUGIGRID_RULES__,
    w.rules,
    w.RULES,
    (globalThis as any).__YUGIGRID_RULES__,
  ];
  for (const v of candidates) {
    if (Array.isArray(v) && v.length) return v as Rule[];
  }
  return null;
}

function bootChainPage(): void {
  if (!isChainPage()) return;

  // ✅ IMPORTANT: if you use dedicated chainPage.ts (with #chainRoot),
  // do NOT boot overlay chainUI on top of it.
  if (document.getElementById("chainRoot")) return;

  if (running) return;

  const cards = getGlobalCards();
  const rules = getGlobalRules();

  renderChainUI({
    onPick: (card) => pickCardById(card.id),
    onClose: () => {
      void endGame("close").finally(() => stopChainMode());
    },
  });

  if (!cards || !rules) {
    running = false;
    gameEnded = false;
    score = 0;
    timeLeftMs = 0;
    currentRowRule = null;
    currentColRule = null;
    activeCards = [];
    lastStatus =
      "⚠ No cards/rules loaded on this page yet. Open from the main game, or expose cards+rules to window.";
    emitUI();
    return;
  }

  startChainMode({
    cards,
    rulePool: rules,
    dayIsSpellTrap: false,
  });
}

try {
  bootChainPage();
} catch (e) {
  console.error("[chain] boot error:", e);
}
