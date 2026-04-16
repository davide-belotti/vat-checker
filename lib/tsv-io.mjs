import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";

// ─── TSV parsing ────────────────────────────────────────────

function parseTsv(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.startsWith("#"));
  if (lines.length === 0) {
    console.error("Error: Input file is empty.");
    process.exit(1);
  }

  const headers = lines[0].split("\t").map((h) => h.trim().toLowerCase());
  const vatIdx = headers.findIndex((h) => h === "vat");
  const carrierIdx = headers.findIndex((h) => h === "carrier");

  if (vatIdx === -1) {
    console.error("Error: Input TSV must have a 'VAT' column header.");
    process.exit(1);
  }

  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split("\t");
      return {
        carrier: carrierIdx >= 0 ? (cols[carrierIdx] || "").trim() : "",
        vat: (cols[vatIdx] || "").trim(),
      };
    })
    .filter((r) => r.vat);
}

// ─── Output path derivation ────────────────────────────────

function deriveOutputPath(inputPath, suffix) {
  const dir = dirname(inputPath);
  const base = basename(inputPath, ".tsv");
  return join(dir, `${base}-${suffix}.tsv`);
}

// ─── TSV writing ────────────────────────────────────────────

const esc = (s) => (s ?? "").toString().replace(/\t/g, " ");

function writeResultsTsv(results, filePath) {
  const header = [
    "Carrier", "VAT", "Format", "Checksum",
    "Registered", "Name", "Address", "Country",
  ].join("\t");

  const lines = results.map((r) => {
    const fmt = r.formatValid ? "Valid" : "Invalid";
    const chk = !r.formatValid
      ? ""
      : r.checksumNote === "N/A"
        ? "N/A"
        : r.checksumValid ? "Pass" : "Fail";
    const reg =
      r.registered === true
        ? "Yes"
        : r.registered === false
          ? "No"
          : r.seeSuggestions
            ? "See suggestions"
            : "";

    return [
      esc(r.carrier),
      esc(`${r.countryCode}${r.vatNumber}`),
      fmt,
      chk,
      reg,
      r.registered === true ? esc(r.name) : "",
      r.registered === true ? esc(r.address) : "",
      r.registered === true ? esc(r.country) : "",
    ].join("\t");
  });

  writeFileSync(filePath, [header, ...lines].join("\n") + "\n", "utf-8");
}

function writeSuggestionsTsv(rows, filePath) {
  const header = [
    "Carrier", "VAT", "VAT_Suggestion", "Format",
    "Checksum", "Registered", "Name", "Address", "Country",
  ].join("\t");

  const lines = rows.map((r) =>
    [
      esc(r.carrier), esc(r.vat), esc(r.vatSuggestion),
      esc(r.format), esc(r.checksum), esc(r.registered),
      esc(r.name), esc(r.address), esc(r.country),
    ].join("\t"),
  );

  writeFileSync(filePath, [header, ...lines].join("\n") + "\n", "utf-8");
}

export { parseTsv, deriveOutputPath, writeResultsTsv, writeSuggestionsTsv };
