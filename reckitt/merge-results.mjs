import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";

function parseResultsTsv(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split("\t");
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
    return obj;
  });
}

function mergeResults(sidecarPath, resultsPath, suggestionsPath) {
  const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8"));
  const results = parseResultsTsv(resultsPath);

  let suggestions = [];
  try {
    suggestions = parseResultsTsv(suggestionsPath);
  } catch {
    // Suggestions file may not exist if --suggest wasn't used
  }

  // Build lookup: VAT → result row (use first match for each VAT)
  const resultsByVat = new Map();
  for (const r of results) {
    const key = r.VAT;
    if (key && !resultsByVat.has(key)) {
      resultsByVat.set(key, r);
    }
  }

  // Build lookup: VAT → best suggestion (first registered match)
  const suggestionsByVat = new Map();
  for (const s of suggestions) {
    const key = s.VAT;
    if (key && s.Registered === "Yes" && !suggestionsByVat.has(key)) {
      suggestionsByVat.set(key, s);
    }
  }

  const merged = [];

  for (const entry of sidecar) {
    const row = {
      transporeonId: entry.transporeonId,
      creditorNumber: entry.creditorNumber,
      carrier: entry.carrier,
      originalVat: entry.originalVat,
      vat: entry.vat,
      vatSource: entry.vatSource,
      country: entry.country,
      vatStatus: entry.vatStatus,
      format: "",
      checksum: "",
      registered: "",
      apiName: "",
      apiAddress: "",
      storedAddress: entry.storedAddress,
      addressMatch: "",
      notes: "",
    };

    if (entry.skipped) {
      row.notes = `Skipped: ${entry.vatStatus}`;
      merged.push(row);
      continue;
    }

    const result = resultsByVat.get(entry.vat);
    if (!result) {
      row.notes = "No validation result found";
      merged.push(row);
      continue;
    }

    row.format = result.Format || "";
    row.checksum = result.Checksum || "";
    row.registered = result.Registered || "";
    row.apiName = result.Name || "";
    row.apiAddress = result.Address || "";

    // If suggestion was resolved, pull corrected VAT
    if (result.Registered === "See suggestions") {
      const sug = suggestionsByVat.get(entry.vat);
      if (sug) {
        row.vat = sug.VAT_Suggestion || entry.vat;
        row.vatSource = "corrected";
        row.registered = "Yes (corrected)";
        row.apiName = sug.Name || "";
        row.apiAddress = sug.Address || "";
        row.notes = `Corrected from ${entry.vat}`;
      }
    }

    // Flag non-EU rows that couldn't be validated
    if (entry.vatStatus === "non_eu" && row.format === "Invalid") {
      row.notes = "Non-EU country — no checksum/API support";
    }

    merged.push(row);
  }

  // Write enriched TSV
  const dir = dirname(sidecarPath);
  const base = basename(sidecarPath, "-sidecar.json");
  const outPath = join(dir, `${base}-enriched.tsv`);

  const esc = (s) => (s ?? "").toString().replace(/\t/g, " ");
  const header = [
    "TRANSPOREON ID", "CreditorNumber", "Carrier", "OriginalVAT",
    "VAT", "VatSource", "Country", "VatStatus",
    "Format", "Checksum", "Registered",
    "ApiName", "ApiAddress", "StoredAddress",
    "AddressMatch", "Notes",
  ].join("\t");

  const outLines = merged.map((r) =>
    [
      esc(r.transporeonId), esc(r.creditorNumber), esc(r.carrier),
      esc(r.originalVat), esc(r.vat), r.vatSource, r.country, r.vatStatus,
      r.format, r.checksum, r.registered,
      esc(r.apiName), esc(r.apiAddress), esc(r.storedAddress),
      r.addressMatch, esc(r.notes),
    ].join("\t"),
  );

  writeFileSync(outPath, [header, ...outLines].join("\n") + "\n", "utf-8");

  // Summary
  const total = merged.length;
  const registered = merged.filter((r) => r.registered === "Yes" || r.registered === "Yes (corrected)").length;
  const notReg = merged.filter((r) => r.registered === "No").length;
  const corrected = merged.filter((r) => r.registered === "Yes (corrected)").length;
  const skippedCount = merged.filter((r) => r.notes.startsWith("Skipped")).length;
  const errors = merged.filter((r) => r.format === "Invalid" && !r.notes.includes("Non-EU")).length;

  console.log(`\n  Merge Results`);
  console.log(`  ─────────────`);
  console.log(`  Output:          ${outPath}`);
  console.log(`  Total rows:      ${total}`);
  console.log(`  Registered:      ${registered}${corrected > 0 ? ` (${corrected} corrected)` : ""}`);
  console.log(`  Not registered:  ${notReg}`);
  console.log(`  Skipped:         ${skippedCount} (no usable VAT)`);
  console.log(`  Format invalid:  ${errors}`);
  console.log();

  return outPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("Usage: node reckitt/merge-results.mjs <sidecar.json> <results.tsv> [suggestions.tsv]");
    process.exit(1);
  }
  mergeResults(args[0], args[1], args[2] || null);
}

export { mergeResults };
