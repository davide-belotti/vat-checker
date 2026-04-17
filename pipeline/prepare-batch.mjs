import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { SEP, NON_EU_COUNTRIES } from "./transform.mjs";

// ─── Read pipe-delimited CSV ────────────────────────────────

function readCsv(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const headers = lines[0].split(SEP).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(SEP);
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
    return obj;
  });
  return { headers, rows };
}

// ─── Prepare batch for API validation ───────────────────────

function prepareBatch(normalizedPath, jobDir, idColumn) {
  const { headers, rows } = readCsv(normalizedPath);

  const batchRows = [];
  const sidecar = [];
  let skippedMissing = 0;
  let skippedNonEu = 0;

  for (const row of rows) {
    const vat = row.VAT || "";
    const status = row.VatStatus || "";
    const country = row.Country || "";
    const carrier = row.Carrier || "";

    const isNonEu = NON_EU_COUNTRIES.has(country);
    const hasVat = vat && status !== "missing" && status !== "placeholder";

    const entry = {
      id: row[idColumn] || "",
      carrier,
      originalVat: row.OriginalVAT || "",
      vat,
      vatStatus: status,
      vatSource: "original",
      country,
      storedAddress: row.StoredAddress || "",
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

    batchRows.push({ carrier, vat });
    sidecar.push(entry);
  }

  const intDir = join(jobDir, "intermediate");

  // Write simple Carrier\tVAT TSV for validate-vat.mjs
  const batchPath = join(intDir, "batch.tsv");
  const batchHeader = "Carrier\tVAT";
  const batchLines = batchRows.map((r) =>
    `${r.carrier.replace(/\t/g, " ")}\t${r.vat}`,
  );
  writeFileSync(batchPath, [batchHeader, ...batchLines].join("\n") + "\n", "utf-8");

  // Write sidecar JSON
  const sidecarPath = join(intDir, "sidecar.json");
  writeFileSync(sidecarPath, JSON.stringify({ idColumn, entries: sidecar }, null, 2), "utf-8");

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
    console.error("Usage: node pipeline/prepare-batch.mjs <normalized.csv> <jobDir> <idColumn>");
    process.exit(1);
  }
  prepareBatch(normalizedPath, jobDir, idColumn);
}

export { prepareBatch, readCsv };
