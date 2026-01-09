import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

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
  // allow simple chars
  if (!/^[a-zA-Z0-9 _\-]+$/.test(s)) return null;
  if (s.length < 3) return null;
  return s.slice(0, 18);
}

export const handler: Handler = async (event) => {
  try {
    const key = "top10_global";

    // ✅ ADMIN: clear leaderboard (use once, then remove)
    // Call: POST /.netlify/functions/chainTop  with body { "adminClear": true, "token": "<TOKEN>" }
    const ADMIN_TOKEN = process.env.CHAIN_ADMIN_TOKEN || "";

    if (event.httpMethod === "POST" && event.body) {
      const body = JSON.parse(event.body);
      if (body?.adminClear === true) {
        if (!ADMIN_TOKEN) {
          return {
            statusCode: 500,
            headers: JSON_HEADERS,
            body: JSON.stringify({ ok: false, error: "Admin token not configured" }),
          };
        }
        if (String(body?.token || "") !== ADMIN_TOKEN) {
          return {
            statusCode: 403,
            headers: JSON_HEADERS,
            body: JSON.stringify({ ok: false, error: "Forbidden" }),
          };
        }

        const store = getStore("chain_leaderboard");
        await store.delete(key);

        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: true, cleared: true }),
        };
      }
    }

    /* =========================
       LOCAL DEV (MOCK)
       ========================= */
    if (isLocalDev()) {
      if (event.httpMethod === "GET") {
        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ list: MOCK_LIST }),
        };
      }

      if (event.httpMethod === "POST") {
        if (!event.body) {
          return {
            statusCode: 400,
            headers: JSON_HEADERS,
            body: JSON.stringify({ ok: false, error: "Missing body" }),
          };
        }

        const { points, name } = JSON.parse(event.body);
        const p = Number(points);

        if (!Number.isFinite(p) || p < 0 || p > 999) {
          return {
            statusCode: 400,
            headers: JSON_HEADERS,
            body: JSON.stringify({ ok: false, error: "Invalid points" }),
          };
        }

        const nm = cleanName(name) ?? randomName();

        MOCK_LIST.push({
          name: nm,
          points: p,
          ts: Date.now(),
        });

        MOCK_LIST.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return a.ts - b.ts;
        });

        MOCK_LIST = MOCK_LIST.slice(0, 10);

        return {
          statusCode: 200,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: true, list: MOCK_LIST, changed: true }),
        };
      }

      return {
        statusCode: 405,
        headers: JSON_HEADERS,
        body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
      };
    }

    /* =========================
       PROD (NETLIFY BLOBS)
       ========================= */
    const store = getStore("chain_leaderboard");

    // GET -> top10
    if (event.httpMethod === "GET") {
      const data = (await store.get(key, { type: "json" })) as Top10 | null;
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify(data ?? { list: [] }),
      };
    }

    // POST -> score beküldés
    if (event.httpMethod === "POST") {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: false, error: "Missing body" }),
        };
      }

      const { points, name } = JSON.parse(event.body);
      const p = Number(points);

      if (!Number.isFinite(p) || p < 0 || p > 999) {
        return {
          statusCode: 400,
          headers: JSON_HEADERS,
          body: JSON.stringify({ ok: false, error: "Invalid points" }),
        };
      }

      const data = (await store.get(key, { type: "json" })) as Top10 | null;
      const list: Entry[] = data?.list ? [...data.list] : [];

      // ✅ use real name if provided, else Anonymous
      const nm = cleanName(name) ?? "Anonymous";

      list.push({
        name: nm,
        points: p,
        ts: Date.now(),
      });

      list.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.ts - b.ts;
      });

      const trimmed = list.slice(0, 10);

      // ✅ always persist latest top10 (simple + reliable)
      await store.set(key, { list: trimmed });

      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({ ok: true, list: trimmed, changed: true }),
      };
    }

    return {
      statusCode: 405,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: false, error: "Method Not Allowed" }),
    };
  } catch (e: any) {
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: false, error: e?.message ?? String(e) }),
    };
  }
};
