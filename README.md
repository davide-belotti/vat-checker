# VAT Checker

Offline checksum validation + live registration lookup for EU and UK VAT numbers. Validates format and checksum locally, then queries VIES (EU) or HMRC (UK) to confirm the number is actually registered. When a checksum fails, the suggestion engine tries single-digit corrections and verifies them against the registry.

## Supported Countries

AT, BE, BG, CY, CZ, DE, DK, EE, EL, ES, FI, FR, HR, HU, IE, IT, LT, LU, LV, MT, NL, PL, PT, RO, SE, SI, SK, GB, XI

## Requirements

- Node.js 18+ (uses native `fetch`)

## Usage

### Validate a single VAT number

```bash
node validate-vat.mjs <VAT_NUMBER>
```

The country prefix is part of the number (e.g. `IT00743110157`, `DE811191002`, `GB823847609`).

Runs checksum validation locally, then queries VIES or HMRC for registration status.

### Validate with correction suggestions

```bash
node validate-vat.mjs <VAT_NUMBER> --suggest
```

If the checksum fails, `--suggest` generates single-digit corrections (substitutions and transpositions) that pass the checksum, then verifies each candidate against the registry to find registered matches.

### Batch mode from a TSV file

```bash
node validate-vat.mjs --file input.tsv
```

Reads a tab-separated file with at least a `VAT` column header (and an optional `Carrier` column). Validates every row and writes results to `input-results.tsv`.

### Batch mode with range

```bash
node validate-vat.mjs --file input.tsv --range 1-10
```

Process only a slice of data rows (header is always excluded). Useful for testing a subset or resuming a large file.

| Example | Effect |
|---|---|
| `--range 1-10` | First 10 data rows |
| `--range 10-20` | Rows 10 through 20 |
| `--range 50-` | Row 50 to end of file |
| `--range -5` | First 5 data rows |

Combines with `--suggest`:

```bash
node validate-vat.mjs --file input.tsv --range 1-10 --suggest
```

### Batch mode with suggestions

```bash
node validate-vat.mjs --file input.tsv --suggest
```

Same as batch mode, but also generates correction suggestions for any rows that fail checksum. Suggestions are written to `input-suggestions.tsv`.

### Run tests

```bash
node validate-vat.mjs --test
```

Runs both test suites in sequence: offline checksum validation (all 28 countries), then live API integration tests against VIES and HMRC (requires network).

## Flags

| Flag | Description |
|---|---|
| `--file <path>` | Run in batch mode against a TSV file |
| `--range <from-to>` | Process only rows `from` through `to` (batch mode only, 1-based, header excluded) |
| `--suggest` | Enable single-digit correction suggestions for failed checksums |
| `--test` | Run all tests (checksum + API) |

## Input File Format

Tab-separated, with a header row. The `VAT` column is required; `Carrier` is optional.

```
Carrier	VAT
Fercamm	IT00098090211
Pirelli	IT00743110157
SAP	DE811191002
```

## Output Files

In batch mode, output files are derived from the input filename:

- **`<name>-results.tsv`** — one row per input VAT with columns: Carrier, VAT, Format, Checksum, Registered, Name, Address, Country. When `--suggest` is used, checksum-failed rows show `See suggestions` in the Registered column.
- **`<name>-suggestions.tsv`** — one row per suggestion with columns: Carrier, VAT, VAT_Suggestion, Format, Checksum, Registered, Name, Address, Country

### Cursor Skills (AI-powered pipeline steps)

Three Cursor Skills handle tasks that require natural language reasoning rather than deterministic code. Each is invoked from Cursor chat.

#### Match carrier suggestions

After a batch + suggest run, resolves `See suggestions` rows by comparing carrier names to the registered business names returned by the API.

```
Match carriers for input-results.tsv and input-suggestions.tsv
```

Uses LLM reasoning (not string comparison) to handle typos, acronyms, abbreviations, and legal suffixes. Confident matches are written back into the results file as `Yes (corrected)` with a `Corrected_VAT` column. Ambiguous or low-confidence cases are left for manual review.

#### Discover missing VATs

Searches the web to find VAT numbers for carriers with missing, placeholder, or malformed VATs in a normalized TSV file. Uses country-specific search strategies (e.g., USt-IdNr for DE, partita IVA for IT, NIP for PL) and official registries when available.

```
Discover missing VATs in reckitt/<name>-normalized.tsv
```

Discovered VATs are written to a `*-discovered.tsv` file with source and confidence level (High / Medium / Low / Not found). High and Medium confidence results are also written back into the normalized file.

#### Compare addresses

Compares stored carrier addresses against the registered business addresses returned by VIES/HMRC in an enriched TSV file. Handles formatting differences, abbreviations, diacritics, and localized street prefixes.

```
Compare addresses in reckitt/<name>-enriched.tsv
```

Each row gets an `AddressMatch` verdict: Match (same location), Partial (same city, different street), Mismatch (different location), or Cannot compare (insufficient data). Results are written back into the enriched file.

## Folder Structure

```
vat-checker/
├── validate-vat.mjs             # Core CLI — checksum + registry lookup
├── suggest-vat.mjs              # Suggestion engine (single-digit corrections)
├── reckitt/
│   ├── transform-reckitt.mjs    # Normalize Reckitt carrier export into standard TSV
│   ├── prepare-batch.mjs        # Prepare normalized file for batch validation
│   └── merge-results.mjs        # Merge validation results back into enriched TSV
├── n8n/
│   └── n8n-workflow-generator.mjs  # Generates n8n workflow JSON
├── test/
│   ├── checksum-cases.json      # Test cases for offline checksum validation
│   ├── api-cases.json           # Test cases for VIES / HMRC API checks
│   ├── test-vat.mjs             # Checksum test runner
│   └── test-api.mjs             # API test runner
├── workflows/
│   └── *.json                   # Generated n8n workflow files
├── .cursor/skills/
│   ├── match-carrier-suggestions/
│   │   └── SKILL.md             # Match carrier names to suggestion results
│   ├── discover-vat/
│   │   └── SKILL.md             # Find missing VATs via web search
│   └── compare-addresses/
│       └── SKILL.md             # Compare stored vs registered addresses
├── TODO.md                      # Improvement plan / roadmap
└── README.md
```

## Other Scripts

| Script | Purpose |
|---|---|
| `test/test-vat.mjs` | Offline checksum unit tests for all supported countries |
| `test/test-api.mjs` | Live API integration tests against VIES and HMRC (requires network) |
| `n8n/n8n-workflow-generator.mjs` | Generates an n8n workflow JSON for Google Sheets integration |

```bash
node test/test-vat.mjs                # checksum tests (offline)
node test/test-api.mjs                # API integration tests (live)
node n8n/n8n-workflow-generator.mjs    # outputs n8n workflow JSON into workflows/
```

## How It Works

1. **Format check** — verifies the number matches the expected pattern for its country
2. **Checksum validation** — runs the country-specific checksum algorithm (Luhn variant, modular arithmetic, etc.)
3. **Registry lookup** — queries VIES REST API (EU) or HMRC GOV.UK (GB/XI) for live registration status
4. **Suggestion engine** (with `--suggest`) — for failed checksums, tries every single-digit substitution and adjacent transposition, filters by checksum validity, then verifies candidates against the registry
