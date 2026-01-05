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
    { "key":"firstSetYear", "op":"lowerEq", "value":2005, "label":"First Print before 2005" },
    { "key":"firstSetYear", "op":"between", "value":2005, "value2":2020, "label":"First Print between 2005-2020" },
    { "key":"firstSetYear", "op":"higherEq", "value":2020, "label":"First Print after 2020" }
  ],
};
