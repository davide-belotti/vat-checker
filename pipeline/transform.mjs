import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { writeNdjson } from "./lib/io.mjs";

const sanitize = (s) => s.replace(/[\s\-._,/\\]+/g, "");

const SUPPORTED_EU_UK = new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","EL","ES","FI","FR",
  "HR","HU","IE","IT","LT","LU","LV","MT","NL","PL","PT","RO",
  "SE","SI","SK","GB","XI","GR",
]);

const NON_EU_COUNTRIES = new Set(["TR","UA","RU","BY","CH"]);

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

  let cleaned = rawVat.replace(/^UK/, "GB");
  const sanitized = sanitize(cleaned);

  if (isPlaceholder(sanitized)) {
    return { vat: "", status: "placeholder", country: cc };
  }

  if (/\s{2,}/.test(rawVat.trim())) {
    return { vat: sanitized, status: "wrong_format", country: cc };
  }

  if (!/^[A-Z0-9]+$/i.test(sanitized)) {
    return { vat: sanitized, status: "wrong_format", country: cc };
  }

  if (/^A\d+$/.test(sanitized) && cc === "ES") {
    return { vat: `ES${sanitized}`, status: "valid", country: cc };
  }

  if (sanitized.toUpperCase().startsWith(vatPrefix)) {
    const final = vatPrefix + sanitized.slice(vatPrefix.length);
    if (NON_EU_COUNTRIES.has(cc)) {
      return { vat: final, status: "non_eu", country: cc };
    }
    return { vat: final, status: "valid", country: cc };
  }

  const possiblePrefix = sanitized.slice(0, 2).toUpperCase();
  if (SUPPORTED_EU_UK.has(possiblePrefix) && /[A-Z]/i.test(possiblePrefix)) {
    return { vat: sanitized.toUpperCase(), status: "valid", country: cc };
  }

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

  if (NON_EU_COUNTRIES.has(cc)) {
    return { vat: sanitized, status: "non_eu", country: cc };
  }
  return { vat: sanitized, status: "wrong_format", country: cc };
}

function buildStoredAddress(parts) {
  return parts
    .map((s) => (s && s !== "NULL" ? s.trim() : ""))
    .filter(Boolean)
    .join(", ");
}

// ─── Main transform ─────────────────────────────────────────

function transform(inputPath, mappingPath, jobDir) {
  const mapping = JSON.parse(readFileSync(mappingPath, "utf-8"));

  if (!mapping.id) {
    console.error("Error: mapping.json must have an 'id' field (system reference column).");
    process.exit(1);
  }

  const content = readFileSync(inputPath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());

  if (lines.length === 0) {
    console.error("Error: Input file is empty.");
    process.exit(1);
  }

  const headers = lines[0].split("\t").map((h) => h.trim());
  const col = (name) => (name ? headers.indexOf(name) : -1);

  const iId      = col(mapping.id);
  const iCarrier = col(mapping.carrier);
  const iVat     = col(mapping.vat);
  const iCountry = col(mapping.country);
  const iStreet1 = col(mapping.street1);
  const iStreet2 = col(mapping.street2);
  const iZip     = col(mapping.zip);
  const iCity    = col(mapping.city);

  if (iId === -1) {
    console.error(`Error: ID column "${mapping.id}" not found in input file.`);
    process.exit(1);
  }
  if (iCarrier === -1) {
    console.error(`Error: Carrier column "${mapping.carrier}" not found in input file.`);
    process.exit(1);
  }

  const records = [];
  const stats = { valid: 0, placeholder: 0, missing: 0, wrong_format: 0, non_eu: 0 };

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const get = (idx) => (idx >= 0 ? (cols[idx] || "").trim() : "");

    const rawVat = get(iVat);
    const countryId = get(iCountry);
    const { vat, status, country } = classifyAndReconstruct(
      rawVat === "NULL" ? "" : rawVat,
      countryId,
    );

    stats[status]++;

    records.push({
      id: get(iId),
      carrier: get(iCarrier),
      originalVat: rawVat === "NULL" ? "" : rawVat,
      vat,
      vatSource: "original",
      vatStatus: status,
      country,
      storedAddress: buildStoredAddress([
        get(iStreet1), get(iStreet2), get(iZip), get(iCity),
      ]),
      notes: [],
    });
  }

  const intDir = join(jobDir, "intermediate");
  const outPath = join(intDir, "normalized.ndjson");
  writeNdjson(outPath, records);

  console.log(`\n  Transform`);
  console.log(`  ─────────`);
  console.log(`  Input:        ${inputPath}`);
  console.log(`  Mapping:      ${mappingPath}`);
  console.log(`  Output:       ${outPath}`);
  console.log(`  Total rows:   ${records.length}`);
  console.log(`  Valid VAT:    ${stats.valid}`);
  console.log(`  Placeholder:  ${stats.placeholder}`);
  console.log(`  Missing:      ${stats.missing}`);
  console.log(`  Wrong format: ${stats.wrong_format}`);
  console.log(`  Non-EU/UK:    ${stats.non_eu}`);
  console.log();

  return { outPath, idColumn: mapping.id, records };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [inputPath, mappingPath, jobDir] = process.argv.slice(2);
  if (!inputPath || !mappingPath || !jobDir) {
    console.error("Usage: node pipeline/transform.mjs <input.tsv> <mapping.json> <jobDir>");
    process.exit(1);
  }
  transform(inputPath, mappingPath, jobDir);
}

export { transform, classifyAndReconstruct, NON_EU_COUNTRIES, SUPPORTED_EU_UK };
