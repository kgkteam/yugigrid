// netlify/functions/stats.js
// POST { seed, cell, cardId }  -> atomic-ish increment in Netlify Blobs (etag CAS)

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

  // allow cardId=0? probably never, but handle null/undefined properly
  if (!seed || !cell || cardId == null) {
    return json({ error: "missing fields" }, 400);
  }

  // normalize to avoid "123" vs 123 creating two buckets
  const cardKey = String(cardId);

  const key = `picks/daily/${seed}.json`;

  // optimistic concurrency with ETag retries
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
    const res = await store.setJSON(key, next, writeOpts);

    if (res.modified) return json({ ok: true });
  }

  return json({ error: "conflict" }, 409);
};
