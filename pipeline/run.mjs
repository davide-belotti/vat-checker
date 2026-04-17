import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

import { transform } from "./transform.mjs";
import { prepareBatch } from "./prepare-batch.mjs";
import { mergeResults, writeEnrichedCsv, printMergeSummary } from "./merge-results.mjs";
import { prepDiscovery, applyDiscovery } from "./discover-unresolved.mjs";
import { apiPass2 } from "./api-pass2.mjs";
import { finalize } from "./finalize.mjs";

// ─── Arg parsing ────────────────────────────────────────────

function parseArgs(argv) {
  const args = { job: null, step: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--job" && i + 1 < argv.length) args.job = argv[++i];
    if (argv[i] === "--step" && i + 1 < argv.length) args.step = argv[++i];
  }
  return args;
}

function findFile(dir, ext) {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(ext));
  return files.length > 0 ? join(dir, files[0]) : null;
}

// ─── Main orchestrator ──────────────────────────────────────

async function run(jobDir, startStep) {
  jobDir = resolve(jobDir);
  const inputDir = join(jobDir, "input");
  const intDir = join(jobDir, "intermediate");

  // Auto-discover input file and mapping
  const inputPath = findFile(inputDir, ".tsv") || findFile(inputDir, ".csv");
  const mappingPath = join(inputDir, "mapping.json");

  if (!inputPath) {
    console.error(`Error: No .tsv or .csv file found in ${inputDir}`);
    process.exit(1);
  }
  if (!existsSync(mappingPath)) {
    console.error(`Error: mapping.json not found in ${inputDir}`);
    process.exit(1);
  }

  const mapping = JSON.parse(readFileSync(mappingPath, "utf-8"));
  const idColumn = mapping.id;

  console.log(`\n  Pipeline v2`);
  console.log(`  ═══════════`);
  console.log(`  Job:     ${jobDir}`);
  console.log(`  Input:   ${inputPath}`);
  console.log(`  ID col:  ${idColumn}`);

  const step = parseInt(startStep) || 1;

  // ── Step 1: Transform ─────────────────────────────────────

  if (step <= 1) {
    console.log(`\n  ── Step 1: Transform + Classify ──`);
    transform(inputPath, mappingPath, jobDir);
  }

  const normalizedPath = join(intDir, "normalized.csv");

  // ── Step 2: API Pass 1 ────────────────────────────────────

  if (step <= 2) {
    console.log(`\n  ── Step 2: API Pass 1 (VIES / HMRC) ──`);
    const { batchPath, sidecarPath } = prepareBatch(normalizedPath, jobDir, idColumn);

    console.log(`  Running validate-vat.mjs --file --suggest...`);
    console.log(`  (This may take 10-30 minutes depending on row count)\n`);

    const rootDir = resolve(jobDir, "..", "..", "..");
    try {
      execSync(
        `node validate-vat.mjs --file "${batchPath}" --suggest`,
        { cwd: rootDir, stdio: "inherit", timeout: 3600000 },
      );
    } catch (err) {
      console.error(`  API validation failed: ${err.message}`);
    }

    const resultsPath = batchPath.replace(".tsv", "-results.tsv");
    const suggestionsPath = batchPath.replace(".tsv", "-suggestions.tsv");

    const { idColumn: id, merged } = mergeResults(
      join(intDir, "sidecar.json"), resultsPath, suggestionsPath, jobDir,
    );
    const pass1Path = join(intDir, "enriched-pass1.csv");
    writeEnrichedCsv(merged, id, pass1Path);
    printMergeSummary(merged, pass1Path);
  }

  // ── Step 3: Discover unresolved (web search) ──────────────

  const pass1Path = join(intDir, "enriched-pass1.csv");

  if (step <= 3) {
    console.log(`\n  ── Step 3: Discover unresolved rows ──`);
    const { outPath, count } = prepDiscovery(pass1Path, jobDir, idColumn);

    if (count > 0) {
      console.log(`  ┌─────────────────────────────────────────────────────┐`);
      console.log(`  │  ${count} rows need web discovery.                     │`);
      console.log(`  │                                                     │`);
      console.log(`  │  In Cursor chat, say:                               │`);
      console.log(`  │  "Discover missing VATs in ${outPath}"              │`);
      console.log(`  │                                                     │`);
      console.log(`  │  Then save results to:                              │`);
      console.log(`  │  ${join(intDir, "discovered.csv")}                  │`);
      console.log(`  │                                                     │`);
      console.log(`  │  Re-run with: --step 3apply                         │`);
      console.log(`  └─────────────────────────────────────────────────────┘`);
      console.log();
      if (!startStep || startStep === "3") return;
    }
  }

  if (step <= 3 || startStep === "3apply") {
    const discoveredFile = join(intDir, "discovered.csv");
    const discoveredJson = join(intDir, "discovered.json");
    const discoveredPath = existsSync(discoveredFile) ? discoveredFile
      : existsSync(discoveredJson) ? discoveredJson : null;

    if (discoveredPath) {
      applyDiscovery(pass1Path, discoveredPath, jobDir, idColumn);
    } else {
      console.log(`  No discovery file found — skipping apply.`);
    }
  }

  // ── Step 4: API Pass 2 ────────────────────────────────────

  const discoveredPath = join(intDir, "enriched-discovered.csv");
  const pass2Input = existsSync(discoveredPath) ? discoveredPath : pass1Path;

  if (step <= 4) {
    console.log(`\n  ── Step 4: API Pass 2 (validate discovered VATs) ──`);
    await apiPass2(pass2Input, jobDir, idColumn);
  }

  // ── Step 5: Compare Names ─────────────────────────────────

  const pass2Path = join(intDir, "enriched-pass2.csv");
  const namesInput = existsSync(pass2Path) ? pass2Path : pass2Input;

  if (step <= 5) {
    console.log(`\n  ── Step 5: Compare Names ──`);
    console.log(`  ┌─────────────────────────────────────────────────────┐`);
    console.log(`  │  In Cursor chat, say:                               │`);
    console.log(`  │  "Compare names in ${namesInput}"                   │`);
    console.log(`  │                                                     │`);
    console.log(`  │  Re-run with: --step 6                              │`);
    console.log(`  └─────────────────────────────────────────────────────┘`);
    console.log();
    if (!startStep || startStep === "5") return;
  }

  // ── Step 6: Compare Addresses ─────────────────────────────

  if (step <= 6) {
    console.log(`\n  ── Step 6: Compare Addresses ──`);
    console.log(`  ┌─────────────────────────────────────────────────────┐`);
    console.log(`  │  In Cursor chat, say:                               │`);
    console.log(`  │  "Compare addresses in ${namesInput}"               │`);
    console.log(`  │                                                     │`);
    console.log(`  │  Re-run with: --step 7                              │`);
    console.log(`  └─────────────────────────────────────────────────────┘`);
    console.log();
    if (!startStep || startStep === "6") return;
  }

  // ── Step 7: Finalize (confidence labels) ──────────────────

  if (step <= 7) {
    console.log(`\n  ── Step 7: Assign Confidence Labels ──`);
    const outPath = finalize(namesInput, jobDir, idColumn);
    console.log(`\n  ═══════════════════════════════════`);
    console.log(`  Pipeline complete.`);
    console.log(`  Final output: ${outPath}`);
    console.log(`  ═══════════════════════════════════\n`);
  }
}

// ─── CLI ────────────────────────────────────────────────────

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.job) {
    console.error("Usage:");
    console.error("  node pipeline/run.mjs --job pipeline/jobs/<name>");
    console.error("  node pipeline/run.mjs --job pipeline/jobs/<name> --step 3apply");
    console.error("  node pipeline/run.mjs --job pipeline/jobs/<name> --step 5");
    process.exit(1);
  }
  await run(args.job, args.step);
}

export { run };
