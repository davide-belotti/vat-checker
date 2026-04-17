import { join } from "path";
import { fileURLToPath } from "url";
import { NON_EU_COUNTRIES } from "./transform.mjs";
import {
  readNdjson, writeNdjson, readResultsTsv, addNote,
} from "./lib/io.mjs";

// ─── Confidence label assignment ────────────────────────────

function assignConfidence(record) {
  const { registered, vatSource, nameMatch, country } = record;

  if (NON_EU_COUNTRIES.has(country)) return "Non-EU";

  if (registered === "Yes") {
    if (vatSource === "original" && nameMatch !== "Mismatch") return "Confirmed";
    if (vatSource === "original" && nameMatch === "Mismatch") return "To be verified";
    if (nameMatch === "Match" || nameMatch === "Partial") return "Likely correct";
    return "To be verified";
  }

  return "Unresolved";
}

// ─── Merge: join sidecar + API results → enriched NDJSON ────
// Note: API "suggestions" are intentionally NOT used here. Failed
// VATs flow through Step 3 (web-search discovery) which is more
// reliable than the VIES/HMRC suggestion heuristic.

function mergeResults(sidecarPath, resultsPath, jobDir) {
  const sidecar = readNdjson(sidecarPath);
  const results = readResultsTsv(resultsPath);

  const resultsByVat = new Map();
  for (const r of results) {
    const key = r.VAT;
    if (key && !resultsByVat.has(key)) resultsByVat.set(key, r);
  }

  const merged = sidecar.map((entry) => {
    const record = {
      ...entry,
      registered: "",
      registeredName: "",
      registeredAddress: "",
      nameMatch: "",
      addressMatch: "",
      confidence: "",
    };

    if (entry.skipped && entry.skipReason === "non_eu") {
      record.registered = "N/A (non-EU)";
      return record;
    }

    if (entry.skipped) {
      addNote(record, `No VAT: ${entry.skipReason}`);
      return record;
    }

    const result = resultsByVat.get(entry.vat);
    if (!result) {
      addNote(record, "No validation result");
      return record;
    }

    record.registered =
      result.Registered === true || result.Registered === "Yes"
        ? "Yes"
        : result.Registered === false || result.Registered === "No"
          ? "No"
          : result.Registered || "";
    record.registeredName = result.Name || "";
    record.registeredAddress = result.Address || "";

    if (result.error) {
      record.registered = "error";
      addNote(record, result.error);
    }

    return record;
  });

  return merged;
}

// ─── Write enriched NDJSON ──────────────────────────────────

function writeEnriched(records, outPath) {
  for (const r of records) {
    r.confidence = r.confidence || assignConfidence(r);
  }
  writeNdjson(outPath, records);
  return outPath;
}

// ─── Summary ────────────────────────────────────────────────

function printMergeSummary(records, outPath) {
  const total = records.length;
  const yes = records.filter((r) => r.registered === "Yes").length;
  const no = records.filter((r) => r.registered === "No").length;
  const nonEu = records.filter((r) => r.registered === "N/A (non-EU)").length;
  const noVat = records.filter((r) => !r.vat && !r.registered).length;
  const errors = records.filter((r) => r.registered === "error").length;

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
  const [sidecarPath, resultsPath, jobDir] = process.argv.slice(2);
  if (!sidecarPath || !resultsPath || !jobDir) {
    console.error("Usage: node pipeline/merge-results.mjs <sidecar.ndjson> <results.tsv> <jobDir>");
    process.exit(1);
  }
  const merged = mergeResults(sidecarPath, resultsPath, jobDir);
  const outPath = join(jobDir, "intermediate", "enriched-pass1.ndjson");
  writeEnriched(merged, outPath);
  printMergeSummary(merged, outPath);
}

export { mergeResults, writeEnriched, printMergeSummary, assignConfidence };
