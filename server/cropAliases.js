/**
 * cropAliases.js — canonical crop name -> common aliases (English + Indian
 * vernacular). This mapping is:
 *   1) injected into the LLM context so the model can resolve ANY messy /
 *      misspelled / local-language crop name to a canonical English name, and
 *   2) used server-side as a DETERMINISTIC dictionary lookup (NOT fuzzy) to
 *      map an alias to the canonical folder name.
 *
 * The LLM does the smart resolution (it handles arbitrary spelling mistakes);
 * this dictionary is the deterministic backup — no Levenshtein guessing.
 */
export const CROP_ALIASES = {
  Castor: ["castor", "arandi", "erandi", "erand", "haralu", "aamudam", "amudam", "chittamudam"],
  Groundnut: ["groundnut", "peanut", "moongphali", "mungfali", "mungphali", "shenga", "kadalekai", "nilakadalai", "verkadalai", "pallelu", "verusanaga"],
  Linseed: ["linseed", "flax", "flaxseed", "alsi", "tisi", "agasi", "javas", "ali"],
  Niger: ["niger", "nigerseed", "ramtil", "ramtilli", "uchellu", "gurellu", "valisulu"],
  "Rapeseed-mustard": ["rapeseed", "mustard", "rapeseed-mustard", "sarson", "sarso", "rai", "toria", "raya", "mohri", "aavalu", "sasive"],
  Safflower: ["safflower", "kusum", "kusuma", "kardai", "kardi", "kusube"],
  Sesame: ["sesame", "til", "teel", "ellu", "gingelly", "nuvvulu", "nuvvu", "simsim"],
  Soybean: ["soybean", "soya", "soya bean", "soyabean", "bhat", "bhatmas"],
  Sunflower: ["sunflower", "surajmukhi", "suryakanti", "suryakamal", "suryphul"],
};

// Build a reverse lookup: lowercased alias -> canonical name.
const REVERSE = {};
for (const [canonical, aliases] of Object.entries(CROP_ALIASES)) {
  REVERSE[canonical.toLowerCase()] = canonical;
  for (const a of aliases) REVERSE[a.toLowerCase()] = canonical;
}

/**
 * Deterministic alias -> canonical resolution (NO fuzzy matching).
 * @param {string} candidate
 * @param {string[]|null} [allowed] restrict to crops actually present on disk
 * @returns {string|null}
 */
export function resolveCropAlias(candidate, allowed = null) {
  if (!candidate || typeof candidate !== "string") return null;
  const canon = REVERSE[candidate.trim().toLowerCase()];
  if (!canon) return null;
  if (allowed && !allowed.includes(canon)) return null;
  return canon;
}

/** Render the mapping as text to inject into the LLM system instruction. */
export function renderCropMappingForPrompt() {
  return Object.entries(CROP_ALIASES)
    .map(([canonical, aliases]) => `- ${canonical}: ${aliases.join(", ")}`)
    .join("\n");
}
