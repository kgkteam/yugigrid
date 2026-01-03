// netlify/functions/stats.js
import { getStore } from "@netlify/blobs";

const store = getStore("yugigrid");

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

function isPreconditionFail(err) {
  const msg = String(err?.message || err || "");
  // Netlify/undici/fetch hibák változhatnak, ez a lazy-safe check
  return (
    msg.includes("onlyIfMatch") ||
    msg.includes("onlyIfNew") ||
    msg.includes("Precondition") ||
    msg.includes("412") ||
    msg.includes("condition") ||
    msg.includes("etag")
  );
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const body = await req.json().catch(() => null);
  const { seed, cell, cardId } = body || {};

  if (!seed || !cell || cardId == null) {
    return json({ error: "missing fields" }, 400);
  }

  const cardKey = String(cardId);
  const key = `picks/daily/${seed}.json`;

  for (let i = 0; i < 10; i++) {
    const existing = await store.getWithMetadata(key, {
      type: "json",
      consistency: "strong",
    });

    const etag = existing?.etag;
    const cur = existing?.data ?? { cells: {} };

    const next = { cells: { ...cur.cells } };

    const prevCell = next.cells[cell] || { total: 0, cards: {} };
    const nextCell = {
      total: (prevCell.total || 0) + 1,
      cards: { ...(prevCell.cards || {}) },
    };
    nextCell.cards[cardKey] = (nextCell.cards[cardKey] || 0) + 1;

    next.cells[cell] = nextCell;

    try {
      if (etag) {
        await store.setJSON(key, next, { onlyIfMatch: etag });
      } else {
        await store.setJSON(key, next, { onlyIfNew: true });
      }
      // ha idáig eljutunk, akkor sikerült az írás
      return json({ ok: true });
    } catch (err) {
      // ha ütközés/precondition fail → újrapróbáljuk
      if (isPreconditionFail(err)) continue;

      // egyéb hiba → logolhatóbb válasz
      return json(
        { error: "write_failed", message: String(err?.message || err) },
        500
      );
    }
  }

  return json({ error: "conflict" }, 409);
};
