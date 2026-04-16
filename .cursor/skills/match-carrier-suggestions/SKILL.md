---
name: match-carrier-suggestions
description: >-
  Match carrier names to VAT suggestion results using natural language reasoning.
  Use when the user asks to match carriers, resolve suggestions, reconcile
  results with suggestions, or mentions results.tsv and suggestions.tsv files.
---

# Match Carrier Suggestions

Resolve `See suggestions` rows in a VAT checker results file by comparing
carrier names to API-verified registered business names using natural language
understanding — not string matching.

## Required Inputs

This skill needs **two files**. If the user does not provide both, ask:

> Please provide both files:
> 1. `<name>-results.tsv` — the batch validation results
> 2. `<name>-suggestions.tsv` — the suggestion engine output
>
> Example: `match carriers for input-results.tsv and input-suggestions.tsv`

Both files must exist and be tab-separated with the column headers produced by
`validate-vat.mjs --file <input> --suggest`.

## Workflow

### Step 1 — Load and filter results

Read `<name>-results.tsv`. Collect rows where **all** of these are true:

- `Registered` column = `See suggestions`
- `Carrier` column is **not empty**

Rows without a carrier name cannot be matched — skip them silently.

### Step 2 — Load suggestions

Read `<name>-suggestions.tsv`. For each carrier/VAT pair from Step 1, find all
suggestion rows where:

- `VAT` matches the original VAT from the results row
- `Registered` = `Yes`
- `Name` is not empty and not an error message

These are the API-verified candidates with real registered business names.

### Step 3 — LLM name matching

For each carrier/VAT pair, compare the **Carrier** name from the results file
against every **Name** value from the matching suggestions.

**Matching rules — use natural language reasoning, not string comparison:**

| Pattern | Example | Should match? |
|---|---|---|
| Typos / misspellings | Carrier: `Fercamm` — Name: `FERCAM SPA` | Yes |
| Case differences | Carrier: `dhl` — Name: `DHL EXPRESS` | Yes |
| Acronyms | Carrier: `TNT` — Name: `TNT Express Italy S.r.l.` | Yes |
| Expanded acronyms | Carrier: `DHL` — Name: `Deutsche Post DHL Group` | Yes |
| Legal suffixes | Carrier: `Fercam` — Name: `FERCAM SPA` | Yes (ignore SPA/GmbH/Ltd/S.r.l./AG/SA/NV etc.) |
| Partial name in longer | Carrier: `Pirelli` — Name: `PIRELLI & C. SPA` | Yes |
| Completely different | Carrier: `ABC Corp` — Name: `XYZ Trading Ltd` | No |
| Ambiguous short names | Carrier: `Express` — Name: `DHL Express Italy` | No (too generic) |

### Step 4 — Decision

For each carrier/VAT pair, decide:

- **One confident match** → update the results row
- **Multiple equally good matches** → leave as `See suggestions` (don't guess)
- **No confident match** → leave as `See suggestions`

Be conservative. Only match when genuinely confident.

### Step 5 — Update results file

For each confident match, update the row in `<name>-results.tsv`:

| Column | New value |
|---|---|
| Registered | `Yes (corrected)` |
| Corrected_VAT | the suggestion's `VAT_Suggestion` value |
| Name | the suggestion's `Name` |
| Address | the suggestion's `Address` |
| Country | the suggestion's `Country` |

Add the `Corrected_VAT` column to the header if it doesn't exist yet (insert it
after `VAT`). Rows that were not matched keep their existing values unchanged.

Write the updated file back to the same `<name>-results.tsv` path.

### Step 6 — Report

Print a summary table:

```
Carrier Matching Summary
────────────────────────
Matched:     N
Ambiguous:   N (multiple candidates — kept as "See suggestions")
No match:    N (no confident match found)
Skipped:     N (no carrier name)

Matched rows:
  Fercamm → FERCAM SPA (IT00098090210)
  ...

Unresolved rows:
  ABC Corp → no confident match
  ...
```

## Important Constraints

- **Never modify `<name>-suggestions.tsv`** — it is the audit trail
- **Never auto-resolve ambiguous matches** — leave them for human review
- **Never match on VAT number similarity** — only match on carrier name vs registered name
- **Always read both files before doing anything** — don't assume file contents
