// netlify/functions/picks.ts
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL as string);

function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    },
    body: JSON.stringify(body),
  };
}

type Row = {
  cell: string;
  card_id: number;
  cnt: number;
  total: number;
  rn: number;
};

export async function handler(event: any) {
  const seed = event.queryStringParameters?.seed;
  if (!seed) return json(400, { error: "Missing seed" });

  try {
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

    return json(200, { seed, top3, totals });
  } catch (e: any) {
    return json(500, { error: "DB error", detail: String(e?.message || e) });
  }
}
