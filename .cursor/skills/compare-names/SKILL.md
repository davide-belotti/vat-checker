---
name: compare-names
description: >-
  Compare carrier names against registered business names using LLM reasoning.
  Use when the user asks to compare names, match names, check name matches,
  or mentions an enriched NDJSON file needing name comparison.
---

# Compare Names

Compare the input carrier name against the registered business name returned
by VIES/HMRC or found via web search, using natural language reasoning to
handle rebranding, legal suffixes, abbreviations, and transliteration.

## Required Input

This skill reads and writes **one file**: an NDJSON file (one JSON object per
line) produced by the pipeline. Typical path:

```
pipeline/jobs/<name>/intermediate/enriched-pass2.ndjson
```

If the user does not provide a file path, ask:

> Please provide the path to the enriched NDJSON file, e.g.:
> `Compare names in pipeline/jobs/<name>/intermediate/enriched-pass2.ndjson`

## Record shape

Each line is a JSON object with at least:

```json
{
  "id": "242534",
  "carrier": "LKW Walter",
  "registered": "Yes",
  "registeredName": "LKW WALTER INTERNATIONALE TRANSPORTORGANISATION AG",
  "nameMatch": "",
  "notes": []
}
```

You'll be modifying `nameMatch` and (for Partial/Mismatch) `notes`.

## Workflow

### Step 1 — Load and filter

Read the file line by line, parsing each with `JSON.parse`. Collect records
where:

- `registeredName` is a non-empty string (not `""`, not absent)

Records without a registered name get `nameMatch = "N/A"` — skip further
reasoning for them.

### Step 2 — LLM name comparison

For each eligible record, compare `carrier` (input) vs `registeredName`
(from API/web).

#### Matching rules — use natural language reasoning, not string comparison:

| Pattern | Example | Verdict |
|---|---|---|
| Same name, different case | `dhl` vs `DHL EXPRESS` | Match |
| Legal suffix differences | `Fercam` vs `FERCAM SPA` | Match |
| Abbreviation vs full | `TNT` vs `TNT Express Italy S.r.l.` | Match |
| Typos / misspellings | `Fercamm` vs `FERCAM SPA` | Match |
| Partial name in longer | `Dachser` vs `DACHSER SE LOGISTIKZENTRUM` | Match |
| Local language full form | `SKAT TRANSPORT SP. Z O.O. SP. K.` vs `SKAT TRANSPORT SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ SPÓŁKA KOMANDYTOWA` | Match |
| Rebranding / acquisition | `GEFCO Polska` vs `CEVA GROUND LOGISTICS POLAND` | Partial |
| Parent/subsidiary | `DHL Freight France` vs `DHL FREIGHT FRANCE SAS` | Match |
| Holding company name | `Schenker Sp z o.o.` vs `DB SCHENKER SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ` | Match |
| Completely different | `ABC Corp` vs `XYZ Trading Ltd` | Mismatch |
| Generic short name | `Express` vs `DHL Express` | Mismatch |

#### Key principles

- **Ignore legal suffixes**: SPA, GmbH, Ltd, S.r.l., AG, SA, NV, Sp. z o.o.,
  A.S., Kft., AB, OY, UAB, SRL, EOOD, etc.
- **Ignore case and diacritics**: ö=o, ł=l, ü=u, etc.
- **"Partial" means the company likely IS the same but has been renamed.**
  Different from "Match" — it signals a structural event (acquisition,
  rebrand, merger) that the reviewer should know about.
- **Mismatch means clearly different companies** — not just a name variation.

### Step 3 — Notes for Partial and Mismatch

**Mandatory.** For every `Partial` or `Mismatch` verdict, append an
explanation to the `notes` array (it's already an array — just push a string):

- **Partial**: explain the name change. What happened, when, why.
  `"GEFCO Polska → CEVA Ground Logistics Poland (GEFCO acquired by CMA CGM 2022, rebranded to CEVA)"`

- **Mismatch**: explain what was found instead.
  `"API returns PIRELLI & C. SPA — completely different company, possible wrong VAT in source data"`

For **Match** verdicts, notes are optional (only add if non-obvious, e.g., a
DBA name or subsidiary relationship).

### Step 4 — Update the file

For each compared record, set `nameMatch` to one of: `"Match"`, `"Partial"`,
`"Mismatch"`, `"N/A"`.

For Partial and Mismatch, push the explanation onto `record.notes` (preserve
existing entries in the array — just append).

Write the updated records back to the **same NDJSON path** (overwrite). One
JSON object per line, no trailing commas, no pretty-printing.

### Step 5 — Report

Print a summary:

```
Name Comparison Summary
───────────────────────
Compared:    N rows
Match:       N (same company)
Partial:     N (renamed/rebranded — see notes)
Mismatch:    N (different company — see notes)
N/A:         N (no registered name)

Partial matches:
  227867  GEFCO Polska → CEVA GROUND LOGISTICS POLAND (acquisition)
  ...

Mismatches:
  234132  CMA CGM Polska → GB VAT returns different UK entity
  ...
```

## Important Constraints

- **Only modify `nameMatch` and `notes`** — do not change any other fields
- **Notes are mandatory for Partial and Mismatch** — the reviewer must
  understand the verdict without re-investigating
- **`notes` is always an array of strings** — never a concatenated string.
  Use `record.notes.push("...")`, not `record.notes += "; ..."`
- **When uncertain between Match and Partial, choose Partial** (conservative)
- **Always read the file first** — don't assume file contents from memory
