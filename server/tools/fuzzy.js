/**
 * Shared fuzzy matcher (Levenshtein-ratio, same spirit as the ICAR
 * Python difflib SequenceMatcher.ratio threshold of 0.75).
 * Used to resolve messy crop names ("soyabean" -> "Soybean").
 */

/** Levenshtein edit distance between two strings. */
function levenshtein(a, b) {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const prev = new Array(n + 1);
  const cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = cur[j];
  }
  return prev[n];
}

/** Similarity ratio in [0,1]; 1 = identical. */
export function ratio(a, b) {
  if (!a && !b) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - dist / maxLen;
}

/**
 * Resolve a candidate string against a list of canonical names.
 * Exact (case-insensitive) wins; else best ratio >= threshold; else null.
 * @param {string} candidate
 * @param {string[]} names
 * @param {number} [threshold=0.75]
 * @returns {string|null}
 */
export function resolveName(candidate, names, threshold = 0.75) {
  if (!candidate || typeof candidate !== "string") return null;
  const c = candidate.trim().toLowerCase();
  if (!c) return null;
  for (const n of names) {
    if (n.toLowerCase() === c) return n;
  }
  // substring hit (e.g. "mustard" -> "Rapeseed-mustard")
  for (const n of names) {
    const nl = n.toLowerCase();
    if (nl.includes(c) || c.includes(nl)) return n;
  }
  let best = null;
  let bestR = 0;
  for (const n of names) {
    const r = ratio(c, n.toLowerCase());
    if (r > bestR) {
      bestR = r;
      best = n;
    }
  }
  return bestR >= threshold ? best : null;
}
