// debugRules.ts
import type { Rule } from "./engine";

// Kapcsold be local teszthez:
export const DEBUG_RULES_ENABLED = true;

// Itt adod meg kézzel a 3 row + 3 col rule-t
// (olyan Rule objektumok legyenek, mint amiket a rules.json-ból is használsz)
export const DEBUG_RULES: { rows: Rule[]; cols: Rule[] } = {
  rows: [
    { "key":"attribute", "op":"eq", "value":"DARK", "label":"Dark Monster" },
    { "key":"attribute", "op":"eq", "value":"LIGHT", "label":"Light Monster" },
    { "key":"attribute", "op":"eq", "value":"WIND", "label":"Wind Monster" },
  ],
  cols: [
    { "key":"ritual", "op":"eq", "value":true, "label":"Ritual Monster" },
    { "key":"desc", "op":"contains", "value":"●", "label":"Has a multiple choice effect" },
    { "key":"name", "op":"special", "value":true, "label":"Has a non-letter character in the card name" },
  ],
}
