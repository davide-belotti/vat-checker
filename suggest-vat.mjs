import { runChecksum, queryVIES, queryHMRC } from "./validate-vat.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Single-digit error correction ──────────────────────────

function suggestCorrections(cc, num) {
  const candidates = [];
  const chars = num.split("");

  for (let pos = 0; pos < chars.length; pos++) {
    const original = chars[pos];
    const isLetter = /[A-Z]/.test(original);
    const options = isLetter
      ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
      : "0123456789".split("");

    for (const replacement of options) {
      if (replacement === original) continue;
      chars[pos] = replacement;
      const candidate = chars.join("");
      const result = runChecksum(cc, candidate);
      if (result.valid) {
        candidates.push({
          number: candidate,
          position: pos + 1,
          change: `position ${pos + 1}: '${original}' \u2192 '${replacement}'`,
          label: `${cc}${candidate}`,
          type: "substitution",
        });
      }
    }
    chars[pos] = original;
  }

  for (let pos = 0; pos < chars.length - 1; pos++) {
    if (chars[pos] === chars[pos + 1]) continue;
    [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
    const candidate = chars.join("");
    const result = runChecksum(cc, candidate);
    if (result.valid) {
      const existing = candidates.find((c) => c.number === candidate);
      if (existing) {
        existing.type = "both";
        existing.change += ` (also swap positions ${pos + 1}\u2194${pos + 2})`;
      } else {
        candidates.push({
          number: candidate,
          position: pos + 1,
          change: `swap positions ${pos + 1}\u2194${pos + 2}: '${chars[pos + 1]}${chars[pos]}' \u2192 '${chars[pos]}${chars[pos + 1]}'`,
          label: `${cc}${candidate}`,
          type: "transposition",
        });
      }
    }
    [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
  }

  candidates.sort((a, b) => {
    const rank = { both: 0, transposition: 1, substitution: 2 };
    return rank[a.type] - rank[b.type];
  });

  return candidates;
}

// ─── Confidence classification ───────────────────────────────

function getConfidence(suggestions) {
  if (suggestions.length === 0) return null;
  const hasBoth = suggestions.some((s) => s.type === "both");
  if (suggestions.length === 1 || hasBoth) return "High";
  if (suggestions.length <= 3) return "Medium";
  return "Low";
}

function getVerifiedConfidence(verifiedCount) {
  if (verifiedCount === 0) return "None";
  if (verifiedCount === 1) return "High";
  if (verifiedCount <= 3) return "Medium";
  return "Low";
}

// ─── Suggest + verify via API ────────────────────────────────

async function getSuggestions(cc, num) {
  const candidates = suggestCorrections(cc, num);

  if (candidates.length === 0) {
    return { candidates: [], confidence: null, verified: [] };
  }

  const isUK = cc === "GB" || cc === "XI";
  const verified = [];

  for (const c of candidates) {
    await sleep(1000);
    const result = isUK
      ? await queryHMRC(c.number)
      : await queryVIES(cc, c.number);

    if (result && !result.error && result.registered) {
      verified.push({
        vatSuggestion: `${cc}${c.number}`,
        registered: true,
        name: result.name || "N/A",
        address: result.address || "N/A",
        country: result.country || cc,
      });
    }
  }

  const confidence = getVerifiedConfidence(verified.length);
  return { candidates, confidence, verified };
}

export { suggestCorrections, getConfidence, getVerifiedConfidence, getSuggestions };
