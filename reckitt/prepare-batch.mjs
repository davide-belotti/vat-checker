import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";

function prepareBatch(normalizedPath) {
  const content = readFileSync(normalizedPath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length === 0) {
    console.error("Error: Normalized file is empty.");
    process.exit(1);
  }

  const headers = lines[0].split("\t").map((h) => h.trim());
  const idx = (name) => headers.indexOf(name);

  const iTransporeonId = idx("TRANSPOREON ID");
  const iCreditor      = idx("CreditorNumber");
  const iCarrier       = idx("Carrier");
  const iOriginalVat   = idx("OriginalVAT");
  const iVat           = idx("VAT");
  const iVatStatus     = idx("VatStatus");
  const iCountry       = idx("Country");
  const iStoredAddress = idx("StoredAddress");

  if (iVat === -1 || iCarrier === -1) {
    console.error("Error: Required columns (Carrier, VAT) not found in normalized file.");
    process.exit(1);
  }

  const batchRows = [];
  const sidecar = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const get = (j) => (j >= 0 ? (cols[j] || "").trim() : "");

    const vat = get(iVat);
    const status = get(iVatStatus);
    const carrier = get(iCarrier);

    // Rows without a usable VAT can't be validated
    if (!vat || status === "missing" || status === "placeholder") {
      skipped++;
      sidecar.push({
        rowIndex: i,
        transporeonId: get(iTransporeonId),
        creditorNumber: get(iCreditor),
        carrier,
        originalVat: get(iOriginalVat),
        vat: "",
        vatStatus: status,
        vatSource: "original",
        country: get(iCountry),
        storedAddress: get(iStoredAddress),
        skipped: true,
      });
      continue;
    }

    const vatSource = status === "discovered" ? "discovered" : "original";

    batchRows.push({ carrier, vat });
    sidecar.push({
      rowIndex: i,
      transporeonId: get(iTransporeonId),
      creditorNumber: get(iCreditor),
      carrier,
      originalVat: get(iOriginalVat),
      vat,
      vatStatus: status,
      vatSource,
      country: get(iCountry),
      storedAddress: get(iStoredAddress),
      skipped: false,
    });
  }

  const dir = dirname(normalizedPath);
  const base = basename(normalizedPath, "-normalized.tsv");

  // Write simple Carrier+VAT batch file
  const batchPath = join(dir, `${base}-batch.tsv`);
  const batchHeader = "Carrier\tVAT";
  const batchLines = batchRows.map((r) =>
    `${r.carrier.replace(/\t/g, " ")}\t${r.vat}`,
  );
  writeFileSync(batchPath, [batchHeader, ...batchLines].join("\n") + "\n", "utf-8");

  // Write sidecar JSON for merge step
  const sidecarPath = join(dir, `${base}-sidecar.json`);
  writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), "utf-8");

  console.log(`\n  Prepare Batch`);
  console.log(`  ─────────────`);
  console.log(`  Input:        ${normalizedPath}`);
  console.log(`  Batch file:   ${batchPath} (${batchRows.length} rows for validation)`);
  console.log(`  Sidecar:      ${sidecarPath}`);
  console.log(`  Skipped:      ${skipped} (no usable VAT)`);
  console.log();
  console.log(`  Next step:`);
  console.log(`  node validate-vat.mjs --file "${batchPath}" --suggest`);
  console.log();

  return { batchPath, sidecarPath };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node reckitt/prepare-batch.mjs <normalized.tsv>");
    process.exit(1);
  }
  prepareBatch(inputPath);
}

export { prepareBatch };
