import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { SEP, NON_EU_COUNTRIES } from "./transform.mjs";
import { readPipeCsv } from "./merge-results.mjs";

// Re-use the core validator for individual VATs
import { validateOne } from "../validate-vat.mjs";
import { runChecksum } from "../lib/checksum-validators.mjs";
import { sanitize } from "../lib/api-clients.mjs";

const esc = (s) => (s ?? "").toString().replace(/\|/g, " ");

// ─── API Pass 2: validate discovered VATs ───────────────────

async function apiPass2(enrichedPath, jobDir, idColumn) {
  const { headers, rows } = readPipeCsv(enrichedPath);

  // Find rows that were discovered and need API verification
  const toValidate = [];
  const indices = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.VatSource !== "discovered") continue;
    if (r.Registered === "Yes" || r.Registered === "Yes (corrected)") continue;
    if (NON_EU_COUNTRIES.has(r.Country)) continue;

    const vat = r.VAT || "";
    if (!vat) continue;

    // Quick checksum check — only validate if format is OK
    const clean = sanitize(vat);
    const cc = clean.slice(0, 2).toUpperCase();
    const num = clean.slice(2);
    const check = runChecksum(cc, num);
    if (!check.formatValid) continue;

    toValidate.push({ index: i, row: r, vat });
    indices.push(i);
  }

  if (toValidate.length === 0) {
    console.log(`\n  API Pass 2`);
    console.log(`  ──────────`);
    console.log(`  No discovered VATs to validate.`);
    console.log();
    return enrichedPath;
  }

  console.log(`\n  API Pass 2`);
  console.log(`  ──────────`);
  console.log(`  Validating ${toValidate.length} discovered VATs...\n`);

  let verified = 0;
  let notRegistered = 0;
  let errors = 0;

  for (let j = 0; j < toValidate.length; j++) {
    const { index, row, vat } = toValidate[j];
    process.stdout.write(`  [${j + 1}/${toValidate.length}] ${vat}...`);

    const result = await validateOne(vat);

    if (result.error) {
      console.log(` error: ${result.error}`);
      const notePrefix = row.Notes ? row.Notes + "; " : "";
      rows[index].Notes = notePrefix + `API Pass 2 error: ${result.error}`;
      rows[index].Registered = "error";
      errors++;
      continue;
    }

    if (result.registered === true) {
      console.log(` registered`);
      rows[index].Registered = "Yes";
      rows[index].RegisteredName = result.name || row.RegisteredName || "";
      rows[index].RegisteredAddress = result.address || row.RegisteredAddress || "";
      verified++;
    } else if (result.registered === false) {
      console.log(` not registered`);
      rows[index].Registered = "No";
      const notePrefix = row.Notes ? row.Notes + "; " : "";
      rows[index].Notes = notePrefix + "API Pass 2: not registered";
      notRegistered++;
    } else {
      console.log(` unknown`);
      errors++;
    }
  }

  // Write updated enriched CSV
  const outPath = join(jobDir, "intermediate", "enriched-pass2.csv");
  const header = [
    idColumn, "Carrier", "OriginalVAT", "VAT", "VatSource", "Country",
    "Registered", "RegisteredName", "RegisteredAddress", "StoredAddress",
    "NameMatch", "AddressMatch", "Confidence", "Notes",
  ].join(SEP);

  const lines = rows.map((r) =>
    [
      esc(r[idColumn]), esc(r.Carrier), esc(r.OriginalVAT), esc(r.VAT),
      r.VatSource || "original", r.Country || "", r.Registered || "",
      esc(r.RegisteredName || ""), esc(r.RegisteredAddress || ""),
      esc(r.StoredAddress || ""),
      r.NameMatch || "", r.AddressMatch || "", r.Confidence || "",
      esc(r.Notes || ""),
    ].join(SEP),
  );

  writeFileSync(outPath, [header, ...lines].join("\n") + "\n", "utf-8");

  console.log(`\n  Verified:        ${verified}`);
  console.log(`  Not registered:  ${notRegistered}`);
  console.log(`  Errors:          ${errors}`);
  console.log(`  Output:          ${outPath}`);
  console.log();

  return outPath;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [enrichedPath, jobDir, idColumn] = process.argv.slice(2);
  if (!enrichedPath || !jobDir || !idColumn) {
    console.error("Usage: node pipeline/api-pass2.mjs <enriched-discovered.csv> <jobDir> <idColumn>");
    process.exit(1);
  }
  await apiPass2(enrichedPath, jobDir, idColumn);
}

export { apiPass2 };
