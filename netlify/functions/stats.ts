// netlify/functions/stats.ts
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL as string);

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      // ha nincs szükség CORS-ra, ezt kiszedheted
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "POST,OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

export async function handler(event: any) {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let payload: any = {};
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const seed = String(payload.seed || "");
  const cell = String(payload.cell || "");
  const cardIdNum = Number(payload.cardId);

  if (!seed || !cell || !Number.isFinite(cardIdNum)) {
    return json(400, { ok: false, error: "Missing/invalid: seed, cell, cardId" });
  }

  try {
    await sql`
      insert into votes (seed, cell, card_id, cnt)
      values (${seed}, ${cell}, ${cardIdNum}, 1)
      on conflict (seed, cell, card_id)
      do update set cnt = votes.cnt + 1,
                    updated_at = now()
    `;

    return json(200, { ok: true });
  } catch (e: any) {
    return json(500, { ok: false, error: "DB error", detail: String(e?.message || e) });
  }
}
