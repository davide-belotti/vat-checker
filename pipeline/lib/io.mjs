import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";

// ─── NDJSON: newline-delimited JSON ─────────────────────────
// One JSON object per line. Native types, native escaping, safe
// for pipes/commas/newlines/unicode. This is the working format
// for all intermediate pipeline files.

function readNdjson(path) {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  const lines = content.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch (err) {
      throw new Error(`Invalid NDJSON at ${path}:${i + 1} — ${err.message}`);
    }
  }
  return out;
}

function writeNdjson(path, records) {
  const lines = records.map((r) => JSON.stringify(r));
  writeFileSync(path, lines.join("\n") + "\n", "utf-8");
}

function appendNdjson(path, records) {
  const lines = records.map((r) => JSON.stringify(r));
  const chunk = lines.join("\n") + "\n";
  if (existsSync(path)) {
    appendFileSync(path, chunk, "utf-8");
  } else {
    writeFileSync(path, chunk, "utf-8");
  }
}

// ─── CSV: RFC-4180 compliant writer ─────────────────────────
// Used ONLY for the final output. Proper quoting (no data loss).

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = Array.isArray(value) ? value.join("; ") : String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// records: array of objects
// columns: array of { key, header } — `key` reads from record, `header` is CSV column name
function writeCsv(path, records, columns) {
  const headerLine = columns.map((c) => csvEscape(c.header)).join(",");
  const lines = records.map((r) =>
    columns.map((c) => csvEscape(r[c.key])).join(","),
  );
  writeFileSync(path, [headerLine, ...lines].join("\n") + "\n", "utf-8");
}

// ─── TSV: external contract with validate-vat.mjs ───────────
// validate-vat.mjs reads `Carrier\tVAT` TSV and writes a results
// TSV. This adapter is the ONLY place pipe/tab concerns live.

function writeBatchTsv(path, rows, columns) {
  const headerLine = columns.join("\t");
  const lines = rows.map((r) =>
    columns.map((c) => String(r[c] ?? "").replace(/\t/g, " ")).join("\t"),
  );
  writeFileSync(path, [headerLine, ...lines].join("\n") + "\n", "utf-8");
}

function readResultsTsv(path) {
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split("\t");
    const obj = {};
    headers.forEach((h, i) => (obj[h] = (cols[i] || "").trim()));
    return obj;
  });
}

// ─── Notes: append to a record's notes array ────────────────

function addNote(record, note) {
  if (!note) return;
  if (!Array.isArray(record.notes)) record.notes = [];
  record.notes.push(note);
}

export {
  readNdjson,
  writeNdjson,
  appendNdjson,
  writeCsv,
  writeBatchTsv,
  readResultsTsv,
  addNote,
  csvEscape,
};
