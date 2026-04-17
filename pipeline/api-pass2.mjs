import { join } from "path";
import { fileURLToPath } from "url";
import { NON_EU_COUNTRIES } from "./transform.mjs";
import { readNdjson, writeNdjson, addNote } from "./lib/io.mjs";

import { validateOne } from "../validate-vat.mjs";
import { runChecksum } from "../lib/checksum-validators.mjs";
import { sanitize } from "../lib/api-clients.mjs";

// ─── API Pass 2: validate discovered VATs ───────────────────

async function apiPass2(enrichedPath, jobDir, idColumn) {
  const records = readNdjson(enrichedPath);

  const toValidate = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (r.vatSource !== "discovered") continue;
    if (r.registered === "Yes") continue;
    if (NON_EU_COUNTRIES.has(r.country)) continue;

    const vat = r.vat || "";
    if (!vat) continue;

    const clean = sanitize(vat);
    const cc = clean.slice(0, 2).toUpperCase();
    const num = clean.slice(2);
    const check = runChecksum(cc, num);
    if (!check.formatValid) continue;

    toValidate.push({ index: i, vat });
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
    const { index, vat } = toValidate[j];
    const record = records[index];
    process.stdout.write(`  [${j + 1}/${toValidate.length}] ${vat}...`);

    const result = await validateOne(vat);

    if (result.error) {
      console.log(` error: ${result.error}`);
      addNote(record, `API Pass 2 error: ${result.error}`);
      record.registered = "error";
      errors++;
      continue;
    }

    if (result.registered === true) {
      console.log(` registered`);
      record.registered = "Yes";
      record.registeredName = result.name || record.registeredName || "";
      record.registeredAddress = result.address || record.registeredAddress || "";
      verified++;
    } else if (result.registered === false) {
      console.log(` not registered`);
      record.registered = "No";
      addNote(record, "API Pass 2: not registered");
      notRegistered++;
    } else {
      console.log(` unknown`);
      errors++;
    }
  }

  const outPath = join(jobDir, "intermediate", "enriched-pass2.ndjson");
  writeNdjson(outPath, records);

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
    console.error("Usage: node pipeline/api-pass2.mjs <enriched-discovered.ndjson> <jobDir> <idColumn>");
    process.exit(1);
  }
  await apiPass2(enrichedPath, jobDir, idColumn);
}

export { apiPass2 };
