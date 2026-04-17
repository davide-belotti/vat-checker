---
name: compare-names
description: >-
  Compare carrier names against registered business names using LLM reasoning.
  Use when the user asks to compare names, match names, check name matches,
  or mentions an enriched CSV file needing name comparison.
---

# Compare Names

Compare the input carrier name against the registered business name returned
by VIES/HMRC or found via web search, using natural language reasoning to
handle rebranding, legal suffixes, abbreviations, and transliteration.

## Required Input

This skill needs **one file**: a pipe-delimited CSV with at least `Carrier`
and `RegisteredName` columns. If the user does not provide a file path, ask:

> Please provide the path to the enriched CSV file, e.g.:
> `Compare names in pipeline/jobs/<name>/intermediate/enriched-pass2.csv`

## Workflow

### Step 1 — Load and filter

Read the CSV file (pipe-delimited `|`). Collect rows where:

- `RegisteredName` is not empty and not `N/A`

Rows without a registered name get `NameMatch` = `N/A` — skip them.

### Step 2 — LLM name comparison

For each eligible row, compare `Carrier` (input) vs `RegisteredName` (from API/web).

#### Matching rules — use natural language reasoning, not string comparison:

| Pattern | Example | Verdict |
|---|---|---|
| Same name, different case | `dhl` vs `DHL EXPRESS` | Match |
| Legal suffix differences | `Fercam` vs `FERCAM SPA` | Match |
| Abbreviation vs full | `TNT` vs `TNT Express Italy S.r.l.` | Match |
| Typos / misspellings | `Fercamm` vs `FERCAM SPA` | Match |
| Partial name in longer | `Dachser` vs `DACHSER SE LOGISTIKZENTRUM` | Match |
| Local language full form | `SKAT TRANSPORT SP. Z O.O. SP. K.` vs `SKAT TRANSPORT SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ SPÓŁKA KOMANDYTOWA` | Match |
| Rebranding / acquisition | `GEFCO Polska` vs `CEVA GROUND LOGISTICS POLAND` | Mismatch |
| Parent/subsidiary | `DHL Freight France` vs `DHL FREIGHT FRANCE SAS` | Match |
| Holding company name | `Schenker Sp z o.o.` vs `DB SCHENKER SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ` | Match |
| Completely different | `ABC Corp` vs `XYZ Trading Ltd` | Mismatch |
| Generic short name | `Express` vs `DHL Express` | Mismatch |

#### Key principles

- **Ignore legal suffixes**: SPA, GmbH, Ltd, S.r.l., AG, SA, NV, Sp. z o.o.,
  A.S., Kft., AB, OY, UAB, SRL, EOOD, etc.
- **Ignore case and diacritics**: ö=o, ł=l, ü=u, etc.
- **"Partial" means the company likely IS the same but has been renamed.**
  This is different from "Match" — it signals a structural event (acquisition,
  rebrand, merger) that the reviewer should know about.
- **Mismatch means clearly different companies.** Not just a name variation —
  genuinely different entities.

### Step 3 — Notes for Partial and Mismatch

**Mandatory.** For every Partial or Mismatch verdict, write an explanation in
the `Notes` column:

- **Partial**: Explain the name change. What happened, when, why.
  `"GEFCO Polska → CEVA Ground Logistics Poland (GEFCO acquired by CMA CGM 2022, rebranded to CEVA)"`

- **Mismatch**: Explain what was found instead.
  `"API returns PIRELLI & C. SPA — completely different company, possible wrong VAT in source data"`

For **Match** verdicts, Notes are optional (only add if there's something
non-obvious, like a DBA name or subsidiary relationship).

### Step 4 — Update the file

For each compared row, write the verdict into the `NameMatch` column.
For Partial and Mismatch, append the explanation to the `Notes` column
(preserve existing notes, separate with "; ").

Write the updated file back to the **same path** (overwrite).

### Step 5 — Report

Print a summary:

```
Name Comparison Summary
───────────────────────
Compared:    N rows
Match:       N (same company)
Partial:     N (renamed/rebranded — see Notes)
Mismatch:    N (different company — see Notes)
N/A:         N (no registered name)

Partial matches:
  227867  GEFCO Polska → CEVA GROUND LOGISTICS POLAND (acquisition)
  ...

Mismatches:
  234132  CMA CGM Polska → GB VAT returns different UK entity
  ...
```

## Important Constraints

- **Only modify `NameMatch` and `Notes` columns** — do not change any other data
- **Notes are mandatory for Partial and Mismatch** — the reviewer must be able
  to understand the verdict without re-investigating
- **Name match is the strongest confidence signal** — be accurate. When uncertain
  between Match and Partial, choose Partial (conservative)
- **Always read the file first** — don't assume file contents from memory
