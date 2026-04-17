import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { SEP, NON_EU_COUNTRIES } from "./transform.mjs";
import { readPipeCsv, assignConfidence } from "./merge-results.mjs";

const esc = (s) => (s ?? "").toString().replace(/\|/g, " ");

// ─── Finalize: assign confidence labels + write output ──────

function finalize(enrichedPath, jobDir, idColumn) {
  const { headers, rows } = readPipeCsv(enrichedPath);

  const stats = { Confirmed: 0, "Likely correct": 0, "To be verified": 0, "Non-EU": 0, Unresolved: 0 };

  for (const row of rows) {
    const label = assignConfidence({
      Registered: row.Registered || "",
      VatSource: row.VatSource || "",
      NameMatch: row.NameMatch || "",
      Country: row.Country || "",
    });
    row.Confidence = label;
    stats[label] = (stats[label] || 0) + 1;
  }

  // Write final output
  const outPath = join(jobDir, "output", "enriched.csv");
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

  console.log(`\n  Finalize`);
  console.log(`  ────────`);
  console.log(`  Output:          ${outPath}`);
  console.log(`  Total:           ${rows.length}`);
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
    console.error("Usage: node pipeline/finalize.mjs <enriched.csv> <jobDir> <idColumn>");
    process.exit(1);
  }
  finalize(enrichedPath, jobDir, idColumn);
}

export { finalize };
