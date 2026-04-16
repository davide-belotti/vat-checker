import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { queryVIES, queryHMRC } from "../validate-vat.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const __dirname = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(__dirname, "api-cases.json"), "utf-8"));
const viesTests = cases.vies;
const hmrcTests = cases.hmrc;

async function runApiTests() {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];

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
    return false;
  }

  console.log(`  All API tests passed (${skipped} skipped due to service availability).\n`);
  return true;
}

export { runApiTests };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = await runApiTests();
  if (!ok) process.exit(1);
}
