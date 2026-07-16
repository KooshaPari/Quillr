# Quillr — Audit Remediation Plan (DAG/WBS)

> **Repo:** `kooshapari/Quillr` @ `50e4ff0`  
> **Audit baseline:** 65.7 / 100 (Grade C+) — **101 satisfied / 42 partial / 27 missing**  
> **Target:** 85+ (B+ or better)  
> **Methodology:** Parallel work packages with no cross-dependencies between phases

---

## Phase 0: Quick-win hygiene (score impact: ~8 pts)

| ID | Task | Pillars | Est. time | Depends on |
|---|---|---|---|---|
| **Q0.1** | `.gitignore` | DX-06 | 3 min | — |
| **Q0.2** | `deny.toml` (licenses + bans + sources + advisories) | SC-02..05, SEC-25 | 8 min | — |
| **Q0.3** | `cargo deny check` in CI step | SEC-06 | 5 min | Q0.2 |
| **Q0.4** | `CODE_OF_CONDUCT.md` | DOC-07 | 2 min | — |
| **Q0.5** | `.github/ISSUE_TEMPLATE/bug_report.yml` + `feature_request.yml` | CI-15 | 8 min | — |
| **Q0.6** | `.github/PULL_REQUEST_TEMPLATE.md` | CI-16 | 5 min | — |
| **Q0.7** | `clippy.toml` + `rustfmt.toml` | CQ-06, CQ-07 | 5 min | — |
| **Q0.8** | `docs/adr/` directory with per-file ADRs (extract from ADR.md) | ARCH-03, DOC-17 | 10 min | — |

**Total Phase 0:** ~46 min → ~73.5%

---

## Phase 1: Infrastructure (score impact: ~6 pts)

| ID | Task | Pillars | Est. time | Depends on |
|---|---|---|---|---|
| **Q1.1** | ARCHITECTURE.md (8+ sections) | DOC-04, ARCH-01 | 20 min | — |
| **Q1.2** | `docs/operations/` with DEPLOY.md + runbook.md | DOC-11, OPS-04 | 20 min | — |
| **Q1.3** | `docs/troubleshooting/known-issues.md` | DOC-15 | 8 min | — |
| **Q1.4** | SBOM upload step in release workflow | SC-07, SC-09 | 8 min | — |
| **Q1.5** | CI timeout + test-timeout configuration | CI-13, TEST-23 | 5 min | — |

**Total Phase 1:** ~61 min → ~79.5%

---

## Phase 2: Advanced testing (score impact: ~5 pts)

| ID | Task | Pillars | Est. time | Depends on |
|---|---|---|---|---|
| **Q2.1** | `proptest` or fuzz targets for Rust middleware | TEST-10 | 30 min | — |
| **Q2.2** | OpenSSF Scorecard workflow + badge | SEC-20 | 10 min | — |
| **Q2.3** | `vitest --coverage` threshold in CI | TEST-19 | 8 min | — |
| **Q2.4** | Acceptance tests: un-ignore at least 3 scenarios | TEST-04, TEST-05 | 20 min | — |
| **Q2.5** | Mutation testing (cargo mutants or Stryker) | TEST-18 | 30 min | — |
| **Q2.6** | Gherkin Cucumber runner in CI | TEST-07 | 15 min | Q2.4 |

**Total Phase 2:** ~113 min → ~84.5%

---

## Phase 3: Observability + release (score impact: ~4 pts)

| ID | Task | Pillars | Est. time | Depends on |
|---|---|---|---|---|
| **Q3.1** | Prometheus `/metrics` endpoint | OBS-04 | 30 min | — |
| **Q3.2** | Health/liveness endpoint | OBS-05 | 15 min | — |
| **Q3.3** | Binary release workflow (cargo build + upload) | RE-06 | 20 min | — |
| **Q3.4** | SLO / SLA definitions doc | RE-10 | 15 min | — |
| **Q3.5** | SLO-based latency tracking wiring | OBS-07 | 20 min | Q3.1 |

**Total Phase 3:** ~100 min → ~88.5%

---

## Summary

| Phase | Est. time | Score impact | Cumulative score |
|---|---|---|---|
| Baseline | — | — | 65.7% (C+) |
| Phase 0 | 46 min | +7.8% | 73.5% (B) |
| Phase 1 | 61 min | +6.0% | 79.5% (B) |
| Phase 2 | 113 min | +5.0% | 84.5% (B) |
| Phase 3 | 100 min | +4.0% | 88.5% (B+) |
| **Total** | ~5.3 hrs | **+22.8 pts** | **88.5% (B+)** |

---

## Identified strengths

- Excellent CI/CD pipeline: 10 workflows, CodeQL, Gitleaks, Trivy, TruffleHog
- Strong middleware architecture: circuit breaker, rate limiter, retry, CORS, OTel
- Dual-language library (TypeScript + Rust) with clear boundaries
- SPEC-driven development with Gherkin acceptance + FR traceability
- Good error handling: HttptoraError enum + QuillError class
- Provenance-based npm publish
- Justfile + process-compose + mise for local dev

## Identified weaknesses (prioritized)

1. **Supply chain** (SC-02..05): No cargo-deny config at all
2. **Dev experience** (DX-03, DX-04, DX-06, DX-11): No devcontainer, pre-commit hooks, gitignore, or fuzz
3. **Documentation** (DOC-04, DOC-07, DOC-11, DOC-15): No ARCHITECTURE.md, CODE_OF_CONDUCT, ops docs, or troubleshooting
4. **Testing** (TEST-04, TEST-05, TEST-07, TEST-10, TEST-18, TEST-19): Acceptance tests stubbed, no fuzz/mutation, no coverage gate
5. **Observability** (OBS-04, OBS-05): No Prometheus /metrics or health endpoint
6. **Release** (RE-06, RE-10): No binary release or SLO definitions
