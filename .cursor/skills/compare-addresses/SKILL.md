---
name: compare-addresses
description: >-
  Compare stored carrier addresses against API-returned registered addresses
  using LLM reasoning. Use when the user asks to compare addresses, check
  address matches, verify addresses, or mentions an enriched NDJSON file
  needing address comparison.
---

# Compare Addresses

Compare the stored carrier address against the registered business address
returned by VIES/HMRC (or found via web search), using natural language
reasoning to handle formatting differences, abbreviations, and localization.

## Required Input

This skill reads and writes **one file**: an NDJSON file (one JSON object per
line) produced by the pipeline. Typical path:

```
pipeline/jobs/<name>/intermediate/enriched-pass2.ndjson
```

If the user does not provide a file path, ask:

> Please provide the path to the enriched NDJSON file, e.g.:
> `Compare addresses in pipeline/jobs/<name>/intermediate/enriched-pass2.ndjson`

## Record shape

Each line is a JSON object with at least:

```json
{
  "id": "221276",
  "carrier": "dls Land u. See",
  "registered": "Yes",
  "registeredAddress": "JACOBSRADE 5, 22962 SIEK",
  "storedAddress": "Jacobsrade 1, 22962, Siek",
  "addressMatch": "",
  "notes": []
}
```

You'll be modifying `addressMatch`.

## Workflow

### Step 1 — Load and filter

Read the file line by line, parsing each with `JSON.parse`. Collect records
where **all** of these are true:

- `registered` is `"Yes"` (API Pass 1 or Pass 2 confirmed it)
- `registeredAddress` is a non-empty string, not `"N/A"`
- `storedAddress` is a non-empty string

Records that don't meet these criteria get `addressMatch = "N/A"` — skip
further reasoning for them.

### Step 2 — LLM address comparison

For each eligible record, compare `storedAddress` vs `registeredAddress`
using natural language reasoning. Both addresses refer to the same company —
the question is whether they describe the **same physical location**.

#### Comparison rules

| Pattern | Example | Verdict |
|---|---|---|
| Same street, same city, formatting differs | `Jacobsrade 1, 22962, Siek` vs `JACOBSRADE 1, 22962 SIEK` | Match |
| Abbreviations | `ul. Równoległa 4A` vs `ROWNOLEGLA 4A` | Match |
| Missing zip or street number | `pl.Bankowy 2, Warszawa` vs `PLAC BANKOWY 2, 00-095 WARSZAWA` | Match |
| Same city, different street | `Ordona 2a, Warszawa` vs `KOLEJOWA 15, 01-237 WARSZAWA` | Partial |
| Same country, different city | `Transportlaan 4, Genk` vs `HAVEN 1040, ANTWERPEN` | Mismatch |
| Completely different | `Munich, Germany` vs `Paris, France` | Mismatch |
| One address is a PO Box | `PO Box 1036, Rozenburg` vs `Marconilaan 2, Rozenburg` | Partial |
| Street name in local vs translated | `Via Aldo Moro` vs `ALDO MORO` | Match |
| One address too vague to compare | `Germany` vs `Schifferstr. 26, Duisburg` | Cannot compare |

#### Key principles

- **Normalize mentally**: ignore case, diacritics (ö→o, ł→l), punctuation,
  `"ul."` / `"str."` / `"via"` prefixes, zip formatting
- **City is the strongest signal**: if the city matches, street differences
  likely mean a different office/branch (Partial), not a wrong company
- **Country mismatch = Mismatch**: if countries differ, it's always a mismatch
  (the VAT may be registered to a parent entity in another country)
- **Don't over-match**: two addresses in the same city but clearly different
  streets are Partial, not Match

#### Verdicts

- **Match** — same physical location, differences are purely cosmetic
- **Partial** — same city/region, different street or ambiguous details
  (branch, PO Box, or different office of the same company)
- **Mismatch** — clearly different location (different city or country)
- **Cannot compare** — one or both addresses are too vague to determine

### Step 3 — Update the file

For each compared record, set `addressMatch` to one of: `"Match"`,
`"Partial"`, `"Mismatch"`, `"Cannot compare"`, `"N/A"`.

Write the updated records back to the **same NDJSON path** (overwrite). One
JSON object per line, no trailing commas, no pretty-printing.

### Step 4 — Report

Print a summary:

```
Address Comparison Summary
──────────────────────────
Compared:       N rows
Match:          N (same location)
Partial:        N (same city, different street)
Mismatch:       N (different location)
Cannot compare: N (insufficient data)
Skipped:        N (no registered address or not registered)

Mismatches:
  242534  LKW Walter (AT) — Stored: IZ NÖ SÜD STR. 14, Wiener Neudorf | API: HAUPTPLATZ 1, WIEN
  ...

Partial matches:
  221276  dls Land u. See (DE) — Stored: Jacobsrade 1, Siek | API: JACOBSRADE 5, 22962 SIEK
  ...
```

## Important Constraints

- **Only modify `addressMatch`** — do not change any other fields
- **Never auto-correct addresses** — this is comparison only, not correction
- **Process all eligible rows** — do not skip any
- **Be conservative**: when uncertain between Match and Partial, choose
  Partial. Between Partial and Mismatch, choose Partial.
- **`notes` stays an array of strings** if you ever touch it — never
  concatenate into a single string
- **Always read the file first** — don't assume file contents from memory
