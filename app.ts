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

import { getSetYearByCode } from "./src/setYear";


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

// ✅ cellánként a TE lerakott lapod community %-a
let cellPickPct: (number | null)[][] = Array.from({ length: 3 }, () => Array(3).fill(null));

// ✅ Submit → View results mód
let hasSubmitted = false;

/* =========================
   DOM helpers
   ========================= */

const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

function renderDayType(isSpellTrap: boolean): void {
  const el = $("dayType");
  if (el) el.textContent = isSpellTrap ? "Spell/Trap" : "Monster";
}

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
      if (hasSubmitted) cell.classList.add("locked");

      const card = grid[r][c];
      const cnt = cellSolutionCounts[r][c] ?? 0;

      if (card) {
        const small = cardImageUrlById(card.id);
        const pct = cellPickPct[r][c];
        const tier = pct == null ? "" : pct >= 90 ? "hot" : pct <= 10 ? "low" : "mid";

        // ✅ BADGE KINT a cellában (nem a .cellCard-ban), így fixen ugyanott lesz
        cell.innerHTML = `
          ${
            pct != null
              ? `<div class="usageBadge" data-tier="${tier}">${pct}%</div>`
              : ""
          }
          <div class="cellCard">
            <img class="cardimg"
              src="${escapeHtml(small)}"
              alt="${escapeHtml(card.name)}"
              loading="lazy"
              decoding="async"
              onerror="this.onerror=null; this.src='${escapeHtml(small)}';">
            <div class="name">${escapeHtml(card.name)}</div>
          </div>
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
  modalBack = $("modalBack");
  listEl = $("list");
  searchEl = $("search") as HTMLInputElement | null;
  closeBtn = $("closeBtn");

  const rc = $("resultCloseBtn") as HTMLButtonElement | null;
  const rb = $("resultBack");

  if (rc) rc.onclick = closeResults;
  if (rb) {
    rb.onclick = (e) => {
      const t = e.target as HTMLElement | null;
      if (t && t.id === "resultBack") closeResults();
    };
  }

  if (!modalBack || !listEl || !searchEl || !closeBtn) {
    console.error("❌ Modal DOM missing:", {
      modalBack: !!modalBack,
      listEl: !!listEl,
      searchEl: !!searchEl,
      closeBtn: !!closeBtn,
    });
    return false;
  }

  if (!modalBound) {
    (closeBtn as HTMLButtonElement).onclick = closePicker;

    modalBack.onclick = (e) => {
      const t = e.target as HTMLElement | null;
      if (t && t.id === "modalBack") closePicker();
    };

    searchEl.addEventListener("input", () => {
      renderList(searchEl?.value ?? "");
    });

    modalBound = true;
  }

  return true;
}

function openPicker(seedStr: string, r: number, c: number): void {
  if (hasSubmitted) return;
  if (!bindModal()) return;

  activeCell = { r, c };

  // ❌ NINCS többé "used" szűrés
  // a kártyák áthelyezését a pickCard() kezeli

  ACTIVE_CARDS = CARDS.filter((card) => {
    if (DAY_IS_SPELLTRAP) return card.kind !== "monster";
    return card.kind === "monster";
  });

  ACTIVE_CARDS.sort((a, b) => a.name.localeCompare(b.name));

  const rowRule = rowRules[r];
  const colRule = colRules[c];

  const titleEl = $("modalTitle");
  if (titleEl) {
    titleEl.textContent = `Choose a card • ${rowRule.label}+${colRule.label}`;
  }

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

  const MAX_SHOW = 50;
  const needle = String(q || "").trim().toLowerCase();

  let list = needle ? ACTIVE_CARDS.filter((c) => c.name.toLowerCase().includes(needle)) : ACTIVE_CARDS;

  const limited = !needle && list.length > MAX_SHOW;
  if (limited) list = list.slice(0, MAX_SHOW);

  listEl.innerHTML = "";

  if (limited) {
    const info = document.createElement("div");
    info.style.opacity = ".7";
    info.style.padding = "12px";
    info.textContent = `Showing first ${MAX_SHOW}. Type to search…`;
    listEl.appendChild(info);
  }

  if (!list.length) {
    const empty = document.createElement("div");
    empty.style.opacity = ".7";
    empty.style.padding = "12px";
    empty.textContent = "No matches.";
    listEl.appendChild(empty);
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

    (item.querySelector("button") as HTMLButtonElement).onclick = () => {
      void pickCard(card);
    };
    listEl.appendChild(item);
  }
}

/* =========================
   PICKING + VALIDATION
   ========================= */

function shakeCell(r: number, c: number): void {
  const b = $("board");
  if (!b) return;

  const cell = b.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`) as HTMLElement | null;
  if (!cell) return;

  cell.classList.remove("shake");
  void cell.offsetWidth;      // force reflow, hogy újrainduljon
  cell.classList.add("shake");

  // fontos: vedd is le, hogy a következő hibánál újra menjen
  window.setTimeout(() => {
    cell.classList.remove("shake");
  }, 380);
}

function findCardInGrid(cardId: number | string): { r: number; c: number } | null {
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const g = grid[r][c];
      if (g && String(g.id) === String(cardId)) {
        return { r, c };
      }
    }
  }
  return null;
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

  // 🔁 ha ez a kártya már máshol van → vegyük ki onnan
  const prev = findCardInGrid(card.id);
  if (prev && (prev.r !== r || prev.c !== c)) {
      grid[prev.r][prev.c] = null;
      wrong[prev.r][prev.c] = false;
      cellPickPct[prev.r][prev.c] = null;
  }

  // ✅ most rakjuk be az új helyre
  if (ok) {
    grid[r][c] = card;
  }
  wrong[r][c] = !ok;

  // először nullázunk, hogy ne legyen félrevezető régi adat
  cellPickPct[r][c] = null;

  closePicker();
  renderBoard(currentSeedStr); // ⬅️ ELŐBB kirajzoljuk az új cellát
  tick();

  if (!ok) {
    mistakes++;
    // ⬅️ UTÁNA rázzuk meg (DOM már létezik)
    requestAnimationFrame(() => shakeCell(r, c));
  }

  // ✅ frissítjük a %-okat (ha van global adat)
  // ✅ frissítjük a %-okat (ha van global adat) — NINCS full rerender, nincs blink
  refreshCellPickPct(currentSeedStr)
    .then(() => {
      updateCellBadge(r, c);
    })
    .catch(() => {});

}

/* =========================
   COMMUNITY PICKS (GLOBAL via Netlify Blobs)
   ========================= */

async function recordSubmit(seedStr: string): Promise<GlobalStats> {
  const picks: { cell: string; cardId: number }[] = [];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const card = grid[r][c];
      if (!card) continue;
      picks.push({ cell: `${r},${c}`, cardId: Number(card.id) });
    }
  }

  if (!picks.length) throw new Error("No picks to submit");

  const res = await fetch("/.netlify/functions/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seed: seedStr, picks }),
  });

  const data = (await res.json().catch(() => null)) as any;

  if (!res.ok) {
    throw new Error("Submit failed: " + (data?.error || (await res.text())));
  }

  // submit.ts most: { ok:true, seed, top3, totals }
  return data as GlobalStats;
}


type GlobalStats = {
  seed: string;
  totals: Record<string, number>;
  top3: Record<string, { cardId: number; cnt: number }[]>;
};

async function fetchGlobalStats(seedStr: string): Promise<GlobalStats> {
  const res = await fetch(`/.netlify/functions/picks?seed=${encodeURIComponent(seedStr)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("picks fetch failed");
  return (await res.json()) as GlobalStats;
}

async function refreshCellPickPct(seedStr: string): Promise<void> {
  cellPickPct = Array.from({ length: 3 }, () => Array(3).fill(null));

  let st: GlobalStats;
  try {
    st = await fetchGlobalStats(seedStr);
  } catch {
    return;
  }

  const totalsByCell = st?.totals || {};
  const top3ByCell = st?.top3 || {};

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const card = grid[r][c];
      if (!card) continue;

      const k = `${r},${c}`;
      const total = Number(totalsByCell[k] ?? 0);
      if (!total) continue;

      const arr = top3ByCell[k] || [];
      const hit = arr.find((x) => Number(x.cardId) === Number(card.id));
      const count = hit ? Number(hit.cnt ?? 0) : 0;

      const pct = Math.round((count / total) * 1000) / 10; // 1 tizedes
      cellPickPct[r][c] = pct;
    }
  }
}

function refreshCellPickPctFromStats(st: GlobalStats): void {
  cellPickPct = Array.from({ length: 3 }, () => Array(3).fill(null));

  const totalsByCell = st?.totals || {};
  const top3ByCell = st?.top3 || {};

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const card = grid[r][c];
      if (!card) continue;

      const k = `${r},${c}`;
      const total = Number(totalsByCell[k] ?? 0);
      if (!total) continue;

      const arr = top3ByCell[k] || [];
      const hit = arr.find((x) => Number(x.cardId) === Number(card.id));
      const count = hit ? Number(hit.cnt ?? 0) : 0;

      const pct = Math.round((count / total) * 1000) / 10;
      cellPickPct[r][c] = pct;
    }
  }
}


async function openResults(seedStr: string): Promise<void> {
  const back = $("resultBack");
  const out = $("resultList");
  if (!back || !out) return;

  out.innerHTML = `<div style="opacity:.7; padding:12px;">Loading picks…</div>`;
  back.style.display = "flex";

  let st: GlobalStats;
  try {
    st = await fetchGlobalStats(seedStr);
  } catch (e) {
    console.error(e);
    out.innerHTML = `<div style="opacity:.7; padding:12px;">No global data (yet) or function error.</div>`;
    return;
  }

  const totalsByCell = st?.totals || {};
  const top3ByCell = st?.top3 || {};

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

      const cellTotal = Number(totalsByCell[k] ?? 0);
      const picks = top3ByCell[k] || [];

      if (!picks.length || !cellTotal) {
        const empty = document.createElement("div");
        empty.style.opacity = ".7";
        empty.textContent = "No data yet.";
        cell.appendChild(empty);
      } else {
        for (const p of picks) {
          const id = String(p.cardId);
          const count = Number(p.cnt ?? 0);
          const pct = Math.round((count / cellTotal) * 1000) / 10;

          const card = CARD_BY_ID.get(id);

          const row = document.createElement("div");
          row.className = "resultRow";
          row.innerHTML = `
            <img class="resultThumb" src="${escapeHtml(cardImageUrlById(id))}" alt="">
            <div class="resTxt" style="min-width:0;">
              <div class="nm">${escapeHtml(card?.name || id)}</div>
            </div>
            <div class="pctBadge">${pct}%</div>
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
  typeline?: string[];

  misc_info?: Array<{ tcg_date?: string; ocg_date?: string }>;

  card_sets?: Array<{ set_code: string }>; // ✅ EZ KELL
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
  const url = "https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=yes&misc=yes";
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

  const isNormalMonster = isMonster && type === "Normal Monster";
  const isEffectMonster = isMonster && !isNormalMonster;

  const toEnum = (s: unknown) =>
    String(s || "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, "_")
      .replace(/[^A-Z0-9_]/g, "");

  const hasTL = (word: string) =>
    Array.isArray(raw.typeline) &&
    raw.typeline.some((t) => String(t).toLowerCase() === word.toLowerCase());

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

  // ✅ több setből jövő évlista (unique + rendezett)
  const setYears = Array.from(
    new Set(
      (raw.card_sets ?? [])
        .map((s) => s?.set_code)
        .filter(Boolean)
        .map((sc) => getSetYearByCode(String(sc)))
        .filter((y): y is number => typeof y === "number" && Number.isFinite(y))
    )
  ).sort((a, b) => a - b);

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

    effect: isMonster ? isEffectMonster : null,
    normal: isMonster ? isNormalMonster : null,

    kind: isSpell ? "spell" : isTrap ? "trap" : "monster",
    spellType: isSpell ? (raw.race ? toEnum(raw.race) : null) : null,
    trapType: isTrap ? (raw.race ? toEnum(raw.race) : null) : null,

    extraDeck,
    mainDeck,

    meta,
    info,

    setYears, // ✅ EZ A FIX (engine a card.setYears-t nézi)
  };
}


/* =========================
   UI wiring
   ========================= */

function updateSubmitUI(): void {
  const submit = $("submitBtn") as HTMLButtonElement | null;
  if (!submit) return;
  submit.textContent = hasSubmitted ? "View results" : "Submit";
}

// ✅ KINT kell lennie (globál scope), hogy pickCard() is elérje
function updateCellBadge(r: number, c: number): void {
  const b = $("board");
  if (!b) return;

  const cell = b.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`) as HTMLElement | null;
  if (!cell) return;

  // ✅ ha valaha bekerült badge a .cellCard-ba, takarítsuk ki
  cell.querySelectorAll(".cellCard .usageBadge").forEach((x) => x.remove());

  const pct = cellPickPct[r][c];
  if (pct == null) return;

  const tier = pct >= 90 ? "hot" : pct <= 10 ? "low" : "mid";

  // ✅ CSAK a cella közvetlen badge-ét keressük (ne descendant-et)
  let badge = cell.querySelector(":scope > .usageBadge") as HTMLElement | null;

  if (!badge) {
    badge = document.createElement("div");
    badge.className = "usageBadge";
    // ✅ legfelül legyen a cellában
    cell.insertBefore(badge, cell.firstChild);
  }

  badge.dataset.tier = tier;
  badge.textContent = `${pct}%`;
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
          cellPickPct[r][c] = null;
        }
      }
      mistakes = 0;
      startTs = Date.now();
      renderBoard(currentSeedStr);
      tick();
      setStatus("Reset.");

      hasSubmitted = false;
      updateSubmitUI();
    };
  }

  if (submit) {
    submit.onclick = async () => {
      if (hasSubmitted) {
        setStatus("");
        await openResults(currentSeedStr);
        return;
      }

      // validáció
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const card = grid[r][c];
          const ok = !!card && matchesCell(card, rowRules[r], colRules[c]);
          wrong[r][c] = !ok;
        }
      }

      renderBoard(currentSeedStr);

      const allOk = grid.flat().every(Boolean) && wrong.flat().every((v) => v === false);

      if (!allOk) {
        setStatus("❌ Some cells are invalid (or empty).");
        return;
      }

      hasSubmitted = true;
      updateSubmitUI();

      setStatus("✅ Showing community results (your pick will appear after refresh)");
      void openResults(currentSeedStr);

      setStatus("⏳ Saving...");

      recordSubmit(currentSeedStr)
        .then((st) => {
          // ✅ saját vote-oddal friss stats
          refreshCellPickPctFromStats(st);
          renderBoard(currentSeedStr);

          setStatus("✅ Saved!");
          // ✅ results megnyitása (ha akarod)
          void openResults(currentSeedStr); // vagy csinálunk openResultsFromStats(st)-t
        })
        .catch((e) => {
          console.error(e);
          setStatus("⚠️ Save failed (try later).");
        });

    };
  }
}

/* =========================
   INIT
   ========================= */

async function init(): Promise<void> {
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

  const isSpellTrap = rand() < 0.2;
  renderDayType(isSpellTrap);
  DAY_IS_SPELLTRAP = isSpellTrap;

  const pool = isSpellTrap ? pools.spellTrapPool : pools.monsterPool;

  const generationCards = CARDS.filter((card) => {
    if (isSpellTrap) return card.kind !== "monster";
    return card.kind === "monster";
  });

  let picked: { rows: Rule[]; cols: Rule[]; cellCounts: number[][] } | null = null;

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

  hasSubmitted = false;
  updateSubmitUI();
}

init().catch((e) => {
  console.error(e);
  const msg =
    (e as any)?.message ||
    (e as any)?.toString?.() ||
    "Unknown error";
  const stack = (e as any)?.stack ? `\n\n${(e as any).stack}` : "";
  alert(`Error during init:\n${msg}${stack}`);
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
window.__YG_CLEAR_CACHE__ = clearCardsCache;

export {};
