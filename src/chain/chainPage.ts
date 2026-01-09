// chainPage.ts — Chain Mode page logic (START button + help text in popup + end screen + Top10 name pick + NEW highlight)
import type { Card, Rule } from "../engine/engine";
import { mulberry32, dateSeed, matches, rulesCompatible } from "../engine/engine";
import { loadAllCards } from "../data/loadAllCards";
import { DEBUG_RULES_ENABLED, DEBUG_CHAIN_RULES } from "../debugRules";

console.log("CHAINPAGE VERSION: START+END+TOP10+NAMEPICK+HIGHLIGHT-v2.4-HOW-ONLY-ON-FIRSTLOAD");

/* =========================
   ROOT
   ========================= */

const root = document.getElementById("chainRoot");
if (!root) throw new Error("chainRoot not found in chain.html");

root.innerHTML = `
  <div class="chainShell">
    <div class="chainHeader">
      <div class="chainHeaderInner">
        <div class="chainHeaderSlot"></div>

        <div class="chainBrand">
          <div class="chainBrandTitle">Chain Mode</div>
          <div class="chainBrandSub">Pick a card that matches BOTH rules. 30s per round.</div>
        </div>

        <a class="chainBackBtn" href="./index.html">← Back to Grid</a>
      </div>
    </div>

    <div class="chainStage">
      <div class="chainStageInner">

        <div class="chainLeftSpacer" aria-hidden="true"></div>

        <div class="chainPanel">
          <div class="chainTop" style="display:grid; grid-template-columns: 1fr 2fr 1fr; align-items:center; gap:12px;">
            <div style="display:flex; align-items:center; justify-content:flex-start;">
              <div class="pill">
                <div class="pillLabel">Score</div>
                <div class="pillValue"><span id="chainScoreText">0</span></div>
              </div>
            </div>

            <div id="chainTopStatus"
                 style="display:flex; justify-content:center; align-items:center; font-weight:950; opacity:.9; text-align:center; min-height:28px;">
            </div>

            <div style="display:flex; align-items:center; justify-content:flex-end;">
              <div class="pill">
                <div class="pillLabel">Time</div>
                <div class="pillValue"><span id="chainTimeText">30</span>s</div>
              </div>
            </div>
          </div>

          <div class="timerBar">
            <div class="timerBarFill" id="timerBarFill"></div>
          </div>

          <div class="chainRules" id="chainRules" style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;"></div>
          <div class="chainRule" id="chainRuleText" style="display:none;">—</div>

          <div class="chainToast" id="chainToast"></div>

          <input id="chainInput" class="search chainInput" placeholder="Type a card name…" autocomplete="off" />
          <div id="chainDrop" class="chainDrop" style="display:none;"></div>

          <div class="chainResultRow">
            <img id="chainCardImg" class="resultThumb" style="width:46px;height:64px;border-radius:10px;display:none;" />
            <div class="chainResultText" style="min-width:0;">
              <div id="chainCardName" class="chainCardName"
                   style="font-weight:950; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.95;"></div>
              <div id="chainMsg" class="chainMsg" style="margin-top:6px; font-weight:950; opacity:.85;"></div>
            </div>
          </div>

          <div class="chainUsedWrap" id="chainUsedWrap" style="display:none; margin-top:12px;">
            <div class="chainUsedTitle" style="font-weight:900; opacity:.75; font-size:12px; margin-bottom:8px;">
              You cannot use these cards for the next pick
            </div>
            <div class="chainUsed" id="chainUsed" style="display:flex; flex-direction:column; gap:8px;"></div>
          </div>

          <div class="chainActions" style="margin-top:14px; justify-content:space-between; display:flex; align-items:center;">
            <div style="display:flex; gap:10px;">
              <button class="btn primary" id="chainRestart" type="button">Restart</button>
              <button class="btn danger" id="chainGiveUp" type="button">Give up</button>
            </div>

            <div class="streakBox" style="font-weight:950; opacity:.85; display:flex; gap:8px; align-items:baseline;">
              <div>Streak: <span id="chainStreak">0</span></div>
              <span id="streakBadge"></span>
            </div>
          </div>
        </div>

        <aside class="chainTopPanel" aria-label="Top 10">
          <div class="chainTopPanelHead">
            <div class="chainTopPanelTitle">🏆Top 10</div>
            <button class="chainTopPanelBtn" id="lbRefresh" type="button">Refresh</button>
          </div>

          <ol class="chainTopPanelList" id="top10List"></ol>

          <div class="chainTopPanelFoot">
            <div class="chainTopPanelHint">Updates after game ends</div>
          </div>
        </aside>

      </div>
    </div>

    <!-- START overlay -->
    <div class="chainStartOverlay" id="chainStartOverlay">
      <div class="chainStartCard">
        <div class="chainStartTitle">Chain Mode</div>
        <div class="chainStartSub">
          Pick a card that matches <b>both</b> rules.<br/>
          You have <b>30 seconds</b> each round.
        </div>

        <!-- How it works ONLY here (✅ default hidden to prevent flash) -->
        <div class="chainHow chainHowInOverlay" id="chainHow" style="display:block;">
          <div class="chainHowTitle">How it works</div>
          <div class="chainHowBody">
            • Press <b>Start</b> to begin.<br/>
            • You get <b>2 rules</b> — type a card name that matches <b>both</b>.<br/>
            • Wrong answers <b>halve</b> the points for the round.<br/>
            • You cannot reuse the last <b>5</b> correct cards.<br/>
            • Each round has <b>30 seconds</b>. Time’s up = game over.
          </div>
        </div>

        <button class="btn primary" id="chainStartBtn" type="button">Start</button>
      </div>
    </div>

    <!-- END overlay -->
    <div class="chainEndOverlay" id="chainEndOverlay" style="display:none;">
      <div class="chainEndCard">
        <div class="chainEndTitle" id="chainEndTitle">Game Over</div>
        <div class="chainEndSub" id="chainEndSub">Final score: 0</div>
        <div class="chainEndActions">
          <button class="btn primary" id="chainEndRestart" type="button">Play again</button>
          <a class="btn" id="chainEndBack" href="./index.html">Back to Grid</a>
        </div>
      </div>
    </div>

  </div>
`;

/* =========================
   CSS
   ========================= */

const style = document.createElement("style");
style.textContent = `
  .usedRowEnter { animation: usedRowEnter .22s ease-out both; }
  @keyframes usedRowEnter {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes inputShake {
    0% { transform: translateX(0); }
    20% { transform: translateX(-5px); }
    40% { transform: translateX(5px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
    100% { transform: translateX(0); }
  }

  .input-wrong {
    animation: inputShake .25s ease;
    border-color: #ff4d4d !important;
    box-shadow: 0 0 0 2px rgba(255,77,77,.35);
  }

  /* Center lock layout */
  .chainStage{ width: 100%; display:flex; justify-content:center; }
  .chainStageInner{
    width: 100%;
    display:grid;
    grid-template-columns: 340px minmax(560px, 680px) 340px;
    gap: 16px;
    align-items:start;
    justify-content:center;
  }
  .chainLeftSpacer{ grid-column:1; }
  .chainPanel{ grid-column:2; min-width:0; }

  .chainTopPanel{
    grid-column:3;
    position: sticky;
    top: 16px;
    border: 1px solid rgba(255,255,255,.12);
    background: rgba(255,255,255,.04);
    border-radius: 16px;
    padding: 12px 14px;
    backdrop-filter: blur(10px);
    align-self:start;
  }

  @media (max-width: 1100px){
    .chainStageInner{ grid-template-columns: 1fr; }
    .chainLeftSpacer{ display:none; }
    .chainTopPanel{ display:none; }
    .chainPanel{ grid-column: 1; }
  }

  .chainTopPanelHead{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
  .chainTopPanelTitle{ font-size:13px; font-weight:900; opacity:.9; }
  .chainTopPanelBtn{
    border: 1px solid rgba(255,255,255,.12);
    background: rgba(255,255,255,.06);
    color: inherit;
    padding: 6px 10px;
    border-radius: 12px;
    cursor: pointer;
    font-weight: 900;
    font-size: 12px;
    opacity: .9;
  }
  .chainTopPanelBtn:hover{ background: rgba(255,255,255,.10); }
  .chainTopPanelList{ margin:0; padding-left:18px; font-size:13px; }
  .chainTopPanelList li{ margin-bottom:6px; opacity:.95; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .chainTopPanelFoot{ margin-top:10px; }
  .chainTopPanelHint{ font-size:11px; opacity:.65; font-weight:900; }

  /* Help text (reused inside overlay) */
  .chainHow{
    border: 1px solid rgba(255,255,255,.10);
    background: rgba(255,255,255,.04);
    border-radius: 14px;
    padding: 10px 12px;
  }
  .chainHowTitle{ font-weight: 950; font-size: 12px; opacity: .9; margin-bottom: 6px; }
  .chainHowBody{ font-weight: 900; font-size: 11px; line-height: 1.35; opacity: .75; }

  /* special: in overlay we want left-aligned + spacing */
  .chainHowInOverlay{
    margin: 12px 0 14px;
    text-align: left;
  }

  /* Start overlay */
  .chainStartOverlay{
    position:fixed; inset:0; z-index:9000;
    background: rgba(0,0,0,.62);
    display:flex; align-items:center; justify-content:center;
    padding:18px;
  }
  .chainStartCard{
    width: min(520px, 100%);
    border: 1px solid rgba(255,255,255,.14);
    background: rgba(20,20,26,.92);
    border-radius: 18px;
    padding: 16px;
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 40px rgba(0,0,0,.35);
    text-align:center;
  }
  .chainStartTitle{ font-weight:950; font-size:18px; margin-bottom:6px; }
  .chainStartSub{ opacity:.8; font-weight:900; font-size:12px; margin-bottom:10px; line-height:1.35; }

  /* End overlay */
  .chainEndOverlay{
    position:fixed; inset:0; z-index:9500;
    background: rgba(0,0,0,.62);
    display:flex; align-items:center; justify-content:center;
    padding:18px;
  }
  .chainEndCard{
    width: min(520px, 100%);
    border: 1px solid rgba(255,255,255,.14);
    background: rgba(20,20,26,.92);
    border-radius: 18px;
    padding: 16px;
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 40px rgba(0,0,0,.35);
    text-align:center;
  }
  .chainEndTitle{ font-weight:950; font-size:18px; margin-bottom:6px; }
  .chainEndSub{ opacity:.85; font-weight:900; font-size:13px; margin-bottom:12px; }
  .chainEndActions{ display:flex; justify-content:center; gap:10px; }

  /* Name pick modal */
  .lbModalOverlay{
    position:fixed; inset:0; z-index:9999;
    background: rgba(0,0,0,.62);
    display:flex; align-items:center; justify-content:center;
    padding: 20px;
  }
  .lbModal{
    width: min(520px, 100%);
    border: 1px solid rgba(255,255,255,.14);
    background: rgba(20,20,26,.92);
    border-radius: 18px;
    padding: 16px;
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 40px rgba(0,0,0,.35);
  }
  .lbModalTitle{ font-weight: 950; font-size: 16px; margin-bottom: 6px; }
  .lbModalSub{ opacity: .8; font-weight: 900; font-size: 12px; margin-bottom: 12px; line-height: 1.35; }
  .lbNameGrid{ display:grid; grid-template-columns: 1fr; gap: 10px; margin-top: 10px; }
  @media(min-width: 520px){ .lbNameGrid{ grid-template-columns: 1fr 1fr; } }
  .lbNameBtn{
    border: 1px solid rgba(255,255,255,.14);
    background: rgba(255,255,255,.06);
    color: inherit;
    padding: 10px 12px;
    border-radius: 14px;
    cursor: pointer;
    font-weight: 950;
    text-align: left;
    transition: transform .06s ease, background .12s ease;
  }
  .lbNameBtn:hover{ background: rgba(255,255,255,.10); }
  .lbNameBtn:active{ transform: scale(.99); }
  .lbModalActions{ display:flex; justify-content:flex-end; gap:10px; margin-top: 14px; }
  .lbCancelBtn{
    border: 1px solid rgba(255,255,255,.14);
    background: transparent;
    color: inherit;
    padding: 8px 12px;
    border-radius: 12px;
    cursor: pointer;
    font-weight: 950;
    opacity: .85;
  }
  .lbCancelBtn:hover{ background: rgba(255,255,255,.06); }
`;
document.head.appendChild(style);

/* =========================
   STATE
   ========================= */

let CARDS: Card[] = [];
let RULES: Rule[] = [];
let CARD_NAME_LOWER: string[] = [];
let CARD_BY_ID = new Map<string, Card>();

const RULE_MATCH_CACHE = new Map<string, Uint32Array>();

let streak = 0;
let ruleA: Rule | null = null;
let ruleB: Rule | null = null;

let score = 0;
let award = 100;
let wrongThisRound = 0;

type UsedEntry = { card: Card; pts: number };
const USED_LIMIT = 5;
let usedEntries: UsedEntry[] = [];

let gameEnded = false;
let gameStarted = false;

// Top10 new entry highlight
let highlightName: string | null = null;
let highlightUntil = 0;

// ✅ SHOW "How it works" ONLY on first page load (per refresh)
let howShownOnce = false;

function setHowVisible(visible: boolean) {
  const howEl = document.getElementById("chainHow") as HTMLDivElement | null;
  if (howEl) howEl.style.display = visible ? "block" : "none";
}

// ✅ if the loaded cards do NOT contain descriptions, disable "mentions/desc" rules
let HAS_DESC_DATA = true;

/* =========================
   DOM (safe)
   ========================= */

function mustGet<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

const inputEl = mustGet<HTMLInputElement>("chainInput");
const dropEl = mustGet<HTMLDivElement>("chainDrop");
const msgEl = mustGet<HTMLDivElement>("chainMsg");
const nameEl = mustGet<HTMLDivElement>("chainCardName");
const imgEl = mustGet<HTMLImageElement>("chainCardImg");
const streakEl = mustGet<HTMLSpanElement>("chainStreak");
const scoreEl = mustGet<HTMLSpanElement>("chainScoreText");

const rulesWrapEl = mustGet<HTMLDivElement>("chainRules");
const toastEl = mustGet<HTMLDivElement>("chainToast");
const badgeEl = document.getElementById("streakBadge") as HTMLSpanElement | null;

const usedWrapEl = document.getElementById("chainUsedWrap") as HTMLDivElement | null;
const usedEl = document.getElementById("chainUsed") as HTMLDivElement | null;

const topStatusEl = mustGet<HTMLDivElement>("chainTopStatus");
const top10ListEl = document.getElementById("top10List") as HTMLOListElement | null;

// overlays
const startOverlayEl = document.getElementById("chainStartOverlay") as HTMLDivElement | null;
const startBtnEl = document.getElementById("chainStartBtn") as HTMLButtonElement | null;

const endOverlayEl = document.getElementById("chainEndOverlay") as HTMLDivElement | null;
const endTitleEl = document.getElementById("chainEndTitle") as HTMLDivElement | null;
const endSubEl = document.getElementById("chainEndSub") as HTMLDivElement | null;
const endRestartEl = document.getElementById("chainEndRestart") as HTMLButtonElement | null;

/* =========================
   GLOBAL TOP10 + NAME PICK
   ========================= */

async function fetchJsonSafe(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();

  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 140)}`);
  if (!ct.includes("application/json")) {
    throw new Error(`Expected JSON, got "${ct}". First chars: ${text.slice(0, 80)}`);
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Bad JSON: ${(e as any)?.message ?? e} | First chars: ${text.slice(0, 80)}`);
  }
}

function renderTop10(list: Array<{ name: string; points: number }>) {
  if (!top10ListEl) return;

  if (!list || list.length === 0) {
    top10ListEl.innerHTML = "<li>—</li>";
    return;
  }

  const now = Date.now();
  const activeHighlight = highlightName && now < highlightUntil ? highlightName : null;

  top10ListEl.innerHTML = "";
  for (const e of list) {
    const li = document.createElement("li");
    const isNew = !!activeHighlight && e.name === activeHighlight;

    li.innerHTML = isNew
      ? `<b>${e.name}</b> — ${e.points} <span style="margin-left:6px; font-weight:950; opacity:.95;">NEW</span>`
      : `${e.name} — ${e.points}`;

    if (isNew) {
      li.style.border = "1px solid rgba(255,255,255,.18)";
      li.style.background = "rgba(255,255,255,.06)";
      li.style.borderRadius = "10px";
      li.style.padding = "6px 8px";
    }

    top10ListEl.appendChild(li);
  }
}

async function loadTop10() {
  if (!top10ListEl) return;
  top10ListEl.innerHTML = "<li>Loading…</li>";

  try {
    const data = await fetchJsonSafe("/.netlify/functions/chainTop");
    const list = (data?.list ?? []) as Array<{ name: string; points: number }>;
    renderTop10(list);
  } catch (err) {
    console.error("[Top10] load failed:", err);
    top10ListEl.innerHTML = "<li>—</li>";
  }
}

/** 4 names, format ColorAnimal (PurpleTiger) */
const COLORS = [
  "Purple",
  "Crimson",
  "Scarlet",
  "Ruby",
  "Orange",
  "Amber",
  "Gold",
  "Yellow",
  "Lime",
  "Green",
  "Emerald",
  "Teal",
  "Cyan",
  "Azure",
  "Blue",
  "Indigo",
  "Violet",
  "Pink",
  "Magenta",
  "Silver",
  "White",
];
const ANIMALS = [
  "Tiger",
  "Wolf",
  "Fox",
  "Hawk",
  "Raven",
  "Lynx",
  "Viper",
  "Panda",
  "Otter",
  "Koala",
  "Lion",
  "Eagle",
  "Shark",
  "Cobra",
  "Falcon",
  "Jaguar",
  "Panther",
  "Bear",
];

function randomName(): string {
  const c = COLORS[Math.floor(Math.random() * COLORS.length)];
  const a = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${c}${a}`;
}

function uniqueNames(n: number): string[] {
  const set = new Set<string>();
  while (set.size < n) set.add(randomName());
  return [...set];
}

function pickNameModal(finalScore: number): Promise<string | null> {
  const names = uniqueNames(4);

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "lbModalOverlay";

    const modal = document.createElement("div");
    modal.className = "lbModal";

    modal.innerHTML = `
      <div class="lbModalTitle">🏆 Congrats! You made the Top 10</div>
      <div class="lbModalSub">
        Your score: <b>${finalScore}</b><br/>
        Choose a name:
      </div>
      <div class="lbNameGrid" id="lbNameGrid"></div>
      <div class="lbModalActions">
        <button class="lbCancelBtn" id="lbCancelBtn" type="button">Skip</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const grid = modal.querySelector("#lbNameGrid") as HTMLDivElement;
    const cancel = modal.querySelector("#lbCancelBtn") as HTMLButtonElement;

    const cleanup = () => overlay.remove();

    cancel.onclick = () => {
      cleanup();
      resolve(null);
    };

    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) {
        cleanup();
        resolve(null);
      }
    });

    for (const nm of names) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lbNameBtn";
      btn.textContent = nm;
      btn.onclick = () => {
        cleanup();
        resolve(nm);
      };
      grid.appendChild(btn);
    }
  });
}

async function submitPoints(points: number, name?: string | null) {
  const shouldSubmit = Number.isFinite(points) && points > 0;

  try {
    if (shouldSubmit) {
      await fetchJsonSafe("/.netlify/functions/chainTop", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ points, name: name ?? undefined }),
      });
    }
  } catch (err) {
    console.error("[Top10] submit failed:", err);
  }

  await loadTop10();
}

function qualifiesForTop10(points: number, list: Array<{ points: number }>): boolean {
  if (!Number.isFinite(points) || points <= 0) return false;
  if (!list || list.length < 10) return true;
  const min = Math.min(...list.map((e) => Number(e.points) || 0));
  return points > min; // strict better than 10th place
}

/* =========================
   HELPERS (UI)
   ========================= */

function showStartOverlay() {
  if (startOverlayEl) startOverlayEl.style.display = "flex";

  // first load: true, restart: false
  setHowVisible(!howShownOnce);
  howShownOnce = true;
}

function hideStartOverlay() {
  // amikor eltűnik az overlay (Start-ra), rejtsük el a How részt is,
  // hogy később (restartnál) se legyen villanás
  setHowVisible(false);
  if (startOverlayEl) startOverlayEl.style.display = "none";
}

function showEndOverlay(title: string, sub: string) {
  if (endTitleEl) endTitleEl.textContent = title;
  if (endSubEl) endSubEl.textContent = sub;
  if (endOverlayEl) endOverlayEl.style.display = "flex";
}

function hideEndOverlay() {
  if (endOverlayEl) endOverlayEl.style.display = "none";
}

function setMsg(t: string, ok?: boolean) {
  msgEl.textContent = t;
  msgEl.style.color = ok === true ? "var(--ok)" : ok === false ? "var(--bad)" : "rgba(233,240,255,.85)";
}

function setTopStatus(text: string, kind: "ok" | "bad" | "muted" = "muted") {
  topStatusEl.textContent = text;
  topStatusEl.style.color =
    kind === "ok" ? "var(--ok)" : kind === "bad" ? "var(--bad)" : "rgba(233,240,255,.85)";
}

function showToast(t: string) {
  toastEl.textContent = t;
  toastEl.classList.add("show");
  window.setTimeout(() => toastEl.classList.remove("show"), 850);
}

function renderRules(rules: string[]) {
  rulesWrapEl.innerHTML = rules.map((r) => `<div class="chainRule">${r}</div>`).join("");
}

function setScore(n: number) {
  score = n;
  scoreEl.textContent = String(score);
}

function resetRoundAward() {
  award = 100;
}

function halveAwardOnWrong() {
  award = Math.max(1, Math.floor(award / 2));
}

function shakeInput() {
  inputEl.classList.remove("input-wrong");
  void inputEl.offsetWidth;
  inputEl.classList.add("input-wrong");
  window.setTimeout(() => inputEl.classList.remove("input-wrong"), 260);
}

function clearPickedUI() {
  imgEl.style.display = "none";
  nameEl.textContent = "";
  setMsg("");
}

function resetUsed() {
  usedEntries = [];
  renderUsed();
}

function updateStreakBadge(n: number) {
  if (!badgeEl) return;
  if (n >= 20) badgeEl.textContent = "💀 INSANE";
  else if (n >= 10) badgeEl.textContent = "⚡ HOT";
  else if (n >= 5) badgeEl.textContent = "🔥 NICE";
  else badgeEl.textContent = "";
}

function setRuleUI() {
  const a = ruleA?.label ?? String(ruleA?.key ?? "—");
  const b = ruleB?.label ?? String(ruleB?.key ?? "—");
  renderRules([a, b]);
}

function showPicked(card: Card) {
  nameEl.textContent = card.name;
  imgEl.src = `https://images.ygoprodeck.com/images/cards_small/${encodeURIComponent(String(card.id))}.jpg`;
  imgEl.style.display = "block";
}

function renderUsed() {
  if (!usedWrapEl || !usedEl) return;

  const list = usedEntries.slice(-USED_LIMIT).reverse();

  if (list.length === 0) {
    usedWrapEl.style.display = "none";
    usedEl.innerHTML = "";
    return;
  }

  usedWrapEl.style.display = "block";

  usedEl.innerHTML = list
    .map((e, idx) => {
      const c = e.card;
      const enterClass = idx === 0 ? "usedRowEnter" : "";
      const safeName = (c.name || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const img = `https://images.ygoprodeck.com/images/cards_small/${encodeURIComponent(String(c.id))}.jpg`;

      return `
      <div class="${enterClass}"
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          padding:8px 10px;
          border-radius:12px;
          background:rgba(255,255,255,.06);
          border:1px solid rgba(255,255,255,.10);
        "
      >
        <div style="display:flex; align-items:center; gap:10px; min-width:0;">
          <img src="${img}" alt="" style="width:34px;height:48px;border-radius:10px; flex:0 0 auto;" />
          <div style="min-width:0;">
            <div style="font-weight:950; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${safeName}
            </div>
            <div style="opacity:.65; font-weight:900; font-size:11px;">
              Recently used
            </div>
          </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px; font-weight:950;">
          <span style="color: var(--ok);">✅</span>
          <span style="color: var(--ok);">+${e.pts}</span>
        </div>
      </div>
    `;
    })
    .join("");
}

/* =========================
   NORMALIZE
   ========================= */

function normKey(k: unknown): string {
  return String(k ?? "")
    .replace(/\s+/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .toLowerCase();
}
function normOp(op: unknown): string {
  return String(op ?? "").trim().toLowerCase();
}
function normLabel(x: unknown): string {
  return String(x ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

/* =========================
   RULES LOADING
   ========================= */

const RULES_LS_KEY = "yugigrid_rules_cache_v1";

async function loadRules(): Promise<Rule[]> {
  try {
    const cached = localStorage.getItem(RULES_LS_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length) return parsed as Rule[];
    }
  } catch {}

  const res = await fetch("/rules.json", { cache: "no-store" });
  if (!res.ok) throw new Error("rules.json not found");
  const rules = (await res.json()) as Rule[];

  try {
    localStorage.setItem(RULES_LS_KEY, JSON.stringify(rules));
  } catch {}

  return rules;
}

/* =========================
   RNG
   ========================= */

const day = (Number(dateSeed().s) || 123456) >>> 0;
const sessionSalt = Date.now() >>> 0;
const chainRand = mulberry32((day ^ sessionSalt ^ 0x9e3779b9) >>> 0);

function randInt(max: number): number {
  return Math.floor(chainRand() * max);
}

/* =========================
   PICK RULES
   ========================= */

function ruleSig(r: Rule): string {
  const k = normKey((r as any).key);
  const op = normOp((r as any).op);
  const v = (r as any).value;
  const v2 = (r as any).value2;
  const lab = (r as any).label;

  const vS = v === undefined ? "∅" : typeof v === "string" ? `s:${v}` : `j:${JSON.stringify(v)}`;
  const v2S = v2 === undefined ? "∅" : typeof v2 === "string" ? `s:${v2}` : `j:${JSON.stringify(v2)}`;
  const labS = lab == null ? "∅" : String(lab);

  return `${k}|${op}|${vS}|${v2S}|${labS}`;
}

let lastSigA: string | null = null;
let lastSigB: string | null = null;

const RECENT_LIMIT = 10;
const recentSigs: string[] = [];

const RULE_BLACKLIST_KEYS_RAW: Array<Rule["key"]> = ["banlistEver", "nameLength"];
const RULE_BLACKLIST_KEYS = new Set(RULE_BLACKLIST_KEYS_RAW.map(normKey));

function dedupeRules(rules: Rule[]): Rule[] {
  const seen = new Set<string>();
  const out: Rule[] = [];
  for (const r of rules) {
    const sig = ruleSig(r);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(r);
  }
  return out;
}

function keyFamily(r: Rule): string {
  const k = normKey((r as any).key);
  const lab = normLabel((r as any).label);

  if (
    k === "level" ||
    k === "rank" ||
    k === "linkrating" ||
    k === "atk" ||
    k === "def" ||
    lab.startsWith("level") ||
    lab.startsWith("rank") ||
    lab.startsWith("link")
  )
    return "NUMERIC";

  if (k === "name" || k === "namelength") return "NAME";
  if (k === "desc" || k === "desclength") return "DESC";

  return k;
}

function getRuleMatchList(rule: Rule): Uint32Array {
  const sig = ruleSig(rule);
  const cached = RULE_MATCH_CACHE.get(sig);
  if (cached) return cached;

  const idxs: number[] = [];
  for (let i = 0; i < CARDS.length; i++) {
    const c = CARDS[i];
    if (!c) continue;
    if (matches(c, rule)) idxs.push(i);
  }

  const arr = Uint32Array.from(idxs);
  RULE_MATCH_CACHE.set(sig, arr);
  return arr;
}

function intersectCountUpTo(a: Uint32Array, b: Uint32Array, cap: number): number {
  let i = 0,
    j = 0,
    cnt = 0;
  while (i < a.length && j < b.length) {
    const va = a[i];
    const vb = b[j];
    if (va === vb) {
      cnt++;
      if (cnt >= cap) return cnt;
      i++;
      j++;
    } else if (va < vb) i++;
    else j++;
  }
  return cnt;
}

function pushRecent(sig: string) {
  recentSigs.push(sig);
  while (recentSigs.length > RECENT_LIMIT) recentSigs.shift();
}

function rememberLast(a: Rule, b: Rule) {
  lastSigA = ruleSig(a);
  lastSigB = ruleSig(b);
  pushRecent(lastSigA);
  pushRecent(lastSigB);
}

function pickNextTwoRules(all: Rule[]) {
  if (DEBUG_RULES_ENABLED) {
    console.warn("[DEBUG] Using fixed chain rules");
    //return DEBUG_CHAIN_RULES;
    all=[DEBUG_CHAIN_RULES.a,DEBUG_CHAIN_RULES.b];
  }

  const MIN_SOL = 80;
  const MAX_SOL = 2000;

  const clean = dedupeRules(
    all
      .filter((r) => r?.key && normKey(r.key) !== "all" && normKey(r.key) !== "any")
      .filter((r) => !RULE_BLACKLIST_KEYS.has(normKey(r.key)))
      .filter((r) => {
        // ✅ if our card dataset has NO desc/effect text, remove any rule that relies on it
        if (!HAS_DESC_DATA) {
          const k = normKey((r as any).key);
          const lab = String((r as any).label ?? "").trim().toLowerCase();

          // keys that typically mean "effect text"
          if (k === "desc" || k === "desclength" || k === "text" || k === "effect" || k === "description") return false;

          // labels like: "mentions draw", "mentions gy", etc.
          if (lab.startsWith("mentions ") || lab.includes("mentions ")) return false;
        }

        const k = normKey((r as any).key);
        const op = normOp((r as any).op);
        const v = Number((r as any).value);
        const lab = String((r as any).label ?? "").trim().toLowerCase();

        if (k === "name" && op === "wordcount" && (v === 4 || v === 5)) return false;
        if (lab === "4 word card name" || lab === "5 word card name") return false;
        return true;
      })
  );

  if (clean.length < 2) {
    const r0 = clean[0] ?? all[0];
    return { a: r0, b: r0, cnt: 0 };
  }

  function okPair(a: Rule, b: Rule): boolean {
    if (!a || !b) return false;

    const ka = normKey((a as any).key);
    const kb = normKey((b as any).key);
    const la = normLabel((a as any).label);
    const lb = normLabel((b as any).label);

    if (ka === kb) return false;
    if (keyFamily(a) === keyFamily(b)) return false;
    if (la.startsWith("level") && lb.startsWith("level")) return false;

    if (!rulesCompatible(a, b)) return false;

    const cntMin = intersectCountUpTo(getRuleMatchList(a), getRuleMatchList(b), MIN_SOL);
    if (cntMin < MIN_SOL) return false;

    const sa = ruleSig(a);
    const sb = ruleSig(b);

    if (recentSigs.includes(sa) || recentSigs.includes(sb)) return false;
    if (lastSigA && (sa === lastSigA || sb === lastSigA)) return false;
    if (lastSigB && (sa === lastSigB || sb === lastSigB)) return false;

    return true;
  }

  for (let i = 0; i < 2500; i++) {
    const a = clean[randInt(clean.length)];
    const b = clean[randInt(clean.length)];
    if (!okPair(a, b)) continue;

    const la = getRuleMatchList(a);
    const lb = getRuleMatchList(b);

    const cnt = intersectCountUpTo(la, lb, MAX_SOL + 1);
    if (cnt >= MIN_SOL && cnt <= MAX_SOL) return { a, b, cnt };
  }

  let best: { a: Rule; b: Rule; cnt: number } | null = null;

  for (let i = 0; i < clean.length; i++) {
    const a = clean[i];
    const la = getRuleMatchList(a);
    if (la.length < MIN_SOL) continue;

    for (let j = 0; j < clean.length; j++) {
      if (i === j) continue;
      const b = clean[j];
      if (!okPair(a, b)) continue;

      const lb = getRuleMatchList(b);
      if (lb.length < MIN_SOL) continue;

      const cnt = intersectCountUpTo(la, lb, MAX_SOL + 1);
      if (cnt < MIN_SOL) continue;

      if (cnt <= MAX_SOL) return { a, b, cnt };
      if (!best || cnt < best.cnt) best = { a, b, cnt };
    }
  }

  if (best) return best;

  const a = clean[0];
  const b = clean[1] ?? clean[0];
  const cnt = intersectCountUpTo(getRuleMatchList(a), getRuleMatchList(b), Number.POSITIVE_INFINITY);
  return { a, b, cnt };
}

/* =========================
   TIMER
   ========================= */

let time = 30;
let timer: number | null = null;

function updateTimerUI(secLeft: number, total: number) {
  const bar = document.getElementById("timerBarFill") as HTMLDivElement | null;
  const tText = document.getElementById("chainTimeText") as HTMLSpanElement | null;

  if (tText) tText.textContent = String(secLeft);
  if (!bar) return;

  const pct = Math.max(0, secLeft / total);
  bar.style.width = `${pct * 100}%`;

  if (secLeft <= 10) {
    const t = Math.max(0, Math.min(1, secLeft / 10));
    const r = Math.round(255 - (255 - 124) * t);
    const g = Math.round(77 + (124 - 77) * t);
    const b = Math.round(77 + (255 - 77) * t);
    bar.style.backgroundColor = `rgb(${r},${g},${b})`;
    document.body.classList.add("timer-panic");
  } else {
    bar.style.backgroundColor = "rgb(124,124,255)";
    document.body.classList.remove("timer-panic");
  }
}

function stopTimer() {
  if (timer != null) window.clearInterval(timer);
  timer = null;
}

function startTimer() {
  stopTimer();
  time = 30;
  updateTimerUI(time, 30);

  timer = window.setInterval(() => {
    if (gameEnded || !gameStarted) return;
    time--;
    updateTimerUI(time, 30);
    if (time <= 0) void endGame("time");
  }, 1000);
}

/* =========================
   DROPDOWN
   ========================= */

function hideDrop() {
  dropEl.style.display = "none";
  dropEl.innerHTML = "";
}

function renderDrop(list: Card[]) {
  if (!list.length) {
    hideDrop();
    return;
  }

  dropEl.innerHTML = list
    .map((c) => {
      const img = `https://images.ygoprodeck.com/images/cards_small/${encodeURIComponent(String(c.id))}.jpg`;

      return `
        <div class="chainOpt" data-id="${String(c.id)}">
          <img class="chainOptImg" src="${img}" alt="">
          <div class="chainOptName">${c.name}</div>
        </div>
      `;
    })
    .join("");

  dropEl.style.display = "block";
}

function getFiltered(q: string): Card[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];

  const out: Card[] = [];
  for (let i = 0; i < CARDS.length; i++) {
    const c = CARDS[i];
    if (!c?.name) continue;
    if (!CARD_NAME_LOWER[i].includes(needle)) continue;

    out.push(c);
    if (out.length >= 12) break;
  }
  return out;
}

/* =========================
   END GAME
   ========================= */

async function endGame(reason: "time" | "giveup") {
  if (gameEnded) return;
  gameEnded = true;
  gameStarted = false;

  stopTimer();
  hideDrop();
  inputEl.disabled = true;

  if (reason === "time") {
    setTopStatus(`Time’s up! • Score: ${score}`);
    showToast("Time's up!");
    showEndOverlay("⏱ Time’s up!", `Final score: ${score}`);
  } else {
    setTopStatus(`🏳️ Gave up. • Score: ${score}`);
    showToast("Gave up");
    showEndOverlay("🏳️ You gave up", `Final score: ${score}`);
  }

  setMsg("");

  try {
    const cur = await fetchJsonSafe("/.netlify/functions/chainTop");
    const list = (cur?.list ?? []) as Array<{ name: string; points: number }>;

    let chosenName: string | null = null;
    if (qualifiesForTop10(score, list)) {
      chosenName = await pickNameModal(score);
      if (!chosenName) chosenName = randomName();
    }

    if (chosenName) {
      highlightName = chosenName;
      highlightUntil = Date.now() + 6000;
    }

    await submitPoints(score, chosenName);
  } catch (e) {
    console.error("[Top10] endGame flow failed:", e);
    try {
      await loadTop10();
    } catch {}
  }
}

/* =========================
   PICK
   ========================= */

function pickById(id: string) {
  if (gameEnded || !gameStarted) return;

  const card = CARD_BY_ID.get(id);
  if (!card || !ruleA || !ruleB) return;

  const last = usedEntries.slice(-USED_LIMIT);
  const isBlocked = last.some((e) => String(e.card.id) === id);
  if (isBlocked) {
    hideDrop();
    inputEl.value = "";
    setMsg("⚠️ Recently used.", false);
    showToast("Recently used");
    return;
  }

  hideDrop();
  inputEl.value = "";
  showPicked(card);

  const ok = matches(card, ruleA) && matches(card, ruleB);

  if (!ok) {
    wrongThisRound++;
    halveAwardOnWrong();
    setTopStatus("", "muted");
    setMsg("❌ Wrong!", false);
    showToast("Wrong");
    shakeInput();
    inputEl.focus();
    return;
  }

  setScore(score + award);

  usedEntries.push({ card, pts: award });
  renderUsed();

  clearPickedUI();
  showToast(`+${award}`);

  if (wrongThisRound === 0) streak++;
  else streak = 0;

  streakEl.textContent = String(streak);
  updateStreakBadge(streak);

  requestAnimationFrame(() => {
    const next = pickNextTwoRules(RULES);
    ruleA = next.a;
    ruleB = next.b;
    setRuleUI();

    if (ruleA && ruleB) rememberLast(ruleA, ruleB);

    resetRoundAward();
    wrongThisRound = 0;
    setTopStatus("", "muted");

    startTimer();
    inputEl.focus();
  });
}

/* =========================
   EVENTS
   ========================= */

let searchT: number | null = null;

inputEl.addEventListener("input", () => {
  if (!gameStarted || gameEnded) return;
  if (searchT) window.clearTimeout(searchT);
  searchT = window.setTimeout(() => {
    const list = getFiltered(inputEl.value);
    renderDrop(list);
  }, 70);
});

inputEl.addEventListener("keydown", (e) => {
  if (!gameStarted || gameEnded) return;

  if (e.key === "Escape") {
    hideDrop();
    inputEl.blur();
    return;
  }
  if (e.key === "Enter") {
    const first = dropEl.querySelector(".chainOpt") as HTMLElement | null;
    const id = first?.dataset?.id;
    if (id) pickById(id);
  }
});

dropEl.addEventListener("mousedown", (e) => {
  if (!gameStarted || gameEnded) return;

  const t = e.target as HTMLElement | null;
  const opt = t?.closest(".chainOpt") as HTMLDivElement | null;
  const id = opt?.dataset?.id;
  if (id) pickById(id);
});

document.addEventListener("click", (e) => {
  const t = e.target as HTMLElement | null;
  if (!t) return;
  if (t === inputEl || t.closest("#chainDrop")) return;
  hideDrop();
});

document.getElementById("chainGiveUp")?.addEventListener("click", () => {
  if (!gameStarted || gameEnded) return;
  void endGame("giveup");
});

document.getElementById("lbRefresh")?.addEventListener("click", () => {
  void loadTop10();
});

startBtnEl?.addEventListener("click", () => {
  if (gameEnded) return;
  if (!RULES.length) return;

  hideStartOverlay();
  hideEndOverlay();

  gameStarted = true;
  gameEnded = false;

  const next = pickNextTwoRules(RULES);
  ruleA = next.a;
  ruleB = next.b;
  setRuleUI();

  if (ruleA && ruleB) rememberLast(ruleA, ruleB);

  resetRoundAward();
  wrongThisRound = 0;

  inputEl.disabled = false;
  inputEl.focus();

  setTopStatus("Good luck!", "muted");
  startTimer();
});

document.getElementById("chainRestart")?.addEventListener("click", () => {
  stopTimer();
  updateTimerUI(30, 30);

  gameEnded = false;
  gameStarted = false;

  hideEndOverlay();

  // ✅ Restart / Play again: should NOT show "How it works"
  showStartOverlay();

  streak = 0;
  streakEl.textContent = "0";
  updateStreakBadge(0);

  setScore(0);
  resetRoundAward();
  wrongThisRound = 0;
  resetUsed();

  ruleA = null;
  ruleB = null;
  renderRules([]);

  clearPickedUI();
  inputEl.value = "";
  hideDrop();

  setTopStatus("Press Start to begin", "muted");
  showToast("Restarted");

  inputEl.disabled = true;

  lastSigA = null;
  lastSigB = null;
  recentSigs.length = 0;
});

endRestartEl?.addEventListener("click", () => {
  // Play again uses the same restart flow (✅ will NOT show How it works)
  (document.getElementById("chainRestart") as HTMLButtonElement | null)?.click();
});

/* =========================
   INIT
   ========================= */

function computeHasDescData(cards: Card[]): boolean {
  for (let i = 0; i < cards.length; i++) {
    const c: any = cards[i] as any;
    const t =
      (typeof c?.desc === "string" && c.desc) ||
      (typeof c?.description === "string" && c.description) ||
      (typeof c?.text === "string" && c.text) ||
      (typeof c?.effect === "string" && c.effect) ||
      "";
    if (String(t).trim().length > 0) return true;
  }
  return false;
}

async function init() {
  try {
    setMsg("");
    renderRules([]);
    setTopStatus("Press Start to begin", "muted");

    stopTimer();
    inputEl.disabled = true;
    updateTimerUI(30, 30);

    void loadTop10();

    CARDS = await loadAllCards();
    RULES = await loadRules();

    // ✅ detect whether our card data actually contains descriptions/effect text
    HAS_DESC_DATA = computeHasDescData(CARDS);
    if (!HAS_DESC_DATA) {
      console.warn("[chain] Card dataset has no desc/text. Disabling 'mentions/desc' rules in Chain Mode.");
    }

    CARD_BY_ID = new Map(CARDS.map((c) => [String(c.id), c]));
    CARD_NAME_LOWER = CARDS.map((c) => (c?.name ?? "").toLowerCase());

    gameEnded = false;
    gameStarted = false;

    setScore(0);
    resetRoundAward();
    wrongThisRound = 0;
    resetUsed();
    clearPickedUI();

    hideDrop();
    updateTimerUI(30, 30);

    renderRules([]);
    inputEl.disabled = true;

    lastSigA = null;
    lastSigB = null;
    recentSigs.length = 0;

    // ✅ First load: show overlay WITH "How it works"
    howShownOnce = false;
    showStartOverlay();
  } catch (e) {
    console.error("[chain] init failed:", e);
    setMsg("❌ Failed to init chain mode.", false);
    setTopStatus("Init failed", "bad");
    showToast("Init failed");
  }
}

init();
