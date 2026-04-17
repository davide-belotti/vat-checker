import { join } from "path";
import { fileURLToPath } from "url";
import { NON_EU_COUNTRIES } from "./transform.mjs";
import { readNdjson, writeNdjson, writeBatchTsv } from "./lib/io.mjs";

// ─── Prepare batch for API validation ───────────────────────
// Reads the normalized NDJSON and emits two artifacts:
//   1. batch.tsv       — Carrier\tVAT (external contract with validate-vat.mjs)
//   2. sidecar.ndjson  — the full record for each row, including skip reasons
//
// The sidecar carries the rest of the record through the API detour so we
// can rejoin by VAT when merging results.

function prepareBatch(normalizedPath, jobDir, idColumn) {
  const records = readNdjson(normalizedPath);

  const batchRows = [];
  const sidecar = [];
  let skippedMissing = 0;
  let skippedNonEu = 0;

  for (const r of records) {
    const vat = r.vat || "";
    const status = r.vatStatus || "";
    const country = r.country || "";

    const isNonEu = NON_EU_COUNTRIES.has(country);
    const hasVat = vat && status !== "missing" && status !== "placeholder";

    const entry = {
      ...r,
      skipped: false,
      skipReason: "",
    };

    if (!hasVat) {
      entry.skipped = true;
      entry.skipReason = status || "no VAT";
      skippedMissing++;
      sidecar.push(entry);
      continue;
    }

    if (isNonEu) {
      entry.skipped = true;
      entry.skipReason = "non_eu";
      skippedNonEu++;
      sidecar.push(entry);
      continue;
    }

    batchRows.push({ carrier: r.carrier || "", vat });
    sidecar.push(entry);
  }

  const intDir = join(jobDir, "intermediate");

  // validate-vat.mjs expects PascalCase "Carrier" / "VAT" headers.
  const batchPath = join(intDir, "batch.tsv");
  writeBatchTsv(
    batchPath,
    batchRows.map((b) => ({ Carrier: b.carrier, VAT: b.vat })),
    ["Carrier", "VAT"],
  );

  const sidecarPath = join(intDir, "sidecar.ndjson");
  writeNdjson(sidecarPath, sidecar);

  console.log(`\n  Prepare Batch (API Pass 1)`);
  console.log(`  ──────────────────────────`);
  console.log(`  Input:          ${normalizedPath}`);
  console.log(`  Batch file:     ${batchPath} (${batchRows.length} rows for VIES/HMRC)`);
  console.log(`  Sidecar:        ${sidecarPath}`);
  console.log(`  Skipped:        ${skippedMissing} (no usable VAT)`);
  console.log(`  Skipped non-EU: ${skippedNonEu} (TR, UA, RU, BY, CH)`);
  console.log();

  return { batchPath, sidecarPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [normalizedPath, jobDir, idColumn] = process.argv.slice(2);
  if (!normalizedPath || !jobDir || !idColumn) {
    console.error("Usage: node pipeline/prepare-batch.mjs <normalized.ndjson> <jobDir> <idColumn>");
    process.exit(1);
  }
  prepareBatch(normalizedPath, jobDir, idColumn);
}

export { prepareBatch };
