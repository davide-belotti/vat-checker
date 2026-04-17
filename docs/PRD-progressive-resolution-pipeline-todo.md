# Pre-Prototyping Refinement Checklist

**Related document:** [`PRD-progressive-resolution-pipeline.md`](./PRD-progressive-resolution-pipeline.md) (v2.3, 953 lines)
**Owner:** Davide Belotti
**Scope:** Design decisions, research, content, technical spikes, pattern-library work, and PRD gaps that must be closed — or consciously deferred — before **wireframing / mid-fi / hi-fi prototyping** begins. Implementation-level engineering tasks are out of scope.

### Priority legend

| | Meaning |
|---|---|
| 🔴 | **Blocking** — answer this before any screen is drawn. |
| 🟡 | **High** — needed before mid-fi prototype. |
| 🟢 | **Normal** — can resolve during prototyping. |
| ⚪ | **Deferrable** — log for Phase 2, do not prototype now. |

---

## 1 · Design decisions still open

### 🔴 Blocking

- [ ] **Pick the v1 domain.** §12 of the PRD leaves this open: carrier VAT (reference implementation), vendor bank-detail (IBAN/BIC), parts master, or customer address. Determines S1 integrations, tenant scope, and which TMS profiles F0 needs to ship.
- [ ] **Commit to a write-back governance model.** Finance review §11 posed the Socratic question and it remains open: direct write-back to the master, or Proposal handoff to the tenant's existing MDG workflow? Reshapes F5 (four-eyes) and §5.3 (record detail).
- [ ] **Deduplication strategy in F0 bootstrap.** TMS exports routinely contain duplicates; the PRD is silent. Decide: dedupe pre-pipeline, flag-first-keep-rest, or admin-resolves in wizard step 3.5.
- [ ] **Budget approver for F0 step 7.** Tenant admin alone, or finance approver for enterprise tenants? Affects wizard UX and tenant-setup permissions.

### 🟡 High

- [ ] **Confidence-threshold customisation UX.** R10 says thresholds are configurable per tenant; no UI specified. Propose a tenant-admin settings surface or fold into §5.4.
- [ ] **Adaptive sample-size algorithm (§6.10).** The growth/shrink function, floor/ceiling, and cold-start default need concrete numbers — not "below 2%".
- [ ] **Spend-at-risk formula (§5.2.2, §6.8).** "€ exposure × probability × recency" is directional; commit to an operational formula, or queue is not sortable.
- [ ] **Trust-breach widening (§8.3).** "Widens for 30 days" — by how much (absolute points? percentage?) and how does it revert?
- [ ] **Sanctions-screening surface.** R21 introduces the stage but no UI. Dedicated queue, cross-cutting chip, or banner?
- [ ] **Wizard resume semantics in F0 step 11.** If the admin pauses mid-run, which records commit and which are suspended? What state is rendered on resume?

### 🟢 Normal

- [ ] **Iconography and colour tokens for the four buckets.** §6.3 commits to icon+colour+label but no icons.
- [ ] **Keyboard shortcut map.** Consolidate §5.2.2, §10, F4 into a single cheat sheet; reserve no conflicts with Modus app-shell shortcuts.
- [ ] **Empty-state content for every worklist surface** (§5.2 both queues, §5.6 parse-review, §5.7 pre-bootstrap).

---

## 2 · User research required

### 🟡 High

- [ ] **Persona validation with 3–5 real MDSTCs.** The §3 persona is composite; validate frequency, expertise, interruption profile, and error cost against real shippers.
- [ ] **Bootstrap flow discovery.** Shadow 1–2 shippers during a real TMS migration to validate F0 step sequence and — critically — willingness to upload a historical invoice corpus at step 4.
- [ ] **Non-English evidence readability (HCI review §10).** Run the Flesch-Kincaid ≤ 10 target against German, Polish, Italian, Turkish native reviewers using mocked evidence prose.
- [ ] **Sampling-gated flow cognitive test.** §6.10 is a novel pattern in our design system; think-aloud with a paper prototype of the sampling wizard to validate the decision tree.

### 🟢 Normal

- [ ] **External-auditor walkthrough of the Attestation view.** A Big-Four auditor reads a mocked Attestation and reports whether it satisfies their audit-defence needs.
- [ ] **Four-eyes approver shadow.** Observe 1–2 sessions of an existing MDG approver to calibrate F5 information density on §5.3.

---

## 3 · Technical feasibility spikes

### 🔴 Blocking

- [ ] **VIES / HMRC rate-limit behaviour for F0.** The bootstrap fires hundreds of calls in quick succession. Measure actual throttling, recovery curves, and plausible total duration — the F0 wizard's "estimated duration" depends on this.

### 🟡 High

- [ ] **Invoice header parsing reliability.** Run extraction against a representative corpus of the six supported formats (PDF native, scanned PDF, PEPPOL UBL, Factur-X, XRechnung, FatturaPA, KSeF). Measure precision / recall on VAT ID, legal name, address.
- [ ] **VIES `N/A` fallback for DE and ES.** Finance review flagged silent failure in the two largest EU economies. Spike Handelsregister and Registro Mercantil APIs for availability, rate limits, licensing.
- [ ] **Sanctions-list integration** (R21). Identify authoritative feeds for EU consolidated list + OFAC SDN + UK OFSI; refresh cadence; false-positive handling.

### 🟢 Normal

- [ ] **AI cost estimator.** Predict AI cost per F0 run from record count and source-pattern mix; validate against 2–3 real datasets. Feeds F0 step 6 pre-run estimate.
- [ ] **TMS source-system profiles for F0.** Pick day-1 profiles (Transporeon probable; CargoWise / MercuryGate candidates). Document per-profile column mappings.

---

## 4 · Content and copy decisions

### 🟡 High

- [ ] **Bucket labels — final commit.** Revisit *Suggested* and *Needs judgment* after item 2.3 (non-English readability). §8.8 reserves the option to A/B test.
- [ ] **Evidence rationale copy bank.** Draft templated sentences for the top-20 verdict reasons (name match, rebrand/M&A, address mismatch, branch vs. HQ, etc.).
- [ ] **Error-message copy for the §6.5 failure classes.** Three canonical templates — transient / dead-end / ambiguous — each with a localisation pattern.
- [ ] **F0 wizard copy.** Every step heading, helper text, pre-run estimate sentence, and confirmation modal.

### 🟢 Normal

- [ ] **Banner copy** for trust breach, sanctions hit, budget exceeded.
- [ ] **Dashboard KPI labels and tooltips** (§5.4) — plain-language explanation per KPI.
- [ ] **Day-1 localisation scope.** English only, or English + 2 pilot-tenant languages?

---

## 5 · Pattern library work

### 🟡 High

- [ ] **Register `MIGRATION-001 Bulk Data Migration Wizard`** in the Modus pattern library, per PRD §11.1 and §11.12. Composed from `HUM-002 + HUM-034 + HAI-014 + HAI-015 + HAI-012 + AI-002 + AI-012 + HUM-050 + HUM-064`.
- [ ] **Document each PRD §6 primitive as a stand-alone pattern** (Problem / Context / Forces / Solution / Rationale / Related patterns / Modus implementation notes). Ten primitives. This is the asset that makes the feature *reusable* beyond this PRD.

### 🟢 Normal

- [ ] **Modus component gap analysis.** For each primitive, mark whether the Modus component library already ships the primitive, ships a near-miss, or needs a net-new component.

---

## 6 · PRD documentation gaps

### 🟡 High

- [ ] **Baselines for success metrics (§9).** The 4× throughput and ≥95% coverage targets have no pre-deployment baseline. Specify a measurement plan per pilot tenant.
- [ ] **Accessibility test plan** (§10). The WCAG 2.2 table has risk levels but no procedure. Specify tools (axe, NVDA, VoiceOver), participants with accessibility needs, acceptance criteria.
- [ ] **Attestation document schema** (R18). "Signed, immutable" is asserted; the JSON and PDF schemas are not specified. Blocks the §6.9 archival path.

### 🟢 Normal

- [ ] **ER diagram for the §4.5 data model.** Currently a table; an actual diagram helps engineers *and* compliance.
- [ ] **State machine for `Carrier` / `ValidationRun` / `Proposal` / `Approval`.** F5 and §6.7 imply one; draw it explicitly.
- [ ] **Interface contracts** for R20 (MDG write-back), R22 (upstream TMS sync). Even as a stub schema.

---

## 7 · Phase-2 items — parked, do not prototype now

### ⚪ Deferrable

- [ ] **E-invoicing real-time pre-issuance path.** §12 open; tracked for IT SdI, PL KSeF 2026, FR 2026-27, ES Verifactu, DE B2B phase-in.
- [ ] **Invoice parser depth Phase 2** (§12). Customer VAT and service-country codes for place-of-supply reasoning.
- [ ] **Global pattern-learning opt-in** (§12 + §8.4). Default declined; design only when a tenant asks.
- [ ] **Multi-domain extension.** Vendor bank-detail, parts master, customer address — decide order after carrier VAT ships.
- [ ] **A/B test infrastructure for bucket labels** (§8.8). Only activate if telemetry shows real confusion.

---

## Summary

**Total open items:** 38. Of these, **10 🔴 blocking / 18 🟡 high / 5 🟢 normal / 5 ⚪ deferred**.

**Critical path to prototype-ready:** resolving all 🔴 + the high-priority research items 2.2, 3.2, 3.3 (parallelisable). Estimated 3–4 weeks with research items running in parallel with design work.

**Meta-note on the PRD itself.** v2.3 is at 953 lines — the upper edge of manageable. Future revisions should *extract* §6 primitives and the new `MIGRATION-001` pattern into the Modus pattern library rather than letting the PRD grow further. The PRD's role is to describe *this feature*; the pattern library's role is to carry *reusable design knowledge*. They should stop overlapping.
