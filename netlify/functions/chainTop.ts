import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json",
  "cache-control": "no-store",
};

// ✅ bump this anytime you redeploy to verify the live function updated
const VERSION = "chainTop-2026-01-09-v2";

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

export const handler: Handler = async (event) => {
  try {
    const key = "top10_global";

    // ✅ ADMIN: clear leaderboard (use once, then remove)
    // Call: POST /.netlify/functions/chainTop with body:
    // { "adminClear": true, "token": "<TOKEN>" }
    //
    // Also supports GET param ?adminClear=1&token=<TOKEN> for easier testing:
    // https://yugigrid.com/.netlify/functions/chainTop?adminClear=1&token=...
    const ADMIN_TOKEN = process.env.CHAIN_ADMIN_TOKEN || "";

    const qs = event.queryStringParameters || {};
    const wantsClearByGet =
      event.httpMethod === "GET" && (qs.adminClear === "1" || qs.adminClear === "true");
    const wantsClearByPost = event.httpMethod === "POST" && !!event.body;

    if (wantsClearByGet || wantsClearByPost) {
      let token = "";

      if (wantsClearByGet) {
        token = String(qs.token || "");
      } else {
        try {
          const body = JSON.parse(event.body || "{}");
          if (body?.adminClear === true) token = String(body?.token || "");
          else token = ""; // normal POST continues below
          if (body?.adminClear !== true) token = "";
        } catch {
          token = "";
        }
      }

      // Only run clear if explicitly requested
      const clearRequested =
        wantsClearByGet ||
        (() => {
          try {
            const body = JSON.parse(event.body || "{}");
            return body?.adminClear === true;
          } catch {
            return false;
          }
        })();

      if (clearRequested) {
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

        MOCK_LIST.sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return a.ts - b.ts;
        });

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
      const data = (await store.get(key, { type: "json" })) as Top10 | null;
      return {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify({ version: VERSION, ...(data ?? { list: [] }) }),
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

      const data = (await store.get(key, { type: "json" })) as Top10 | null;
      const list: Entry[] = data?.list ? [...data.list] : [];

      // ✅ use real name if provided, else Anonymous
      const nm = cleanName(name) ?? "Anonymous";

      list.push({ name: nm, points: p, ts: Date.now() });

      list.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.ts - b.ts;
      });

      const trimmed = list.slice(0, 10);

      await store.set(key, { list: trimmed });

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
