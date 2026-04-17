import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { SEP } from "./transform.mjs";
import { readPipeCsv, writeEnrichedCsv } from "./merge-results.mjs";

// ─── Prep: extract unresolved rows for web discovery ────────

function prepDiscovery(enrichedPath, jobDir, idColumn) {
  const { headers, rows } = readPipeCsv(enrichedPath);

  const toDiscover = rows.filter((r) => {
    const reg = r.Registered || "";
    return reg !== "Yes" && reg !== "Yes (corrected)";
  });

  const discoveryData = toDiscover.map((r) => ({
    id: r[idColumn] || "",
    carrier: r.Carrier || "",
    vat: r.VAT || "",
    country: r.Country || "",
    storedAddress: r.StoredAddress || "",
    registered: r.Registered || "",
  }));

  const outPath = join(jobDir, "intermediate", "to-discover.json");
  writeFileSync(outPath, JSON.stringify(discoveryData, null, 2), "utf-8");

  console.log(`\n  Prep Discovery`);
  console.log(`  ───────────────`);
  console.log(`  Input:           ${enrichedPath}`);
  console.log(`  To discover:     ${discoveryData.length} rows`);
  console.log(`  Output:          ${outPath}`);
  console.log();

  return { outPath, count: discoveryData.length };
}

// ─── Apply: merge discovered results back into enriched CSV ─

function applyDiscovery(enrichedPath, discoveredPath, jobDir, idColumn) {
  const { headers, rows } = readPipeCsv(enrichedPath);

  let discovered;
  try {
    const content = readFileSync(discoveredPath, "utf-8");
    if (discoveredPath.endsWith(".json")) {
      discovered = JSON.parse(content);
    } else {
      // Pipe-delimited CSV discovery results
      const dLines = content.split(/\r?\n/).filter((l) => l.trim());
      const dHeaders = dLines[0].split(SEP).map((h) => h.trim());
      discovered = dLines.slice(1).map((line) => {
        const cols = line.split(SEP);
        const obj = {};
        dHeaders.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
        return obj;
      });
    }
  } catch (err) {
    console.error(`Error reading discovery file: ${err.message}`);
    process.exit(1);
  }

  // Build lookup by ID
  const discoveryById = new Map();
  for (const d of discovered) {
    const id = d[idColumn] || d.id || d["TRANSPOREON ID"] || "";
    if (id) discoveryById.set(id, d);
  }

  let updated = 0;
  let notFound = 0;

  const merged = rows.map((row) => {
    const id = row[idColumn] || "";
    const d = discoveryById.get(id);
    if (!d) return row;

    const reg = row.Registered || "";
    if (reg === "Yes" || reg === "Yes (corrected)") return row;

    const discoveredVat = d.DiscoveredVAT || d.discoveredVat || d.VAT || "";
    const confidence = d.Confidence || d.confidence || "";
    const source = d.Source || d.source || "";
    const dNotes = d.Notes || d.notes || "";

    if (!discoveredVat || confidence === "Not found") {
      notFound++;
      const notePrefix = row.Notes ? row.Notes + "; " : "";
      row.Notes = notePrefix + (dNotes || `Web search: not found (${source || "no results"})`);
      return row;
    }

    if (confidence === "Low") {
      const notePrefix = row.Notes ? row.Notes + "; " : "";
      row.Notes = notePrefix + `Low confidence: ${discoveredVat} (${source}). ${dNotes}`;
      return row;
    }

    // High or Medium confidence — update the row
    row.VAT = discoveredVat;
    row.VatSource = "discovered";

    if (d.RegisteredName || d.registeredName) {
      row.RegisteredName = d.RegisteredName || d.registeredName;
    }
    if (d.RegisteredAddress || d.registeredAddress) {
      row.RegisteredAddress = d.RegisteredAddress || d.registeredAddress;
    }

    const notePrefix = row.Notes ? row.Notes + "; " : "";
    row.Notes = notePrefix + `Web: ${source}${dNotes ? ". " + dNotes : ""}`;
    updated++;

    return row;
  });

  const outPath = join(jobDir, "intermediate", "enriched-discovered.csv");
  const header = [
    idColumn, "Carrier", "OriginalVAT", "VAT", "VatSource", "Country",
    "Registered", "RegisteredName", "RegisteredAddress", "StoredAddress",
    "NameMatch", "AddressMatch", "Confidence", "Notes",
  ].join(SEP);

  const esc = (s) => (s ?? "").toString().replace(/\|/g, " ");
  const lines = merged.map((r) =>
    [
      esc(r[idColumn]), esc(r.Carrier), esc(r.OriginalVAT), esc(r.VAT),
      r.VatSource || "original", r.Country, r.Registered || "",
      esc(r.RegisteredName || ""), esc(r.RegisteredAddress || ""),
      esc(r.StoredAddress || ""),
      r.NameMatch || "", r.AddressMatch || "", r.Confidence || "",
      esc(r.Notes || ""),
    ].join(SEP),
  );

  writeFileSync(outPath, [header, ...lines].join("\n") + "\n", "utf-8");

  console.log(`\n  Apply Discovery`);
  console.log(`  ────────────────`);
  console.log(`  Updated:    ${updated} rows (VAT discovered, High/Medium confidence)`);
  console.log(`  Not found:  ${notFound} rows (noted in file)`);
  console.log(`  Output:     ${outPath}`);
  console.log();

  return { outPath, updated, notFound };
}

// ─── CLI ────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === "prep") {
    const [, , , enrichedPath, jobDir, idColumn] = process.argv;
    if (!enrichedPath || !jobDir || !idColumn) {
      console.error("Usage: node pipeline/discover-unresolved.mjs prep <enriched.csv> <jobDir> <idColumn>");
      process.exit(1);
    }
    prepDiscovery(enrichedPath, jobDir, idColumn);
  } else if (mode === "apply") {
    const [, , , enrichedPath, discoveredPath, jobDir, idColumn] = process.argv;
    if (!enrichedPath || !discoveredPath || !jobDir || !idColumn) {
      console.error("Usage: node pipeline/discover-unresolved.mjs apply <enriched.csv> <discovered.csv|json> <jobDir> <idColumn>");
      process.exit(1);
    }
    applyDiscovery(enrichedPath, discoveredPath, jobDir, idColumn);
  } else {
    console.error("Usage:");
    console.error("  node pipeline/discover-unresolved.mjs prep <enriched.csv> <jobDir> <idColumn>");
    console.error("  node pipeline/discover-unresolved.mjs apply <enriched.csv> <discovered> <jobDir> <idColumn>");
    process.exit(1);
  }
}

export { prepDiscovery, applyDiscovery };
