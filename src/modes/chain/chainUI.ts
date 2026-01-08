import type { Card } from "../../engine";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

type RenderOpts = {
  onPick: (card: Card) => void;
  onClose: () => void;
};

let bound = false;
let _onPick: ((card: Card) => void) | null = null;
let _onClose: (() => void) | null = null;

let ACTIVE: Card[] = [];
let lastQuery = "";

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

function cardImageUrlById(id: string | number): string {
  return `https://images.ygoprodeck.com/images/cards_small/${encodeURIComponent(String(id))}.jpg`;
}

function renderList(q: string) {
  const list = $("chainList");
  if (!list) return;

  const needle = String(q || "").trim().toLowerCase();
  let items = needle ? ACTIVE.filter((c) => c.name.toLowerCase().includes(needle)) : ACTIVE;

  // limit hogy ne legyen brutál nagy
  const MAX_SHOW = 10;
  const limited = items.length > MAX_SHOW;
  if (limited) items = items.slice(0, MAX_SHOW);

  list.innerHTML = "";

  if (limited) {
    list.innerHTML += `<div style="opacity:.7; padding:8px 6px;">Showing first ${MAX_SHOW}. Type to search…</div>`;
  }

  if (!items.length) {
    list.innerHTML = `<div style="opacity:.7; padding:10px;">No matches.</div>`;
    return;
  }

  for (const card of items) {
    const small = cardImageUrlById(card.id);
    const row = document.createElement("div");
    row.className = "chainItem";
    row.innerHTML = `
      <img class="chainThumb" src="${escapeHtml(small)}" alt="" loading="lazy" decoding="async">
      <div class="chainName">${escapeHtml(card.name)}</div>
      <button class="chainPickBtn" type="button">Pick</button>
    `;

    (row.querySelector(".chainPickBtn") as HTMLButtonElement).onclick = () => {
  // ✅ pick után azonnal ürítsük a search-t, bármi is lesz az eredmény
  const search = $("chainSearch") as HTMLInputElement | null;
  if (search) search.value = "";
  lastQuery = "";
  renderList("");

  _onPick?.(card);
};


    list.appendChild(row);
  }
}

export function renderChainUI(opts: RenderOpts) {
  _onPick = opts.onPick;
  _onClose = opts.onClose;

  const screen = $("chainScreen");
  if (!screen) return;

  screen.style.display = "grid";

  // panel felépítés (rule + picker)
  screen.innerHTML = `
    <div class="chainPanel">
      <div class="chainTop">
        <div>
          <div class="chainTitle">Chain Mode</div>
          <div class="chainMeta">
            Score: <span id="chainScore">0</span> • Time: <span id="chainTime">30</span>s
          </div>
        </div>
        <button id="chainCloseBtn" class="iconBtn" type="button">✕</button>
      </div>

      <div class="chainRule" id="chainRule">—</div>
      <div class="chainStatus" id="chainStatus" style="margin-top:10px; opacity:.8; font-weight:800;">—</div>

      <div style="margin-top:12px;">
        <input id="chainSearch" class="search" placeholder="Search card..." />
      </div>

      <div id="chainList" class="chainList"></div>
    </div>
  `;

  if (!bound) {
    bound = true;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("chainScreen")?.style.display !== "none") {
        _onClose?.();
      }
    });
  }

  const closeBtn = $("chainCloseBtn") as HTMLButtonElement | null;
  if (closeBtn) closeBtn.onclick = () => _onClose?.();

  const search = $("chainSearch") as HTMLInputElement | null;
  if (search) {
    search.oninput = () => {
      lastQuery = search.value;
      renderList(lastQuery);
    };
    search.value = "";
    lastQuery = "";
  }
}

export function updateChainUI(p: {
  running: boolean;
  score: number;
  ruleLabel: string;
  timeLeft: number;
  status: string;
  cards: Card[];
}) {
  ACTIVE = (p.cards || []).slice().sort((a, b) => a.name.localeCompare(b.name));

  const sc = $("chainScore");
  const tm = $("chainTime");
  const rl = $("chainRule");
  const st = $("chainStatus");

  if (sc) sc.textContent = String(p.score);
  if (tm) tm.textContent = String(Math.max(0, p.timeLeft));
  if (rl) rl.textContent = p.ruleLabel || "—";
  if (st) st.textContent = p.status || "";

  renderList(lastQuery);

  // ha game over → keresőt letilthatod
  const search = $("chainSearch") as HTMLInputElement | null;
  if (search) search.disabled = !p.running;
}

export function closeChainUI() {
  const screen = $("chainScreen");
  if (!screen) return;
  screen.style.display = "none";
  screen.innerHTML = "";
}
