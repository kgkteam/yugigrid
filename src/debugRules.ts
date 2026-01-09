// debugRules.ts
// ⚠️ CSAK FEJLESZTÉSHEZ – PROD-BAN KAPCSOLD KI

import type { Rule } from "./engine";

/* =========================
   DEBUG FLAG
   ========================= */

export const DEBUG_RULES_ENABLED = false; // ⬅️ false prod előtt

/* =========================
   FIX RULE PAIRS (Chain Mode)
   ========================= */

/**
 * Chain mode-hoz:
 * mindig EZT a két szabályt adja vissza
 */
export const DEBUG_CHAIN_RULES: { a: Rule; b: Rule; cnt?: number } = {
  a: {
    key: "attribute",
    op: "eq",
    value: "EARTH",
    label: "Earth monster",
  },
  
    b:{ "key":"effect", "op":"eq", "value":false, "label":"Non-Effect Monster" },
  cnt: 3, // opcionális – ha minimum megoldásszámot nézel
};
