// app.ts — wiring + state + rendering
// Uses YGOPRODeck API + IndexedDB cache
// Global community stats via Netlify Functions + Netlify Blobs

import {
  mulberry32,
  dateSeed,
  buildRulePools,
  matchesCell,
  pickNonCollidingAsync,
  type Card,
  type Rule,
} from "./engine";

/* =========================
   IndexedDB cache (large)
   ========================= */

const IDB_DB = "yugigrid_db";
const IDB_STORE = "kv";
const IDB_KEY = "cards_v1";
const IDB_TS_KEY = "cards_v1_ts";
const CARDS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T = unknown>(key: string): Promise<T | null> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const store = tx.objectStore(IDB_STORE);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result ?? null) as T | null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbSet(key: string, val: unknown): Promise<boolean> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const req = store.put(val, key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function idbDel(key: string): Promise<boolean> {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const store = tx.objectStore(IDB_STORE);
    const req = store.delete(key);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}

async function clearCardsCache(): Promise<void> {
  await idbDel(IDB_KEY).catch(() => {});
  await idbDel(IDB_TS_KEY).catch(() => {});
}

/* =========================
   STATE
   ========================= */

let rowRules: Rule[] = [];
let colRules: Rule[] = [];
let RULE_POOL: Rule[] = [];
let CARDS: Card[] = [];
let CARD_BY_ID: Map<string, Card> = new Map();
let ACTIVE_CARDS: Card[] = [];

// ✅ day flag (Spell&Trap vs Monster)
let DAY_IS_SPELLTRAP = false;

type Grid = (Card | null)[][];
type BoolGrid = boolean[][];
type CellCounts = number[][];

const grid: Grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => null));
let wrong: BoolGrid = Array.from({ length: 3 }, () => Array(3).fill(false));
let mistakes = 0;
let startTs = Date.now();
let activeCell: { r: number; c: number } | null = null;

const MIN_SOLUTIONS_PER_CELL = 20;
let cellSolutionCounts: CellCounts = Array.from({ length: 3 }, () => Array(3).fill(0));

/* =========================
   DOM helpers
   ========================= */

   function renderDayType(isSpellTrap: boolean): void {
  const el = $("dayType");
  if (el) el.textContent = isSpellTrap ? "Spell/Trap" : "Monster";
}


const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

function escapeHtml(str: unknown): string {
  return String(str).replace(/[&<>"']/g, (m) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    } as Record<string, string>)[m]
  );
}

function setStatus(msg: string): void {
  const el = $("status");
  if (el) el.textContent = msg || "";
}

/* =========================
   Images (CDN)
   ========================= */

function cardImageUrlById(id: string | number): string {
  return `https://images.ygoprodeck.com/images/cards_small/${encodeURIComponent(String(id))}.jpg`;
}

/* =========================
   RENDER
   ========================= */

function renderRules(seedStr: string): void {
  const seedEl = $("seed") as HTMLInputElement | null;
  if (seedEl) seedEl.value = String(seedStr);

  const cr = $("colRules");
  const rr = $("rowRules");
  if (!cr || !rr) return;

  cr.innerHTML = "";
  rr.innerHTML = "";

  for (let i = 0; i < 3; i++) {
    const d = document.createElement("div");
    d.className = "rule";
    d.textContent = colRules[i]?.label ?? "—";
    cr.appendChild(d);
  }

  for (let i = 0; i < 3; i++) {
    const d = document.createElement("div");
    d.className = "rule";
    d.textContent = rowRules[i]?.label ?? "—";
    rr.appendChild(d);
  }
}

function renderBoard(seedStr: string): void {
  const b = $("board");
  if (!b) return;

  b.innerHTML = "";

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      (cell.dataset as any).r = String(r);
      (cell.dataset as any).c = String(c);

      if (wrong[r][c]) cell.classList.add("wrong");
      if (grid[r][c]) cell.classList.add("picked");

      const card = grid[r][c];
      const cnt = cellSolutionCounts[r][c] ?? 0;

      if (card) {
        const small = cardImageUrlById(card.id);

        cell.innerHTML = `
        <img class="cardimg" 
            src="${escapeHtml(small)}"
            alt="${escapeHtml(card.name)}"
            loading="lazy"
            decoding="async"
            onerror="this.onerror=null; this.src='${escapeHtml(small)}';">
        <div class="name">${escapeHtml(card.name)}</div>
      `;
      } else {
        cell.innerHTML = `
          <div class="cell-center">
            <div style="text-align:center;">
              <div style="font-weight:950;">Pick</div>
              <div style="opacity:.75; font-size:12px; margin-top:6px;">
                Possible solutions: ${cnt}
              </div>
            </div>
          </div>
        `;
      }

      cell.addEventListener("click", () => openPicker(seedStr, r, c));
      b.appendChild(cell);
    }
  }
}

/* =========================
   MODAL
   ========================= */

let modalBack: HTMLElement | null,
  listEl: HTMLElement | null,
  searchEl: HTMLInputElement | null,
  closeBtn: HTMLElement | null;

let modalBound = false;

function bindModal(): boolean {
  if (modalBound) return true;

  modalBack = $("modalBack");
  listEl = $("list");
  searchEl = $("search") as HTMLInputElement | null;
  closeBtn = $("closeBtn");

  const rc = $("resultCloseBtn");
  const rb = $("resultBack");
  if (rc) (rc as HTMLButtonElement).onclick = closeResults;
  if (rb) rb.onclick = (e) => {
    const t = e.target as HTMLElement | null;
    if (t && t.id === "resultBack") closeResults();
  };

  if (!modalBack || !listEl || !searchEl || !closeBtn) {
    console.error("Modal DOM missing:", { modalBack, listEl, searchEl, closeBtn });
    return false;
  }

  closeBtn.onclick = closePicker;
  modalBack.onclick = (e) => {
    const t = e.target as HTMLElement | null;
    if (t && t.id === "modalBack") closePicker();
  };

  searchEl.addEventListener("input", () => {
    renderList(searchEl?.value ?? "");
  });

  modalBound = true;
  return true;
}

function openPicker(seedStr: string, r: number, c: number): void {
  if (!bindModal()) return;
  if (grid[r][c]) return;

  activeCell = { r, c };

  const rowRule = rowRules[r];
  const colRule = colRules[c];

  const used = new Set(grid.flat().filter(Boolean).map((x) => String((x as Card).id)));

  // ✅ day-based filtering:
  // - Spell/Trap day -> only spell+trap
  // - Monster day -> only monsters
  ACTIVE_CARDS = CARDS.filter((card) => {
    if (used.has(String(card.id))) return false;

    if (DAY_IS_SPELLTRAP) {
      if (card.kind === "monster") return false;
    } else {
      if (card.kind !== "monster") return false;
    }

    return true;
    // matchesCell(card, rowRule, colRule);
  });

  ACTIVE_CARDS.sort((a, b) => a.name.localeCompare(b.name));

  const titleEl = $("modalTitle");
  if (titleEl) titleEl.textContent = `Choose a card • ${rowRule.label}+${colRule.label}`;
  if (searchEl) searchEl.value = "";
  renderList("");

  if (modalBack) modalBack.style.display = "flex";
  searchEl?.focus();
}

function closePicker(): void {
  if (modalBack) modalBack.style.display = "none";
  activeCell = null;
}

function renderList(q: string): void {
  if (!listEl) return;

  const needle = String(q || "").trim().toLowerCase();
  const list = needle ? ACTIVE_CARDS.filter((c) => c.name.toLowerCase().includes(needle)) : ACTIVE_CARDS;

  listEl.innerHTML = "";

  if (!list.length) {
    listEl.innerHTML = `<div style="opacity:.7; padding:12px;">No matches.</div>`;
    return;
  }

  for (const card of list) {
    const item = document.createElement("div");
    item.className = "item";
    const small = cardImageUrlById(card.id);

    item.innerHTML = `
      <img class="thumb"
          src="${escapeHtml(small)}"
          alt=""
          loading="lazy"
          decoding="async"
          onerror="this.onerror=null; this.src='${escapeHtml(small)}';">
      <div class="left">
        <div class="t">${escapeHtml(card.name)}</div>
      </div>
      <div class="right">
        <button>Pick</button>
      </div>
    `;

    (item.querySelector("button") as HTMLButtonElement | null)!.onclick = () => pickCard(card);
    listEl.appendChild(item);
  }
}

/* =========================
   PICKING + VALIDATION
   ========================= */

function shakeCell(r: number, c: number): void {
  const b = $("board");
  if (!b) return;
  const cell = b.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  if (!cell) return;
  cell.classList.remove("shake");
  // force reflow
  void (cell as HTMLElement).offsetWidth;
  cell.classList.add("shake");
}

let currentSeedStr = "";

async function pickCard(card: Card): Promise<void> {
  if (!activeCell) return;

  // ✅ hard guard: don't allow wrong kind for the day
  if (DAY_IS_SPELLTRAP) {
    if (card.kind === "monster") return;
  } else {
    if (card.kind !== "monster") return;
  }

  const { r, c } = activeCell;
  const rowRule = rowRules[r];
  const colRule = colRules[c];

  const ok = matchesCell(card, rowRule, colRule);

  if (!ok) {
    wrong[r][c] = true;
    mistakes++;
    shakeCell(r, c);
    closePicker();
    renderBoard(currentSeedStr);
    tick();
    return;
  }

  wrong[r][c] = false;
  grid[r][c] = card;

  closePicker();
  renderBoard(currentSeedStr);
  tick();
}

/* =========================
   COMMUNITY PICKS (GLOBAL via Netlify Blobs)
   ========================= */

async function recordSubmit(seedStr: string): Promise<void> {
  // fire-and-forget per cell
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const card = grid[r][c];
      if (!card) continue;

      fetch("/.netlify/functions/stats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seed: seedStr,
          cell: `${r},${c}`,
          cardId: String(card.id),
        }),
      }).catch(() => {});
    }
  }
}

type CellStats = {
  total: number;
  cards: Record<string, number>;
};

type GlobalStats = {
  cells: Record<string, CellStats>;
};

async function fetchGlobalStats(seedStr: string): Promise<GlobalStats> {
  const res = await fetch(`/.netlify/functions/picks?seed=${encodeURIComponent(seedStr)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("picks fetch failed");
  return (await res.json()) as GlobalStats;
}

async function openResults(seedStr: string): Promise<void> {
  const back = $("resultBack");
  const out = $("resultList");
  if (!back || !out) return;

  out.innerHTML = `<div style="opacity:.7; padding:12px;">Loading community picks…</div>`;
  back.style.display = "flex";

  let st: GlobalStats;
  try {
    st = await fetchGlobalStats(seedStr);
  } catch (e) {
    console.error(e);
    out.innerHTML = `<div style="opacity:.7; padding:12px;">No global data (yet) or function error.</div>`;
    return;
  }

  const cells = st?.cells || {};

  out.innerHTML = "";

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const k = `${r},${c}`;
      const cell = document.createElement("div");
      cell.className = "resultCell";

      const title = document.createElement("div");
      title.className = "cellTitle";
      title.textContent = `Cell ${r + 1},${c + 1}`;
      cell.appendChild(title);

      // ÚJ: cellánkénti stat
      const cellStats = cells[k]; // CellStats | undefined
      const cellTotal = Number(cellStats?.total ?? 0);
      const picks = cellStats?.cards ?? {};

      const entries = Object.entries(picks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      if (!entries.length || !cellTotal) {
        const empty = document.createElement("div");
        empty.style.opacity = ".7";
        empty.textContent = "No data yet.";
        cell.appendChild(empty);
      } else {
        for (const [id, count] of entries) {
          const pct = Math.round((count / cellTotal) * 1000) / 10;
          const card = CARD_BY_ID.get(String(id));

          const row = document.createElement("div");
          row.className = "resultRow";
          row.innerHTML = `
            <img src="${escapeHtml(cardImageUrlById(id))}" alt="">
            <div style="min-width:0;">
              <div class="nm">${escapeHtml(card?.name || id)}</div>
              <div class="pct">${pct}% • ${count}/${cellTotal}</div>
            </div>
          `;
          cell.appendChild(row);
        }
      }

      out.appendChild(cell);
    }
  }
}

function closeResults(): void {
  const back = $("resultBack");
  if (back) back.style.display = "none";
}

/* =========================
   TIMER / HUD
   ========================= */

function tick(): void {
  const m = $("mistakes");
  if (m) m.textContent = String(mistakes);

  const t = $("time");
  if (t) {
    const sec = Math.floor((Date.now() - startTs) / 1000);
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    t.textContent = `${mm}:${ss}`;
  }
}

/* =========================
   LOADERS
   ========================= */

async function loadRules(): Promise<Rule[]> {
  setStatus("Loading rules...");
  const res = await fetch("./rules.json", { cache: "no-store" });
  if (!res.ok) throw new Error("rules.json not found");
  return (await res.json()) as Rule[];
}

type YgoApiCard = Record<string, unknown> & {
  id: number;
  name: string;
  desc?: string;
  type?: string;
  race?: string;
  attribute?: string;
  level?: number;
  rank?: number;
  linkval?: number;
  linkRating?: number;
  typeline?: string[];
};

async function loadCards(): Promise<YgoApiCard[]> {
  setStatus("Loading cards (API)...");
  const now = Date.now();

  try {
    const ts = await idbGet<number>(IDB_TS_KEY);
    const cached = await idbGet<string>(IDB_KEY);
    if (cached && ts && now - ts < CARDS_MAX_AGE_MS) {
      setStatus("Loading cards (cache)...");
      return JSON.parse(cached) as YgoApiCard[];
    }
  } catch {
    // ignore
  }

  setStatus("Downloading cards (first time can be slow)...");
  const url = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("YGOPRODeck API error");
  const json = (await res.json()) as { data?: unknown };
  const data = Array.isArray((json as any)?.data) ? ((json as any).data as YgoApiCard[]) : [];

  try {
    await idbSet(IDB_KEY, JSON.stringify(data));
    await idbSet(IDB_TS_KEY, now);
  } catch {
    // ignore
  }

  return data;
}

/* =========================
   NORMALIZE CARD
   ========================= */

function normalizeCard(raw: YgoApiCard): Card {
  const type = (raw.type as string) || "";
  const isSpell = type === "Spell Card";
  const isTrap = type === "Trap Card";
  const isMonster = !isSpell && !isTrap;

  // Strict, API-based:
  // - Normal Monster => raw.type === "Normal Monster"
  // - Effect Monster => any monster that is not Normal Monster
  const isNormalMonster = isMonster && type === "Normal Monster";
  const isEffectMonster = isMonster && !isNormalMonster;

  const toEnum = (s: unknown) =>
    String(s || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_")
      .replace(/[^A-Z0-9_]/g, "");

  const hasTL = (word: string) =>
    Array.isArray(raw.typeline) && raw.typeline.some((t) => String(t).toLowerCase() === word.toLowerCase());

  const isXyz = hasTL("Xyz");
  const isFusion = hasTL("Fusion");
  const isSynchro = hasTL("Synchro");
  const isLink = hasTL("Link");
  const isRitual = hasTL("Ritual");
  const isPendulum = hasTL("Pendulum");
  const isTuner = hasTL("Tuner");

  let level: number | null = (raw.level as number | undefined) ?? null;
  let rank: number | null = (raw.rank as number | undefined) ?? null;

  if (isXyz && rank == null && level != null) {
    rank = level;
    level = null;
  }

  const extraDeck = isXyz || isFusion || isSynchro || isLink;
  const mainDeck = !extraDeck;

  const meta = (() => {
    if (isSpell) return `Spell • ${raw.race}`.trim();
    if (isTrap) return `Trap • ${raw.race}`.trim();

    const bits: string[] = [];
    if (raw.attribute) bits.push(String(raw.attribute));
    if (raw.race) bits.push(String(raw.race));
    if (level != null) bits.push(`Lv ${level}`);
    if (rank != null) bits.push(`Rank ${rank}`);
    if (raw.linkval != null) bits.push(`Link ${raw.linkval}`);
    return bits.join(" • ");
  })();

  const info = (() => {
    if (isSpell || isTrap) return "";
    const tags: string[] = [];
    if (isFusion) tags.push("Fusion");
    if (isSynchro) tags.push("Synchro");
    if (isXyz) tags.push("Xyz");
    if (isLink) tags.push("Link");
    if (isPendulum) tags.push("Pendulum");
    if (isRitual) tags.push("Ritual");
    if (isTuner) tags.push("Tuner");
    return tags.join(" • ");
  })();

  return {
    id: raw.id,
    name: raw.name,
    desc: String(raw.desc || ""),

    type,
    race: raw.race,

    attribute: raw.attribute ? toEnum(raw.attribute) : null,
    monsterType: raw.race && !isSpell && !isTrap ? toEnum(raw.race) : null,

    level,
    rank,

    linkRating: (raw.linkval as number | undefined) ?? null,

    xyz: isXyz,
    fusion: isFusion,
    synchro: isSynchro,
    link: isLink,
    ritual: isRitual,
    pendulum: isPendulum,
    tuner: isTuner,

    // ✅ these 2 fix rules.json (Non-Effect / Normal)
    // For spells/traps keep null so monster-only rules don't match them.
    effect: isMonster ? isEffectMonster : null,
    normal: isMonster ? isNormalMonster : null,

    kind: isSpell ? "spell" : isTrap ? "trap" : "monster",
    spellType: isSpell ? (raw.race ? toEnum(raw.race) : null) : null,
    trapType: isTrap ? (raw.race ? toEnum(raw.race) : null) : null,

    extraDeck,
    mainDeck,

    meta,
    info,
  };
}

function bindButtons(): void {
  const reset = $("resetBtn") as HTMLButtonElement | null;
  const submit = $("submitBtn") as HTMLButtonElement | null;

  if (reset) {
    reset.onclick = () => {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          grid[r][c] = null;
          wrong[r][c] = false;
        }
      }
      mistakes = 0;
      startTs = Date.now();
      renderBoard(currentSeedStr);
      tick();
      setStatus("Reset.");
    };
  }

  if (submit) {
    submit.onclick = async () => {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const card = grid[r][c];
          const ok = !!card && matchesCell(card, rowRules[r], colRules[c]);
          wrong[r][c] = !ok;
        }
      }

      renderBoard(currentSeedStr);

      const allOk =
        grid.flat().every(Boolean) &&
        wrong.flat().every((v) => v === false);

      if (!allOk) {
        setStatus("❌ Some cells are invalid (or empty).");
        return;
      }

      await recordSubmit(currentSeedStr);
      setStatus("✅ All cells are valid! (Saved to global community stats)");
      await openResults(currentSeedStr);
    };
  }
}


/* =========================
   INIT
   ========================= */

async function init(): Promise<void> {
  // ✅ törli a query-t és hash-t (pl. ?seed=, #asd), de nem töri el az appot
  if (location.search || location.hash) {
    history.replaceState(null, "", location.pathname);
  }

  const seedObj = dateSeed();
  const seedStr = seedObj.s;

  currentSeedStr = seedStr;

  bindButtons();

  RULE_POOL = await loadRules();

  const rawCards = await loadCards();
  CARDS = rawCards.map(normalizeCard);
  CARD_BY_ID = new Map(CARDS.map((c) => [String(c.id), c]));

  console.log("CARDS LOADED:", CARDS.length);

  const base = (Number(seedStr) || 123456) >>> 0;
  const pools = buildRulePools(RULE_POOL);
  const rand = mulberry32(base);

  // stable per seed (20% Spell/Trap day)
  const isSpellTrap = rand() < 0.2;

  renderDayType(isSpellTrap);

  // choose correct rule pool
  const pool = isSpellTrap ? pools.spellTrapPool : pools.monsterPool;

  // store day type so picker can filter properly
  DAY_IS_SPELLTRAP = isSpellTrap;

  // IMPORTANT: generator needs the correct card universe
  const generationCards = CARDS.filter((card) => {
    if (isSpellTrap) return card.kind !== "monster";
    return card.kind === "monster";
  });

  let picked:
    | { rows: Rule[]; cols: Rule[]; cellCounts: number[][] }
    | null = null;

  try {
    const res = await pickNonCollidingAsync({
      rand,
      poolRows: pool,
      poolCols: pool,
      activeCards: generationCards,
      minSolutionsPerCell: MIN_SOLUTIONS_PER_CELL,
      maxTries: 12000,
    });
    picked = { rows: res.rows, cols: res.cols, cellCounts: res.cellCounts };
  } catch (e) {
    console.error(e);
  }

  if (!picked) {
    alert(
      "Nem sikerült táblát generálni a jelenlegi feltételekkel.\n" +
        "Tipp: csökkentsd MIN_SOLUTIONS_PER_CELL értékét (pl. 10 → 5)."
    );
    setStatus("❌ Nem sikerült táblát generálni.");
    return;
  }

  rowRules = picked.rows;
  colRules = picked.cols;
  cellSolutionCounts = picked.cellCounts;

  renderRules(seedStr);
  renderBoard(seedStr);

  startTs = Date.now();
  tick();
  setStatus("");
}

init().catch((e) => {
  console.error(e);
  alert("Error during init. Check the console.");
});

/* =========================
   DEBUG ONLY
   ========================= */

declare global {
  interface Window {
    __YG_DEBUG__?: unknown;
    __YG_CLEAR_CACHE__?: () => Promise<void>;
  }
}

window.__YG_DEBUG__ = {
  get cards() {
    return CARDS;
  },
  get rules() {
    return RULE_POOL;
  },
  get rowRules() {
    return rowRules;
  },
  get colRules() {
    return colRules;
  },
  get dayIsSpellTrap() {
    return DAY_IS_SPELLTRAP;
  },
};

setInterval(tick, 250);

// handy: clear cards cache from console
window.__YG_CLEAR_CACHE__ = clearCardsCache;

export {};
