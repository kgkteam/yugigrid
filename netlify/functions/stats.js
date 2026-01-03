// netlify/functions/stats.js
import { getStore } from "@netlify/blobs";

const store = getStore("yugigrid");

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });

export default async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const body = await req.json().catch(() => null);
  const { seed, cell, cardId } = body || {};

  if (!seed || !cell || cardId == null) {
    return json({ error: "missing fields" }, 400);
  }

  const cardKey = String(cardId);
  const key = `picks/daily/${seed}.json`;

  for (let i = 0; i < 6; i++) {
    const existing = await store.getWithMetadata(key, {
      type: "json",
      consistency: "strong"
    });

    const etag = existing?.etag;
    const cur = existing?.data ?? { cells: {} };

    const next = { cells: { ...cur.cells } };

    const prevCell = next.cells[cell] || { total: 0, cards: {} };
    const nextCell = {
      total: (prevCell.total || 0) + 1,
      cards: { ...(prevCell.cards || {}) }
    };

    nextCell.cards[cardKey] = (nextCell.cards[cardKey] || 0) + 1;
    next.cells[cell] = nextCell;

    const writeOpts = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };

    // IMPORTANT: set() -> string, biztosabban kompatibilis
    const res = await store.set(key, JSON.stringify(next), writeOpts);

    // res elvileg { modified, etag }, de ha mégsem, legalább nem crashelünk
    if (res?.modified) return json({ ok: true });
  }

  return json({ error: "conflict" }, 409);
};
