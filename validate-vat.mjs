import { fileURLToPath } from "url";
import { checksumValidators, runChecksum } from "./lib/checksum-validators.mjs";
import { queryVIES, queryHMRC, sanitize, isTransientError, sleep, RATE_LIMIT_MS } from "./lib/api-clients.mjs";
import { parseTsv, deriveOutputPath, writeResultsTsv, writeSuggestionsTsv } from "./lib/tsv-io.mjs";
import { printLookupResult, printChecksumResult } from "./lib/console-output.mjs";

// ─── validateOne — structured result for a single VAT ───────

async function validateOne(rawVat) {
  const clean = sanitize(rawVat);
  const countryCode = clean.slice(0, 2).toUpperCase();
  const vatNumber = clean.slice(2);

  const checksumResult = runChecksum(countryCode, vatNumber);

  const result = {
    input: rawVat,
    countryCode,
    vatNumber,
    formatValid: checksumResult.formatValid,
    checksumValid: checksumResult.valid,
    checksumNote: checksumResult.formatOnly ? "N/A" : null,
    formatError: checksumResult.error || null,
    registered: null,
    name: null,
    address: null,
    country: countryCode,
    reason: null,
    error: null,
  };

  if (!checksumResult.formatValid) return result;

  const isUK = countryCode === "GB" || countryCode === "XI";
  const shouldSkip =
    !checksumResult.valid && (isUK || !checksumResult.formatOnly);
  if (shouldSkip) return result;

  let apiResult;
  for (let attempt = 1; attempt <= 3; attempt++) {
    apiResult = isUK
      ? await queryHMRC(vatNumber)
      : await queryVIES(countryCode, vatNumber);

    if (!isTransientError(apiResult)) break;
    if (attempt < 3) {
      await sleep(RATE_LIMIT_MS * Math.pow(2, attempt));
    }
  }

  if (apiResult) {
    if (apiResult.error) {
      result.error = apiResult.error;
    } else {
      result.registered = apiResult.registered;
      result.name = apiResult.name || null;
      result.address = apiResult.address || null;
      result.country = apiResult.country || countryCode;
      result.reason = apiResult.reason || null;
    }
  }

  return result;
}

// ─── Suggestion printing (shared by single + batch) ─────────

async function printSuggestions(countryCode, vatNumber, serviceName) {
  console.log(`  Generating suggestions...\n`);
  const { getSuggestions } = await import("./suggest-vat.mjs");
  const { candidates, confidence, verified, apiErrors } = await getSuggestions(
    countryCode,
    vatNumber,
  );

  console.log(`  Candidates:  ${candidates.length} (checksum-valid)`);
  console.log(`  Verified:    ${verified.length} (registered)`);
  if (apiErrors.length > 0) {
    console.log(`  Failed:      ${apiErrors.length} (API errors — could not verify)`);
  }
  console.log(`  Confidence:  ${confidence}\n`);

  if (verified.length > 0) {
    for (const v of verified) {
      printLookupResult({
        service: serviceName,
        label: "Suggestion",
        registered: true,
        vatNumber: v.vatSuggestion,
        name: v.name,
        address: v.address || "N/A",
        country: v.country,
      });
    }
  } else {
    console.log(`  No registered corrections found.\n`);
  }

  if (apiErrors.length > 0) {
    console.log(`  Candidates that could not be verified (API errors):`);
    for (const e of apiErrors) {
      console.log(`    ${e.vatSuggestion} — ${e.error}`);
    }
    console.log();
  }
}

// ─── Single-VAT console mode ────────────────────────────────

async function runSingle(rawVat, suggest = false) {
  const result = await validateOne(rawVat);
  const { countryCode, vatNumber } = result;

  const checksumResult = {
    formatValid: result.formatValid,
    valid: result.checksumValid,
    formatOnly: result.checksumNote === "N/A",
    error: result.formatError,
  };
  printChecksumResult(countryCode, vatNumber, checksumResult);

  if (!result.formatValid) return;

  const isUK = countryCode === "GB" || countryCode === "XI";
  const serviceName = isUK ? "HMRC" : "VIES";

  if (!result.checksumValid) {
    console.log(`  Skipping ${serviceName} — checksum failed.\n`);
    if (suggest) {
      await printSuggestions(countryCode, vatNumber, serviceName);
    }
    return;
  }

  if (result.error) {
    console.error(`  ${serviceName} Error: ${result.error}\n`);
  } else if (result.registered !== null) {
    printLookupResult({ service: serviceName, ...result });
  }
}

// ─── Batch suggestions ──────────────────────────────────────

async function runBatchSuggestions(failed, inputPath, results) {
  if (failed.length === 0) {
    console.log(`\n  No checksum failures — no suggestions needed.`);
    return;
  }

  console.log(
    `\n  Generating suggestions for ${failed.length} failed VAT(s)...\n`,
  );
  const { getSuggestions } = await import("./suggest-vat.mjs");
  const suggestionRows = [];

  for (const r of failed) {
    process.stdout.write(
      `  Suggesting for ${r.countryCode}${r.vatNumber}...`,
    );
    const { confidence, verified, apiErrors } = await getSuggestions(
      r.countryCode,
      r.vatNumber,
    );

    if (apiErrors.length > 0) {
      for (const e of apiErrors) {
        suggestionRows.push({
          carrier: r.carrier,
          vat: `${r.countryCode}${r.vatNumber}`,
          vatSuggestion: e.vatSuggestion,
          format: "",
          checksum: "",
          registered: "",
          name: `API error: ${e.error}`,
          address: "",
          country: "",
        });
      }
    }

    if (verified.length === 0) {
      suggestionRows.push({
        carrier: r.carrier,
        vat: `${r.countryCode}${r.vatNumber}`,
        vatSuggestion: "",
        format: "",
        checksum: "",
        registered: "",
        name: "No registered corrections found",
        country: "",
      });
      const errCount = apiErrors.length;
      console.log(errCount > 0
        ? ` no matches (${errCount} API error${errCount > 1 ? "s" : ""})`
        : " no matches");
    } else {
      for (const v of verified) {
        suggestionRows.push({
          carrier: r.carrier,
          vat: `${r.countryCode}${r.vatNumber}`,
          vatSuggestion: v.vatSuggestion,
          format: "Valid",
          checksum: "Pass",
          registered: "Yes",
          name: v.name,
          address: v.address || "N/A",
          country: v.country,
        });
      }
      const errCount = apiErrors.length;
      console.log(` ${verified.length} registered match(es)${errCount > 0 ? `, ${errCount} API error(s)` : ""}`);
    }
  }

  for (const r of failed) {
    r.seeSuggestions = true;
  }

  const suggestPath = deriveOutputPath(inputPath, "suggestions");
  writeSuggestionsTsv(suggestionRows, suggestPath);
  console.log(`\n  Suggestions written to ${suggestPath}`);

  const resultsPath = deriveOutputPath(inputPath, "results");
  writeResultsTsv(results, resultsPath);
  console.log(`  Results updated with suggestion references.`);
}

// ─── Batch summary ──────────────────────────────────────────

function printBatchSummary(results) {
  const valid = results.filter((r) => r.registered === true).length;
  const notReg = results.filter((r) => r.registered === false).length;
  const fmtFail = results.filter((r) => !r.formatValid).length;
  const chkFail = results.filter(
    (r) => r.formatValid && !r.checksumValid,
  ).length;
  const errors = results.filter((r) => r.error).length;

  console.log(`\n  Summary`);
  console.log(`  -------`);
  console.log(`  Total:            ${results.length}`);
  console.log(`  Registered:       ${valid}`);
  console.log(`  Not registered:   ${notReg}`);
  if (errors > 0) console.log(`  Failed:           ${errors} (API errors — could not verify)`);
  console.log(`  Format invalid:   ${fmtFail}`);
  console.log(`  Checksum failed:  ${chkFail}`);
  console.log();
}

// ─── Batch mode ─────────────────────────────────────────────

async function runBatch(inputPath, suggest, range) {
  let rows = parseTsv(inputPath);
  const totalRows = rows.length;

  if (range) {
    const start = range.from - 1;
    const end = Math.min(range.to, totalRows);
    rows = rows.slice(start, end);
    console.log(`\n  Range ${range.from}-${end} of ${totalRows} rows (processing ${rows.length})\n`);
  } else {
    console.log(`\n  Processing ${rows.length} VAT numbers...\n`);
  }

  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const { carrier, vat } = rows[i];
    process.stdout.write(`  [${i + 1}/${rows.length}] ${vat}...`);

    const result = await validateOne(vat);
    result.carrier = carrier;
    results.push(result);

    const status = result.error
      ? "error"
      : !result.formatValid
        ? "invalid format"
        : !result.checksumValid
          ? "checksum fail"
          : result.registered === true
            ? "registered"
            : result.registered === false
              ? "not registered"
              : "unknown";
    console.log(` ${status}`);
  }

  const resultsPath = deriveOutputPath(inputPath, "results");
  writeResultsTsv(results, resultsPath);
  console.log(`\n  Results written to ${resultsPath}`);

  if (suggest) {
    const failed = results.filter(
      (r) => r.formatValid && !r.checksumValid,
    );
    await runBatchSuggestions(failed, inputPath, results);
  }

  printBatchSummary(results);
}

// ─── Range parser ───────────────────────────────────────────

function parseRange(rangeStr) {
  const m = rangeStr.match(/^(\d+)?-(\d+)?$/);
  if (!m || (!m[1] && !m[2])) {
    console.error("Error: Invalid --range format. Use: 1-10, -5, or 50-");
    process.exit(1);
  }
  const from = m[1] ? parseInt(m[1]) : 1;
  const to = m[2] ? parseInt(m[2]) : Infinity;
  if (from < 1) {
    console.error("Error: --range start must be >= 1");
    process.exit(1);
  }
  if (from > to) {
    console.error("Error: --range start must be <= end");
    process.exit(1);
  }
  return { from, to };
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  let filePath = null;
  let suggest = false;
  let test = false;
  let rangeStr = null;
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--file" && i + 1 < args.length) {
      filePath = args[++i];
    } else if (args[i] === "--range" && i + 1 < args.length) {
      rangeStr = args[++i];
    } else if (args[i] === "--suggest") {
      suggest = true;
    } else if (args[i] === "--test") {
      test = true;
    } else if (!args[i].startsWith("--")) {
      positional.push(args[i]);
    }
  }

  const range = rangeStr ? parseRange(rangeStr) : null;

  if (range && !filePath) {
    console.error("Error: --range can only be used with --file (batch mode).");
    process.exit(1);
  }

  if (test) {
    const { runTests } = await import("./test/test-vat.mjs");
    runTests();
    const { runApiTests } = await import("./test/test-api.mjs");
    const ok = await runApiTests();
    if (!ok) process.exit(1);
  } else if (filePath) {
    await runBatch(filePath, suggest, range);
  } else if (positional.length > 0) {
    await runSingle(positional.join(""), suggest);
  } else {
    console.error("Usage:");
    console.error("  Single:   node validate-vat.mjs <VAT_NUMBER>");
    console.error("  Suggest:  node validate-vat.mjs <VAT_NUMBER> --suggest");
    console.error("  Batch:    node validate-vat.mjs --file input.tsv");
    console.error("  Range:    node validate-vat.mjs --file input.tsv --range 1-10");
    console.error("  Batch+S:  node validate-vat.mjs --file input.tsv --suggest");
    console.error("  Test:     node validate-vat.mjs --test");
    process.exit(1);
  }
}

// ─── Exports & entry point ──────────────────────────────────

export {
  sanitize, checksumValidators, runChecksum,
  queryVIES, queryHMRC, validateOne,
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
