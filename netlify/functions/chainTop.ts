// netlify/functions/chainTop.ts
import type { Handler } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const JSON_HEADERS: Record<string, string> = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS",
};

// ✅ bump this anytime you redeploy to verify the live function updated
const VERSION = "chainTop-2026-01-09-v6";

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

function isLocalDev(): boolean {
  return process.env.NETLIFY_DEV === "true" || process.env.NETLIFY_LOCAL === "true";
}

// ===== MOCK DATA (only local) =====
let MOCK_LIST: Entry[] = [
  { name: "Lucky Fox", points: 88, ts: Date.now() - 300000 },
  { name: "Nova Wolf", points: 71, ts: Date.now() - 240000 },
  { name: "Crimson Hawk", points: 54, ts: Date.now() - 180000 },
];

function cleanName(x: unknown): string | null {
  const s = String(x ?? "").trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (!/^[a-zA-Z0-9 _\-]+$/.test(s)) return null;
  if (s.length < 3) return null;
  return s.slice(0, 18);
}

/**
 * ✅ Creates a blobs store in a way that works even if
 * Netlify doesn't auto-inject the blobs environment.
 *
 * Required env vars on Netlify (Site settings → Environment variables):
 * - NETLIFY_SITE_ID
 * - NETLIFY_AUTH_TOKEN  (a Personal Access Token)
 */
function getBlobsStore() {
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID || "";
  const token =
    process.env.NETLIFY_AUTH_TOKEN ||
    process.env.NETLIFY_TOKEN ||
    process.env.BLOBS_TOKEN ||
    "";

  // If provided, use manual config (fixes your error)
  if (siteID && token) {
    return getStore({ name: "chain_leaderboard", siteID, token });
  }

  // Fallback: try default (works on some setups)
  return getStore("chain_leaderboard");
}

/**
 * ✅ Robust read that never throws:
 * - tries JSON typed read
 * - if it fails, falls back to text read
 */
async function readTop10(store: ReturnType<typeof getStore>, key: string): Promise<Top10> {
  try {
    const raw = (await store.get(key, { type: "json" })) as unknown;

    if (!raw) return { list: [] };

    if (typeof raw === "object" && raw !== null && Array.isArray((raw as any).list)) {
      return { list: (raw as any).list as Entry[] };
    }

    if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.list)) return { list: parsed.list as Entry[] };
    }

    return { list: [] };
  } catch {
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

function ok(body: any) {
  return {
    statusCode: 200,
    headers: JSON_HEADERS,
    body: JSON.stringify({ ok: true, version: VERSION, ...body }),
  };
}

function bad(statusCode: number, error: string, extra?: any) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify({ ok: false, version: VERSION, error, ...(extra || {}) }),
  };
}

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") return ok({});

    const key = "top10_global";

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

    // LOCAL DEV (MOCK)
    if (isLocalDev()) {
      if (clearByGet || clearByPost) {
        MOCK_LIST = [];
        return ok({ cleared: true, list: [] as Entry[] });
      }

      if (event.httpMethod === "GET") return ok({ list: MOCK_LIST });

      if (event.httpMethod === "POST") {
        if (!event.body) return bad(400, "Missing body");

        let body: any;
        try {
          body = JSON.parse(event.body);
        } catch {
          return bad(400, "Invalid JSON body");
        }

        const p = Number(body?.points);
        if (!Number.isFinite(p) || p < 0 || p > 999) return bad(400, "Invalid points");

        const nm = cleanName(body?.name) ?? randomName();
        MOCK_LIST.push({ name: nm, points: p, ts: Date.now() });

        MOCK_LIST.sort((a, b) => (b.points - a.points) || (a.ts - b.ts));
        MOCK_LIST = MOCK_LIST.slice(0, 10);

        return ok({ changed: true, list: MOCK_LIST });
      }

      return bad(405, "Method Not Allowed");
    }

    // PROD (NETLIFY BLOBS)
    const store = getBlobsStore();

    // Optional: if env is missing, return a clearer hint.
    // (This doesn't block the fallback, but gives you a readable error if fallback fails.)
    const hasManualEnv =
      !!(process.env.NETLIFY_SITE_ID || process.env.SITE_ID) &&
      !!(process.env.NETLIFY_AUTH_TOKEN || process.env.NETLIFY_TOKEN || process.env.BLOBS_TOKEN);

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

      if (!ADMIN_TOKEN) return bad(500, "Admin token not configured");
      if (!token || token !== ADMIN_TOKEN) return bad(403, "Forbidden");

      try {
        await store.delete(key);
        return ok({ cleared: true, list: [] as Entry[] });
      } catch (e: any) {
        return bad(
          500,
          e?.message ?? String(e),
          hasManualEnv
            ? undefined
            : { hint: "Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN in Netlify environment variables." }
        );
      }
    }

    if (event.httpMethod === "GET") {
      try {
        const data = await readTop10(store, key);
        return ok({ list: data.list });
      } catch (e: any) {
        return bad(
          500,
          e?.message ?? String(e),
          hasManualEnv
            ? undefined
            : { hint: "Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN in Netlify environment variables." }
        );
      }
    }

    if (event.httpMethod === "POST") {
      if (!event.body) return bad(400, "Missing body");

      let body: any;
      try {
        body = JSON.parse(event.body);
      } catch {
        return bad(400, "Invalid JSON body");
      }

      const p = Number(body?.points);
      if (!Number.isFinite(p) || p < 0 || p > 999) return bad(400, "Invalid points");

      try {
        const data = await readTop10(store, key);
        const list: Entry[] = Array.isArray(data.list) ? [...data.list] : [];

        const nm = cleanName(body?.name) ?? "Anonymous";
        list.push({ name: nm, points: p, ts: Date.now() });

        list.sort((a, b) => (b.points - a.points) || (a.ts - b.ts));
        const trimmed = list.slice(0, 10);

        await store.set(key, JSON.stringify({ list: trimmed }));

        return ok({ changed: true, list: trimmed });
      } catch (e: any) {
        return bad(
          500,
          e?.message ?? String(e),
          hasManualEnv
            ? undefined
            : { hint: "Set NETLIFY_SITE_ID and NETLIFY_AUTH_TOKEN in Netlify environment variables." }
        );
      }
    }

    return bad(405, "Method Not Allowed");
  } catch (e: any) {
    return bad(500, e?.message ?? String(e));
  }
};
