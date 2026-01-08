import type { Rule } from "./engine/engine";

export const DEBUG_CHAIN_RULES_ENABLED = false;

export const DEBUG_CHAIN_RULES: Rule[] = [
    {
    key: "fusion",
    op: "eq",
    value: true,
    label: "Fusion",
  },
  {
    key: "DEF",
    op: "lowerEq",
    value: "3000",
    label: "3k def lower",
  },
];
