# MathMagics Family Pilot Runbook

Status: readiness protocol only. Real household evidence begins only after approved Production activation and successful production smoke verification.

## Purpose

Run a real multi-week, single-household pilot on the existing P2/P3 curriculum without changing learning authority or manufacturing evidence. The pilot should determine whether families can use the existing loop and understand what was learned, mastered, recently unstable, still needs correction, and should be taught next.

The pilot is not a curriculum-expansion exercise, an analytics build, or a reason to tune policy from isolated anecdotes.

## Activation prerequisite

Do not start real pilot evidence collection until all of the following are true:

- the exact Production application SHA is recorded;
- the deployed adaptation policy version is recorded, currently `adaptive-policy-v1` unless a reviewed release changes it;
- Production Neon is separately configured in Singapore;
- migrations `0000`–`0004` have been explicitly approved and applied to Production;
- the exact SHA has been deployed;
- production smoke verification has passed for auth, PilotReview, next lesson, student loop and parent view.

Production migration/deployment remains behind the explicit Human Owner gate. This runbook does not grant that approval.

## Pilot session sequence

Use this sequence for every real learning session:

1. Confirm deployed SHA and adaptation policy version.
2. Student follows the Pilot Shell next lesson.
3. Parent records major friction/comprehension notes privately.
4. Read PilotReview at session end.
5. Classify incidents P0/P1/P2/P3.
6. Do not change policy from one anecdote.

Do not manufacture wrong answers, recurrence, correction, starvation-guard behavior, KEEP, or SUPERSEDE decisions merely to exercise a path. Record only paths that occur naturally.

## Before each session

Record privately or in the weekly review:

- date/time;
- deployed application SHA;
- adaptation policy version;
- expected student;
- whether this is the first real session on a new release.

Then confirm:

- household authentication succeeds;
- the known pilot student is available;
- `/api/pilot/review` loads for that student;
- `/api/learning/next` returns either a bounded next lesson or an intentional empty result;
- Production and non-production database credentials remain separated;
- no migration command is executed by application startup.

If any identity, environment, or canonical-data boundary is uncertain, do not begin the session.

## During the session

The student should use the existing Pilot Shell as the normal path:

`next lesson → start → learn → practice/homework when naturally applicable → correction when projected → complete/skip → next`

Operator rules:

- do not manually set Mastery, Readiness, Performance, Strategy state or Mistake state;
- do not edit canonical facts to make the observed state look correct;
- do not reveal answer keys, `AnswerSpec`, solution outlines or internal adaptive ranking;
- do not force an incorrect answer, recurrence or lesson supersession for coverage;
- do not bypass a normal product failure with a hidden manual data workaround;
- ordinary family preference may be noted, but should not silently mutate policy.

## Parent observation

The parent's qualitative journal remains private and is not committed verbatim.

Capture concise observations such as:

- could the student determine what to do next without operator explanation?
- could the parent understand what was learned and what still needs support?
- was a next-lesson change understandable from the displayed rationale?
- did any wording, upload, retry, correction or navigation step cause abandonment or require intervention?
- did the system state materially disagree with observed learning reality?

Do not record unnecessary child/household PII.

## End-of-session review

Open the Parent PilotReview and check whether the canonical projections can reconstruct:

- what was learned or attempted;
- what is mastered;
- what is recently unstable;
- what still needs correction;
- what Strategy evidence exists;
- what lesson is next and why;
- any KEEP/SUPERSEDE decision that naturally occurred.

Record only the relevant de-identified facts in the weekly review. If a correction, recurrence or adaptive branch did not occur, mark it **not observed**, not **validated**.

## Incident classification

### P0 — Stop

Examples:

- canonical fact corruption;
- wrong-environment or destructive migration;
- credential exposure;
- auth bypass;
- wrong-student data;
- answer-key/private-reasoning exposure;
- unsafe adaptation that violates authority rules.

Response: stop new learning writes, preserve evidence/logs, and use a separately reviewed repair path. Never repair the appearance of state by manually rewriting canonical facts.

### P1 — Session blocker

Examples:

- student cannot complete the intended lesson/practice/homework/correction loop;
- Parent PilotReview cannot be reconstructed;
- a required pilot API consistently fails.

Response: stop the affected session, preserve the failing request/fact context, and fix before the next real session.

### P2 — Material friction

Examples:

- confusing copy;
- recoverable upload/retry friction;
- technically correct rationale that the family cannot understand;
- repeated workaround needed to continue.

Response: record for weekly review. Fix only when repeated impact or a clear bounded product defect justifies it.

### P3 — Cosmetic/minor

Examples:

- spacing;
- non-blocking wording polish;
- small visual inconsistencies.

Response: record if useful and defer. Do not interrupt the pilot for cosmetic cleanup.

## Change control during the pilot

For every pilot release/change point, record:

```text
old SHA / policy version
change reason
new SHA / policy version
verification evidence
first real session on new release
```

Rules:

- a material policy change splits evidence into before/after windows;
- policy changes require evidence-backed justification and relevant regression tests;
- curriculum corrections must be version-controlled and attributable to a specific content/source defect;
- do not tune mastery thresholds, performance thresholds, starvation rules, MistakePriority or adaptation ranking from one anecdote;
- bounded P0/P1 defects may be fixed, but unrelated expansion waits for Phase 9.

## Weekly review

Complete `docs/pilot/family-pilot-weekly-review-template.md` once per pilot week using only real observations.

Keep Coverage, Mastery, Performance and Strategy separate. Do not create a combined learning score or convert qualitative notes into a synthetic metric.

## Evidence integrity and privacy

Repository evidence must be de-identified.

Do not commit:

- child or household names;
- raw homework images;
- private journal text;
- credentials or database URLs;
- unnecessary PII;
- invented sessions or synthetic pilot outcomes.

The final `family-pilot-evidence-report.md` is created only after real multi-week use provides sufficient evidence. Tests and demonstration data are verification evidence, not family-pilot evidence.

## Phase 9 decision gate

Do not preselect Phase 9. At closeout, material findings are classified as:

- `KEEP`
- `FIX`
- `ADJUST POLICY`
- `EXPAND CURRICULUM`
- `EXPAND PRODUCT`
- `MORE EVIDENCE`

The primary Phase 9 path must follow the strongest observed bottleneck. If the pilot evidence does not support a conclusion, keep Phase 8 open as `MORE EVIDENCE`.
