import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { runChecksum } from "../validate-vat.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tests = JSON.parse(readFileSync(join(__dirname, "checksum-cases.json"), "utf-8"));

function runTests() {
  let totalPass = 0;
  let totalFail = 0;
  const failures = [];

  for (const [cc, cases] of Object.entries(tests)) {
    for (const num of cases.correct) {
      const r = runChecksum(cc, num);
      if (r.valid) {
        totalPass++;
      } else {
        totalFail++;
        failures.push({ cc, num, expected: "valid", got: r });
      }
    }

    for (const num of cases.formatOnly) {
      const r = runChecksum(cc, num);
      if (r.formatValid && !r.valid && !r.formatOnly) {
        totalPass++;
      } else if (r.formatOnly) {
        totalPass++;
      } else {
        totalFail++;
        failures.push({ cc, num, expected: "formatValid+checksumFail", got: r });
      }
    }

    for (const num of cases.invalid) {
      const r = runChecksum(cc, num);
      if (!r.formatValid) {
        totalPass++;
      } else {
        totalFail++;
        failures.push({ cc, num, expected: "formatInvalid", got: r });
      }
    }
  }

  console.log(`\n  VAT Validation Tests`);
  console.log(`  --------------------`);
  console.log(`  Passed: ${totalPass}`);
  console.log(`  Failed: ${totalFail}`);
  console.log(`  Total:  ${totalPass + totalFail}\n`);

  if (failures.length > 0) {
    console.log(`  Failures:`);
    for (const f of failures) {
      console.log(`    ${f.cc} ${f.num} — expected: ${f.expected}, got: ${JSON.stringify(f.got)}`);
    }
    console.log();
    process.exit(1);
  } else {
    console.log(`  All tests passed.\n`);
  }
}

export { runTests };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runTests();
}
