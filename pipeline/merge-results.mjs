import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { SEP, NON_EU_COUNTRIES } from "./transform.mjs";

const esc = (s) => (s ?? "").toString().replace(/\|/g, " ");

// ─── Parse a TSV results file from validate-vat.mjs ─────────

function parseResultsTsv(filePath) {
  let content;
  try { content = readFileSync(filePath, "utf-8"); } catch { return []; }
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

// ─── Read pipe-delimited CSV ────────────────────────────────

function readPipeCsv(filePath) {
  let content;
  try { content = readFileSync(filePath, "utf-8"); } catch { return { headers: [], rows: [] }; }
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = lines[0].split(SEP).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(SEP);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
    return obj;
  });
  return { headers, rows };
}

// ─── Confidence label assignment ────────────────────────────

function assignConfidence(row) {
  const registered = row.Registered || "";
  const vatSource = row.VatSource || "";
  const nameMatch = row.NameMatch || "";
  const country = row.Country || "";

  if (NON_EU_COUNTRIES.has(country)) return "Non-EU";

  if (registered === "Yes" || registered === "Yes (corrected)") {
    if (vatSource === "original" && nameMatch !== "Mismatch") return "Confirmed";
    if (vatSource === "original" && nameMatch === "Mismatch") return "To be verified";
    if (nameMatch === "Match" || nameMatch === "Partial") return "Likely correct";
    return "To be verified";
  }

  return "Unresolved";
}

// ─── Merge: join sidecar + API results → enriched CSV ───────

function mergeResults(sidecarPath, resultsPath, suggestionsPath, jobDir) {
  const sidecarData = JSON.parse(readFileSync(sidecarPath, "utf-8"));
  const { idColumn, entries } = sidecarData;
  const results = parseResultsTsv(resultsPath);
  const suggestions = suggestionsPath ? parseResultsTsv(suggestionsPath) : [];

  const resultsByVat = new Map();
  for (const r of results) {
    const key = r.VAT;
    if (key && !resultsByVat.has(key)) resultsByVat.set(key, r);
  }

  const suggestionsByVat = new Map();
  for (const s of suggestions) {
    const key = s.VAT;
    if (key && s.Registered === "Yes" && !suggestionsByVat.has(key)) {
      suggestionsByVat.set(key, s);
    }
  }

  const merged = [];

  for (const entry of entries) {
    const row = {
      id: entry.id,
      carrier: entry.carrier,
      originalVat: entry.originalVat,
      vat: entry.vat,
      vatSource: entry.vatSource || "original",
      country: entry.country,
      registered: "",
      registeredName: "",
      registeredAddress: "",
      storedAddress: entry.storedAddress,
      nameMatch: "",
      addressMatch: "",
      confidence: "",
      notes: "",
    };

    if (entry.skipped && entry.skipReason === "non_eu") {
      row.registered = "N/A (non-EU)";
      merged.push(row);
      continue;
    }

    if (entry.skipped) {
      row.notes = `No VAT: ${entry.skipReason}`;
      merged.push(row);
      continue;
    }

    const result = resultsByVat.get(entry.vat);
    if (!result) {
      row.notes = "No validation result";
      merged.push(row);
      continue;
    }

    row.registered = result.Registered === true || result.Registered === "Yes"
      ? "Yes"
      : result.Registered === false || result.Registered === "No"
        ? "No"
        : result.Registered || "";
    row.registeredName = result.Name || "";
    row.registeredAddress = result.Address || "";

    if (result.Registered === "See suggestions") {
      const sug = suggestionsByVat.get(entry.vat);
      if (sug) {
        row.vat = sug.VAT_Suggestion || entry.vat;
        row.vatSource = "corrected";
        row.registered = "Yes (corrected)";
        row.registeredName = sug.Name || "";
        row.registeredAddress = sug.Address || "";
        row.notes = `Corrected from ${entry.vat}`;
      }
    }

    if (result.error) {
      row.registered = "error";
      row.notes = result.error;
    }

    merged.push(row);
  }

  return { idColumn, merged };
}

// ─── Write enriched CSV ─────────────────────────────────────

function writeEnrichedCsv(merged, idColumn, outPath) {
  const header = [
    idColumn, "Carrier", "OriginalVAT", "VAT", "VatSource", "Country",
    "Registered", "RegisteredName", "RegisteredAddress", "StoredAddress",
    "NameMatch", "AddressMatch", "Confidence", "Notes",
  ].join(SEP);

  const lines = merged.map((r) => {
    r.confidence = r.confidence || assignConfidence(r);
    return [
      esc(r.id), esc(r.carrier), esc(r.originalVat), esc(r.vat),
      r.vatSource, r.country, r.registered,
      esc(r.registeredName), esc(r.registeredAddress), esc(r.storedAddress),
      r.nameMatch, r.addressMatch, r.confidence, esc(r.notes),
    ].join(SEP);
  });

  writeFileSync(outPath, [header, ...lines].join("\n") + "\n", "utf-8");
  return outPath;
}

// ─── Summary ────────────────────────────────────────────────

function printMergeSummary(merged, outPath) {
  const total = merged.length;
  const yes = merged.filter((r) => r.registered === "Yes" || r.registered === "Yes (corrected)").length;
  const no = merged.filter((r) => r.registered === "No").length;
  const nonEu = merged.filter((r) => r.registered === "N/A (non-EU)").length;
  const noVat = merged.filter((r) => !r.vat && !r.registered).length;
  const errors = merged.filter((r) => r.registered === "error").length;

  console.log(`\n  Merge Results`);
  console.log(`  ─────────────`);
  console.log(`  Output:          ${outPath}`);
  console.log(`  Total rows:      ${total}`);
  console.log(`  Registered:      ${yes}`);
  console.log(`  Not registered:  ${no}`);
  console.log(`  Non-EU (skipped):${nonEu}`);
  console.log(`  No VAT:          ${noVat}`);
  if (errors > 0) console.log(`  API errors:      ${errors}`);
  console.log();
}

// ─── CLI ────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error("Usage: node pipeline/merge-results.mjs <sidecar.json> <results.tsv> <jobDir> [suggestions.tsv]");
    process.exit(1);
  }
  const [sidecarPath, resultsPath, jobDir, suggestionsPath] = args;
  const { idColumn, merged } = mergeResults(sidecarPath, resultsPath, suggestionsPath, jobDir);
  const outPath = join(jobDir, "intermediate", "enriched-pass1.csv");
  writeEnrichedCsv(merged, idColumn, outPath);
  printMergeSummary(merged, outPath);
}

export { mergeResults, writeEnrichedCsv, printMergeSummary, readPipeCsv, assignConfidence };
