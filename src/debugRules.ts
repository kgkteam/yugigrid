import type { Rule } from "./engine/engine";

export const DEBUG_CHAIN_RULES_ENABLED = true;

export const DEBUG_CHAIN_RULES: Rule[] = [
    
  { "key":"desc", "op":"contains", "value":"target", "label":"Targets card" },
  
  { "key":"desc", "op":"contains", "value":"Special Summon", "label":"Mentions Special Summon" },
];
