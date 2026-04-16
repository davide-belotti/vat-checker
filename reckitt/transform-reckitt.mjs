import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";

const sanitize = (s) => s.replace(/[\s\-._,/\\]+/g, "");

const SUPPORTED_EU_UK = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","EL","ES","FI","FR",
  "HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO",
  "SE","SI","SK","GB","XI","GR",
]);

const NON_EU_COUNTRIES = new Set(["TR","UA","RU","BY","CH"]);

// GR is used in VIES but the ISO code is GR; Reckitt uses GR in CountryId
// EL is the VIES code for Greece — we map GR→EL for VAT prefix
const COUNTRY_TO_VAT_PREFIX = { GR: "EL" };

function isPlaceholder(vat) {
  const digits = vat.replace(/^[A-Z]{2}/, "");
  return /^0+$/.test(digits);
}

function classifyAndReconstruct(rawVat, countryId) {
  const cc = (countryId || "").trim().toUpperCase();
  const vatPrefix = COUNTRY_TO_VAT_PREFIX[cc] || cc;

  if (!rawVat || rawVat === "NULL") {
    return { vat: "", status: "missing", country: cc };
  }

  // UK/UK-style placeholder mapped to GB
  let cleaned = rawVat.replace(/^UK/, "GB");

  const sanitized = sanitize(cleaned);

  if (isPlaceholder(sanitized)) {
    return { vat: "", status: "placeholder", country: cc };
  }

  // Multi-value field (e.g. "8252102129   8250004747") — mark as wrong_format
  if (/\s{2,}/.test(rawVat.trim())) {
    return { vat: sanitized, status: "wrong_format", country: cc };
  }

  // Contains non-VAT characters after sanitize (should be alphanumeric only)
  if (!/^[A-Z0-9]+$/i.test(sanitized)) {
    return { vat: sanitized, status: "wrong_format", country: cc };
  }

  // Spanish CIF starting with A- prefix (e.g. "A-04014635")
  if (/^A\d+$/.test(sanitized) && cc === "ES") {
    return { vat: `ES${sanitized}`, status: "valid", country: cc };
  }

  // Already has the correct country prefix
  if (sanitized.toUpperCase().startsWith(vatPrefix)) {
    const final = vatPrefix + sanitized.slice(vatPrefix.length);
    if (NON_EU_COUNTRIES.has(cc)) {
      return { vat: final, status: "non_eu", country: cc };
    }
    return { vat: final, status: "valid", country: cc };
  }

  // Has a different known EU prefix (e.g. GB VAT stored on a PL carrier row)
  const possiblePrefix = sanitized.slice(0, 2).toUpperCase();
  if (SUPPORTED_EU_UK.has(possiblePrefix) && /[A-Z]/i.test(possiblePrefix)) {
    return { vat: sanitized.toUpperCase(), status: "valid", country: cc };
  }

  // Digits-only (or starts with digit) — prepend VAT country prefix
  if (/^\d/.test(sanitized)) {
    if (!cc) {
      return { vat: sanitized, status: "wrong_format", country: cc };
    }
    const full = vatPrefix + sanitized;
    if (NON_EU_COUNTRIES.has(cc)) {
      return { vat: full, status: "non_eu", country: cc };
    }
    return { vat: full, status: "valid", country: cc };
  }

  // Fallback — has letters but doesn't match known patterns
  if (NON_EU_COUNTRIES.has(cc)) {
    return { vat: sanitized, status: "non_eu", country: cc };
  }
  return { vat: sanitized, status: "wrong_format", country: cc };
}

function buildStoredAddress(street1, street2, zip, location) {
  return [street1, street2, zip, location]
    .map((s) => (s && s !== "NULL" ? s.trim() : ""))
    .filter(Boolean)
    .join(", ");
}

function transformReckitt(inputPath) {
  const content = readFileSync(inputPath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length === 0) {
    console.error("Error: Input file is empty.");
    process.exit(1);
  }

  const headers = lines[0].split("\t").map((h) => h.trim());
  const col = (name) => headers.indexOf(name);

  const iTransporeonId = col("TRANSPOREON ID");
  const iName          = col("Name");
  const iCreditor      = col("CreditorNumber_BillingDetail");
  const iVat           = col("VAT");
  const iCountry       = col("CountryId");
  const iStreet1       = col("Street_1");
  const iStreet2       = col("Street_2");
  const iZip           = col("Zip");
  const iLocation      = col("Location");

  if (iVat === -1 || iCountry === -1 || iName === -1) {
    console.error("Error: Required columns (Name, VAT, CountryId) not found.");
    process.exit(1);
  }

  const rows = [];
  const stats = { valid: 0, placeholder: 0, missing: 0, wrong_format: 0, non_eu: 0 };

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const get = (idx) => (idx >= 0 ? (cols[idx] || "").trim() : "");

    const rawVat   = get(iVat);
    const countryId = get(iCountry);
    const { vat, status, country } = classifyAndReconstruct(rawVat, countryId);

    stats[status]++;

    rows.push({
      transporeonId: get(iTransporeonId),
      creditorNumber: get(iCreditor),
      carrier: get(iName),
      originalVat: rawVat === "NULL" ? "" : rawVat,
      vat,
      vatStatus: status,
      country,
      storedAddress: buildStoredAddress(
        get(iStreet1), get(iStreet2), get(iZip), get(iLocation),
      ),
    });
  }

  // Write normalized TSV
  const dir = dirname(inputPath);
  const base = basename(inputPath, ".tsv");
  const outPath = join(dir, `${base}-normalized.tsv`);

  const esc = (s) => (s ?? "").toString().replace(/\t/g, " ");
  const outHeader = [
    "TRANSPOREON ID", "CreditorNumber", "Carrier", "OriginalVAT",
    "VAT", "VatStatus", "Country", "StoredAddress",
  ].join("\t");

  const outLines = rows.map((r) =>
    [
      esc(r.transporeonId), esc(r.creditorNumber), esc(r.carrier),
      esc(r.originalVat), esc(r.vat), r.vatStatus, r.country,
      esc(r.storedAddress),
    ].join("\t"),
  );

  writeFileSync(outPath, [outHeader, ...outLines].join("\n") + "\n", "utf-8");

  console.log(`\n  Reckitt Transform`);
  console.log(`  ─────────────────`);
  console.log(`  Input:        ${inputPath}`);
  console.log(`  Output:       ${outPath}`);
  console.log(`  Total rows:   ${rows.length}`);
  console.log(`  Valid VAT:    ${stats.valid}`);
  console.log(`  Placeholder:  ${stats.placeholder}`);
  console.log(`  Missing:      ${stats.missing}`);
  console.log(`  Wrong format: ${stats.wrong_format}`);
  console.log(`  Non-EU/UK:    ${stats.non_eu}`);
  console.log();

  return outPath;
}

// CLI entry point
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node reckitt/transform-reckitt.mjs <reckitt-export.tsv>");
    process.exit(1);
  }
  transformReckitt(inputPath);
}

export { transformReckitt, classifyAndReconstruct };
