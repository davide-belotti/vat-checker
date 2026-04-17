import { join } from "path";
import { fileURLToPath } from "url";
import { readNdjson, writeCsv } from "./lib/io.mjs";
import { assignConfidence } from "./merge-results.mjs";

// ─── Canonical output column order ──────────────────────────
// This is the ONLY place the pipeline decides what the final CSV
// looks like — column order, header casing, and how nested fields
// (like notes[]) are flattened.

function outputColumns(idColumn) {
  return [
    { key: "id",                header: idColumn },
    { key: "carrier",           header: "Carrier" },
    { key: "originalVat",       header: "OriginalVAT" },
    { key: "vat",               header: "VAT" },
    { key: "vatSource",         header: "VatSource" },
    { key: "country",           header: "Country" },
    { key: "registered",        header: "Registered" },
    { key: "registeredName",    header: "RegisteredName" },
    { key: "registeredAddress", header: "RegisteredAddress" },
    { key: "storedAddress",     header: "StoredAddress" },
    { key: "nameMatch",         header: "NameMatch" },
    { key: "addressMatch",      header: "AddressMatch" },
    { key: "confidence",        header: "Confidence" },
    { key: "notes",             header: "Notes" },  // array → "a; b; c"
  ];
}

// ─── Finalize: assign confidence + write output CSV ─────────

function finalize(enrichedPath, jobDir, idColumn) {
  const records = readNdjson(enrichedPath);

  const stats = {
    Confirmed: 0, "Likely correct": 0, "To be verified": 0,
    "Non-EU": 0, Unresolved: 0,
  };

  for (const r of records) {
    const label = assignConfidence(r);
    r.confidence = label;
    stats[label] = (stats[label] || 0) + 1;
  }

  const outPath = join(jobDir, "output", "enriched.csv");
  writeCsv(outPath, records, outputColumns(idColumn));

  console.log(`\n  Finalize`);
  console.log(`  ────────`);
  console.log(`  Output:          ${outPath}`);
  console.log(`  Total:           ${records.length}`);
  console.log(`  Confirmed:       ${stats.Confirmed}`);
  console.log(`  Likely correct:  ${stats["Likely correct"]}`);
  console.log(`  To be verified:  ${stats["To be verified"]}`);
  console.log(`  Non-EU:          ${stats["Non-EU"]}`);
  console.log(`  Unresolved:      ${stats.Unresolved}`);
  console.log();

  return outPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [enrichedPath, jobDir, idColumn] = process.argv.slice(2);
  if (!enrichedPath || !jobDir || !idColumn) {
    console.error("Usage: node pipeline/finalize.mjs <enriched.ndjson> <jobDir> <idColumn>");
    process.exit(1);
  }
  finalize(enrichedPath, jobDir, idColumn);
}

export { finalize, outputColumns };
