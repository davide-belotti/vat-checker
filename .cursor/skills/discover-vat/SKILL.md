---
name: discover-vat
description: >-
  Discover missing or placeholder VAT numbers for carriers using web search.
  Use when the user asks to find VATs, enrich missing VATs, discover VAT numbers,
  fill placeholder VATs, or mentions a to-discover.ndjson file produced by the
  pipeline's Step 3 prep stage.
---

# Discover Missing VAT Numbers

Search the web to find VAT numbers for carriers that weren't resolved in API
Pass 1 of the pipeline.

## Required Input

This skill reads **one file**: an NDJSON file (one JSON object per line)
produced by `pipeline/discover-unresolved.mjs prep`. Typical path:

```
pipeline/jobs/<name>/intermediate/to-discover.ndjson
```

If the user does not provide a file path, ask:

> Please provide the path to the `to-discover.ndjson` file, e.g.:
> `Discover missing VATs in pipeline/jobs/<name>/intermediate/to-discover.ndjson`

You can also accept an optional row range:

> `Discover missing VATs in pipeline/jobs/<name>/intermediate/to-discover.ndjson rows 1-20`

If no range is given, process ALL rows in the file.

## Input record shape

Each line of the NDJSON input is an object like:

```json
{"id":"230387","carrier":"ATL CZ s.r.o.","vat":"","country":"CZ","storedAddress":"Praha 9, 19000","registered":"","vatStatus":"missing"}
```

Every row in `to-discover.ndjson` already needs discovery — the prep stage
filtered out rows that were registered by API Pass 1. Do not re-filter.

## Workflow

### Step 1 — Load

Read the file line by line. Each non-empty line is a JSON object. Use a helper
like `JSON.parse(line)` per line — do NOT try to parse the whole file as one
JSON document.

### Step 2 — Web search for each carrier

For each carrier, use the **WebSearch** tool to find the company's VAT number
using these fields from the record:

- `carrier` — company name
- `country` — ISO country code (tells you which country's registry to target)
- `storedAddress` — address details to disambiguate branches/entities

#### Search strategy by country

| Country | Primary search | Fallback search |
|---|---|---|
| DE | `"{carrier}" USt-IdNr` | `"{carrier}" {city} Handelsregister` |
| FR | `"{carrier}" numéro TVA intracommunautaire` | `societe.com "{carrier}"` |
| PL | `"{carrier}" NIP` | `"{carrier}" {city} KRS` |
| IT | `"{carrier}" partita IVA` | `"{carrier}" {city} visura camerale` |
| GB | `"{carrier}" VAT number UK` | `Companies House "{carrier}"` |
| ES | `"{carrier}" CIF NIF` | `"{carrier}" {city} registro mercantil` |
| PT | `"{carrier}" NIF Portugal` | `"{carrier}" {city} NIF` |
| NL | `"{carrier}" BTW-nummer` | `"{carrier}" KvK` |
| DK | `"{carrier}" CVR` or `"{carrier}" momsnummer` | `virk.dk "{carrier}"` |
| Other EU | `"{carrier}" VAT number {country name}` | `"{carrier}" {city} VAT` |
| TR | `"{carrier}" vergi numarası` | `"{carrier}" {city} vergi` |
| UA, BY, RU | `"{carrier}" tax ID {country name}` | `"{carrier}" {city}` |
| CH | `"{carrier}" UID Schweiz` or `"{carrier}" MWST` | `zefix.ch "{carrier}"` |

#### Validation rules

- The discovered VAT must be plausible for the country (correct prefix and length)
- If multiple results appear, use the stored address to pick the right entity/branch
- Prefer the branch matching the stored address city/country
- For group structures (GEFCO, DHL, etc.), find the correct legal entity for the
  specific country, not the parent group

#### Confidence levels

- **High** — VAT found on an official registry (Companies House, societe.com,
  KRS, Handelsregister, virk.dk, zefix.ch) and matches carrier name + country
- **Medium** — VAT found on a business directory or logistics platform; name
  matches but source is not an official registry
- **Low** — VAT found but name match is uncertain, or source is unreliable
- **Not found** — no VAT could be determined after searching

### Step 3 — Write discovery output

Write an NDJSON file at:

```
pipeline/jobs/<name>/intermediate/discovered.ndjson
```

One JSON object per line. Required fields:

| Field | Description |
|---|---|
| `id` | Same `id` value from the input row (preserves the join key) |
| `carrier` | Carrier name (for readability during debugging) |
| `country` | ISO code |
| `discoveredVat` | The VAT found via web search (empty string if not found) |
| `discoverySource` | Where the VAT was found (e.g., `"societe.com"`, `"Companies House"`) |
| `discoveryConfidence` | `"High"` \| `"Medium"` \| `"Low"` \| `"Not found"` |
| `notes` | Array of short strings with context, e.g., `["multiple branches, matched by city"]` |

Optional fields (set if the web result provided them):

| Field | Description |
|---|---|
| `registeredName` | Registered business name from the source |
| `registeredAddress` | Registered address from the source |

#### Example output lines

```json
{"id":"242534","carrier":"Unifeeder A/S","country":"DK","discoveredVat":"DK12345678","discoverySource":"virk.dk","discoveryConfidence":"High","notes":[]}
{"id":"230387","carrier":"ATL CZ s.r.o.","country":"CZ","discoveredVat":"","discoverySource":"","discoveryConfidence":"Not found","notes":["no matches on ARES"]}
```

If the file already exists, **append** rather than overwrite so multiple
invocations accumulate results.

### Step 4 — Report

Print a summary:

```
VAT Discovery Summary
─────────────────────
Processed:   N carriers
High:        N (will be applied by Step 3b)
Medium:      N (will be applied by Step 3b)
Low:         N (left for manual review)
Not found:   N

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
  happens in Step 4 of the pipeline.
- **Never fabricate a VAT** — if you cannot find it, set
  `discoveryConfidence: "Not found"` and `discoveredVat: ""`.
- **Be conservative** — when uncertain between Medium and Low, pick Low.
- **Don't modify the input file** — only read `to-discover.ndjson`, write to
  `discovered.ndjson`.
- **Preserve the `id` field exactly** — the pipeline joins by `id`, so any
  change breaks the merge.
- **Always read the file first** — don't assume file contents from memory.
