import type { TaxCountry } from "@prisma/client";
import { nigeriaRules } from "./nigeria.js";
import { usRules } from "./us.js";
import type { TaxRuleModule } from "./types.js";
const modules: Record<TaxCountry, TaxRuleModule> = { NIGERIA: nigeriaRules, US: usRules };
export function getTaxRules(country?: TaxCountry | null) { return modules[country ?? "NIGERIA"] ?? modules.NIGERIA; }
