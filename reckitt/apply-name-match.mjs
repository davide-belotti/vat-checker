import { readFileSync, writeFileSync } from "fs";

const SEP = "|";
const inputPath = "reckitt/output/Reckitt carriers export 14.04.2026 - Active carriers-name-match.csv";
const outputPath = "reckitt/output/Reckitt carriers export 14.04.2026 - Active carriers-final.csv";

const NON_EU_COUNTRIES = new Set([
  "TR","UA","RU","BY","CH","GE","AZ","AM","MD","BA","RS","ME","MK","AL","XK","NO","IS"
]);

function assignConfidence(row) {
  const registered = row.Registered || "";
  const vatSource = row.VatSource || "";
  const nameMatch = row.NameMatch || "";
  const country = row.Country || "";
  if (NON_EU_COUNTRIES.has(country)) return "Non-EU";
  if (registered === "Yes" || registered === "Yes (corrected)") {
    if (vatSource === "original" && nameMatch !== "Mismatch") return "Confirmed";
    if (vatSource === "original" && nameMatch === "Mismatch") return "To be verified";
    if (nameMatch === "Match" || nameMatch === "Partial") return "Likely correct";
    return "To be verified";
  }
  return "Unresolved";
}

// Verdicts by 0-based data row index: [verdict, note_to_append]
// null = N/A, "Match" = Match, ["Partial", "..."] or ["Mismatch", "..."]
const verdicts = {
  0: ["Match"],
  1: ["Match"],
  6: ["Match"],
  7: ["Match"],
  8: ["Partial", "GEFCO Polska rebranded to CEVA Ground Logistics Poland (GEFCO acquired by CMA CGM 2022, integrated into CEVA)"],
  9: ["Match"],
  11: ["Match"],
  12: ["Match"],
  13: ["Match"],
  14: ["Partial", "XPO HOLDINGS UK AND IRELAND LIMITED is the holding company of XPO Logistics. Same group, different legal entity level"],
  15: ["Partial", "Pekaes acquired by GEODIS, rebranded to GEODIS Road Network"],
  17: ["Match"],
  18: ["Match"],
  19: ["Match"],
  20: ["Match"],
  21: ["Partial", "VIES returns VAT group label instead of company name. Waberer's International is a member of this VAT group"],
  22: ["Match"],
  23: ["Partial", "Sole proprietorship — Waldemar Bocheński trades as P.H.U.S EXPORT-IMPORT TRANSPIL-SPEDITION. Same entity"],
  24: ["Match"],
  26: ["Match"],
  27: ["Match"],
  31: ["Partial", "Sole proprietorship — Andrzej Mielczarek trades as Firma Transportowo Spedycyjno Handlowa. Same entity"],
  32: ["Match"],
  34: ["Match"],
  35: ["Match"],
  36: ["Match"],
  37: ["Match"],
  39: ["Match"],
  41: ["Match"],
  42: ["Match"],
  43: ["Match"],
  44: ["Match"],
  45: ["Partial", "Girteka Logistics UAB renamed its LT entity to EVERWEST UAB as part of group restructuring"],
  46: ["Match"],
  47: ["Match"],
  48: ["Match"],
  50: ["Match"],
  54: ["Match"],
  55: ["Match"],
  58: ["Match"],
  59: ["Partial", "GEFCO Italia rebranded to CEVA Ground Logistics Italy (GEFCO acquired by CMA CGM 2022, integrated into CEVA)"],
  60: ["Match"],
  61: ["Partial", "Müller Transporte GmbH vs Müller BeteiligungsverwaltungsGmbH — holding/investment entity shares VAT with transport company. Same Müller group"],
  62: ["Match"],
  64: ["Match"],
  65: ["Match"],
  66: ["Match"],
  67: ["Match"],
  69: ["Match"],
  70: ["Match"],
  72: ["Mismatch", "API returns GERMANCARS SRL — completely different company. VAT IT05160120266 does not belong to Tradecor. Possible incorrect VAT correction"],
  73: ["Match"],
  74: ["Match"],
  76: ["Match"],
  78: ["Match"],
  79: ["Partial", "Spanish subsidiary (Patinter España) using Portuguese parent PATINTER PORTUGUESA VAT. Same group, wrong country VAT"],
  80: ["Match"],
  81: ["Match"],
  82: ["Match"],
  83: ["Match"],
  84: ["Match"],
  85: ["Match"],
  86: ["Match"],
  88: ["Match"],
  89: ["Partial", "Sole proprietorship — Kamil Stańczak trades as Lafante. Same entity"],
  90: ["Match"],
  94: ["Match"],
  95: ["Partial", "NOLAN TRANSPORT renamed/restructured as ROADTEAM LOGISTICS SOLUTIONS. Address still references Nolan Transport"],
  96: ["Match"],
  97: ["Partial", "Sole proprietorship — Piotr Szczerbiński trades as Trans-Logistic Dębica. Same entity"],
  98: ["Match"],
  99: ["Match"],
  102: ["Match"],
  103: ["Mismatch", "API returns STELLANTIS UK LIMITED — different company. GEFCO UK VAT GB272369149 now registered to Stellantis (formerly PSA Group)"],
  104: ["Match"],
  107: ["Match"],
  108: ["Match"],
  109: ["Match"],
  110: ["Match"],
  111: ["Match"],
  112: ["Match"],
  115: ["Match"],
  116: ["Partial", "GEFCO Baltic rebranded to CEVA Logistics Baltic (GEFCO integrated into CEVA Logistics Jan 2023)"],
  117: ["Match"],
  118: ["Partial", "MacAndrews & Co Ltd is a CMA CGM subsidiary. VAT GB802298146 belongs to MacAndrews, not the parent CMA CGM UK entity"],
  119: ["Match"],
  120: ["Partial", "GEFCO Portugal rebranded to CEVA Logistica Empresarial (GEFCO integrated into CEVA Logistics Jan 2023)"],
  121: ["Partial", "GEFCO Magyarország rebranded to CEVA Ground Logistics Hungary (GEFCO integrated into CEVA Logistics Jan 2023)"],
  122: ["Match"],
  125: ["Match"],
  126: ["Match"],
  127: ["Partial", "Bolloré Logistics UK acquired by CMA CGM, rebranded to CEVA Air & Ocean UK (2023)"],
  129: ["Match"],
  130: ["Match"],
  132: ["Match"],
  133: ["Match"],
  134: ["Match"],
  135: ["Match"],
  137: ["Match"],
  138: ["Match"],
  139: ["Match"],
  141: ["Match"],
  142: ["Match"],
  143: ["Match"],
  147: ["Match"],
  148: ["Match"],
  149: ["Partial", "Sole proprietorship — Mariusz Grycz trades as MGT Transport Krajowy i Międzynarodowy. Same entity"],
  150: ["Match"],
  151: ["Partial", "Norbert Dentressangle acquired by XPO (2015), logistics division spun off as GXO Logistics (2021). Same entity, twice renamed"],
  152: ["Match"],
  153: ["Match"],
  154: ["Match"],
  156: ["Match"],
  157: ["Partial", "Sole proprietorship — Piotr Cyrson trades as AEROTRANS. Same entity"],
  159: ["Match"],
  160: ["Match"],
  162: ["Match"],
  164: ["Match"],
  165: ["Match"],
  166: ["Match"],
  167: ["Partial", "Sole proprietorship — Rafał Kosztowny trades as Aro-Trans. Same entity"],
  168: ["Match"],
  169: ["Match"],
  170: ["Partial", "Sole proprietorship — Edward Osica trades as Firma Transportowo-Handlowa. Same entity"],
  171: ["Mismatch", "API returns MACANDREWS & CO LTD — GB VAT GB802298146 belongs to UK MacAndrews entity, not CMA CGM Polska. Wrong VAT"],
  172: ["Match"],
  173: ["Match"],
  174: ["Match"],
  176: ["Match"],
  178: ["Match"],
  179: ["Match"],
  180: ["Partial", "VGL Road rebranded to Ligentia Poland (formerly VGL Group/Vector Global Logistics). Rebrand confirmed"],
  185: ["Match"],
  186: ["Match"],
  187: ["Partial", "ND Polska (Norbert Dentressangle) renamed to XPO Transport Solutions Poland after XPO acquisition (2015)"],
  189: ["Mismatch", "API returns DFDS LOGISTICS SERVICES — completely different company from Ekol Logistics. VAT may have been reassigned"],
  191: ["Match"],
  192: ["Match"],
  194: ["Match"],
  195: ["Match"],
  197: ["Partial", "GB GLOBAL MANAGEMENT LIMITED is the holding company of Uniserve Group. Same group, different legal name"],
  198: ["Match"],
  201: ["Match"],
  202: ["Match"],
  204: ["Match"],
  207: ["Match"],
  208: ["Match"],
  209: ["Match"],
  210: ["Match"],
  211: ["Match"],
  212: ["Match"],
  214: ["Match"],
  216: ["Match"],
  218: ["Match"],
  220: ["Match"],
  222: ["Match"],
  225: ["Match"],
  227: ["Match"],
  228: ["Match"],
  230: ["Partial", "Sole proprietorship — Marcin Łuczkowski trades as F.H.U Łuczkowski. Same entity"],
  231: ["Match"],
  232: ["Match"],
  234: ["Mismatch", "API returns Sennder Benelux B.V. — different company. VAT NL859288961B01 belongs to sennder, not Uber Freight"],
  235: ["Match"],
  237: ["Partial", "Blackbuck Poland / TruKKer Europe — entity renamed, now in liquidation. Same entity"],
  239: ["Partial", "Sole proprietorship — Łukasz Bloch trades as Luk-Trans. Same entity"],
  240: ["Match"],
  242: ["Partial", "Sole proprietorship — Agnieszka Osica-Foltyn trades as F&O. Same entity"],
  243: ["Match"],
  244: ["Match"],
  245: ["Match"],
  247: ["Match"],
  248: ["Partial", "FM Logistic Crépy-en-Valois is a branch/site of SAS FM France. Same company"],
  250: ["Match"],
  251: ["Partial", "Sole proprietorship — Marcin Osiński trades as TSL Wiolmar. Same entity"],
  252: ["Partial", "UAB Girteka Europe West is a sub-brand; VAT belongs to parent Girteka Logistics UAB. Same group"],
  253: ["Match"],
  254: ["Match"],
};

const raw = readFileSync(inputPath, "utf-8").trimEnd();
const [headerLine, ...dataLines] = raw.split("\n");
const headers = headerLine.split(SEP);

const nameMatchIdx = headers.indexOf("NameMatch");
const notesIdx = headers.indexOf("Notes");

// Add Confidence column after NameMatch (or before Notes)
const newHeaders = [...headers];
const confInsertAt = newHeaders.indexOf("Notes");
if (!newHeaders.includes("Confidence")) {
  newHeaders.splice(confInsertAt, 0, "Confidence");
}

const outLines = [newHeaders.join(SEP)];
const stats = { Match: 0, Partial: 0, Mismatch: 0, "N/A": 0 };
const partials = [];
const mismatches = [];

for (let i = 0; i < dataLines.length; i++) {
  const cols = dataLines[i].split(SEP);
  const obj = {};
  headers.forEach((h, idx) => (obj[h] = cols[idx] || ""));

  const rn = obj.RegisteredName || "";
  const isEligible = rn && rn !== "N/A" && rn !== "Yes";

  let verdict = "N/A";
  let noteAppend = "";

  if (isEligible && verdicts[i]) {
    verdict = verdicts[i][0];
    noteAppend = verdicts[i][1] || "";
  } else if (!isEligible) {
    verdict = "N/A";
  }

  obj.NameMatch = verdict;
  stats[verdict] = (stats[verdict] || 0) + 1;

  if (noteAppend) {
    const existing = obj.Notes || "";
    obj.Notes = existing ? `${existing}; ${noteAppend}` : noteAppend;
  }

  // Assign confidence
  const confidence = assignConfidence({
    Registered: obj.Registered || "",
    VatSource: obj.VatSource || "",
    NameMatch: obj.NameMatch || "",
    Country: obj.Country || "",
  });
  obj.Confidence = confidence;

  if (verdict === "Partial") {
    partials.push(`  ${obj["TRANSPOREON ID"]}  ${obj.Carrier} → ${obj.RegisteredName}`);
  }
  if (verdict === "Mismatch") {
    mismatches.push(`  ${obj["TRANSPOREON ID"]}  ${obj.Carrier} → ${obj.RegisteredName}`);
  }

  const row = newHeaders.map((h) => {
    if (h === "Confidence") return obj.Confidence || "";
    return obj[h] || "";
  });
  outLines.push(row.join(SEP));
}

writeFileSync(outputPath, outLines.join("\n") + "\n", "utf-8");

// Count confidence
const confStats = { Confirmed: 0, "Likely correct": 0, "To be verified": 0, "Non-EU": 0, Unresolved: 0 };
for (const line of outLines.slice(1)) {
  const cols = line.split(SEP);
  const confIdx = newHeaders.indexOf("Confidence");
  const conf = cols[confIdx] || "";
  confStats[conf] = (confStats[conf] || 0) + 1;
}

console.log(`\nName Comparison Summary`);
console.log(`───────────────────────`);
console.log(`Compared:    ${stats.Match + stats.Partial + stats.Mismatch} rows`);
console.log(`Match:       ${stats.Match} (same company)`);
console.log(`Partial:     ${stats.Partial} (renamed/rebranded — see Notes)`);
console.log(`Mismatch:    ${stats.Mismatch} (different company — see Notes)`);
console.log(`N/A:         ${stats["N/A"]} (no registered name)`);

if (partials.length) {
  console.log(`\nPartial matches:`);
  for (const p of partials) console.log(p);
}
if (mismatches.length) {
  console.log(`\nMismatches:`);
  for (const m of mismatches) console.log(m);
}

console.log(`\nConfidence Summary`);
console.log(`──────────────────`);
console.log(`Output:          ${outputPath}`);
console.log(`Total:           ${dataLines.length}`);
console.log(`Confirmed:       ${confStats.Confirmed}`);
console.log(`Likely correct:  ${confStats["Likely correct"]}`);
console.log(`To be verified:  ${confStats["To be verified"]}`);
console.log(`Non-EU:          ${confStats["Non-EU"]}`);
console.log(`Unresolved:      ${confStats.Unresolved}`);
