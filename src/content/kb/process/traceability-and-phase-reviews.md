---
title: 'Phase reviews and end-to-end traceability'
category: process
summary: 'Pause for review at the end of each spec phase; keep every requirement traceable to a design section, a task, and a test — both ways.'
principle: 'Pause for review at the end of each phase; keep requirement ↔ design section ↔ task ↔ test traceable both ways; amend the spec (not the code) when reality diverges.'
severity: strong
tags: [process, spec-driven, traceability, reviews, documentation]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'phase reviews; mandatory traceability; amend spec not code; watch drift'
related:
  - process/spec-driven-ears-not-user-stories
  - process/incremental-epics-stay-green
order: 2
updated: 2026-06-10
---

Traceability is the property that lets you start from a failing test and walk
backwards to the requirement that demanded it, or start from a requirement and walk
forwards to the test that proves it is satisfied. Without traceability you cannot tell
whether an implementation is complete, whether a change is safe, or whether a test
failure means the code is wrong or the spec is wrong. The spec-driven workflow
(formalised in the engineering standard, 2026-06-02) treats traceability as mandatory, not optional documentation.

Phase reviews are the enforcement mechanism. A review is a deliberate pause at the
boundary between phases — requirements → design, design → tasks, tasks → implementation
— that checks completeness and correctness before the next phase begins. Fixing a
spec is cheap. Fixing code that was built on a wrong spec is expensive.

## Why this matters

The cost asymmetry is not abstract. A requirements error discovered during code review
means: the implementation is wrong, the tests are wrong (they validated the wrong
behaviour), the design decisions that depended on the requirement may be wrong, and
the PR needs to be unwound before the spec can be fixed and the cycle restarted. The
same error caught at the requirements-to-design review costs a paragraph edit.

The failure mode that traceability guards against is **spec drift**: the spec says one
thing, the code gradually diverges, nobody updates the spec, and after a few
increments nobody is certain what the system is supposed to do. The spec becomes
decorative. The canonical fix is not to write better specs once — it is to maintain
the discipline that the spec is authoritative and that divergence triggers a spec
amendment, not a silent code accommodation.

A related failure is **hallucinated scope**: an implementation adds behaviour that was
never in the spec, often with good intentions ("while I was here I also…"). This is
invisible until it breaks something or until a code review catches a feature with no
requirement behind it.

## How to apply

### Phase review checkpoints

At the end of each phase, before proceeding to the next, answer these questions:

**After requirements.md:**
- Does every capability have a named group with 4–8 EARS items?
- Is every item independently testable? (Can you write the test from the criterion alone?)
- Are locked decisions explicitly listed and separated from functional requirements?
- Is the scope boundary explicit — what is out of scope, and why?

**After design.md:**
- Does every EARS criterion appear in at least one design section?
- Does every design section reference the requirement(s) it satisfies?
- Are trade-offs recorded where alternatives were considered?
- Does the design introduce no behaviour not required by the spec?

**After tasks.md:**
- Does every task reference the design section and requirement(s) it implements?
- Is every requirement covered by at least one task?
- Are tasks ordered so that each one is buildable and testable in isolation?

Only pass the checkpoint when all questions have affirmative answers. If a question
cannot be answered affirmatively, fix the artifact — do not proceed.

### The traceability chain

The full chain for one requirement looks like this:

```
requirements.md
  REQ-4: WHEN a message has failed delivery 10 times THE SYSTEM SHALL
         move it to the dead-letter table and emit a metric.
         ↓
design.md
  ## Dead-letter handling (satisfies REQ-4)
  After 10 consecutive delivery failures the relay writes the message row
  to `outbox_dead_letter` and calls `metrics.increment('dlq.moved')`. …
         ↓
tasks.md
  TASK-7: Implement dead-letter promotion (REQ-4, design §Dead-letter handling)
          - Add `failure_count` column migration
          - Add promotion logic in OutboxRelay.attemptDelivery
          - Add metric emission
          - Write unit test for promotion threshold
         ↓
src/outbox/relay.ts  (references TASK-7 in commit message)
src/outbox/relay.test.ts
  describe('dead-letter promotion', () => {
    // REQ-4: 10 consecutive failures → DLQ + metric
    it('promotes after 10 failures', …);
    it('emits dlq.moved metric on promotion', …);
  });
```

The backward direction works the same way: given a test, you can find the task, the
design section, and the requirement that demanded it.

### When the spec is wrong

Implementation often reveals spec errors. The correct response is a fixed sequence:

1. **Stop.** Do not work around the error in the code.
2. **Document the finding.** Write a short note: what the spec says, what reality
   requires, why they differ.
3. **Amend the spec.** Edit `requirements.md` (or `design.md` if it is a design
   error) with the correction. Record the reasoning inline or in a revision history section
   of the spec file.
4. **Re-review.** The amended section passes through the same checkpoint questions as
   the original. If the amendment cascades (a requirement change invalidates design
   decisions), those sections are updated too.
5. **Continue.** Only after the spec is correct does the implementation resume.

This is not bureaucracy — it is the minimum work to keep the spec authoritative. A
spec that is amended once and re-reviewed is still a source of truth. A spec that was
silently contradicted by code is no longer a spec; it is a historical document.

### Versioning and location

Specs live next to the code, in the repository, in a `docs/` or `specs/` directory
at the relevant scope. They are versioned with the code — a spec amendment and the
code change it authorises go in the same PR, or in adjacent commits with a clear
reference. A spec that exists in a wiki or a separate system and is not versioned with
the code will drift.

### Code review as spec-adherence check

Every PR review includes a spec-adherence pass:

- Does the implementation match the spec, no more and no less?
- Is every task in `tasks.md` that this PR claims to complete actually complete?
- Does any new behaviour have a requirement behind it?
- If the spec was amended as part of this PR, does the amendment go through the
  checkpoint questions before the implementation is accepted?

## Anti-patterns

**Implementing past a failing checkpoint.** The checkpoint revealed that REQ-7 has no
design section. The response is not to note it and continue — it is to add the design
section and re-check before writing a line of code for REQ-7.

**Amending the spec to match the code.** The implementation diverged; instead of
understanding why and deciding what is correct, the spec is edited to say what the
code does. This is not a spec amendment — it is retroactive rationalisation. The
amendment must record the reasoning for the change, not just the change.

**Traceability as a trailing annotation.** Adding `// REQ-4` comments after the
implementation is complete is better than nothing but does not replace the forward
planning. The task must reference the requirement before the code is written, so that
the implementation is guided by the spec, not the other way around.

**Scope creep under a plausible heading.** A design section for "Dead-letter handling"
acquires a retry dashboard because "it was convenient." The dashboard has no
requirement. This is hallucinated scope. Every design element needs a requirement
reference; if the reference does not exist, either add a requirement (via the proper
channel, including a review) or remove the element.

## Enforcement

The phase-review checkpoints are enforced by the process, not by a tool. The practical
enforcement is: no PR is opened for implementation work unless `tasks.md` exists and
has passed its checkpoint. A PR that adds features with no corresponding tasks entry
is incomplete by definition.

The spec drift check in code review is the last safety net. If a reviewer finds
behaviour in the PR that has no requirement behind it, the PR is not merged until
either the requirement is added (with a review) or the behaviour is removed.
