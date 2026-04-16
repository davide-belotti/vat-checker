---
name: discover-vat
description: >-
  Discover missing or placeholder VAT numbers for carriers using web search.
  Use when the user asks to find VATs, enrich missing VATs, discover VAT numbers,
  fill placeholder VATs, or mentions a normalized.tsv file with missing/placeholder rows.
---

# Discover Missing VAT Numbers

Search the web to find VAT numbers for carriers that have missing, placeholder,
or malformed VATs in a normalized TSV file produced by `reckitt/transform-reckitt.mjs`.

## Required Input

This skill needs **one file**: a normalized TSV with the columns produced by the
transform step. If the user does not provide a file path, ask:

> Please provide the path to the normalized TSV file, e.g.:
> `Discover missing VATs in reckitt/<name>-normalized.tsv`

You can also accept an optional row range:

> `Discover missing VATs in reckitt/<name>-normalized.tsv rows 1-20`

If no range is given, process ALL rows that need discovery.

## Workflow

### Step 1 — Load and filter

Read the normalized TSV file. Collect rows where `VatStatus` is one of:

- `missing` — no VAT at all
- `placeholder` — all-zeros VAT was cleared
- `wrong_format` — VAT present but malformed

Skip rows with `VatStatus` = `valid` or `non_eu` (non-EU carriers that already
have a VAT, even if unverifiable via VIES).

If a range was specified, apply it to the filtered rows (1-based).

### Step 2 — Web search for each carrier

For each carrier to discover, use the **WebSearch** tool to find the company's
VAT number. Use information from these columns:

- `Carrier` — the company name
- `Country` — ISO country code (tells you which country's registry to target)
- `StoredAddress` — address details to disambiguate branches/entities

#### Search strategy by country

| Country | Primary search | Fallback search |
|---|---|---|
| DE | `"{Carrier}" USt-IdNr` | `"{Carrier}" {City} Handelsregister` |
| FR | `"{Carrier}" numéro TVA intracommunautaire` | `societe.com "{Carrier}"` |
| PL | `"{Carrier}" NIP` | `"{Carrier}" {City} KRS` |
| IT | `"{Carrier}" partita IVA` | `"{Carrier}" {City} visura camerale` |
| GB | `"{Carrier}" VAT number UK` | `Companies House "{Carrier}"` |
| ES | `"{Carrier}" CIF NIF` | `"{Carrier}" {City} registro mercantil` |
| PT | `"{Carrier}" NIF Portugal` | `"{Carrier}" {City} NIF` |
| NL | `"{Carrier}" BTW-nummer` | `"{Carrier}" KvK` |
| DK | `"{Carrier}" CVR` or `"{Carrier}" momsnummer` | `virk.dk "{Carrier}"` |
| Other EU | `"{Carrier}" VAT number {Country name}` | `"{Carrier}" {City} VAT` |
| TR | `"{Carrier}" vergi numarası` | `"{Carrier}" {City} vergi` |
| UA, BY, RU | `"{Carrier}" tax ID {Country name}` | `"{Carrier}" {City}` |
| CH | `"{Carrier}" UID Schweiz` or `"{Carrier}" MWST` | `zefix.ch "{Carrier}"` |

#### Validation rules

- The discovered VAT must be plausible for the country (correct prefix and length)
- If multiple results appear, use the stored address to pick the right entity/branch
- If the company appears to have multiple branches, prefer the branch matching
  the stored address city/country
- For group structures (e.g., GEFCO, DHL), be careful to find the correct
  legal entity for the specific country, not the parent group

#### Confidence levels

- **High** — VAT found on an official registry (e.g., Companies House, societe.com,
  KRS, Handelsregister) and matches carrier name + country
- **Medium** — VAT found on a business directory or logistics platform, name matches
  but not from an official registry
- **Low** — VAT found but name match is uncertain, or the source is unreliable
- **Not found** — no VAT could be determined after searching

### Step 3 — Write discovery output

Create or append to a **discovery TSV** at `reckitt/<base>-discovered.tsv` with columns:

| Column | Description |
|---|---|
| `TRANSPOREON ID` | From the normalized file |
| `Carrier` | Carrier name |
| `Country` | ISO code |
| `DiscoveredVAT` | The VAT found via web search (empty if not found) |
| `Source` | Where the VAT was found (e.g., "societe.com", "Companies House") |
| `Confidence` | High / Medium / Low / Not found |
| `Notes` | Any relevant context (e.g., "multiple branches, matched by city") |

If the file already exists (from a previous batch), **append** new rows rather than
overwriting, so multiple invocations accumulate results.

### Step 4 — Update the normalized file

For each carrier where a VAT was discovered with High or Medium confidence:

1. Update the `VAT` column with the discovered VAT
2. Change `VatStatus` from `missing`/`placeholder`/`wrong_format` to `discovered`

Write the updated normalized file back to the same path.

For Low confidence or Not found, leave the row unchanged — human review needed.

### Step 5 — Report

Print a summary:

```
VAT Discovery Summary
─────────────────────
Processed:   N carriers
High:        N (updated in normalized file)
Medium:      N (updated in normalized file)
Low:         N (left for manual review)
Not found:   N
Skipped:     N (already valid/non_eu)

Discovered:
  242534  Unifeeder A/S (DK) → DK12345678 [High, virk.dk]
  222443  Tricolore Transport (DK) → DK87654321 [Medium, business directory]
  ...

Not found:
  230387  ATL CZ s.r.o. (CZ) — no results
  ...
```

## Important Constraints

- **Discovery only** — do NOT call VIES/HMRC or run any API validation. That
  happens in Step 3 of the pipeline.
- **Never fabricate a VAT** — if you cannot find it, mark as "Not found".
- **Be conservative** — when uncertain, use Low confidence rather than Medium.
- **Preserve the file** — only modify `VAT` and `VatStatus` columns in the
  normalized file. Do not change any other columns.
- **Batch size** — if processing many carriers, work through them systematically.
  It's fine to do all of them in one invocation if context allows.
- **Always read the file first** — don't assume file contents from memory.
