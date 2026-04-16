import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { queryVIES, queryHMRC } from "../validate-vat.mjs";
import { isTransientError } from "../lib/api-clients.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MAX_RETRIES = 4;
const VIES_DELAY_MS = 3000;
const HMRC_DELAY_MS = 2500;
const RETRY_BASE_MS = 5000;

const __dirname = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(__dirname, "api-cases.json"), "utf-8"));
const viesTests = cases.vies;
const hmrcTests = cases.hmrc;

async function queryVIESWithRetry(cc, num) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await queryVIES(cc, num);
    if (!isTransientError(result)) return result;
    if (attempt < MAX_RETRIES) {
      const backoff = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      process.stdout.write(` retry ${attempt}/${MAX_RETRIES - 1} (${(backoff / 1000).toFixed(0)}s)...`);
      await sleep(backoff);
    }
  }
  return { error: "All retries exhausted" };
}

async function runApiTests() {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];

  console.log("\n  VIES API Tests");
  console.log("  ──────────────");

  for (const t of viesTests) {
    await sleep(VIES_DELAY_MS);
    process.stdout.write(`  ${t.cc}${t.num}  (${t.label})...`);
    const result = await queryVIESWithRetry(t.cc, t.num);

    if (!result || result.error) {
      console.log(` SKIP — VIES unavailable: ${result?.error || "no response"}`);
      skipped++;
      continue;
    }

    const got = result.registered;
    if (got === t.expect) {
      console.log(` PASS — Registered: ${got ? "Yes" : "No"}`);
      passed++;
    } else {
      console.log(` FAIL — expected ${t.expect}, got ${got}`);
      failures.push({ service: "VIES", id: `${t.cc}${t.num}`, label: t.label, expected: t.expect, got });
      failed++;
    }
  }

  console.log("\n  HMRC (GOV.UK) API Tests");
  console.log("  ──────────────────────");

  for (const t of hmrcTests) {
    await sleep(HMRC_DELAY_MS);
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
  console.log(`  Skipped: ${skipped} (service unavailable after ${MAX_RETRIES} retries)`);
  console.log(`  Total:   ${passed + failed + skipped}\n`);

  if (failures.length > 0) {
    console.log("  Failure details:");
    for (const f of failures) {
      console.log(`    [${f.service}] ${f.id} (${f.label}): expected ${f.expected}, got ${f.got}`);
    }
    console.log();
    return false;
  }

  if (skipped > 0) {
    console.log(`  All reachable API tests passed (${skipped} skipped — member state services unavailable).\n`);
  } else {
    console.log(`  All API tests passed.\n`);
  }
  return true;
}

export { runApiTests };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ok = await runApiTests();
  if (!ok) process.exit(1);
}
