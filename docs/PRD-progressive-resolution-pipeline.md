# PRD — Progressive Resolution Pipeline (Embedded)

**Status:** Draft v2.3 · **Owner:** Davide Belotti · **Last updated:** 2026-04-17
**Supersedes:** v1 (back-office / export-based) · v2 (bucket rename + sampling-gated batch approval + invoice evidence) · v2.2 (user flows with pattern-skeleton citations).
**Revision notes — v2.3:** Added §5.7 *Bootstrap setup wizard* and §11.1 *F0 — Bootstrap the carrier master*. F0 is the highest-ROI flow of the entire feature: it converts the legacy TMS dump into an attested master at tenant setup, replacing what would otherwise be weeks of manual work with a single admin-led ritual.
**Review sources:** `docs/PRD-progressive-resolution-pipeline-hci-review.md` · `docs/PRD-progressive-resolution-pipeline-finance-review.md`.

An **embedded, agentic data-recovery capability** for master-data governance. When a carrier (or any regulated counterparty) is created, edited, or periodically re-verified inside the application, the system progressively attempts to resolve gaps and verify identity — deterministic checks first, authoritative APIs next, AI reasoning and web search last — and only surfaces to a human what genuinely cannot be fixed by available information.

The capability never asks the user to export data to a spreadsheet, run a tool outside the application, and re-import results. All inputs, evidence, verdicts, approvals, and audit attestations live **inside the application**.

---

## 1. Problem

Operational systems run on master data that is never fully clean. Carrier lists, vendor masters, customer directories, parts catalogs are entered by humans over years, synced from imperfect sources, and drift as companies rebrand, merge, relocate, go bankrupt, or change their tax registration. In a freight-audit / shipper context this drift has a specific, measurable cost:

- **Disallowed input VAT** when carrier VAT IDs on invoices don't match the registered legal entity (0.1–0.5% of cross-border freight spend per year for a typical mid-size EU shipper; €100k–500k P&L exposure)
- **Tax-inspector findings** on carrier-master controls (SOX §404, equivalent EU frameworks)
- **Re-work** at onboarding when incomplete data bounces back from downstream systems
- **Trust erosion** in the application when users discover wrong data after the fact

Today, resolving these gaps is a **manual, all-or-nothing task, performed outside the application**. Back-office operators export carrier lists to spreadsheets, open tabs to VIES, Companies House, Handelsregister, KRS, zefix.ch; they copy values back; they email corrections to the ERP team for manual entry. The interaction is:

> *"Here is the whole problem, go solve it somewhere else, and bring the answer back."*

That pattern is **externally consistent** (most SaaS handles it this way) but **internally incoherent**: it breaks Nielsen's H1 (*visibility of system status* — the app has no idea what the user did outside it) and H9 (*help users recognize, diagnose, and recover from errors* — no evidence is attached to the correction).

### The opportunity

Invert the pattern. Make the validation an **embedded feature of the record itself**. The carrier record is not a form the user fills in blind; it is a **live object** whose identity is being verified, whose confidence is visible, and whose evidence is preserved alongside it. The first and most important moment to do this is **at onboarding**, before the record ever participates in a downstream workflow.

---

## 2. Goals & Non-goals

### Goals

- **Embed** the validation flow at three trigger moments: carrier **onboarding** (primary), **event-driven revalidation** (VAT or address edited), and **periodic sweep** (quarterly or on-demand). All three produce the same persistent artifact: a `ValidationRun` attached to the record.
- **Resolve what the system can resolve**. Deterministic paths first, authoritative APIs (VIES, HMRC, zefix) next, AI web-discovery last. Confidence is compound: a categorical badge for triage *plus* an evidentiary layer for audit.
- **Escalate only what requires judgment**. The default reviewer view is an inbox of escalations, sorted by **spend at risk**, not by row count.
- **Preserve evidence as first-class UI**. Every verdict carries a visible reasoning chain. Evidence persists for the longest applicable retention period and is available inside the application without export.
- **Produce a defensible audit attestation** inside the application — a signed, viewable record of every run, every verdict, every approval, suitable for external auditors.

### Non-goals

- **No export-and-reimport loop.** No CSV or spreadsheet is the primary output of this feature. Nothing requires the user to leave the application.
- **No silent auto-correction.** Anything the system changes must be traceable, reversible, and pass through the application's existing master-data-governance approval chain.
- **No real-time guarantee on deep-reasoning stages.** Web discovery and AI comparison are asynchronous by design. The onboarding flow gates on the fast stages (format, authoritative API) and defers the slow stages to the background, with status visible on the record.
- **No standalone batch tool.** This is a capability of the application, not a companion CLI.

---

## 3. Users & primary use cases

### Primary persona — **Master-Data Steward / Tax Compliance Officer (MDSTC)**

A named, accountable role. Sits at the intersection of AP / vendor master operations and indirect tax.

| Attribute | Value |
|---|---|
| Frequency | Daily during onboarding peaks; otherwise 2–3 times per week for inbox triage |
| Expertise | Expert in domain (VAT regimes, reverse charge, carrier contracts); moderate in the application |
| Interruption profile | Task-switching between onboarding queue, escalation inbox, ad-hoc record edits |
| Error cost | High. A wrong VAT propagates into invoices, tax returns, SAF-T / JPK, ESL reporting |
| Accountability | Owns carrier-master integrity for reverse-charge compliance (EU VAT Directive 2006/112/EC, Article 44) |
| Keyboard fluency | Expected. Mouse-only flows are a failure mode for this persona |

### Secondary persona — **Master-Data Approver**

A supervisor or second reviewer who confirms write-backs under the four-eyes principle. Lower task frequency; pattern-matches on evidence rather than investigates from scratch.

### Tertiary persona — **External auditor / tax inspector** (read-only)

Requests the audit attestation for a specific carrier or time window. Must be able to reconstruct the full decision chain without re-running anything.

### Primary use cases (trigger moments)

1. **Carrier onboarding (synchronous, primary).** A new carrier record is created. Validation runs inline on the record page. The fast stages (format, authoritative API) gate the Save action; the slow stages (web discovery, reasoning) complete asynchronously and update the record.
2. **Event-driven revalidation.** VAT ID or address is edited on an existing record. A fresh `ValidationRun` starts automatically; the prior run is preserved in the validation history.
3. **Periodic sweep.** The steward triggers a quarterly (or on-demand) revalidation of the active carrier master. Results land in the escalation inbox, spend-weighted.

---

## 4. The concept

### 4.1 Three embedded trigger moments — one mechanism

| Trigger | Mode | Gating behaviour | Landing surface |
|---|---|---|---|
| Onboarding | Synchronous for fast stages; async for slow | Fast-stage failure blocks Save; slow-stage escalation does not | Inline validation panel on the record |
| Edit event | Async from the moment of edit | Never blocks the edit; updates the record on completion | Record detail page + escalation inbox if verdict needs review |
| Periodic sweep | Fully async, bulk | Never blocks; results aggregate | Escalation inbox + portfolio dashboard |

The **same pipeline** runs in all three modes. What varies is only (a) which stages gate which actions and (b) which surface renders the result. Shneiderman's *Human-Centered AI* framework calls this a **supervision** pattern for the onboarding case (user sees and accepts the proposal) and a hybrid **autonomy / supervision / collaboration** pattern for periodic sweep (*Confirmed* auto-applies; *Suggested* lands in the batch approval queue; *Needs judgment* and *Unresolved* land in the case-by-case inbox).

### 4.2 Pipeline stages

| # | Stage | Type | Source rank (§4.3) | Latency target |
|---|---|---|---|---|
| 1 | Classify | Deterministic | — | <100 ms |
| 2 | Authoritative API (VIES / HMRC / Zefix / Handelsregister) | Synchronous API | **S1 (primary)** | <3 s (sync path) / any (batch) |
| 3 | Invoice-derived evidence | Deterministic extraction from tenant-uploaded past invoices | **S2** | milliseconds (pre-indexed) |
| 4 | Web discovery | AI + tools | **S3** | minutes (async only) |
| 5 | Re-verification | Synchronous API against S1 | **S1** | <3 s per record |
| 6 | Compare & reason (name, address, cross-source) | AI | **S4 (inference only, never a source)** | seconds |
| 7 | Label & triage | Deterministic | — | <100 ms |

Stages 1, 2, 3, 7 form the **fast path** that gates onboarding (if Invoice-derived evidence already exists for this carrier, it's a cache lookup). Stages 4, 5, 6 form the **deep path** that runs asynchronously and updates the record when complete.

### 4.3 Source ranking and conflict resolution

Four sources of evidence feed the pipeline. They are explicitly ranked — when they conflict on a data value, the higher-ranked source wins and the disagreement is recorded on the record.

| Rank | Source | Why it ranks here | Example |
|---|---|---|---|
| **S1** | **Authoritative gov registry** (VIES, HMRC, zefix, Handelsregister, Registro Mercantil, KRS, etc.) | Legal source of truth. The only source a tax inspector accepts on its own. | VIES returns `registered: Yes` for `IT01897330641`. |
| **S2** | **Tenant-provided past invoices** | The carrier's own legal self-identification on a tax document. Outranks web because invoices are legally binding (EU VAT Directive Article 226). Outranked by S1 because registries are current; invoices are point-in-time. | Header of an invoice dated 2024-11 shows `GEFCO Polska Sp. z o.o., NIP 1234567890`. |
| **S3** | **Web discovery** (official company directories, business registries via search) | Public third-party data. Useful when S1 returns nothing and no invoice exists. | societe.com returns a SIRET linked to the carrier name. |
| **S4** | **LLM reasoning** (cross-source comparison, name-matching, address-matching) | **Inference only — never a primary source.** Reconciles the above; flags mismatches; never overrides them. | "Stored name `GEFCO Polska` vs. registered name `CEVA GROUND LOGISTICS POLAND` = Partial (2022 M&A)." |

**Conflict rules:**

1. **Direct data values** (VAT ID, legal name, address) — S1 wins over S2 wins over S3. S4 never overrides any of them, only reconciles.
2. **Temporal precedence within equal rank** — more recent wins. A 2026 invoice beats a 2022 invoice.
3. **Disagreements are preserved, not erased.** If S2 (invoice) and S1 (VIES) disagree on the legal name, both are stored in the evidence timeline and the record lands in *Needs judgment* (§4.4). The user sees both and decides.

### 4.4 The Confidence Ladder IS the information architecture

The verdict produced by Stage 7 is the primary IA of every screen in this feature. Each bucket has an explicit **dominant action** — what the user is supposed to *do* with records in that bucket.

| Bucket | What it means | Dominant action | HCAI position | Default UI treatment |
|---|---|---|---|---|
| **Confirmed** | S1 + (S2 ∨ S3) agree. Deterministic match input → registry. | **None.** Auto-apply structural corrections. | Autonomy | Green badge, collapsed by default |
| **Suggested** *(was "Likely correct")* | System has a confident proposal from S1–S3. Names match. Needs supervision, not investigation. | **Sample & bulk-approve.** The batch-review surface shows a random sample with full evidence; if the user's override rate stays low, the rest becomes bulk-approvable. | Supervision | Cyan badge; lives in the **Batch approval queue** (§5.2.1) |
| **Needs judgment** *(was "To be verified")* | Sources disagree, or S1 returned Partial/Mismatch on name or address. Each case requires case-by-case evaluation. | **Evaluate one by one.** The inbox shows full evidence per record. No bulk affordance; every record needs a considered decision. | Collaboration | Amber badge; lives in the **Case-by-case inbox** (§5.2.2), default-expanded |
| **Unresolved** | No source produced a plausible answer, or confidence is too low. | **Research manually.** The user consults their own sources, enters the value by hand, and the four-eyes flow runs as normal. | User-led | Red badge; surfaced at the top of the inbox with a "no leads" evidence note |

Following IBM Carbon's AI guidance and Salesforce Einstein's pattern, confidence is encoded **twice**: categorically (the badge — for fast triage, Miller's chunking) and evidentiarily (the reasoning chain — for audit and calibration). The two layers are distinct on screen; the badge never replaces the evidence.

> **Why the rename matters.** In v1 both "Likely correct" and "To be verified" prompted the user to *do some work*, without specifying which kind. In v2, *Suggested* ⇒ batch supervision with sampling; *Needs judgment* ⇒ case-by-case evaluation. The buckets now differ by *kind of work*, not just *degree of confidence*. This directly follows Shneiderman's HCAI axis (supervision vs. collaboration).

#### Non-EU is a cross-cutting sub-bucket, not a verdict

Any of the four verdicts can carry a non-EU sub-type — the jurisdiction is orthogonal to the confidence bucket:

- **GB (HMRC-validated)** — post-Brexit, still authoritative via HMRC
- **CH (Zefix-validated)** — authoritative via Zefix
- **Sanctions-screened (RU, BY, etc.)** — parallel EU/OFAC/OFSI check required (R21)
- **Other non-EU** — manual review required

### 4.5 Data model — persistent artifacts, not files

Because the output lives inside the application, the artifacts are **domain objects**, not files. Names below are illustrative:

| Object | Owns | Lifetime |
|---|---|---|
| `Carrier` | The master record itself | Until legal entity ceases |
| `InvoiceUpload` | A tenant-uploaded past-invoice file (PDF / XML / e-invoice) with parse status | Same as retention of `InvoiceEvidence` derived from it |
| `InvoiceEvidence` | Structured data extracted from an `InvoiceUpload` header: carrier name, VAT ID, address, invoice date | Longest applicable tax retention; GDPR erasure respects legitimate-interest carve-out for tax evidence |
| `ValidationRun` | One execution of the pipeline against one carrier | Longest applicable tax retention (10 yr DE, 8 yr NL, 7 yr UK/IE/SOX, 5 yr others — **longest wins**) |
| `StageResult` | Per-stage output (API response, verdict, reasoning, source rank used) | Same as parent `ValidationRun` |
| `Verdict` | The final confidence bucket + its justification + source-attribution map | Same as parent `ValidationRun` |
| `Proposal` | A change the system wants to make to the `Carrier` (e.g., corrected VAT) | Until accepted, rejected, or expired |
| `BatchApproval` | A single approval action that ratifies many `Proposal`s from the Suggested bucket at once, with sample-validation record attached (§6.10) | Same as the `Proposal`s it ratifies |
| `Approval` | Two-signature record (proposer + approver) binding a `Proposal` to a `Carrier` change | Same as the change it ratifies |
| `Attestation` | A signed, immutable audit report bundling a set of `ValidationRun`s, `Approval`s, and `BatchApproval`s | Same as the longest `ValidationRun` it covers |

Every one of these is viewable inside the application. **None is delivered as a file** (archival-PDF export of `Attestation` is the only exception — §5.5).

---

## 5. Surfaces inside the application

The capability is realised through five surfaces. Each maps to an explicit information-architecture decision resolved from the prior review round.

### 5.1 Onboarding validation panel *(primary surface)*

**Where:** the carrier create/edit form itself.
**Mental model:** form field → live validation, the same way Stripe validates an address in checkout or GitHub validates a repository name inline.

Behaviour:

- The user enters `country`, `vat`, `name`, `address`. As soon as `country + vat` is complete, Stages 1–2 fire in the background.
- **Within 3 seconds** the panel shows one of the four verdict buckets (Confirmed / Suggested / Needs judgment / Unresolved), with the non-EU sub-type if applicable.
- The panel shows the authoritative name/address returned by the registry next to what the user typed, with mismatches highlighted (Nielsen H1).
- **Stage 3–5 (web discovery, reasoning) run asynchronously**. The form can be saved as soon as the fast path resolves. The slow path completes in the background and updates the record; if a significant mismatch emerges, the record goes into the inbox.
- For fields where the authoritative registry returned values (VIES name, HMRC address), the form offers a one-click "adopt registry value" affordance.

This is an **embedded-feature pattern**, not a standalone screen. It sits on top of the record the user was already editing.

### 5.2 Review queues *(secondary surface — two distinct queues, one page)*

**Where:** a dedicated page in the application, linked from the main navigation. The page hosts **two queues** as primary tabs, plus dashboard-level summaries. The queues are *kind-of-work-distinct*: don't mix them.

**Mental model:** a worklist with two kinds of work — "supervise a batch" and "judge a case." This mirrors SAP Fiori's convention of splitting mass-approval worklists from case-review worklists.

#### 5.2.1 Batch approval queue *(bucket: Suggested)*

For records the system confidently proposes and the user supervises.

- Records are grouped into **review batches** (typically 10–50 records sharing a verdict type and source pattern — e.g., "all carriers whose VAT was discovered via societe.com and re-verified via VIES").
- The user is presented with a **sampling-gated flow** (§6.10): inspect N randomly drawn records with full evidence, then decide:
  - **Approve remainder** — the `BatchApproval` ratifies the whole batch in one signed action (with sample decisions recorded as a trust artefact).
  - **Go in depth** — fall back to one-by-one review for the batch.
  - **Mix** — approve a subset, defer or escalate the rest.
- As the user's override rate on this bucket stays low over time, the required sample size shrinks. This is the trust-calibration loop made visible.

#### 5.2.2 Case-by-case inbox *(buckets: Needs judgment + Unresolved)*

For records that require real judgment; bulk actions intentionally absent.

- Default sort: **spend at risk** (€ exposure if the carrier is wrong × probability × recency), not record count. (Endsley SA: priority follows consequence magnitude.)
- Secondary sort: oldest-pending first.
- Each row shows: carrier name, confidence badge, one-line reasoning summary, spend-at-risk, age, source-attribution chip (S1/S2/S3 disagreement pattern).
- Keyboard-first: `j/k` to move, `a` to accept, `o` to open detail, `d` to defer, `e` to escalate to second reviewer, `r` to request re-run with more context.
- No bulk "accept all" affordance. Bulk *defer* exists but requires a reason. This preserves the supervision vs. collaboration distinction the PRD commits to in §4.4.

### 5.3 Carrier record detail + Validation History Timeline

**Where:** the carrier's own detail page.
**Mental model:** an activity/audit timeline (SAP Fiori Object Page, Atlassian activity stream).

Every `ValidationRun` the carrier has ever undergone is visible as a chronological timeline on the record page. Each entry shows the verdict, the evidence, who approved any resulting change, and the date.

This is what a tax inspector sees when they ask *"When did you last confirm this VAT, and what evidence did you have?"* — they get the answer without the steward re-running anything.

### 5.4 Carrier-master health dashboard

**Where:** a dashboard view for the MDSTC and their manager.
**Mental model:** portfolio KPI dashboard.

KPIs:

- `% of active carriers with Confirmed status` (target ≥ 95%)
- `% of freight spend (€) covered by Confirmed + Suggested` (spend-weighted — the metric that actually matters)
- `# of Needs-judgment verdicts outstanding` (exposure)
- `# of invoice-backed validations` — how much of the master is corroborated by S2 evidence
- `Median age of last successful validation` (freshness)
- `Mismatch verdicts resolved before invoice payment` — the money metric
- `Estimated P&L exposure prevented this quarter` — Mismatch count × average invoice value

### 5.5 Audit attestation view

**Where:** the carrier detail page and a dedicated attestations index.
**Mental model:** read-only attestation document (SAP compliance report, Workday audit pack).

For any carrier, time window, or sweep run, the application produces a **signed, immutable attestation**: pipeline inputs, API responses, reasoning, verdicts, approver signatures. Viewable inside the app by auditors (with appropriate role). Downloadable as PDF *only for archival* — not as the primary delivery path.

### 5.6 Invoice evidence intake

**Where:** a dedicated "Evidence library" area in the application, plus an affordance on the onboarding panel and the bootstrap wizard (§5.7) that says *"Have past invoices for this carrier? Drop them here to improve the match."*
**Mental model:** a document library that *feeds* the validation pipeline, not a standalone file store. Users recognise this pattern from expense-management tools (Concur / Expensify receipt upload) and e-invoicing inboxes (SAP Concur, Basware).

**Behaviour:**

- The tenant uploads past-invoice files in bulk (PDF, scanned PDF, or structured e-invoice formats — PEPPOL UBL, Factur-X, XRechnung, FatturaPA, KSeF XML).
- The system parses the **invoice header only**: issuer legal name, issuer VAT ID, issuer address, invoice date. **Line-item data is ignored** — this feature is vendor-identity evidence, not invoice audit.
- Each parsed invoice becomes an `InvoiceEvidence` object (§4.5) linked to the `Carrier` whose identity it attests to. Matching is by VAT ID first, then by fuzzy name + address for invoices where the VAT ID failed to extract.
- `InvoiceEvidence` immediately becomes a usable S2 source for any current or future `ValidationRun` on that carrier. A carrier with strong invoice evidence reaches `Confirmed` faster and with less reliance on S3/S4.
- A **parse-review inbox** exists for invoices where header extraction failed or ambiguous — the user assigns them to the right carrier manually; the system learns from those decisions.

**Why this lives here, not in freight-audit:**

The invoice's *line-level* data (rates, accessorials, fuel surcharges) is what a freight-audit system processes. The invoice's *header* data (who is this carrier legally) is what a master-data-validation system processes. They are distinct uses of the same document. This PRD is scoped to the header use; the line-level use is a separate product concern.

**GDPR and retention:**

- Retention matches `InvoiceEvidence`'s tax-retention window (§4.5).
- GDPR erasure: for invoices containing personal data (sole proprietors common in DE, PL, IT), the legitimate-interest carve-out for tax evidence applies. Any erasure request goes through the tenant's DPO flow, which can redact personal fields while preserving the VAT attestation.

### 5.7 Bootstrap setup wizard *(one-time, admin-led)*

**Where:** a setup path in the tenant admin console, surfaced as "Import your carrier master" on first launch. After the bootstrap completes, the entry point collapses into an "Import more carriers" utility inside the Evidence library (§5.6).
**Mental model:** an import / migration wizard, of the kind professionals recognise from Salesforce Data Loader, HubSpot CSV import, Jira Cloud Migration, and SAP Migration Cockpit. A multi-step, admin-only workflow that turns a raw legacy dump into attested master data — **before normal operations begin**.

**Why this lives as its own surface, not a variant of §5.1:**

§5.1 handles *one* carrier at a time; §5.7 handles *hundreds to thousands* at once. The interaction model is different: column mapping, cost budgeting, pre-run estimation, and resumable batch execution are concerns that only apply at bootstrap scale. Forcing these through §5.1 would overload that surface with use cases 99% of steward sessions will never encounter.

**Behaviour (summary — see F0 in §11 for the full task flow):**

- Admin selects the source system (Transporeon, CargoWise, MercuryGate, Oracle TMS, SAP MDG, or generic CSV/TSV/Excel). Pre-configured profiles exist for the known systems; generic falls back to AI-assisted mapping.
- Admin uploads the carrier dump. Optionally uploads a historical invoice corpus in parallel (triggers §5.6 inline, seeding S2 evidence **before** the pipeline runs — this is what makes bootstrap results so much better than later periodic sweeps).
- The wizard shows a pre-run estimate: record count × estimated duration × AI cost budget (R23). Admin approves; budget is pre-authorised.
- The full pipeline fans out as a single large-scale `ValidationRun` per record. Progress visible live on §5.4 with buckets filling up in real time.
- On completion (or pause/resume), the wizard hands off to the MDSTC with a "ready for review" notification — F3 and F4 queues are now populated, the dashboard has meaningful numbers, and the tenant is operational.

**What the admin does not see:**

- The wizard never presents results as a downloadable file. Everything lands in the application (§6.9 No-Export Principle).
- The wizard never asks the admin to make record-by-record judgments — that's the MDSTC's job, through F3/F4, *after* the bootstrap completes.

---

## 6. Design primitives

The following primitives are named patterns; they will each be documented separately in the Modus pattern library with a Problem / Context / Forces / Solution / Rationale / Modus implementation notes structure (Alexander-Tidwell template).

### 6.1 Evidence-Attached Verdict
Every verdict renders with a 1–3 line inline summary + expandable full chain + authoritative source citations. No modal dive for a first judgment. (Shneiderman's *Visual Information Seeking Mantra*: overview first, zoom and filter, details on demand.)

**Information-density targets:** summary ≤ 140 characters. Full chain ≤ 800 characters with progressive-disclosure accordion for longer. Reading level Flesch-Kincaid ≤ 10.

### 6.2 Pipeline Transparency
Each record shows a horizontal stage-meter of the seven stages with per-stage status glyph (pass / fail / skipped / pending) and a per-stage source badge (S1 / S2 / S3 / S4 per §4.3). Click to reveal stage details. (Salesforce Path component, Cloudscape Progress Tracker.)

### 6.3 Compound Confidence Encoding
Confidence is never rendered as colour alone. Every confidence indicator is **icon + colour + textual label**, and every one is paired (on demand) with the evidentiary layer underneath it. (IBM Carbon AI guidance; WCAG 1.4.11, 1.4.1.)

### 6.4 Correction Feedback Loop
Every override the steward makes is captured and used:

- **Per-tenant pattern store** — "GEFCO → CEVA is known here, stop flagging it."
- Never written as a model weight update. Always as an auditable rule that can be inspected and revoked.
- **Scoped to the tenant by default.** Global learning is opt-in per tenant.

### 6.5 Differentiated Failure Affordance
Three failure classes, three affordances:
- **Transient** (rate limit, API timeout) → **Retry** (the user does not need to diagnose)
- **Dead end** (no public record exists) → **Edit manually** (with a note that the system looked)
- **Ambiguous** (multiple candidates) → **Choose** (side-by-side comparison)

### 6.6 Async Operation Status
Slow-path pipeline runs (web discovery, reasoning) show their status **on the record itself** — a compact "validating…" chip with estimated completion. The user is not blocked; they are informed. On completion, the chip collapses into a Verdict, and if escalation is needed, a notification appears in the inbox. (Cloudscape progressive operation, Fiori background process.)

### 6.7 Four-Eyes Approval on Write-Back
No proposal becomes a `Carrier` mutation without two distinct user signatures. The proposer and the approver cannot be the same user. Both signatures are recorded in the `Approval` object and visible in the attestation. (SAP Fiori approval flow; SOX §404 segregation of duties.)

### 6.8 Spend-Weighted Triage
The escalation inbox sorts by `spend at risk`, not record count. The steward's attention is directed to the records whose failure would cost the most, first. (Endsley SA: *priority is set by consequence magnitude, not by alphabetical order.*)

### 6.9 No-Export Principle
All outputs are first-class objects inside the application. The archival PDF export of the Attestation is the **only** sanctioned file-based output, and it is derivative, not primary. Any feature request that asks the steward to "download a CSV and upload it later" is automatically a design regression.

### 6.10 Sampling-Gated Batch Approval *(new — resolves the "Suggested bucket" ambiguity)*

**Problem:** When the system proposes corrections for many records it is confident about (*Suggested* bucket), asking the user to approve each one individually wastes their time; auto-applying without supervision breaks the four-eyes control and erodes trust.

**Forces:**
- Throughput (Shneiderman golden rule #6: *permit easy reversal*) vs. supervision (SOX four-eyes)
- Trust calibration (Lee & See, 2004) — trust is built by witnessing accuracy, not by bypassing review
- Cognitive load (Wickens) — batch approvals must not become rubber-stamping

**Solution:** *Sampling-gated flow*, modelled on data-labelling QA practice (Labelbox audit-sampling, Snorkel-style weak-supervision validation). For every `BatchApproval`:

1. **System draws a random sample** of `√n` records from the batch (n = 20 → sample 5; n = 200 → sample 14). The sample size is bounded to `[3, 25]`.
2. **User inspects each sample with full evidence.** Per sample, they accept or override.
3. **Decision tree on sample outcomes:**
   - All accepted → user may **Approve remainder** in one signed action. The `BatchApproval` records the sample outcomes as a trust artefact.
   - 1–2 overrides → user is offered **Resample** (larger sample, same batch) or **Go in depth** (one-by-one for the remainder).
   - ≥ 3 overrides or > 20% override rate → system refuses bulk approval for this batch; everything falls back to one-by-one in the Case-by-case inbox. This is the *trust-breach* event (§8.3) applied at batch scope.
4. **Adaptive sampling over time.** If the user's historical override rate on Suggested records of this source-pattern stays below (say) 2% for 90 days, the sample size shrinks to its floor. If it rises, the sample size grows. This is the calibration loop made visible to the user.

**Rationale:**
- Mirrors ISO 2859 / AQL sampling conventions familiar to quality professionals.
- The user sees the system *earning* their trust over time, not claiming it.
- Audit defensibility is preserved: `BatchApproval.sampleDecisions[]` captures what was inspected and approved.

**Related:** Salesforce mass-action patterns; Fiori mass-approval; Labelbox review-sampling.

---

## 7. Functional requirements

### Embedded triggers

- **R1** — The pipeline must be invocable from three distinct trigger moments (onboarding, edit event, periodic sweep) using the same underlying mechanism and producing the same artifact schema.
- **R2** — Onboarding path must return a Stage 1–2 verdict within 3 seconds under normal conditions; longer stages must defer to async without blocking Save, unless the verdict is `Unresolved` at Stage 2 (the steward then decides whether to Save with an Unresolved status or wait).
- **R3** — Edit-event path must fire automatically on change to `vat`, `country`, `name`, or address fields. It must never block the edit itself.
- **R4** — Periodic sweep must be schedulable per tenant; must be pauseable and resumable; must never be required on a fixed cadence imposed by the product.

### Pipeline mechanics

- **R5** — Stages must be ordered by decreasing confidence: deterministic → authoritative → probabilistic.
- **R6** — Every stage produces a `StageResult` with source (S1/S2/S3/S4 per §4.3), timestamp, inputs, outputs, and (for AI stages) reasoning.
- **R7** — No stage may silently overwrite prior `StageResult` data. Subsequent runs produce new `ValidationRun` records; history is append-only.
- **R8** — Every AI-driven verdict must carry a human-readable justification on the `StageResult`.
- **R8.1** — **Source-conflict resolution:** when two sources disagree on a data value, the higher-ranked source wins on the value itself; both values are preserved in the evidence record; the `Verdict` reflects the disagreement (typically routing the record to *Needs judgment*). S4 (LLM reasoning) never overrides S1–S3 on a data value.

### Confidence & triage

- **R9** — Every `Verdict` carries exactly one categorical confidence bucket (*Confirmed* / *Suggested* / *Needs judgment* / *Unresolved*) *and* its evidentiary layer.
- **R10** — Confidence thresholds must be configurable per tenant; a conservative tenant can route *Suggested* into *Needs judgment*.
- **R11** — The non-EU sub-type (GB / CH / sanctions-screened / other) is orthogonal to the confidence bucket and rendered as a separate badge.

### Reviewer experience

- **R12** — The review surface exposes **two distinct queues** (§5.2): the *Batch approval queue* (bucket: *Suggested*, workflow: sampling-gated §6.10) and the *Case-by-case inbox* (buckets: *Needs judgment* + *Unresolved*, workflow: one-by-one). Both sort by spend at risk.
- **R13** — The Case-by-case inbox must support Accept / Override / Defer / Escalate / Annotate / Request re-run on every row. No bulk "accept all" affordance exists on this queue.
- **R13.1** — The Batch approval queue must implement the §6.10 sampling flow: random-sample inspection, adaptive sample size, refusal of bulk approval above the override threshold.
- **R14** — Every record carries a `Validation History Timeline` viewable on its detail page, with per-entry source attribution (S1/S2/S3/S4).
- **R15** — All textual evidence renders at Flesch-Kincaid ≤ 10 and is available to screen-readers with semantically structured ARIA attributes (WCAG 1.3.1).

### Invoice-derived evidence

- **R15.1** — The application must accept bulk uploads of past-invoice files in at least: PDF (native and scanned), PEPPOL UBL, Factur-X, XRechnung, FatturaPA, KSeF XML. File size and per-tenant batch-size caps apply (configurable).
- **R15.2** — Invoice-header parsing must extract: issuer legal name, issuer VAT ID, issuer address, invoice date. Line-item data is explicitly out of scope for this feature.
- **R15.3** — `InvoiceEvidence` is linked to `Carrier` by VAT ID first, then by fuzzy name + address for headers where VAT ID extraction failed. Ambiguous matches go to the parse-review inbox (§5.6).
- **R15.4** — `InvoiceEvidence` becomes available as S2 source to any current or future `ValidationRun` for the matched carrier, without re-running the pipeline.
- **R15.5** — Invoice files and derived `InvoiceEvidence` follow the longest applicable tax-retention period (§4.5); GDPR erasure respects the tax-evidence legitimate-interest carve-out and routes via the tenant DPO flow.

### Governance (four-eyes, retention, audit)

- **R16** — Any `Proposal` that would mutate a `Carrier` must pass through a two-signature approval flow. Proposer ≠ approver.
- **R17** — `ValidationRun`, `StageResult`, `Verdict`, `Proposal`, `Approval`, `Attestation` objects must be retained for the longest tax-retention period applicable to the tenant's footprint (default 10 years for any EU + UK multinational).
- **R18** — The application must produce a **signed, immutable `Attestation`** for any carrier, time window, or sweep run. Viewable in-app; downloadable as PDF for archival.
- **R19** — An external auditor role must exist with read-only access to `Attestation`s and the `Validation History Timeline` of any carrier, without access to other parts of the application.

### Integration

- **R20** — Write-backs (Approved `Proposal` → `Carrier`) flow through the application's existing master-data-governance interface. No bypass.
- **R21** — Sanctions screening (EU consolidated list / OFAC SDN / UK OFSI) fires as a parallel stage for non-EU carriers from sanctions-relevant jurisdictions. Any hit suspends write-back and surfaces the record as a dedicated escalation type.
- **R22** — Source-of-truth upstream (TMS carrier profile, ERP vendor master) may sync into the application; corrections approved in the application propagate back via the same interface.

### Governance of the AI itself

- **R23** — Per-tenant AI cost budget with a visible kill switch (admin role).
- **R24** — Observability: every `StageResult` from an AI stage includes tool calls, prompt template version, model version, and cached response key if replayed.
- **R25** — Any `Attestation` is **replayable** against cached responses without incurring new AI cost.

---

## 8. Trade-offs — decisions resolved and still-open

### 8.1 Sync vs. async: **resolved**
Fast path (Stages 1, 2, 3, 7) is synchronous and gates onboarding save. Slow path (Stages 4, 5, 6) is always asynchronous and never blocks a user action. Users never wait for an AI agent during a form submit.

### 8.2 Auto-apply vs. propose-only: **resolved as per-field policy with bucket-aware workflow**
- **Structural corrections** (format normalisation, leading-zero fix on `IT122680226`, prefix casing) auto-apply — *Confirmed* bucket, Autonomy position.
- **Semantic corrections** (VAT ID change, address change, legal name change) are **always `Proposal`s** requiring approval. Two workflows exist:
  - *Suggested* bucket → sampling-gated **batch approval** (§6.10). One signed `BatchApproval` ratifies many `Proposal`s.
  - *Needs judgment* + *Unresolved* → case-by-case **four-eyes approval**. Proposer + approver signatures per `Proposal`.
- This is consistent with SAP Fiori's distinction between automatic data-cleansing, mass-approval workflows, and individual master-data-change workflows.

### 8.3 Trust calibration — operationalised
Three mechanisms:

- **Per-tenant accuracy dashboard** surfaces override rate per confidence bucket, published quarterly to tenant admins.
- **Trust-breach event** — when a previously `Confirmed` carrier is later found wrong, the application marks it as a *breach*, automatically widens the confidence threshold for that tenant for 30 days, and flags similar records for re-verification.
- **Power users can recalibrate thresholds** per their own workflow, within tenant-admin bounds.

(Informed by Lee & See, *Trust in Automation*, 2004.)

### 8.4 Correction-loop scope: **per-tenant learning, not global, not model weights**
A per-tenant **rule store** captures overrides as inspectable rules. Global learning is opt-in at tenant level (typically declined by regulated customers). No model weights are fine-tuned by operational overrides.

### 8.5 Cost exposure: **hard caps**
Per-tenant daily and per-run AI cost caps, with an admin-visible kill switch. Caching of stable registry responses (VIES, HMRC) drives the marginal cost of a periodic sweep toward zero.

### 8.6 Observability & reproducibility: **replayable attestations**
An `Attestation` is replayable against cached responses for at least as long as its retention period. An auditor can reconstruct a historical decision without incurring new cost and without risk of different AI output on re-run.

### 8.7 Invoice evidence — upload burden vs. match quality
Invoice uploads are powerful (S2 source, legally binding) but costly to collect. Trade-offs:

- **Bulk historical upload** (one-time, at onboarding) — maximum match quality on day one; real work for the tenant to assemble and transfer.
- **Continuous capture** (hook into the AP inbox / e-invoicing channel) — lower burden, slower ramp, needs integration.
- **Opportunistic only** (user uploads when they hit a hard case) — minimal burden, marginal benefit.

Recommendation: **offer all three.** Default to opportunistic; surface continuous-capture as an integration when available; offer bulk upload as a setup step on the onboarding wizard. GDPR posture is the same across all three — tax-evidence legitimate interest, DPO-routed erasure.

### 8.8 Bucket naming — resolved in v2 but keep telemetry for refinement
"Likely correct" and "To be verified" were renamed to *Suggested* and *Needs judgment* to make the **dominant action** per bucket unambiguous (batch-approve-with-sampling vs. case-by-case). If tenant telemetry in Phase 2 shows sustained user confusion, escalate to an A/B test on alternative labels (*Proposed* / *Disputed* are the strongest alternatives identified).

### 8.9 Still open — Shneiderman-axis positioning per bucket

We currently treat:
- **Confirmed** as *Autonomy* (auto-apply structural corrections only; semantic changes still pass through approval)
- **Suggested** as *Supervision* (sampling-gated batch approval)
- **Needs judgment** + **Unresolved** as *Collaboration* / user-led (the steward leads, the system assists)

Tenant customisation could allow a conservative tenant to demote *Confirmed* to *Supervision* or *Suggested* to *Needs judgment*. Decision deferred to Phase-2 telemetry.

---

## 9. Success metrics

### Leading (are we building the right thing?)

- **Case-by-case rate**: % of records routed to *Needs judgment* or *Unresolved*. Target ≤ 25%.
- **Automation coverage**: % resolved without human touch (*Confirmed*) or with supervision only (*Suggested*). Target ≥ 70%.
- **Evidence completeness**: 100% of escalations have inline reasoning ≥ 1 sentence.
- **Onboarding gate latency (p95)**: ≤ 3 s for the synchronous verdict.
- **Invoice-evidence coverage**: % of active carriers with at least one `InvoiceEvidence` record. Tracks how well S2 has been seeded.

### Lagging (is it working?) — operational

- **Review throughput**: records reviewed per hour, before and after. Target ≥ 4× pre-deployment manual baseline.
- **Override-to-accept ratio on *Suggested***: ≤ 2% steady-state. Higher triggers sample-size growth (§6.10). Above 20% refuses bulk approval for the batch.
- **Sample-size trend on *Suggested***: a falling sample size over time is the positive trust-calibration signal.
- **Median age of last successful validation**, per tenant. Target ≤ 90 days.

### Lagging — money & compliance *(from finance review)*

- **`% of freight spend (€) covered by *Confirmed* + *Suggested* (approved)`** — the metric a CFO reads. Target ≥ 95%.
- **Mismatch verdicts resolved before invoice payment** per quarter. Target: capture ≥ 90% of Mismatch-eligible invoices pre-payment.
- **Estimated P&L exposure prevented per quarter** (Mismatch count × average invoice value × historical recovery rate). This is the number that justifies the feature to the CFO.
- **Trust-breach rate on *Confirmed***: target ≤ 0.5% per quarter. Above that threshold, the bucketing is too loose.
- **S2 contribution rate**: % of `Confirmed` or `Suggested` verdicts that drew on `InvoiceEvidence`. Measures real value of the invoice-intake feature.

### Qualitative

- **Reviewer NPS on the escalation inbox** — if reviewers feel the system hands them the *right* problems first, trust compounds.
- **External-auditor acceptance of `Attestation`** — qualitative but critical. A Big-Four auditor accepting an attestation at face value is the strongest signal this feature has achieved its compliance positioning.

---

## 10. Accessibility

The feature is embedded in a dense, information-rich application used for 4–8 hours per day by professional operators. Accessibility is a first-class functional requirement, not a later polish.

| WCAG 2.2 criterion | Design response |
|---|---|
| 1.3.1 *Info and Relationships* | Evidence is semantically structured; ARIA labels bind verdict to record |
| 1.4.1 / 1.4.11 *Use of Color / Non-text Contrast* | Compound confidence encoding (§6.3) — never colour alone. ≥3:1 contrast on all badges |
| 2.1.1 *Keyboard* | Full keyboard model in the inbox: `j/k` nav, `a` accept, `o` open, `d` defer, `e` escalate. Onboarding panel traversable with Tab/Shift-Tab only |
| 2.4.11 *Focus Not Obscured* (WCAG 2.2 new) | Inline evidence-expand respects scroll-into-view; focus never hidden behind fixed headers |
| 2.5.7/8 *Dragging / Target Size* (WCAG 2.2 new) | All bulk-action controls ≥ 24×24 px; no action is drag-only |
| 3.3.1 *Error Identification* | The Evidence-Attached Verdict pattern is the literal realisation of this criterion |
| AAA — cognitive | Evidence prose capped at Flesch-Kincaid ≤ 10. Verdict labels localised per tenant |
| Screen-reader narrative | Each confidence bucket has an aria-label template: *"Verdict: {Confirmed \| Suggested \| Needs judgment \| Unresolved}. {one-line reason}. Dominant action: {none \| sample & bulk-approve \| evaluate one by one \| research manually}."* |

Localisation of verdict labels is required for tenant languages beyond English. The application's general i18n framework applies.

---

## 11. User flows

This section walks the ten primary user flows through the surfaces defined in §5, mapping each step to the canonical B2B patterns documented in `app-pattern/patterns/b2b-pattern-skeleton.md` (cited as `APP-###`, `HUM-###`, `HAI-###`, `AI-###`) and, where relevant, to this PRD's own primitives (cited as `§6.n`). The goal is to make the feature buildable by a product-engineering team without re-inventing interaction semantics. Each flow follows Constantine & Lockwood's *essential use case* structure: actor → trigger → intent → steps → branches → post-condition → failure modes.

**Flows are numbered F0–F9 by *chronological phase*, not importance.** F0 runs once at tenant setup; F1–F6 are steady-state operations; F7–F9 are periodic or read-only. By ROI, F0 typically delivers the largest single time saving of the entire feature (see §11.1 rationale).

### 11.0 Legend

- **Actor** — who performs the step. All flows assume the MDSTC persona (§3) unless noted.
- **Trigger** — the event that initiates the flow.
- **Pattern(s)** — canonical pattern(s) composed at that step.
- **Branch** — where the flow forks based on system or user input.
- **Post** — persistent state after the flow completes.
- **Failure modes** — the primary error paths and the patterns that handle them.

Pattern citations use the form `HAI-011 Confidence / Certainty Indicators`; repeated references may abbreviate to the ID alone.

---

### 11.1 F0 — Bootstrap: migrate an existing carrier master *(one-time, the highest-ROI flow)*

**Actors:** Tenant admin (owns the bootstrap) · MDSTC (consumes the output, starts F3/F4 after completion) · External implementation partner (optional, configures integrations).
**Trigger:** First-time tenant setup, or a catch-up migration when a shipper switches TMS systems (Transporeon → alternative, CargoWise → alternative, etc.).
**Intent:** Convert a raw legacy TMS / ERP carrier dump into an **attested, production-ready carrier master** in hours instead of the weeks or months the manual path would take.
**Preconditions:** Tenant created. At least one source system (TMS or CSV) identified. Admin has bootstrap permission (`APP-019 Permission-Gated UI`). S1 integrations configured (VIES, HMRC, Zefix, national registries as applicable).
**Landing surfaces:** §5.7 Bootstrap setup wizard (primary) · §5.4 Carrier-master health dashboard (live progress) · §5.2 Review queues (results) · §5.6 Evidence library (parallel invoice seeding) · §5.5 Attestation (bootstrap-level attestation produced on completion).

#### Why this flow matters

Before this feature, the typical path to a clean carrier master at tenant setup is: **export from legacy TMS → manual verification in spreadsheets and registry tabs → back-and-forth with the ERP team → weeks of work → partial coverage at day 1**. The feature replaces that with a **single admin-led ritual** that runs the full progressive-resolution pipeline over the entire legacy dump overnight, yielding a master in which ~70% of records are in `Confirmed` or `Suggested (batch-approved)` state before the MDSTC opens the application on day 1. The remaining ~30% are pre-sorted by §6.8 spend-weighted triage, so the steward works the highest-value records first.

This is the **single moment** in the feature's lifecycle where the ROI case (finance review §7: €100k–500k P&L exposure × 0.5–1.0 FTE operator year) is delivered in one event. Every other flow (F1–F9) is *sustaining* that value; F0 is what *creates* it.

#### Primary path

| # | Step | Pattern(s) |
|---|---|---|
| 1 | Admin launches the Bootstrap setup wizard from the tenant admin console | `APP-019 Permission-Gated UI`; `HUM-030 Global Actions`; `HUM-045 Empty States` (pre-bootstrap dashboard shows the guided entry) |
| 2 | **Step 1 of wizard — Source selection.** Admin picks source system (Transporeon / CargoWise / MercuryGate / Oracle TMS / SAP MDG / generic CSV/TSV/Excel) | `HUM-002 Multi-Page Create (Wizard)`; `HUM-043 Multi-Step Form (Wizard)`; `HUM-037 Selection in Forms` |
| 3 | **Step 2 — File upload.** Admin drops the export file(s) | `HUM-034 Batch / Bulk Operations`; `HUM-046 Loading & Refreshing States` |
| 4 | **Step 3 — Column mapping.** For known TMS profiles, mapping is pre-filled; for generic CSV, the system proposes mappings with per-field rationale; admin accepts / overrides each | `HAI-015 AI-Driven Recommendations`; `HAI-014 AI-Assisted Form Filling`; `HAI-012 AI Explanation / Rationale Display` (why "CARRIER_NAME" → `carrier`); `HAI-010 Human-in-the-Loop Correction` (override any mapping) |
| 5 | **Step 4 — Optional parallel invoice-corpus upload.** Admin is invited to upload a historical invoice archive for the carrier set; triggers F6 in parallel *before* the pipeline runs, so S2 evidence is available from the first record onward | `HUM-003 Sub-Resource Create`; cross-reference F6 (§11.7) |
| 6 | **Step 5 — Pre-run estimate.** Wizard shows row count, estimated duration (based on rate-limit headroom), and AI cost estimate | `AI-012 AI Rate Limiting & Quota Display`; `HUM-047 Progressive Steps / Progress Indicators` |
| 7 | **Step 6 — Budget approval.** Admin authorises the cost envelope (R23); optionally runs a **dry-run** first (full pipeline, no writes to master) for a representative sample | `HUM-050 Modal / Prompt Notification` (cost confirmation); `HUM-013 Defaults & Presets` (a conservative budget default proposed) |
| 8 | **Wizard hands off — async bulk execution begins.** A single `ValidationRun` per `Carrier` row; fan-out respects rate limits per authoritative source | `AI-002 Autonomous Background Processing`; `AI-014 Scheduled AI Jobs & Reports` (bootstrap runs as a privileged, long-lived job) |
| 9 | **Live progress on §5.4 dashboard.** Buckets fill in real time: `Confirmed`, `Suggested`, `Needs judgment`, `Unresolved` counts animate as stages complete | `HUM-046`; `HUM-026 Data Visualization (Charts & Graphs)`; `APP-007 Static Dashboard` with a bootstrap-specific "run in progress" state |
| 10 | **Admin can pause / extend budget / kill-switch at any time** | `HUM-030`; `HUM-049 Banner / Alert Notifications`; honours R23 |
| 11 | **Completion.** Wizard emits a "ready for review" banner; MDSTC receives a notification; a bootstrap-level `Attestation` is produced | `HUM-048 Notification Center (Bell & Tray)`; `HUM-049 Banner`; `HUM-064 Audit Trail / Activity Log` |
| 12 | **MDSTC takes over.** F3 (Batch approval) and F4 (Case-by-case) queues are now populated; the steward begins normal operations | — (hands off to F3, F4) |

#### Composed pattern — "Bulk Data Migration Wizard"

The skeleton has no single pattern for bulk data migration; this flow is a **composition** of `HUM-002` + `HUM-034` + `HAI-014/15/12` + `AI-002` + `AI-012` + `HUM-050` + `HUM-064`, realising what professional software calls a *Data Loader* or *Migration Cockpit*. Reference implementations in the wild: Salesforce Data Loader, HubSpot CSV import, Jira Cloud Migration Assistant, SAP Migration Cockpit, Workday EIB. The Modus pattern library should register this composition as a named pattern (`MIGRATION-001 Bulk Data Migration Wizard`) rather than leaving it implicit.

#### Branches

- **Known TMS profile (Transporeon, CargoWise, etc.)** → column-mapping step is pre-filled; admin confirms and proceeds. The AI-assisted mapping step becomes a confirmation, not a decision.
- **Generic CSV / unknown schema** → full `HAI-015` + `HAI-010` mapping loop. Admin may save the mapping as a reusable profile (`HUM-022 Saved Filter Sets` analogue for mappings).
- **Dry-run mode** → full pipeline runs, attestation is produced, **no writes** to master. Admin reviews bucket counts and escalation samples before committing. On commit, a second run is unnecessary if cached responses are still valid (R25 replayability).
- **Budget exceeded mid-run** → `AI-012` shows the overrun; `HUM-049` banner invites the admin to extend budget, pause, or accept partial completion. Already-processed records are persisted (never discarded).
- **Invoice corpus not provided at step 4** → bootstrap proceeds with S1+S3+S4 only. S2 coverage can be backfilled later via F6 — but the day-1 match quality will be lower.
- **Partial completion (admin pauses)** → wizard is resumable; remaining records pick up from where they were left. `HUM-066 State Persistence` applies to the wizard itself.
- **Sanctions-screening hits during bootstrap** → affected records are parked in a dedicated sub-queue and do not auto-apply to master; admin reviews them in a specialised view before proceeding (R21).

#### Post

- Tenant's carrier master is populated with attested `Carrier` records. Buckets roughly: Confirmed ≥ 40–60%, Suggested ≥ 20–30%, Needs judgment ≤ 15%, Unresolved ≤ 5% (targets — see §9 metrics).
- A bootstrap-level `Attestation` is persisted (`HUM-064`, `AI-010`). This document is the artefact that year-1 external audits will ask for.
- F3 and F4 queues are populated with the records needing human work; §6.8 spend-weighted triage applies immediately.
- §5.4 dashboard now shows meaningful KPIs (S2 coverage %, Confirmed %, spend-weighted coverage, median validation age).
- The tenant is **operational** — the application can start accepting freight bookings against this carrier master on day 1.

#### Failure modes

- **File format unrecognised / malformed** → `HUM-044 Error Messages` at upload with column-level diagnostics (`§6.5` — "dead end" class if file is fundamentally broken; "transient" if retryable).
- **Column mapping ambiguous on 10%+ of columns** → the wizard refuses to proceed without admin confirmation on each uncertain field (over-escalation rather than silent misassignment).
- **AI cost cap reached** → auto-pause (R23); admin extends budget or accepts partial completion. Already-processed records are committed.
- **Authoritative registry rate-limits** (VIES and HMRC both throttle) → automatic back-off with exponential scheduling; total duration extends gracefully; progress indicator shows the delay explicitly rather than appearing stalled (Nielsen H1).
- **Some source-system fields are not mappable at all** (legacy TMS has fields the application does not model) → wizard ignores them but preserves them as `Carrier.legacyFields` for auditability. Admin is warned via `HUM-049` banner.

#### F0-specific success metrics

These sit alongside §9 but are only meaningful for F0:

- **Time-to-first-clean-record** — wall-clock hours from wizard start to the first `Carrier` record in `Confirmed` status. Traditional manual path: days to weeks. Target: **< 1 hour**.
- **Day-1 coverage** — % of carrier master in `Confirmed` + `Suggested-approved` within 72 hours of bootstrap start. Target: **≥ 60%**.
- **Bootstrap automation ratio** — ratio of records auto-resolved (Confirmed + batch-approved Suggested) to records requiring human judgment. Target: **≥ 3:1**.
- **S2 seed effectiveness** — if the admin provided an invoice corpus, the delta in Confirmed-bucket size vs. a no-S2 dry-run. Measures invoice-corpus ROI.

---

### 11.2 F1 — Onboard a new carrier *(primary flow, synchronous, single-record)*

**Actor:** MDSTC
**Trigger:** "New carrier" action from the carrier list page (`HUM-030 Global Actions`)
**Intent:** Create a valid, identity-verified carrier record without leaving the application.
**Preconditions:** User has create permission (`APP-019 Permission-Gated UI`). Tenant has at least S1 integrations configured.
**Landing surface:** §5.1 Onboarding validation panel.

#### Primary path

| # | Step | Pattern(s) |
|---|---|---|
| 1 | User opens the Create form | `HUM-001 Single-Page Create` (default, <15 fields); `HUM-002 Multi-Page Create (Wizard)` for complex tenants |
| 2 | User types country + VAT ID | `HUM-039 Validation Patterns` (inline syntactic validation: country prefix, checksum, length) |
| 3 | As soon as the country+VAT pair passes format checks, Stages 1–2 fire silently | `AI-002 Autonomous Background Processing`; `AI-001 AI Loading / Processing States` (a discrete "validating…" chip, **not** a blocking spinner) |
| 4 | Within 3 s the panel displays the verdict badge and authoritative name/address | `HAI-011 Confidence / Certainty Indicators`; `HAI-008 AI Output Label / Provenance` (source chip S1/S2/S3); `§6.3 Compound Confidence Encoding` |
| 5 | Divergences between typed values and registry values are highlighted | `HUM-072 Comparison View` (side-by-side); Nielsen H1 (*visibility of system status*) |
| 6 | Panel offers "Adopt registry value" one-click affordance for each divergent field | `HAI-014 AI-Assisted Form Filling`; `HAI-010 Human-in-the-Loop Correction` |
| 7 | Expandable rationale available underneath the badge | `HAI-012 AI Explanation / Rationale Display`; `§6.1 Evidence-Attached Verdict` |
| 8 | User Saves | Fast-path verdict committed; slow path (Stages 4–6) continues asynchronously (`AI-002`) |
| 9 | On async completion, a toast notifies the user; the record updates in place | `HUM-051 Toast / Snackbar`; `HUM-048 Notification Center (Bell & Tray)` |

#### Branches

- **Fast-path verdict = Confirmed** → record saved; structural corrections auto-apply (§8.2); deep path still runs to annotate history.
- **Fast-path verdict = Suggested / Needs judgment** → record saved; queued to §5.2 for later handling (F3 or F4). Save is **not blocked**.
- **Fast-path verdict = Unresolved at Stage 2** → `HUM-049 Banner / Alert Notifications` warns "No registry match — save with Unresolved status?" — user chooses.
- **Sanctions jurisdiction detected** → parallel screening fires (R21); if hit, Save is gated by `HUM-050 Modal / Prompt Notification` requiring justification.
- **User has past invoices** → opportunistic upload affordance jumps to F6 inline (`HUM-003 Sub-Resource Create`).

#### Post
`Carrier` persisted with `ValidationRun`, `Verdict`, and `StageResult`s attached. Validation History Timeline entry created (`HUM-064 Audit Trail / Activity Log`).

#### Failure modes

- **Transient API timeout (S1)** → `HUM-044 Error Messages` with **Retry** affordance (`§6.5 Differentiated Failure Affordance` — transient class).
- **Invalid format** → inline `HUM-039` with country-specific hint.
- **Write-back rejected by upstream MDG interface** → `HUM-049 Banner` with explicit recovery path; the steward has an open override workflow (F5 applies).

---

### 11.3 F2 — Event-driven revalidation on edit *(brief)*

**Actor:** MDSTC
**Trigger:** Edit to `vat`, `country`, `name`, or address on an existing `Carrier` (`HUM-007 Attribute Editing` or `HUM-008 Inline Edit`).
**Intent:** Ensure any master-data change is immediately revalidated without blocking the user.
**Landing surface:** §5.3 Carrier record detail.

| # | Step | Pattern(s) |
|---|---|---|
| 1 | User saves edit | `HUM-008 Inline Edit` — edit is never blocked |
| 2 | New `ValidationRun` starts | `AI-002` |
| 3 | Live stage-meter updates on the record | `HUM-074 Status Workflow Indicator`; `§6.2 Pipeline Transparency` |
| 4 | On completion, Validation History Timeline appends | `HUM-073 Timeline / History View`; `HUM-064` |
| 5 | If new verdict ≠ Confirmed, record routed to queue | `HUM-028 Worklist`; `HUM-051 Toast` |

**Post:** Prior `ValidationRun` preserved in history (R7). Timeline shows before/after side-by-side.

---

### 11.4 F3 — Batch-approve the Suggested queue *(sampling-gated)*

**Actor:** MDSTC
**Trigger:** Steward opens Review queues → Batch approval tab.
**Intent:** Efficiently supervise high-confidence proposals without rubber-stamping.
**Preconditions:** Suggested bucket non-empty. Tenant has override-rate telemetry for adaptive sample sizing.
**Landing surface:** §5.2.1 Batch approval queue.

#### Primary path

| # | Step | Pattern(s) |
|---|---|---|
| 1 | Queue renders as a worklist grouped into review batches | `HUM-028 Worklist`; `HUM-017 List Report`; `HUM-018 Table with Grouped Resources` |
| 2 | Default sort = spend at risk; filters available | `HUM-068 Sorting Patterns`; `HUM-021 Filtering Patterns`; `§6.8 Spend-Weighted Triage` |
| 3 | Saved filter sets for repeat workflows | `HUM-022 Saved Filter Sets`; `HUM-066 State Persistence (View Memory)` |
| 4 | User opens a batch — sampling wizard starts | `HUM-047 Progressive Steps / Progress Indicators` |
| 5 | System presents √n sampled records (bounded `[3, 25]`) with full evidence each | `HAI-011 Confidence / Certainty Indicators`; `HAI-012 AI Explanation / Rationale Display`; `§6.10 Sampling-Gated Batch Approval` |
| 6 | User accepts or overrides each sample | `HAI-010 Human-in-the-Loop Correction`; `HAI-020 AI Feedback Loop` (override captured) |
| 7 | Decision prompt based on sample outcomes (§6.10) | `HUM-050 Modal / Prompt Notification` (confirm final action) |
| 8 | On "Approve remainder" → single-signature `BatchApproval` persists | `HUM-034 Batch / Bulk Operations`; `HUM-075 Multi-Select with Actions` (conceptually batch = selection) |
| 9 | `BatchApproval` enters F5 for second signature | `HUM-074 Status Workflow Indicator` → *Pending Approval* |
| 10 | Bulk approval reversible within tenant-configurable window | `HUM-035 Undo / Redo` (scoped to the BatchApproval) |

#### Branches

- **All samples accepted** → offer **Approve remainder**.
- **1–2 overrides** → offer **Resample** (larger N, same batch) OR **Go in depth** (hand off remainder to F4).
- **≥ 3 overrides or > 20% rate** → system refuses bulk approval (trust breach at batch scope); affected records auto-routed to F4.
- **Voluntary "Go in depth"** → F4 takes over.

#### Post
`BatchApproval` + `sampleDecisions[]` attached to each affected `ValidationRun`. Adaptive sample size updated per (source pattern × tenant) in the `HAI-013 Progressive AI Assistance` style — sample shrinks as trust compounds.

#### Failure modes

- **AI service outage during rationale render** → `HUM-044` with Retry; batch paused, not lost.
- **AI cost-cap hit** (R23) → `AI-012 AI Rate Limiting & Quota Display` banner; batch deferred.

---

### 11.5 F4 — Judge one case at a time *(Needs judgment + Unresolved)*

**Actor:** MDSTC
**Trigger:** Steward selects the Case-by-case tab.
**Intent:** Evaluate records where sources disagree or evidence is absent, one at a time, with full context.
**Landing surface:** §5.2.2 Case-by-case inbox.

#### Primary path

| # | Step | Pattern(s) |
|---|---|---|
| 1 | Queue renders as split view (list left, detail right) | `HUM-020 Split View (Master-Detail Collection)` |
| 2 | Default sort = spend at risk; bulk "accept all" intentionally absent | `HUM-068`; `§6.8` |
| 3 | Keyboard navigation (`j/k` next/prev, `o` open, `a` accept, `d` defer, `e` escalate, `r` re-run) | `HUM-036 Keyboard Shortcuts` |
| 4 | Detail panel shows full evidence + source-disagreement comparison | `HAI-012`; `HUM-072 Comparison View` (S1 vs S2 side-by-side); `HUM-062 Secondary Panels (Sidesheets)` (deep-evidence drawer) |
| 5 | Action set: Accept / Override / Defer / Escalate / Annotate / Re-run | `HUM-031 In-Context Actions`; `HUM-033 Toolbar Patterns` |
| 6 | Shortcut menu for less-frequent actions | `HUM-032 Shortcut Menus (Context Menus)` |
| 7 | Override → creates `Proposal` → F5 | `HUM-074 Status Workflow Indicator` |
| 8 | Annotations stored on timeline | `HUM-073`; `HUM-064` |

#### Branches

- **Accept** → value confirmed; `ValidationRun` re-labelled `Confirmed` with steward signature.
- **Override** → `Proposal` → F5.
- **Defer** (snooze) → leaves active queue; reason required (`HUM-050`).
- **Escalate** → reassigned to second reviewer (`HUM-065 Collaboration & Sharing`); reason required.
- **Re-run with more context** → steward uploads a supporting invoice inline → F6 mini-flow triggers → new `ValidationRun` fires.

#### Failure modes

- **Evidence fetch fails** → `HUM-044` in the sidesheet with Retry.
- **User lacks Override permission** → action disabled (`HUM-040 Disabled & Read-Only States`) with explanatory tooltip.

---

### 11.6 F5 — Four-eyes approval (proposer → approver)

**Actors:** MDSTC (proposer, from F1/F2/F3/F4) + Master-Data Approver (second signature)
**Trigger:** `Proposal` or `BatchApproval` created upstream.
**Intent:** Enforce segregation of duties on any mutation to the master record.
**Landing surfaces:** §5.2 (approver's worklist) + §5.3 (carrier detail for context).

#### Primary path

| # | Step | Pattern(s) |
|---|---|---|
| 1 | Item status = *Pending Approval* | `HUM-074 Status Workflow Indicator` |
| 2 | Approver sees the item in their worklist | `HUM-028 Worklist`; `HUM-052 Scoped Notification` |
| 3 | Approver opens the detail panel | `HUM-020 Split View`; `HUM-004 Resource Details Page` |
| 4 | Approver reviews evidence and proposer's rationale | `HAI-012`; `HAI-007 User-Authorized AI Actions` (the approval authorises, does not re-execute) |
| 5 | Approver signs — `Approval` persists | `HUM-050 Modal / Prompt Notification` with reason field; `§6.7 Four-Eyes Approval on Write-Back` |
| 6 | `Carrier` mutation propagates via MDG interface (R20) | `HUM-074` → *Approved* |
| 7 | Both signatures visible on `Attestation` | `HUM-064`; `HUM-073` |

#### Branches

- **Proposer == Approver** → attempt blocked by `HUM-049 Banner` (R16; segregation-of-duties enforcement).
- **Reject** → returns to proposer queue with reason; no mutation.
- **Request more info** → proposer notified via `HUM-048 Notification Center`.

#### Failure modes

- **MDG write-back fails** → `HUM-044` on the `Approval` record; status becomes *Approval-write-back-failed*; auto-retry with backoff.
- **Sanctions hit between signing and write-back** → write-back suspended; record routed to sanctions sub-queue; `HUM-049` banner.

---

### 11.7 F6 — Upload past invoices as S2 evidence

**Actor:** MDSTC or tenant admin
**Trigger:** "Upload invoices" from the Evidence library, or opportunistic prompt on the onboarding panel (F1 step 5 branch), or inline during F4 (Re-run with more context).
**Intent:** Seed or strengthen S2 evidence for one or many carriers.
**Landing surface:** §5.6 Invoice evidence intake.

#### Primary path

| # | Step | Pattern(s) |
|---|---|---|
| 1 | User selects files (PDF / UBL / Factur-X / XRechnung / FatturaPA / KSeF XML) | `HUM-003 Sub-Resource Create`; `HUM-034 Batch / Bulk Operations` |
| 2 | Per-file upload progress | `HUM-046 Loading & Refreshing States`; `HUM-047 Progressive Steps` |
| 3 | Parsing runs asynchronously (header-only) | `AI-002 Autonomous Background Processing` |
| 4 | Each parsed invoice is auto-linked to a `Carrier` by VAT ID | `AI-006 Auto-Classification / Tagging` |
| 5 | Linked invoices immediately become S2 evidence for future `ValidationRun`s | §5.6; R15.4 |
| 6 | Ambiguous / failed parses populate the parse-review inbox | `HUM-028 Worklist`; `HUM-045 Empty States` when caught up |
| 7 | Steward manually assigns ambiguous invoices | `HAI-010 Human-in-the-Loop Correction`; `HAI-015 AI-Driven Recommendations` for ranked candidates; `HAI-012` explains each candidate |
| 8 | Each manual assignment feeds the matcher | `AI-013 AI Training Data Feedback Pipeline`; `HAI-020 AI Feedback Loop` |
| 9 | Scanned-PDF review uses magnifier for OCR verification | `HUM-063 Image Magnifier` |

#### Branches

- **Parse success + unique VAT match** → `InvoiceEvidence` linked automatically.
- **Parse success + no VAT match** → parse-review inbox, fuzzy name/address candidates offered.
- **Parse success + multiple candidates** → parse-review inbox with AI-ranked candidates (`HAI-015`).
- **OCR parse failure** → raw PDF retained; steward views in magnifier and enters values manually.
- **PII detected in header** (sole-proprietor VATs common in DE/PL/IT) → DPO-review gate before evidence becomes live.

#### Post
`InvoiceUpload` + one or more `InvoiceEvidence` objects persisted. Tenant's S2 coverage metric on §5.4 increments.

#### Failure modes

- **File virus / malformed** → rejected at upload with `HUM-044`.
- **Tenant storage cap exceeded** → `HUM-049` banner with admin contact.

---

### 11.8 F7 — Periodic sweep *(brief)*

**Actor:** Tenant admin (configures) → system (executes) → MDSTC (consumes results).
**Trigger:** Scheduled cron (quarterly default) or on-demand "Run sweep now".
**Landing surfaces:** §5.4 dashboard (execution view) + §5.2 queues (results) + §5.5 (sweep-level attestation).

| # | Step | Pattern(s) |
|---|---|---|
| 1 | Admin schedules / launches sweep | `AI-014 Scheduled AI Jobs & Reports`; `HUM-030 Global Actions` |
| 2 | Sweep fans out one `ValidationRun` per active `Carrier` | `AI-002` |
| 3 | Progress + running cost visible on dashboard | `HUM-046`; `HUM-047`; `AI-012 AI Rate Limiting & Quota Display` |
| 4 | Admin can pause / kill-switch | `HUM-049`; `HUM-030`; honours R23 |
| 5 | Results routed to queues by bucket (F3 / F4 take over) | — |
| 6 | Completion notification with summary | `HUM-048`; `HUM-052 Scoped Notification` |
| 7 | Sweep-level `Attestation` produced | `HUM-064` |

**Failure modes:** cost cap (R23) → auto-pause, admin-extends or defers; registry rate-limit → auto-backoff, stage metadata records the delay.

---

### 11.9 F8 — Trust-breach response *(brief)*

**Actor:** System detects; MDSTC responds.
**Trigger:** A previously `Confirmed` carrier is later found wrong (via external evidence, payment rejection, re-verification, or F4 override).
**Landing surfaces:** §5.4 banner + §5.2 queues.

| # | Step | Pattern(s) |
|---|---|---|
| 1 | System detects breach | `AI-005 Anomaly Detection & Alert Generation` |
| 2 | Banner notification on dashboard and affected record | `HUM-049`; `AI-015 AI-Driven Notifications & Alerts` |
| 3 | Tenant confidence threshold widens for 30 days (§8.3) | Config change logged to `HUM-064` |
| 4 | Similar records (same source pattern) auto-flagged for re-verification | `HUM-028` with breach-origin chip |
| 5 | Steward works the flagged set via F4 | — |
| 6 | Per-tenant accuracy dashboard updates | §5.4 |

---

### 11.10 F9 — External-auditor attestation review *(brief)*

**Actor:** External auditor (read-only role).
**Trigger:** Auditor session during tax inspection or internal audit.
**Landing surface:** §5.5 Audit attestation view.

| # | Step | Pattern(s) |
|---|---|---|
| 1 | Auditor signs in with scoped role | `APP-018 Role-Based Experience`; `APP-019 Permission-Gated UI` |
| 2 | Auditor navigates to a carrier or time window | `APP-017 Global Search`; `HUM-067 Scoped / In-Context Search` |
| 3 | Auditor opens the `Attestation` | `HUM-004 Resource Details Page`; `HUM-073 Timeline / History View` |
| 4 | Full chain visible: run inputs → API responses → reasoning → verdicts → signatures | `HUM-064`; `AI-010 AI Model Transparency / Audit Trail`; `HAI-012` |
| 5 | Auditor requests replay against cached responses (R25) | `HUM-046` |
| 6 | Optional archival PDF download (sole sanctioned export; §6.9) | `HUM-071 Print View`; `HUM-070 Export / Download` |

**Failure mode:** auditor lacks permission for a record → `HUM-040 Disabled & Read-Only States`, title visible, contents redacted.

---

### 11.11 Flow-to-surface matrix

Quick cross-reference: which flow touches which surface, and in what capacity.

| Flow | §5.1 Onboard. panel | §5.2.1 Batch queue | §5.2.2 Case-by-case | §5.3 Record detail | §5.4 Dashboard | §5.5 Attestation | §5.6 Evidence library | §5.7 Bootstrap wizard |
|---|---|---|---|---|---|---|---|---|
| **F0** Bootstrap *(one-time)* | | ○ results populate here | ○ results populate here | | ● live progress | ○ bootstrap attestation | ○ parallel seeding | ● primary |
| **F1** Onboard single | ● primary | | | ○ follow-up | | | ○ opportunistic | |
| **F2** Edit revalidation | | | ○ if flagged | ● primary | | | | |
| **F3** Batch approve | | ● primary | | ○ drill-down | | | | |
| **F4** Case-by-case judge | | | ● primary | ○ drill-down | | | ○ inline upload | |
| **F5** Four-eyes approval | | ○ approver queue | ○ approver queue | ● detail review | | ○ signatures | | |
| **F6** Upload invoices | ○ opportunistic | | | | | | ● primary | ○ step 4 of bootstrap |
| **F7** Periodic sweep | | ○ results land here | ○ results land here | | ● admin view | ○ sweep attestation | | |
| **F8** Trust breach | | | ○ flagged set | ○ affected record | ● banner + KPI | | | |
| **F9** Auditor review | | | | ○ drill-in | | ● primary | | |

*Legend: ● primary surface · ○ secondary / consulted.*

**Observation:** F0 is the only flow that exercises **six** of the seven surfaces in a single session. This is the architectural justification for treating it as a first-class flow with its own landing surface (§5.7) rather than folding it into F1 or §5.4.

---

### 11.12 Pattern coverage summary

The ten flows above compose **~50 distinct patterns** from the Trimble app-pattern skeleton plus **this PRD's 10 own primitives**. High-level grouping, by skeleton category:

- **APP-### (Application shell):** `APP-001`, `APP-007`, `APP-017`, `APP-018`, `APP-019` — role scoping, global search, permission gates around admin (F0, F7) and auditor (F9) flows.
- **HUM-### (Human task patterns):** dominant in F0 and F1–F6. Heaviest use: `HUM-002 Multi-Page Create (Wizard)` (F0 bootstrap), `HUM-028 Worklist` (queues), `HUM-020 Split View` (case-by-case detail), `HUM-034 Batch / Bulk Operations` (F0, F3, F6), `HUM-074 Status Workflow Indicator` (Proposal lifecycle), `HUM-064 Audit Trail` + `HUM-073 Timeline` (everywhere — evidence preservation is the doctrine), `HUM-044 Error Messages` (differentiated failure, §6.5), `HUM-036 Keyboard Shortcuts` (power-user requirement per persona §3).
- **HAI-### (Human + AI):** the PRD's core identity. `HAI-010 Human-in-the-Loop Correction`, `HAI-011 Confidence / Certainty Indicators`, `HAI-012 AI Explanation / Rationale Display`, `HAI-014 AI-Assisted Form Filling` (esp. F0 column mapping and F1 adopt-registry-value), `HAI-015 AI-Driven Recommendations`, `HAI-018 AI-Assisted Data Validation`, `HAI-020 AI Feedback Loop`.
- **AI-### (Autonomous AI):** for async back-ends. `AI-002 Autonomous Background Processing` (the slow path, also F0's main engine), `AI-005 Anomaly Detection` (trust breach), `AI-006 Auto-Classification` (invoice → carrier linking), `AI-014 Scheduled AI Jobs` (F0 bootstrap run, F7 periodic sweep), `AI-010 AI Model Transparency / Audit Trail` (auditor flow), `AI-012 AI Rate Limiting & Quota Display` (F0, F7), `AI-013 AI Training Data Feedback Pipeline`.

**One novel composition identified (not a new pattern to invent, but a name worth registering).** F0 composes `HUM-002` + `HUM-034` + `HAI-014/15/12` + `AI-002` + `AI-012` + `HUM-050` + `HUM-064` into what professional software calls a **Bulk Data Migration Wizard** (Salesforce Data Loader, HubSpot CSV import, Jira Cloud Migration Assistant, SAP Migration Cockpit, Workday EIB). The Modus pattern library should register this composition under a stable name (suggested: `MIGRATION-001 Bulk Data Migration Wizard`) so it can be reused by future features (vendor-master migration, customer-master migration, parts-master migration — the whole master-data product family).

Apart from that composition, **zero novel patterns invented**. Every interaction is covered by an existing skeleton entry or a named PRD primitive (§6). The feature's originality is in the *composition*, not in bespoke widgets — which is exactly the posture Nielsen H4 (*consistency and standards*) requires for enterprise adoption.

---

## 12. Open questions

Resolved in this revision:

- ~~Standalone vs. embedded~~ → embedded
- ~~Primary mental model~~ → inline panel at onboarding + two-queue worklist post-onboarding (batch vs. case-by-case)
- ~~Scope of first surface~~ → onboarding panel, Phase 1
- ~~CSV-as-output~~ → removed; attestation is in-app
- ~~Ambiguity between *Likely correct* and *To be verified*~~ → renamed to *Suggested* and *Needs judgment* with explicit dominant actions
- ~~How to make *Suggested* supervisable at scale~~ → §6.10 Sampling-Gated Batch Approval
- ~~Second data source beyond registry + web~~ → §5.6 Invoice-evidence intake (S2 in source hierarchy)

Still open:

- **Which domain ships first?** The reference implementation is VAT. The same pattern applies to customer VAT validation, vendor bank-detail validation (IBAN + BIC via SEPA registry), parts master (manufacturer cross-reference), customer address validation. Which domain carries the feature to GA, and in what order do we add the others?
- **Invoice parser depth.** Day-1 scope is header parsing only. Should Phase 2 extract additional header fields (customer VAT for tax-role determination, service-country codes for place-of-supply analysis)? Depends on whether the pipeline generalises into line-level freight audit.
- **Tenant vs. global pattern-learning opt-in** — default declined, but the mechanism for opting in (and auditing its effect) needs design.
- **E-invoicing readiness (IT SdI, PL KSeF 2026, FR 2026–27, ES Verifactu, DE B2B phase-in)** — the capability's future home is invoice-issuance time, not only onboarding time. The Phase-2 spec should include a real-time pre-issuance validation path that is an alias of the onboarding path.
- **ERP/TMS/FAP integration surface** — whether corrections propagate via the application's existing connector framework or via a new, dedicated master-data-governance connector. Dependent on the broader platform roadmap.

---

## 13. Appendix — reference implementation

A back-office reference implementation of this pipeline exists for VAT-number reconciliation at `pipeline/run.mjs` in this repo. It is deliberately file-based (NDJSON intermediates, CSV output) because it was built before this PRD was written — it functions as a **research artifact** that proves the mechanism, not as the productised capability described here.

The productised capability will reuse the reference pipeline's **stages and reasoning**, but replace its **presentation layer** (CSV output, standalone CLI) with the embedded surfaces defined in §5. Specifically:

- Stages 1–6 map directly.
- `pipeline/jobs/*/intermediate/*.ndjson` → `ValidationRun` / `StageResult` domain objects.
- `output/enriched.csv` → the combination of inline record state, inbox entries, history timeline, and attestation.
- The `discover-vat`, `compare-names`, `compare-addresses` Cursor skills are replaced by server-side agentic services with the same prompts and logic.

The reference implementation remains useful for one-off audits against datasets that are not yet in the application (legacy data migration, acquisition integration). It should never be the primary way users interact with this capability.
