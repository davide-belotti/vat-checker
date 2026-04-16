import { runChecksum, queryVIES, queryHMRC } from "./validate-vat.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Test cases ─────────────────────────────────────────────

const viesTests = [
  { cc: "DE", num: "811191002", expect: true, label: "SAP SE" },
  { cc: "FR", num: "40303265045", expect: true, label: "LVMH" },
  { cc: "IT", num: "00743110157", expect: true, label: "Pirelli" },
  { cc: "ES", num: "B58378431", expect: true, label: "Spanish CIF" },
  { cc: "NL", num: "853746333B80", expect: false, label: "Synthetic NL (valid checksum, not registered)" },
  { cc: "DE", num: "000000000", expect: false, label: "Invalid DE" },
  { cc: "FR", num: "00000000000", expect: false, label: "Invalid FR" },
];

const hmrcTests = [
  { num: "823847609", expect: true, label: "University of Cambridge" },
  { num: "434031494", expect: false, label: "Unregistered number" },
  { num: "000000000", expect: false, label: "All zeros" },
];

// ─── Helpers ────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

// ─── Run VIES tests ─────────────────────────────────────────

console.log("\n  VIES API Tests");
console.log("  ──────────────");

for (const t of viesTests) {
  await sleep(1500);

  const result = await queryVIES(t.cc, t.num);

  if (!result || result.error) {
    console.log(`  SKIP  ${t.cc}${t.num}  (${t.label}) — VIES temporarily unavailable`);
    skipped++;
    continue;
  }

  const got = result.registered;

  if (got === t.expect) {
    console.log(`  PASS  ${t.cc}${t.num}  (${t.label}) — Registered: ${got ? "Yes" : "No"}`);
    passed++;
  } else {
    console.log(`  FAIL  ${t.cc}${t.num}  (${t.label}) — expected ${t.expect}, got ${got}`);
    failures.push({ service: "VIES", id: `${t.cc}${t.num}`, label: t.label, expected: t.expect, got });
    failed++;
  }
}

// ─── Run HMRC tests ─────────────────────────────────────────

console.log("\n  HMRC (GOV.UK) API Tests");
console.log("  ──────────────────────");

for (const t of hmrcTests) {
  await sleep(1000);

  const result = await queryHMRC(t.num);

  if (!result || result.error) {
    console.log(`  SKIP  GB${t.num}  (${t.label}) — HMRC temporarily unavailable`);
    skipped++;
    continue;
  }

  const got = result.registered;

  if (got === t.expect) {
    console.log(`  PASS  GB${t.num}  (${t.label}) — Registered: ${got ? "Yes" : "No"}`);
    passed++;
  } else {
    console.log(`  FAIL  GB${t.num}  (${t.label}) — expected ${t.expect}, got ${got}`);
    failures.push({ service: "HMRC", id: `GB${t.num}`, label: t.label, expected: t.expect, got });
    failed++;
  }
}

// ─── Summary ────────────────────────────────────────────────

console.log(`\n  API Test Summary`);
console.log(`  ────────────────`);
console.log(`  Passed:  ${passed}`);
console.log(`  Failed:  ${failed}`);
console.log(`  Skipped: ${skipped} (service unavailable)`);
console.log(`  Total:   ${passed + failed + skipped}\n`);

if (failures.length > 0) {
  console.log("  Failure details:");
  for (const f of failures) {
    console.log(`    [${f.service}] ${f.id} (${f.label}): expected ${f.expected}, got ${f.got}`);
  }
  console.log();
  process.exit(1);
} else {
  console.log(`  All API tests passed (${skipped} skipped due to service availability).\n`);
}
