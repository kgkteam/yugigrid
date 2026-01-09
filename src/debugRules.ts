// debugRules.ts
// ⚠️ CSAK FEJLESZTÉSHEZ – PROD-BAN KAPCSOLD KI

import type { Rule } from "./engine";

/* =========================
   DEBUG FLAG
   ========================= */

export const DEBUG_RULES_ENABLED = true; // ⬅️ false prod előtt

/* =========================
   FIX RULE PAIRS (Chain Mode)
   ========================= */

/**
 * Chain mode-hoz:
 * mindig EZT a két szabályt adja vissza
 */
export const DEBUG_CHAIN_RULES: { a: Rule; b: Rule; cnt?: number } = {
    a: { "key":"level", "op":"lower", "value":3, "label":"Level 2 or lower" },
  
    b: { "key":"desc", "op":"contains", "value":"Special Summon this", "value2":"Must be Special Summoned", "value3":"Must first be Special Summoned", "label":"Special Summons itself" },
  cnt: 3, // opcionális – ha minimum megoldásszámot nézel
};
