# Blocker Records — `github-ci`

Per [`implementation-workflow.md`](../../../implementation-workflow.md) §4.1, any `OPEN`
blocker halts every phase of this module.

---

## BLK-1 — Remote repository settings cannot be applied from the agent session   [OPEN]

**Phase:** 4   **Raised:** 2026-08-17   **Gate:** 6 (Run)
**Where:** GitHub repository settings for `faizan45640/PakCommerceAi`

**The question:** The workflow file is committed, but a workflow alone does not enforce
anything. Branch protection, required status checks, and Actions permissions live in
repository settings, which are not in the repo and cannot be set from the working tree.

**What the documents say nearest to it:** `docs/ci-cd.md` §"Branch protection
(recommended)" already asks for protection on `dev` and `main` and for CI to be a required
check. `docs/gitworkflow.md` states "Never code directly on `main`" and "Open PRs only into
`dev`" — both are conventions today, enforced by nothing.

**Options:**
- A — A repository admin applies the settings through the GitHub web UI. Cost: ~10 minutes,
  once. Serves the four-contributor invariant: a red build cannot be merged by anyone.
- B — Leave CI advisory. Cost: zero now; a member can merge a red branch into `dev` and
  the next person to pull inherits it.

**Recommendation:** A. The runbook for it is in `docs/ci-cd.md` §"Branch protection".
The `gh` CLI is now installed locally but needs an interactive `gh auth login`, which an
agent session cannot complete.

**If unanswered I will:** stop. No further phase of this module starts.

**Resolution:** _(written by a human)_

---

## BLK-2 — `npm audit` reports 8 vulnerabilities in the dependency tree   [OPEN]

**Phase:** 4   **Raised:** 2026-08-17   **Gate:** 7 (Scan)
**Where:** root `package-lock.json`

**The question:** Workflow §6 lists dependency vulnerabilities in the fast gate. Installing
the test tooling surfaced 8 advisories (1 moderate, 7 high) that predate this module. Should
CI fail on them, warn on them, or ignore them until triaged?

**What the documents say nearest to it:** Workflow §6 says the fast gate includes
`npm audit`. It does not set a severity floor. Nothing in `docs/ci-cd.md` mentions auditing.

**Options:**
- A — Add `npm audit --audit-level=high` to CI now. Cost: CI goes red immediately on
  pre-existing debt unrelated to anything a contributor pushed.
- B — Triage the 8 advisories first, then add the gate. Cost: a separate task.
- C — Add the audit as a non-blocking informational job.

**Recommendation:** B, then A. Turning a gate on against a known-red baseline teaches the
team to ignore it, which workflow §6 explicitly warns against. This module therefore ships
**no** audit gate; that is a deliberate omission, recorded here rather than left silent.

**Resolution:** _(written by a human)_
