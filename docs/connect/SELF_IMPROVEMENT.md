# Engineering improvement playbook

Use this playbook for Petey Plant implementation, review, and handoffs. Lauren Tan's approach informs the order. Put important rules in the code, make repeat failures detectable, and inspect what the user actually sees. [All Code Is Slop (Except Mine), AI Engineer](https://ai.engineer/talks/O_zcc6Xl12g-all-code-is-slop-except-mine)

## Before editing

1. Identify the user action and expected result in the [verification map](ENGINEERING_INTEGRITY.md#journey-and-release-verification). Check the [work package](MASTER_PLAN.md#four-week-execution-plan) and [current handoff](../../ANTIGRAVITY_HANDOFF.md) for dependencies and open gates.
2. Trace the result to its [source of truth](ENGINEERING_INTEGRITY.md#authority-contracts). Capture the smallest reliable reproduction and its revision. For UI behavior, drive the normal controls in the running app. For a care decision, include the saved setup, inputs, and observation time.
3. Agree on acceptance evidence in a delegated brief. Include the paths the agent owns, adjacent files or local work to preserve, fixture or device requirements, and the command or journey that will verify the result. Have the integration owner check shared behavior after merging the pieces.

## Make the fix durable

- Encode a product rule at the boundary that owns it. Garden uses the backend's confirmed plant and care decisions. Lens suggestions require owner confirmation, and the release gate belongs to the model qualification workflow.
- For a repeated failure, fix the shared cause where practical and add the smallest check that detects it. Exercise that check against the original failure. Prefer the existing unit, API, browser, or asset suite. Give failures a message that identifies the broken behavior.
- Verify what can only be seen at runtime through the normal entry point. For example, the Lens preview test rotates a real companion, waits for rendering, and checks the restored frame. Reintroducing the old portrait bug changed 21.5% of the pixels against a 0.5% threshold. [Recorded cross-stack review](../../PLANS.md#2026-11-28-project-connect--cross-stack-review)
- Label fixture inputs and report skipped checks. Software tests can establish behavior under those inputs. Lens accuracy, a watering dose, phone performance, and botanical art approval each need their own evidence. [Release verification](ENGINEERING_INTEGRITY.md#journey-and-release-verification)

## Carry the lesson forward

Record the user impact, root cause, safeguard, revision, exact commands and results in the existing [milestone log](../../PLANS.md). Link the runnable regression from the verification map if it adds or changes journey coverage. For unfinished work, put the next reproducible step, its owner or dependency, and the completion evidence in the [handoff](../../ANTIGRAVITY_HANDOFF.md).

Use a single durable home for each lesson. When an API or test now enforces a rule, link to it and retire obsolete workarounds and duplicate guidance in the same area. Update root [agent instructions](../../AGENTS.md) when a repeatable lesson changes how all contributors work.
