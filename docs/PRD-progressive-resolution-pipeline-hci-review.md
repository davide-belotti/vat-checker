# HCI Review — Progressive Resolution Pipeline PRD

**Reviewer persona:** HCI scientist · IA/UX strategist (40+ years, enterprise B2B SaaS)
**Document reviewed:** [`docs/PRD-progressive-resolution-pipeline.md`](./PRD-progressive-resolution-pipeline.md)
**Review type:** Heuristic evaluation + IA critique + benchmark + pattern extraction
**Date:** 2026-04-17
**Deep-research escalation:** Not triggered — the PRD sits within the established HCI canon for human-in-the-loop AI (Shneiderman, Endsley), progressive disclosure (Nielsen, Krug), and decision-support UIs (Wickens, Tidwell). One topic where escalation *would* be warranted before a Phase-2 spec is flagged in §10.

---

## 1 · Executive assessment

The PRD is **structurally strong at the conceptual layer** — it names the right pattern (progressive resolution with confidence-tiered triage), identifies the correct IA inversion (inbox over table), and commits to evidence-as-UI, which is the single most important design decision for an agentic data-recovery feature. It reads as a **credible vision document**.

It is, however, **under-specified at the interaction and persona layers**. There is no task topology, no mental-model commitment, no information-density targets, no keyboard-first interaction model, and no accessibility assessment. These are the layers where agentic UIs typically fail in production — not at the strategy layer, where they rarely do. In Garrett's *Five Planes* model (Garrett, 2002), the PRD is well-developed at the Strategy and Scope planes, thin at Structure, and essentially silent on Skeleton and Surface.

**Headline recommendation:** before this PRD advances to design, resolve three things — (a) the reviewer persona, (b) the primary mental model (workflow queue vs. curated list vs. audit ledger), and (c) the pattern language used to name and constrain the six design primitives. Everything else can follow.

---

## 2 · What the PRD gets right (with HCI grounding)

| PRD claim | HCI principle it rests on | Verdict |
|---|---|---|
| "Inbox, not a table" — default view is escalations only | Progressive disclosure (Nielsen H8 *Aesthetic and minimalist design*); attention economy (Wickens, *Multiple Resource Theory*) | ✅ Correct inversion. Matches the "Object Page + Worklist" pattern from SAP Fiori. |
| "Evidence attached to every verdict" | Nielsen H1 (*Visibility of system status*), H9 (*Help users recognize, diagnose, and recover from errors*); Norman's *Gulf of Evaluation* | ✅ This is the single most defensible claim in the doc. It is also the core of IBM Carbon's AI guidelines ("Explainability is non-negotiable"). |
| "Confidence ladder IS the UX" (four buckets) | Miller's 7±2 (Miller, 1956); Hick's Law on choice complexity | ✅ Four discrete buckets is the right chunking. Flatter would be ambiguous; deeper would force unnecessary decision load. |
| "Correction loop that teaches the system" | Shneiderman's *Human-Centered AI* framework (2022) — especially the observation→supervision→collaboration→autonomy progression | ✅ Correct framing, but under-operationalized (see §4.4). |
| "Differentiated failure affordances" (retry / edit / choose) | Shneiderman's 8 Golden Rules #5 (*Offer error prevention and simple error handling*) | ✅ A meaningful design distinction. Most enterprise tools conflate these. |
| "Resumability as a UI concept" | Tognazzini's principle of *persistent state*; also aligns with "progressive operations" pattern in Cloudscape | ✅ Correct; rare to see named explicitly in a PRD at this stage. |

---

## 3 · Structural gaps (IA & persona layer)

### 3.1 The persona is a job title, not a persona

"Operations / master-data reviewer" is insufficient to drive interaction decisions. Cooper's goal-directed design requires, at minimum: task frequency, expertise level, interruption context, error cost, accountability structure.

The interaction model changes meaningfully across these axes. Concrete example:

- A **daily reviewer** (high frequency, expert) needs keyboard-first bulk triage — think Gmail power users (`e` to archive, `j/k` to navigate).
- A **weekly reviewer** (medium frequency, moderate expertise) needs a curated worklist with sort/filter — think Jira board.
- A **monthly auditor** (low frequency, high-stakes, accountable) needs slow, evidenced review with a confirmation step — think SAP Four-Eyes approval flow.

The PRD could cover any of these and they'd all look different. **This needs resolution before UX design starts.**

### 3.2 The primary mental model is not committed

The PRD says "inbox" but never commits to *which kind* of inbox. These are architecturally different:

| Mental model | Reference product | Interaction primitive |
|---|---|---|
| **Workflow queue** (one at a time, dismiss or act) | Gmail, Intercom conversation inbox | Keyboard-driven sequential processing |
| **Curated triage list** (glance many, act on several) | Jira board, Linear inbox, GitHub PR list | Scan + filter + bulk-act |
| **Audit ledger** (review historical decisions, rarely drive new ones) | ServiceNow audit log, Workday approvals | Search + drill-down + annotate |

All three are "inboxes" and all three are legitimate answers. **Picking one is the foundational IA decision.**

### 3.3 No task topology

The PRD lists verdicts (`Confirmed`, `Likely correct`, `To be verified`, `Unresolved`) but never enumerates the user's *actions* on an escalated row. From the pattern domain one would expect at minimum:

- Accept as-is
- Override with corrected value
- Defer (snooze N days)
- Escalate to second reviewer
- Reject the whole record (data quality issue upstream)
- Annotate without resolving
- Request AI re-run with more context

Without this list, the interaction surface cannot be drawn. In Constantine & Lockwood's *essential use case* language, the PRD has the *context* but not the *intentions*.

### 3.4 The confidence ladder is taxonomically flat, not psychologically flat

The four labels are treated as equal-weight categories. In practice, users build habituation around these labels only if the *statistical* confidence behind each is stable and explainable.

**Benchmark** — how leading systems handle this:

- **IBM Carbon AI** uses a **compound encoding**: a categorical badge *plus* a numeric percentage for expert users (documented in Carbon's AI guidance).
- **Salesforce Einstein** uses the same compound approach (star rating + confidence score).
- **Microsoft Copilot "grounding cards"** use source-count and source-quality as the confidence signal.

**Recommendation:** the confidence ladder should be a two-layer encoding — categorical (for triage) *and* evidentiary (for audit). The PRD currently collapses both into one.

---

## 4 · Component-level gaps

### 4.1 Evidence rendering has no information-density target

"Three lines, readable at a glance" is a design aspiration, not a constraint. Before this becomes buildable, the PRD needs:

- **Maximum evidence length** before truncation (character count or tokens)
- **Strategy for long reasoning chains** (summary + drawer? Tufte's "sparkline" compression? Accordion?)
- **Ordering rule** — most discriminating evidence first? Or chronological-by-pipeline-stage?

This is a direct application of Shneiderman's Visual Information Seeking Mantra: *overview first, zoom and filter, details on demand*. The PRD implies it; design needs it specified.

### 4.2 Trust calibration is named but not operationalized

The PRD elevates trust calibration to "the whole game" (§7.1) but provides no mechanism. Trust in AI systems has a well-documented developmental arc (Lee & See, *Trust in Automation*, 2004):

1. **Calibration** — user's trust matches system's capability
2. **Miscalibration (over-trust)** — user accepts wrong outputs
3. **Miscalibration (under-trust)** — user re-checks everything, no leverage

**To operationalize, the PRD needs to specify:**

- How the system *demonstrates* calibration over time (e.g., per-tenant accuracy dashboard for `Likely correct` rows)
- How the system *recovers* from a trust breach (when a `Confirmed` row turns out wrong, what's the UI event?)
- How power users can *recalibrate the thresholds* for their own workflow

Without these, "trust calibration" is aspiration, not design.

### 4.3 The correction loop is a feature, not a mechanism

Section 5.3 names the loop but doesn't specify whether corrections are:

- **Per-tenant learned** (this org's "GEFCO → CEVA" is known)
- **Globally learned** (all tenants benefit)
- **Model-weight updated** vs. **rule-table updated**
- **Immediate vs. batched**

These have significant privacy, governance, and explainability implications. Enterprise buyers will ask on day one. **This section will not survive procurement review as currently written.**

### 4.4 Shneiderman's Human-Centered AI progression is not placed on the roadmap

The pattern can sit at any of four positions on Shneiderman's axis:

| Position | Human role | System role | Example |
|---|---|---|---|
| Observation | Does work | Watches, suggests | Grammarly v1 |
| Supervision | Approves/corrects | Drafts | Copilot inline suggestions |
| Collaboration | Partners | Partners | GitHub Copilot Workspace |
| Autonomy | Reviews exceptions | Acts unless blocked | Automated trading with circuit breakers |

The PRD currently oscillates between **Supervision** (user must accept `Likely correct`) and **Autonomy** (`Confirmed` is auto-applied). Committing to a position per-bucket — and naming it — makes the product legible to enterprise buyers.

---

## 5 · Benchmark: how leading design systems handle this pattern family

| System | AI/agentic pattern present? | What to steal |
|---|---|---|
| **IBM Carbon** | Yes — formal *AI Design Guidelines* section | Confidence encoding, explainability patterns, data-density tables |
| **Salesforce Lightning (Einstein)** | Yes — Einstein Confidence component, Recommendation records | Compound confidence (badge + score), "Why?" drawer pattern |
| **Microsoft Fluent (Copilot)** | Yes — grounding cards, source-attribution patterns | Source-count confidence encoding, in-line citation chips |
| **SAP Fiori** | Partial — Object Page + Worklist patterns are adjacent | Four-Eyes approval flow for high-stakes verdicts |
| **AWS Cloudscape** | Partial — no explicit AI, but excellent long-running-operation and dense-table patterns | Progressive operation UI, status indicator vocabulary |
| **Atlassian** | Partial — Intelligence summaries in Jira | Dismiss/accept/customize interaction triad |
| **Modus (Trimble)** | Minimal explicit AI guidance | Will need extension; see §7 |

**Single most useful external pattern to replicate:** IBM Carbon's AI guidance on explainability + Salesforce Einstein's compound confidence encoding. Together they solve §3.4 and §4.1 cleanly.

---

## 6 · Patterns to extract and formalize

The PRD introduces six ideas that deserve to be registered as named patterns with a problem/context/forces/solution/rationale structure (Alexander, Tidwell). Brief drafts:

### 6.1 Pattern: **Confidence Ladder**
- **Problem:** How to compress continuous AI confidence into triage-usable categories without hiding evidence?
- **Forces:** Cognitive chunking (Miller) vs. loss of precision; habituation (Raskin) vs. explainability
- **Solution:** Four-tier categorical ladder for default view; numeric/evidentiary layer on demand
- **Related:** Einstein Confidence (SLDS), Carbon AI confidence patterns

### 6.2 Pattern: **Evidence-Attached Verdict**
- **Problem:** How to make AI decisions trustable and auditable without forcing a modal dive?
- **Forces:** Information density (Tufte) vs. depth of justification; default scannability vs. completeness
- **Solution:** Inline summary (1–3 lines) + expandable full chain + source citations
- **Related:** Copilot grounding cards, Einstein "Why?" drawer

### 6.3 Pattern: **Pipeline Transparency**
- **Problem:** How to expose which stages succeeded/failed without cognitive overload?
- **Forces:** Diagnostic value vs. abstraction; live state vs. historical record
- **Solution:** Horizontal stage-meter with per-stage status glyph; click to reveal stage details
- **Related:** Salesforce Path component, Cloudscape Progress Tracker

### 6.4 Pattern: **Differentiated Failure Affordance**
- **Problem:** Users confuse transient/terminal failures and act inappropriately.
- **Forces:** Error semantics vs. surface uniformity; action recoverability
- **Solution:** Three failure classes mapped to three distinct primary actions (Retry / Edit / Choose)
- **Related:** Shneiderman Rule #5 (error handling)

### 6.5 Pattern: **Correction Feedback Loop**
- **Problem:** Repeat work on known resolutions erodes trust in the automation.
- **Forces:** Privacy (per-tenant) vs. leverage (global); immediate vs. batched learning
- **Solution:** Per-tenant pattern store updated on every override; surfaced as "you've told us before" hint
- **Related:** Shneiderman HCAI supervision→collaboration progression

### 6.6 Pattern: **Async Agentic Run**
- **Problem:** Long-running AI operations blocking user workflow.
- **Forces:** Latency vs. interactivity; session persistence
- **Solution:** Background run with progress meter, pausable/resumable, desktop/email notification on completion
- **Related:** Cloudscape long-running-operation pattern, Fiori background process pattern

---

## 7 · Accessibility assessment (WCAG 2.2)

This is a **material gap** in the current PRD. An AI-assisted review inbox with inline evidence is, by its nature, a dense, high-cognitive-load interface — exactly the profile where accessibility fails silently.

| WCAG 2.2 criterion | Risk level in current PRD | Why |
|---|---|---|
| 1.3.1 *Info and Relationships* | 🔴 High | Confidence buckets likely rendered as colored badges only; no programmatic association between evidence text and the record |
| 1.4.11 *Non-text Contrast* | 🟡 Moderate | Bucket colors need ≥3:1 against background; PRD doesn't specify |
| 2.1.1 *Keyboard* | 🔴 High | No keyboard-first interaction model described; enterprise reviewers with hundreds of rows cannot be mouse-bound |
| 2.4.11 *Focus Not Obscured* (WCAG 2.2 new) | 🟡 Moderate | Dense list + inline evidence = focus obscuration risk |
| 2.5.7/8 *Dragging & Target Size* (WCAG 2.2 new) | 🟡 Moderate | Bulk-action affordances need ≥24×24 targets |
| 3.3.1 *Error Identification* | 🟢 Low | PRD's evidence-attached verdicts actually help here |
| 3.3.8 *Accessible Authentication* | N/A | — |
| Cognitive accessibility (WCAG 2.2 AAA considerations) | 🔴 High | No reading-level target for evidence prose; localization of verdict labels unspecified |

**Minimum additions before design:**
- Explicit keyboard model (propose Gmail-style single-character shortcuts for the three primary actions)
- Screen-reader narrative for each verdict bucket (e.g., aria-label templates)
- Reading-level target for evidence prose (recommend Flesch-Kincaid ≤ 10; audience is professional but non-native speakers are common in operational roles)
- Color-independent encoding of confidence (icon + text, not just a colored chip)

---

## 8 · Prioritized recommendations

| # | Recommendation | Effort | Impact | When |
|---|---|---|---|---|
| 1 | Commit to a primary mental model (workflow queue vs. curated list vs. audit ledger) | S | 🔥 Critical | Before UX design starts |
| 2 | Develop a richer persona (frequency, expertise, context, error cost) with 2–3 discriminating scenarios | M | 🔥 Critical | Before UX design starts |
| 3 | Enumerate the escalation row's action set (accept / override / defer / escalate / annotate / re-run) | S | High | Before UX design starts |
| 4 | Specify compound confidence encoding (category + numeric/evidentiary) | S | High | Phase 1 |
| 5 | Add an Accessibility section to the PRD with the WCAG 2.2 criteria in §7 | M | High | Phase 1 |
| 6 | Operationalize trust calibration — per-tenant accuracy visibility, breach-recovery UI event | M | High | Phase 1 |
| 7 | Extract the six patterns in §6 into a separate pattern-library doc (design-system agnostic + Modus implementation notes) | M | Medium | Phase 1 |
| 8 | Specify the correction loop's mechanism (per-tenant vs. global, immediate vs. batched, privacy) | L | High | Phase 2, before procurement review |
| 9 | Commit to Shneiderman-axis positioning per bucket (Supervision for *Likely correct*, Autonomy for *Confirmed*, etc.) | S | Medium | Phase 2 |
| 10 | Add cost-governance spec (per-tenant budget, kill switch) — currently implicit | M | Medium (high for enterprise sales) | Phase 2 |

---

## 9 · Summary for stakeholders

> This PRD correctly identifies an **agentic data-recovery pattern** with strong theoretical grounding. The strategic framing ("confidence ladder as IA," "evidence as UI," "inbox over table") is defensible against leading enterprise design systems and aligned with current HCI consensus on human-AI collaboration.
>
> It requires three structural additions before design can begin: **a commitment to the primary mental model, a richer persona, and an enumerated action set**. Without these, the UX will drift.
>
> It requires two additions before the document survives enterprise procurement: **operationalized trust calibration and a specified correction-loop mechanism**. Without these, the feature will either be distrusted or prohibited in regulated environments.
>
> With these additions, the pattern is **ready to become a canonical capability** in the product family — not just a feature of one application. Its reuse potential across master-data domains (vendors, customers, parts, addresses) is the strategic value.

---

## 10 · Confidence score on this review

🟢 **High confidence** on §2–§6 and §8 — these draw on settled HCI literature and publicly documented design-system guidance that is referenceable without fabrication.

🟡 **Moderate confidence** on §7 (accessibility) at the *specific* criterion-level risk mapping — exact risk levels depend on visual design choices not yet made. The criteria themselves are correctly cited.

🔴 **Low confidence / escalation recommended** on one specific question not yet in the PRD: **which AI-explanation patterns have been validated at scale in non-English-speaking operational user bases?** The literature is heavily Anglophone. The reference implementation's user base is global (data processed includes German, Polish, Italian, Hungarian, Turkish content); a Phase-2 spec should trigger the Literature Scout and Industry Practice Analyst sub-agents to survey non-English AI UX research before finalizing the evidence-rendering specification.

---

## 11 · One Socratic question to advance

Before proceeding to pattern specifications, the decision with the highest downstream leverage is the mental-model commitment (§3.2). So:

> **When a reviewer has 40 escalations waiting, what is the most common mode they enter? Are they (a) sitting down for a focused 30-minute block to clear the whole queue, (b) handling them one-by-one as notifications arrive, or (c) reviewing them weekly against a deadline with sign-off?**

The answer determines whether we design a **workflow queue** (b), a **curated triage list** (a), or an **audit ledger** (c) — and almost every downstream pattern cascades from it.

---

## References cited (verifiable sources)

- Cooper, A. — *About Face: The Essentials of Interaction Design*
- Constantine, L. & Lockwood, L. — *Software for Use*
- Endsley, M. — *Designing for Situation Awareness*
- Garrett, J.J. — *The Elements of User Experience* (2002)
- Lee, J.D. & See, K.A. — *Trust in Automation: Designing for Appropriate Reliance*, Human Factors 46(1), 2004
- Miller, G.A. — *The Magical Number Seven, Plus or Minus Two*, Psychological Review, 1956
- Nielsen, J. — *10 Usability Heuristics for User Interface Design* (1994)
- Norman, D. — *The Design of Everyday Things*
- Raskin, J. — *The Humane Interface*
- Shneiderman, B. — *Designing the User Interface* (8 Golden Rules)
- Shneiderman, B. — *Human-Centered AI* (2022)
- Tidwell, J. — *Designing Interfaces: Patterns for Effective Interaction Design*
- Tognazzini, B. — *First Principles of Interaction Design*
- Tufte, E. — *The Visual Display of Quantitative Information*
- Wickens, C. — *An Introduction to Human Factors Engineering*
- W3C — *Web Content Accessibility Guidelines (WCAG) 2.2*

**Design system references:**
- IBM Carbon Design System — *AI Design Guidelines*
- Salesforce Lightning Design System — *Einstein patterns*
- Microsoft Fluent UI — *Copilot grounding card patterns*
- SAP Fiori Design Guidelines — *Object Page, Worklist, Approval Flow*
- AWS Cloudscape Design System — *Progressive Operations*
- Atlassian Design System — *Jira intelligence summaries*
- Trimble Modus Design System — implementation target
