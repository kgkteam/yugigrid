import { getStore } from "@netlify/blobs";

const store = getStore("yugigrid");

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });

export default async (req) => {
  if (req.method !== "GET") {
    return json({ error: "method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const seed = url.searchParams.get("seed");
  if (!seed) return json({ error: "missing seed" }, 400);

  const key = `picks/daily/${seed}.json`;

  const existing = await store.get(key, { type: "json", consistency: "strong" });
  const data = existing?.data ?? { cells: {} };
  return json(data);
};
