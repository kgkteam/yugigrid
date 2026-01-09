import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

// ✅ bump this anytime you redeploy to verify the live function updated
const VERSION = "chainTop-2026-01-09-v4";

type Entry = {
  name: string;
  points: number;
  ts: number;
};

type Top10 = {
  list: Entry[];
};

const ADJ = ["Lucky", "Silent", "Rapid", "Golden", "Brave", "Cosmic", "Nova", "Icy", "Crimson", "Arcane"];
const NOUN = ["Fox", "Wolf", "Panda", "Hawk", "Otter", "Tiger", "Raven", "Lynx", "Viper", "Koala"];

function randomName(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return `${a} ${n}`;
}

// ✅ ONLY local when running `netlify dev`
function isLocalDev(): boolean {
  return process.env.NETLIFY_DEV === "true" || process.env.NETLIFY_LOCAL === "true";
}

// ===== MOCK DATA (only local) =====
let MOCK_LIST: Entry[] = [
  { name: "Lucky Fox", points: 88, ts: Date.now() - 300000 },
  { name: "Nova Wolf", points: 71, ts: Date.now() - 240000 },
  { name: "Crimson Hawk", points: 54, ts: Date.now() - 180000 },
];

// ✅ sanitize + limit name length
function cleanName(x: unknown): string | null {
  const s = String(x ?? "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (!/^[a-zA-Z0-9 _\-]+$/.test(s)) return null;
  if (s.length < 3) return null;
  return s.slice(0, 18);
}

/**
 * ✅ Robust read that never throws:
 * - tries JSON typed read
 * - if it fails (bad data), falls back to text read
 */
async function readTop10(store: ReturnType<typeof getStore>, key: string): Promise<Top10> {
  // 1) Try JSON mode
  try {
    const raw = (await store.get(key, { type: "json" })) as unknown;

    if (!raw) return { list: [] };

    // stored as object { list: [...] }
    if (typeof raw === "object" && raw !== null && Array.isArray((raw as any).list)) {
      return { list: (raw as any).list as Entry[] };
    }

    // stored as JSON string (rare)
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.list)) return { list: parsed.list as Entry[] };
    }

    return { list: [] };
  } catch {
    // 2) Fallback: read as text and parse ourselves
    try {
      const txt = (await store.get(key, { type: "text" })) as unknown;
      if (typeof txt !== "string" || !txt) return { list: [] };
      const parsed = JSON.parse(txt);
      if (parsed && Array.isArray(parsed.list)) return { list: parsed.list as Entry[] };
      return { list: [] };
    } catch {
      return { list: [] };
    }
  }
}

export const handler: Handler = async (event) => {
  try {
    // ✅ QUICK WIPE OPTION:
    // Change this key to instantly "reset" the leaderboard without fighting old stored data.
    // Example: "top10_global_v2"
    const key = "top10_global";

    /* =========================
       ADMIN: CLEAR LEADERBOARD
       =========================
       - GET:  /.netlify/functions/chainTop?adminClear=1&token=...
       - POST: /.netlify/functions/chainTop  body { "adminClear": true, "token":"..." }
    */
    const ADMIN_TOKEN = process.env.CHAIN_ADMIN_TOKEN || "";
    const qs = event.queryStringParameters || {};

    const clearByGet =
      event.httpMethod === "GET" && (qs.adminClear === "1" || qs.adminClear === "true");

    const clearByPost =
      event.httpMethod === "POST" &&
      !!event.body &&
      (() => {
        try {
          const body = JSON.parse(event.body || "{}");
          return body?.adminClear === true;
        } catch {
          return false;
        }
      })();

    if (clearByGet || clearByPost) {
      const token = clearByGet
        ? String(qs.token || "")
        : (() => {
            try {
              const body = JSON.parse(event.body || "{}");
              return String(body?.token || "");
            } catch {
              return "";
            }
          })();

      if (!ADMIN_TOKEN) {
        return {
          statusCode: 500,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: false, error: "Admin token not configured", version: VERSION }),
        };
      }

      if (!token || token !== ADMIN_TOKEN) {
        return {
          statusCode: 403,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: false, error: "Forbidden", version: VERSION }),
        };
      }

      const store = getStore("chain_leaderboard");
      await store.delete(key);

      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({ ok: true, cleared: true, version: VERSION }),
      };
    }

    /* =========================
       LOCAL DEV (MOCK)
       ========================= */
    if (isLocalDev()) {
      if (event.httpMethod === "GET") {
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ version: VERSION, list: MOCK_LIST }),
        };
      }

      if (event.httpMethod === "POST") {
        if (!event.body) {
          return {
            statusCode: 400,
            headers: JSON_HEADERS,
            body: JSON.stringify({ ok: false, error: "Missing body", version: VERSION }),
          };
        }

        const { points, name } = JSON.parse(event.body);
        const p = Number(points);

        if (!Number.isFinite(p) || p < 0 || p > 999) {
          return {
            statusCode: 400,
            headers: JSON_HEADERS,
            body: JSON.stringify({ ok: false, error: "Invalid points", version: VERSION }),
          };
        }

        const nm = cleanName(name) ?? randomName();
        MOCK_LIST.push({ name: nm, points: p, ts: Date.now() });

        MOCK_LIST.sort((a, b) => (b.points - a.points) || (a.ts - b.ts));
        MOCK_LIST = MOCK_LIST.slice(0, 10);

        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: true, list: MOCK_LIST, changed: true, version: VERSION }),
        };
      }

      return {
        statusCode: 405,
        headers: JSON_HEADERS,
        body: JSON.stringify({ ok: false, error: "Method Not Allowed", version: VERSION }),
      };
    }

    /* =========================
       PROD (NETLIFY BLOBS)
       ========================= */
    const store = getStore("chain_leaderboard");

    // GET -> top10
    if (event.httpMethod === "GET") {
      const data = await readTop10(store, key);
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({ version: VERSION, ...data }),
      };
    }

    // POST -> score beküldés
    if (event.httpMethod === "POST") {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: false, error: "Missing body", version: VERSION }),
        };
      }

      const { points, name } = JSON.parse(event.body);
      const p = Number(points);

      if (!Number.isFinite(p) || p < 0 || p > 999) {
        return {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: false, error: "Invalid points", version: VERSION }),
        };
      }

      const data = await readTop10(store, key);
      const list: Entry[] = Array.isArray(data.list) ? [...data.list] : [];

      const nm = cleanName(name) ?? "Anonymous";
      list.push({ name: nm, points: p, ts: Date.now() });

      list.sort((a, b) => (b.points - a.points) || (a.ts - b.ts));
      const trimmed = list.slice(0, 10);

      // ✅ store as JSON STRING (TS-safe, Node-safe)
      await store.set(key, JSON.stringify({ list: trimmed }));

      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({ ok: true, list: trimmed, changed: true, version: VERSION }),
      };
    }

    return {
      statusCode: 405,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: false, error: "Method Not Allowed", version: VERSION }),
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: false, error: e?.message ?? String(e), version: VERSION }),
    };
  }
};
