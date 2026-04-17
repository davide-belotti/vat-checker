import { readFileSync, writeFileSync } from "fs";

const SEP = "|";
const inputPath = "reckitt/output/Reckitt carriers export 14.04.2026 - Active carriers-enriched.csv";
const outputPath = "reckitt/output/Reckitt carriers export 14.04.2026 - Active carriers-name-match.csv";

const raw = readFileSync(inputPath, "utf-8").trimEnd();
const [headerLine, ...dataLines] = raw.split("\n");
const headers = headerLine.split(SEP);

const apiNameIdx = headers.indexOf("ApiName");
if (apiNameIdx === -1) {
  console.error("ApiName column not found");
  process.exit(1);
}

const newHeaders = [...headers];
const notesIdx = newHeaders.indexOf("Notes");

// Insert RegisteredName after ApiName, NameMatch before Notes
const insertAt = notesIdx !== -1 ? notesIdx : newHeaders.length;
if (!newHeaders.includes("NameMatch")) {
  newHeaders.splice(insertAt, 0, "NameMatch");
}
if (!newHeaders.includes("RegisteredName")) {
  const apiIdx = newHeaders.indexOf("ApiName");
  newHeaders.splice(apiIdx + 1, 0, "RegisteredName");
}

const outLines = [newHeaders.join(SEP)];

for (const line of dataLines) {
  const cols = line.split(SEP);
  const obj = {};
  headers.forEach((h, i) => (obj[h] = cols[i] || ""));

  const registeredName = obj.ApiName || "";
  const row = {};
  for (const h of newHeaders) {
    if (h === "RegisteredName") row[h] = registeredName;
    else if (h === "NameMatch") row[h] = "";
    else row[h] = obj[h] || "";
  }
  outLines.push(newHeaders.map((h) => row[h]).join(SEP));
}

writeFileSync(outputPath, outLines.join("\n") + "\n", "utf-8");
console.log(`Prepared ${dataLines.length} rows → ${outputPath}`);
console.log(`RegisteredName column mapped from ApiName`);
