// netlify/functions/submit.ts
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.NETLIFY_DATABASE_URL as string);

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
    body: JSON.stringify(body),
  };
}

type Pick = { cell: string; cardId: number };
type Row = {
  cell: string;
  card_id: number;
  cnt: number;
  total: number;
  rn: number;
};

export async function handler(event: any) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });

  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  try {
    const { seed, picks } = JSON.parse(event.body || "{}") as {
      seed?: string;
      picks?: Pick[];
    };

    if (!seed || !Array.isArray(picks) || picks.length === 0) {
      return json(400, { error: "Bad payload (missing seed or picks)" });
    }

    // basic validation
    for (const p of picks) {
      if (
        !p ||
        typeof p.cell !== "string" ||
        !p.cell.length ||
        typeof p.cardId !== "number" ||
        !Number.isFinite(p.cardId)
      ) {
        return json(400, { error: "Bad payload (invalid pick)" });
      }
    }

    // --- 1) UPSERT: mindegyik pick +1 szavazat ---
    // Feltételezi, hogy van unique constraint: (seed, cell, card_id)
    const cells = picks.map((p) => p.cell);
    const cardIds = picks.map((p) => p.cardId);

    await sql`
      with data as (
        select
          unnest(${cells}::text[])  as cell,
          unnest(${cardIds}::int[]) as card_id
      )
      insert into votes (seed, cell, card_id, cnt)
      select ${seed}, cell, card_id, 1
      from data
      on conflict (seed, cell, card_id)
      do update set cnt = votes.cnt + 1,
        updated_at = now()
    `;

    // --- 2) Visszaadjuk a top3 + totals-t (ugyanaz a logika, mint picks.ts) ---
    const rows = (await sql`
      select cell, card_id, cnt, total, rn
      from (
        select
          cell,
          card_id,
          cnt,
          sum(cnt) over (partition by cell) as total,
          row_number() over (partition by cell order by cnt desc) as rn
        from votes
        where seed = ${seed}
      ) t
      where rn <= 3
      order by cell, rn
    `) as Row[];

    const top3: Record<string, Array<{ cardId: number; cnt: number }>> = {};
    const totals: Record<string, number> = {};

    for (const r of rows) {
      if (!top3[r.cell]) top3[r.cell] = [];
      top3[r.cell].push({ cardId: r.card_id, cnt: r.cnt });
      totals[r.cell] = r.total;
    }

    return json(200, { ok: true, seed, top3, totals });
  } catch (e: any) {
    return json(500, { error: "DB error", detail: String(e?.message || e) });
  }
}
