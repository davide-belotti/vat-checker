import { runChecksum, queryVIES, queryHMRC } from "./validate-vat.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Transient VIES error detection ─────────────────────────

const TRANSIENT_ERRORS = [
  "MS_MAX_CONCURRENT_REQ",
  "MS_UNAVAILABLE",
  "TIMEOUT",
  "SERVICE_UNAVAILABLE",
];

function isTransientError(result) {
  if (!result || !result.error) return false;
  return TRANSIENT_ERRORS.some((e) => result.error.includes(e));
}

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
    return { candidates: [], confidence: null, verified: [], apiErrors: [] };
  }

  const isUK = cc === "GB" || cc === "XI";
  const verified = [];
  const apiErrors = [];
  let delayMs = 1000;

  for (const c of candidates) {
    await sleep(delayMs);

    let result;
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = isUK
        ? await queryHMRC(c.number)
        : await queryVIES(cc, c.number);

      if (!isTransientError(result)) break;
      if (attempt < 3) {
        const backoff = delayMs * Math.pow(2, attempt);
        await sleep(backoff);
      }
    }

    if (result && result.error) {
      if (isTransientError(result)) {
        delayMs = Math.min(delayMs * 2, 5000);
      }
      apiErrors.push({
        vatSuggestion: `${cc}${c.number}`,
        error: result.error,
      });
    } else if (result && !result.error) {
      delayMs = Math.max(1000, delayMs > 1000 ? delayMs - 500 : delayMs);
      if (result.registered) {
        verified.push({
          vatSuggestion: `${cc}${c.number}`,
          registered: true,
          name: result.name || "N/A",
          address: result.address || "N/A",
          country: result.country || cc,
        });
      }
    }
  }

  const confidence = getVerifiedConfidence(verified.length);
  return { candidates, confidence, verified, apiErrors };
}

export { suggestCorrections, getConfidence, getVerifiedConfidence, getSuggestions };
