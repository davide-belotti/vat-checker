# VAT Suggestion Engine — Improvement Plan

## Problem

The Fercamm IT case (IT00098090211) revealed that the suggestion engine
reported "0 verified" — yet manual re-verification of the same 12 candidates
found IT00098090210 registered as FERCAM SPA. Root cause: transient VIES
errors (e.g. `MS_MAX_CONCURRENT_REQ`) are silently treated as "not registered"
instead of being retried.

---

## Phase 1 — Reliability (fix false negatives)

- [ ] **1.1 Retry on transient VIES errors**
  Add retry logic (e.g. 3 attempts with exponential backoff) in `getSuggestions`
  when `queryVIES` returns known transient errors:
  `MS_MAX_CONCURRENT_REQ`, `MS_UNAVAILABLE`, `TIMEOUT`, `SERVICE_UNAVAILABLE`.
  Currently line 102 in `suggest-vat.mjs` skips any result with `.error`.

- [ ] **1.2 Track and report API errors separately**
  Distinguish between "not registered" and "API error" in the output.
  Currently both are silently skipped. The user should see:
  - `Verified: 1 (registered)`
  - `Failed: 3 (API errors — could not verify)`
  - `Not registered: 8`

- [ ] **1.3 Adaptive rate limiting**
  Replace the fixed 1s delay with adaptive backoff. If a request returns
  `MS_MAX_CONCURRENT_REQ`, increase the delay for subsequent requests
  (e.g. 1s → 3s → 5s). Reset on success.

---

## Phase 2 — Broader correction coverage

- [ ] **2.1 Two-digit correction mode (`--suggest-deep`)**
  Try all combinations of two single-digit substitutions. This catches cases
  like IT00905813008 (two digits wrong) and FR63321528621 (both key digits wrong).
  Trade-off: O(n² × 10²) candidates — for an 11-digit IT VAT that's ~10,000
  checksum checks (fast) but potentially hundreds of VIES lookups (slow).
  Strategy: generate all checksum-valid candidates first, then verify in batches.

- [ ] **2.2 FR key recalculation**
  For French VATs specifically, the 2-digit key can be computed directly from
  the SIREN: `key = (SIREN × 100 + 12) % 97`. If the checksum fails, auto-
  compute the correct key and verify that single candidate. This is instant
  and covers the most common FR error pattern.

- [ ] **2.3 Missing/extra digit detection**
  Handle cases where a digit was accidentally added or dropped (number is
  10 or 12 digits instead of 11 for IT). Try removing each digit or inserting
  0-9 at each position, then checksum-validate.

---

## Phase 3 — Output and UX

- [ ] **3.1 Verbose mode (`--verbose`)**
  Print each candidate as it's checked, showing the VIES result in real time:
  ```
  [1/12] IT00089090211 ... not registered
  [2/12] IT00090890211 ... not registered
  ...
  [12/12] IT00098090210 ... REGISTERED — FERCAM SPA
  ```
  This is what we did manually and it was much more informative.

- [ ] **3.2 Summary of errored candidates**
  After suggestion runs, list any candidates that couldn't be verified due
  to API errors, so the user can retry them manually or with a follow-up run.

- [ ] **3.3 Carrier name fuzzy matching**
  When a carrier name is provided (batch mode), score suggestion results by
  name similarity to the carrier. E.g. input carrier "Fercamm" + suggestion
  name "FERCAM SPA" = high confidence boost.

---

## Priority

1. **1.1** (retry logic) — highest impact, directly fixes the Fercamm false negative
2. **1.2** (error reporting) — makes failures visible
3. **2.2** (FR key recalc) — trivial to implement, big win for FR VATs
4. **3.1** (verbose mode) — better debugging UX
5. **1.3** (adaptive rate limit) — reduces throttling cascades
6. **2.1** (two-digit deep mode) — catches more edge cases
7. **2.3** (missing/extra digit) — broader correction
8. **3.2 + 3.3** — polish
