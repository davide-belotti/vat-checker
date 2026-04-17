import { join } from "path";
import { fileURLToPath } from "url";
import { readNdjson, writeNdjson, addNote } from "./lib/io.mjs";

// ─── Prep: extract unresolved rows for web discovery ────────

function prepDiscovery(enrichedPath, jobDir, idColumn) {
  const records = readNdjson(enrichedPath);

  const toDiscover = records
    .filter((r) => (r.registered || "") !== "Yes")
    .map((r) => ({
      id: r.id,
      carrier: r.carrier,
      vat: r.vat,
      country: r.country,
      storedAddress: r.storedAddress,
      registered: r.registered,
      vatStatus: r.vatStatus,
    }));

  const outPath = join(jobDir, "intermediate", "to-discover.ndjson");
  writeNdjson(outPath, toDiscover);

  console.log(`\n  Prep Discovery`);
  console.log(`  ───────────────`);
  console.log(`  Input:           ${enrichedPath}`);
  console.log(`  To discover:     ${toDiscover.length} rows`);
  console.log(`  Output:          ${outPath}`);
  console.log();

  return { outPath, count: toDiscover.length };
}

// ─── Apply: merge discovered results back into enriched NDJSON ─

function applyDiscovery(enrichedPath, discoveredPath, jobDir, idColumn) {
  const records = readNdjson(enrichedPath);
  const discovered = readNdjson(discoveredPath);

  const byId = new Map();
  for (const d of discovered) {
    const id = d.id ?? d[idColumn];
    if (id !== undefined && id !== "") byId.set(String(id), d);
  }

  let updated = 0;
  let notFound = 0;

  for (const record of records) {
    if ((record.registered || "") === "Yes") continue;

    const d = byId.get(String(record.id));
    if (!d) continue;

    const discoveredVat = d.discoveredVat || d.vat || "";
    const confidence = d.discoveryConfidence || d.confidence || "";
    const source = d.discoverySource || d.source || "";
    const dNotes = d.notes;

    if (!discoveredVat || confidence === "Not found") {
      notFound++;
      addNote(record, dNotes
        ? (Array.isArray(dNotes) ? dNotes.join("; ") : String(dNotes))
        : `Web search: not found (${source || "no results"})`);
      continue;
    }

    if (confidence === "Low") {
      const extra = dNotes
        ? ` ${Array.isArray(dNotes) ? dNotes.join("; ") : dNotes}`
        : "";
      addNote(record, `Low confidence: ${discoveredVat} (${source}).${extra}`);
      continue;
    }

    // High or Medium confidence — update the record.
    record.vat = discoveredVat;
    record.vatSource = "discovered";
    record.discoveryConfidence = confidence;
    record.discoverySource = source;

    if (d.registeredName) record.registeredName = d.registeredName;
    if (d.registeredAddress) record.registeredAddress = d.registeredAddress;

    const webNote = `Web: ${source}${
      dNotes
        ? `. ${Array.isArray(dNotes) ? dNotes.join("; ") : dNotes}`
        : ""
    }`;
    addNote(record, webNote);
    updated++;
  }

  const outPath = join(jobDir, "intermediate", "enriched-discovered.ndjson");
  writeNdjson(outPath, records);

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
      console.error("Usage: node pipeline/discover-unresolved.mjs prep <enriched.ndjson> <jobDir> <idColumn>");
      process.exit(1);
    }
    prepDiscovery(enrichedPath, jobDir, idColumn);
  } else if (mode === "apply") {
    const [, , , enrichedPath, discoveredPath, jobDir, idColumn] = process.argv;
    if (!enrichedPath || !discoveredPath || !jobDir || !idColumn) {
      console.error("Usage: node pipeline/discover-unresolved.mjs apply <enriched.ndjson> <discovered.ndjson> <jobDir> <idColumn>");
      process.exit(1);
    }
    applyDiscovery(enrichedPath, discoveredPath, jobDir, idColumn);
  } else {
    console.error("Usage:");
    console.error("  node pipeline/discover-unresolved.mjs prep <enriched.ndjson> <jobDir> <idColumn>");
    console.error("  node pipeline/discover-unresolved.mjs apply <enriched.ndjson> <discovered.ndjson> <jobDir> <idColumn>");
    process.exit(1);
  }
}

export { prepDiscovery, applyDiscovery };
