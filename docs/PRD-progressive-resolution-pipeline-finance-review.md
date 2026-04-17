# Finance & Freight-Audit Review — Progressive Resolution Pipeline PRD

**Reviewer persona:** Freight audit & tax compliance lead · multinational shipper · 30+ years across EU operations (pre-SEPA, through EU enlargement, Brexit, OSS/IOSS, e-invoicing)
**Document reviewed:** [`docs/PRD-progressive-resolution-pipeline.md`](./PRD-progressive-resolution-pipeline.md)
**Review type:** Fit-for-purpose assessment for freight audit, vendor master governance, and VAT compliance workflows
**Date:** 2026-04-17

---

## 1 · Bottom line up front

This is **a useful tool**, but the PRD describes it as a data-quality feature. From where I sit, it is a **vendor-master compliance control** and should be positioned as such. The distinction matters because it changes who owns it, who signs off on its output, how long we retain its artifacts, and which internal control framework it sits under.

If I were setting up freight audit at a new shipper tomorrow, I would want this running against our carrier master **before** the first invoice is processed, and again on a quarterly cadence thereafter. Wrong or expired carrier VATs on freight invoices are the kind of issue that costs real money (disallowed input VAT, re-opened tax returns, tax inspector findings) and is trivially preventable with the right plumbing.

The PRD is aware of *most* of the problem but speaks about it in product/UX vocabulary rather than finance vocabulary. **Translating the framing fixes 60% of the gaps.** The other 40% are genuine missing capabilities listed below.

---

## 2 · Where does this actually live in a freight audit workflow?

This is the single most important question the PRD doesn't answer. In a real shipper's operation, carrier VAT validation is not one thing — it happens at three distinct moments, with three different controls and three different approvers:

| Moment | Trigger | Who owns it | Compliance concern |
|---|---|---|---|
| **Carrier onboarding** | New vendor created in ERP (SAP LFA1, Oracle, D365) | AP / vendor master team | Vendor master integrity; ensuring first invoice can be booked |
| **Periodic re-validation** | Quarterly or semi-annual sweep | Tax / Indirect tax team | VAT-ID deregistrations, carrier M&A, address changes; avoiding stale deductions |
| **Invoice-time check** | Freight invoice receipt | Freight audit (in-house or FAP provider: CTSI, Trax, A3, etc.) | Reverse charge applicability per invoice line; Intrastat / ESL / SAF-T reporting accuracy |

The PRD currently describes the **periodic re-validation** mode well. It does not say anything about **onboarding** (where it would need a synchronous, single-record path) or **invoice-time** (where it would need TMS / freight-audit-provider integration). Without that, this is a useful back-office tool, not a compliance control.

**Recommendation:** add a section specifying which of these three moments the feature is built for in v1, and which are roadmap. Then size integrations accordingly.

---

## 3 · What the PRD gets right, in finance terms

- **Non-EU bucket separated from Unresolved.** Correct. VIES only covers EU-27 intra-community VAT IDs; GB is HMRC (post-Brexit); CH, NO, TR, UA, RU, BY are entirely outside this regime. Lumping them in with "Unresolved" would produce a meaningless compliance metric. The PRD handles this cleanly.
- **VIES / HMRC as authoritative source.** Correct. These are the only legally defensible confirmation sources for reverse-charge determination under the EU VAT Directive (2006/112/EC) and post-Brexit UK rules. Any tax inspector or Big-Four auditor will accept a VIES response; no other source qualifies in the same way.
- **"To be verified" bucket for name mismatches.** This is the single most valuable output for finance. A VAT that is *valid and registered* but returns a **different legal entity name** is the textbook signature of a wrong carrier VAT in the vendor master — and that is the exact scenario that produces disallowed input VAT on audit. The pipeline catches this correctly (e.g., CMA CGM Polska with a GB VAT belonging to MacAndrews; GEFCO UK resolving to Stellantis UK).
- **Evidence retained as `notes[]`.** Essential. EU tax retention is 10 years in some jurisdictions (Germany §147 AO), 7 in others, 5 minimum baseline. Having the *reasoning* attached to each record means the audit defence is self-contained — we can produce evidence years later without re-running anything.
- **Confidence bucket for `Likely correct`.** Correct in spirit. It maps to what tax people call "reasonable diligence" — we looked, we verified with two sources (web + authoritative registry), we documented. That's the standard, and the bucket captures it.

---

## 4 · Compliance & audit-defensibility gaps

### 4.1 The retention policy is not specified

Intermediate NDJSON files, reasoning notes, web-search evidence — where do these live, and for how long?

- **Tax retention:** 10 years (DE), 8 years (NL), 7 years (UK, IE), 5 years (most others). **Longest applicable period wins** for a multinational.
- **GDPR erasure requirements** may conflict with tax retention for VATs linked to sole proprietors (common in DE, PL, IT).
- **SOX-listed shippers** require controls-evidence retention of 7 years minimum.

The PRD says "every AI-driven verdict must carry a human-readable justification" (R4) — good — but says nothing about **where the justification is stored, in what format, with what retention, and who has access**. That is the actual compliance requirement. Without a retention/access spec, this feature cannot be deployed in a controlled environment.

### 4.2 Four-Eyes Principle / segregation of duties is absent

For any vendor master change that affects payment, most EU shippers require two different people to approve. The PRD currently implies a single reviewer resolves the escalation inbox. In practice:

- The reviewer who *proposes* a VAT correction (operational)
- The approver who *confirms the ERP write-back* (tax or AP supervisor)

These cannot be the same person, and the audit trail must reflect both. This is a day-one requirement, not a Phase-2 addition, if the feature writes back to a vendor master.

### 4.3 No distinction between "VAT valid" and "VAT valid for the service we're invoicing"

The PRD treats `registered: "Yes"` as the end of the question. It is not. A carrier may have a **valid domestic VAT** but not be **registered for intra-EU services** (the rarer case, but it exists for small national carriers expanding cross-border). The practical implication: VIES response `Yes` is sufficient for our reverse-charge determination, but it does not tell us whether the carrier should be charging us VAT at all in domestic invoicing scenarios.

For a freight-audit application, this needs a field:
- `vies_valid_for_intracommunity` (authoritative yes/no)
- `reverse_charge_applicable` (our determination based on place-of-supply rules, per Article 44 of the VAT Directive)

The pipeline as built answers the first; the second requires context it doesn't collect (our entity, their entity, service type).

### 4.4 No cadence for re-validation

A VAT-ID valid today may be invalid in six months (deregistration, bankruptcy, merger-absorption). VIES confirms a specific moment in time, nothing more. Tax inspectors know this — they ask "when did you last confirm this VAT?" and expect an answer measured in months, not years.

The PRD's "stale-record audit" use case (§3 of the PRD) hints at this but doesn't specify the cadence or the trigger. **Recommended default: quarterly full sweep, plus a re-check 48 hours before any first-time payment to a carrier that has been inactive for >90 days.**

### 4.5 Data quality as a portfolio KPI is missing

Finance doesn't care about a single carrier; we care about the **health of the whole carrier master**. The pipeline should surface aggregate KPIs such as:

- `% of active carriers with Confirmed status` (target: >95%)
- `% of spend (€) covered by Confirmed/Likely correct carriers` (weighted matters more than count — long-tail carriers are less risky)
- `# of Mismatch verdicts` (this is the compliance exposure metric — each one is a potential disallowed input-VAT event)
- `Median age of last successful validation` (freshness indicator)

The PRD gives us per-row verdicts but no dashboard-level summaries. For governance, that's the wrong abstraction level.

### 4.6 "Non-EU" is too coarse

Non-EU is not a single regime. From a shipper accounting perspective:

| Region | Tax ID system | Validation source | Invoice treatment |
|---|---|---|---|
| GB | VAT (HMRC) | HMRC API | Post-Brexit: import VAT + postponed accounting |
| CH | UID / MWST | zefix.ch / BFS | Outside EU VAT; no reverse charge; CH-VAT if registered |
| NO | Org number | Brønnøysund / Skatteetaten | Outside EU; NO-VAT rules apply |
| TR | VKN (vergi kimlik no) | GİB (limited public API) | Outside EU; TR-KDV rules apply |
| UA, RU, BY | National tax ID | National registries | Outside EU; sanctions checks apply for RU/BY |

Treating these as one bucket hides the difference between "VAT-registered in UK, cleared HMRC, we're good" and "Russian tax ID, sanctions-screened, pay via compliant counterparty only". **The PRD should at minimum separate GB (still validatable), CH (validatable via Zefix), and the sanctions-relevant jurisdictions (RU, BY) from the rest.**

---

## 5 · Missing functionality a finance user would expect on day one

### 5.1 Write-back to the vendor master (ERP)

The CSV output is a file. A file is not a control. A control is: the pipeline *proposes*, an approver *confirms*, and the vendor master in SAP/Oracle/D365 is **updated via a governed interface** (IDoc, OData, or API) with an audit log of who approved what when. Without this, every improvement is re-discovered next quarter because the ERP never learned.

### 5.2 Integration with the TMS (Transporeon, CargoWise, MercuryGate, Oracle TMS)

The source data for this pipeline came from a Transporeon export. In a real deployment the loop would be:
1. TMS carrier master is the source
2. Pipeline validates
3. Corrections flow back into TMS carrier profile
4. Corrected carrier profile feeds the freight-audit provider's matching
5. Invoice-level audit uses the clean carrier record

The PRD stops at step 2.

### 5.3 Integration with the freight-audit provider

Most mid-to-large shippers outsource invoice-level freight audit to providers like CTSI Global, Trax, A3 Freight Payment, RateLinx, or nShift. These providers already maintain carrier profiles; the pipeline's output should be exportable to their intake format (each provider has one). Without this, the shipper maintains the same carrier data in three places.

### 5.4 Sanctions screening

Any carrier with RU, BY, or Iran-adjacent jurisdictions needs **sanctions screening** (EU consolidated list, OFAC SDN, UK OFSI). This is adjacent to VAT validation but runs on the same master data. The pipeline should either do it or cleanly hand off to a sanctions-screening step. Ignoring it creates exposure the tax team cannot mitigate alone.

### 5.5 M&A event annotation on "Partial" verdicts

The pipeline correctly identifies GEFCO → CEVA, Norbert Dentressangle → XPO → GXO, Panalpina → DSV, Ekol → DFDS. Finance cares about the **effective date** of these events, because that determines:

- When the vendor master *should* have been updated
- Whether invoices between the M&A date and the master update are at risk of being addressed to a now-defunct entity (and therefore potentially invalid for input VAT)

The `notes[]` currently say "acquisition 2022" — it should say "CMA CGM closed the GEFCO acquisition on 2022-04-29" so the finance team can bucket pre- and post-date invoices for review.

### 5.6 Currency-weighted impact view

Two carriers with Mismatch verdicts are not equal. One does €5M of business with us; the other €5k. The escalation queue should be sortable by **spend at risk**, not just row-count. Without spend data joined in, the reviewer will process them in ID order and waste effort.

---

## 6 · European regulatory edge cases the PRD doesn't address

1. **VIES returning "N/A" for name/address.** DE and ES explicitly do not return company name/address through VIES (they return a confirmation flag only). The PRD's name-matching step silently fails for these two — which are the two largest EU economies. Needs a documented fallback (Handelsregister for DE, Registro Mercantil for ES).

2. **Hungarian VAT groups.** HU has explicit VAT-group registration; VIES returns a group placeholder, not the operating entity. `Waberer's International Zrt.` hit this in the reference run. The correct finance interpretation is "group VAT, valid, individual entity must be identified separately from NAV." PRD doesn't surface this distinction.

3. **Italian "split payment" regime.** For public-sector counterparties in Italy, split payment applies. Not typical for shipper-carrier but worth noting if the tool generalises to vendor types beyond carriers.

4. **Polish JPK_VAT and SAF-T requirements.** Poland has mandatory detailed VAT reporting; a wrong carrier NIP on an invoice produces a JPK mismatch that the tax office *will* flag. High-frequency issue — PL has more carriers in the reference dataset than any other country, so this is the highest-volume compliance exposure in the output.

5. **French numéro TVA vs SIRET/SIREN.** The SIRET is the French business ID; the TVA is the VAT ID. They are linked but not the same. Web-discovery must not confuse them; the `discover-vat` skill's fallback `societe.com` returns SIREN primarily.

6. **Greek VAT prefix `EL`.** Greece uses `EL`, not `GR`, in the VIES system. PRD handles this (I checked the reference implementation), but it is the single most common source of "valid VAT, rejected by VIES" errors.

7. **E-invoicing mandates (2026+).** IT (SdI), PL (KSeF from 2026), FR (from 2026–27), ES (Verifactu), DE (B2B e-invoicing phase-in). These will make VAT-ID validity a **real-time blocker** at invoice issuance, not a back-office reconciliation. The pipeline should be designed with this in mind — its future home is invoice-time, not quarterly.

8. **OSS / IOSS** for e-commerce shippers — the pipeline doesn't attempt to identify OSS-registered VAT IDs, which behave differently. Probably out of scope for freight, but worth flagging.

---

## 7 · Cost / benefit — where's the ROI?

Finance case, roughly, for a mid-size EU shipper with ~500 active carriers and €100M freight spend:

**Costs avoided (annual, order of magnitude):**
- Disallowed input VAT from wrong carrier VAT: typically 0.1–0.5% of freight spend on EU cross-border = **€100k–500k per year** in direct P&L exposure before this control
- Tax-inspector penalty risk: one-off €10k–50k per finding, multiple findings possible
- External auditor "management letter" findings on vendor-master control weaknesses: no direct €, but drives remediation cost

**Operational savings:**
- Carrier master hygiene today is typically 0.5–1.0 FTE in a back-office team, manually, reactively. This pipeline can reduce that by **50–70%** if properly integrated (§5.1–5.3).

**Cost of running:**
- VIES queries: free
- HMRC queries: free
- Web search / LLM reasoning: real but modest. For the reference run (258 rows) approx. <€5 of AI cost
- For a 500-carrier quarterly sweep: <€30/quarter in AI cost, assuming caching of stable results
- Operational: reviewer time on the escalation inbox

**Rough payback:** first quarter of use on a single P&L-material Mismatch catch. I would expect 2–3 of those per quarter in a typical 500-carrier master.

The PRD's success metrics (§8 of the PRD) focus on throughput and override ratio. **Add two money metrics: (a) number of Mismatch verdicts resolved before invoice payment, (b) estimated P&L exposure prevented (Mismatch count × average invoice value).** Those are the numbers a CFO will ask about.

---

## 8 · Integration reality check

For this to be a deployable control in a real shipper, three integrations are needed that the PRD doesn't specify:

| Integration | Why | Typical interface |
|---|---|---|
| **ERP vendor master (SAP LFA1 / Oracle / D365)** | Propose corrections with approval workflow; write back on confirmation | IDoc / OData / REST; change documents (CDPOS / CDHDR in SAP) for audit trail |
| **TMS carrier master (Transporeon, CargoWise, MercuryGate)** | Source of truth for operational carrier data | Typically CSV or REST per vendor |
| **Freight audit provider** (if outsourced) | Feed clean carrier data into invoice-level audit matching | Provider-specific intake format; most accept CSV with defined schema |

Each of these is real work. A shipper will not adopt this feature without at least the ERP integration.

---

## 9 · Prioritized recommendations (€/compliance impact)

| # | Recommendation | € impact | Compliance impact | When |
|---|---|---|---|---|
| 1 | Specify artefact retention policy (intermediate NDJSON, notes, web evidence) aligned with longest applicable tax retention | — | 🔥 Blocking for deployment | Phase 1 |
| 2 | Add Four-Eyes / segregation-of-duties approval flow for any write-back to master data | — | 🔥 Blocking for SOX/SOC controls | Phase 1 |
| 3 | Split the "Non-EU" bucket into GB (HMRC), CH (Zefix), Other-validatable, Other-manual, Sanctioned | Medium | High | Phase 1 |
| 4 | Add spend-weighted sort to the escalation inbox (€ at risk per row) | High | High | Phase 1 |
| 5 | Specify revalidation cadence and pre-payment re-check rule | Medium | High | Phase 1 |
| 6 | Add VIES `N/A` fallback for DE and ES using national registries (Handelsregister, Registro Mercantil) | Medium | Medium | Phase 1 |
| 7 | Specify ERP write-back integration (minimum: SAP BAPI/OData) with change-document audit trail | High | High | Phase 2 |
| 8 | Add sanctions screening step (EU/OFAC/OFSI) at the same cadence | Low (probability) but high (per event) | Blocking for RU/BY exposure | Phase 2 |
| 9 | Record effective date of M&A events on Partial verdicts, and flag pre-date invoices for review | Medium | Medium | Phase 2 |
| 10 | Prepare for 2026+ e-invoicing mandates — position the pipeline as a real-time pre-issuance check, not a quarterly back-office sweep | High (strategic) | High | Roadmap |

---

## 10 · Verdict

**Adopt — with conditions.** This is the most credible first pass at an agentic carrier-master compliance control I've seen in this problem space. The reference implementation surfaces the right signals: legal-entity mismatches, post-M&A rebrands, missing VATs on long-tail carriers. Those are the exact failure modes that cost money on audit.

However, in its current form the PRD describes a **useful data-cleanup feature**. To become a **deployable compliance control**, it needs §4.1 (retention), §4.2 (four-eyes), §5.1 (ERP write-back), and at least §4.4 (revalidation cadence). Without those, it is a productivity tool for the back-office team; it does not yet satisfy tax or internal-audit control requirements.

Two things that would close the deal for me specifically:

1. A **spend-weighted escalation inbox**. If I have 54 Unresolved rows and two of them are our top-10 carriers by spend, I need to see those two first. Row count is the wrong unit of work.

2. A **signed audit report per run**, with the full evidence chain (pipeline inputs, API responses, reasoning, verdicts, approver sign-off), exportable as a PDF or JSON attestation. That document is what I hand to the external auditor when they ask about our carrier-VAT control. It's also what protects the shipper in a tax inspection.

Everything else on the list is improvement. Those two are the difference between a nice-to-have and a control we can defend.

---

## 11 · One question I'd want answered before scoping Phase 2

> **What's the intended governance model — does this feature's output update the vendor master directly, or does it produce a proposal that the existing master-data-governance workflow (MDG in SAP, or equivalent) consumes?**

If the former, it's a substantial build with change-management and audit-trail implications across the ERP. If the latter, it's much lighter and faster to deploy, at the cost of a manual handoff step. Both are defensible. **Picking one determines the integration scope, the approval flow, and the answer to every compliance question a tax or internal-audit team will ask.**

---

## References

- EU Council Directive 2006/112/EC — the principal EU VAT directive
- Council Regulation (EU) No 904/2010 — administrative cooperation on VAT (legal basis for VIES)
- UK HMRC — *VAT Notice 700/1* and post-Brexit VAT rules (Jan 2021 onwards)
- German §147 AO (Abgabenordnung) — tax record retention (10 years)
- Polish JPK_VAT / SAF-T requirements
- Italian SdI (Sistema di Interscambio) — e-invoicing mandate
- French VAT ID (TVA) vs business ID (SIREN/SIRET) — INSEE
- EU consolidated sanctions list; OFAC SDN; UK OFSI consolidated list
- SOX §404 internal controls over financial reporting (US-listed shippers)
- IFRS 15 and IAS 37 — relevant for freight accrual and disputed-invoice treatment (context, not directly applicable)
