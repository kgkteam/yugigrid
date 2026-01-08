// debugRules.ts
import type { Rule } from "./engine";

// Kapcsold be local teszthez:
export const DEBUG_RULES_ENABLED = true;

// Itt adod meg kézzel a 3 row + 3 col rule-t
// (olyan Rule objektumok legyenek, mint amiket a rules.json-ból is használsz)
export const DEBUG_RULES: { rows: Rule[]; cols: Rule[] } = {
  rows: [
    { "key":"attribute", "op":"eq", "value":"LIGHT", "label":"Light Monster" },
    { "key":"desc", "op":"contains", "value":"Special Summon", "label":"Mentions Special Summon" },
    { "key":"banlistEver", "op":"eq", "value":true, "label":"Was ever Limited / Semi-Limited / Forbidden (TCG)" },
  ],
  
  cols: [
    { "key":"level", "op":"eq", "value":8, "label":"Level 8" },
    { "key":"desc", "op":"contains", "value":"GY", "value2":"Graveyard", "label":"Mentions GY" },
    { "key":"fusion", "op":"eq", "value": true, "label":"Fusion Monster" },
  ],
}
