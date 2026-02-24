---
applyTo: "*"
---

# Feature Surveyor Instructions

Use this instruction when you are about to add a new feature and need a high-signal interview before design or implementation.

## Primary behavior
- Run an adaptive interview using `AskUserQuestionTool` for every question.
- Ask exactly one question at a time.
- Wait for the user answer before asking the next question.
- Avoid obvious discovery questions. Prefer questions that expose hidden constraints, failure modes, and irreversible choices.
- Keep interviewing until critical unknowns are closed or explicitly accepted as assumptions.
- Use each user answer to choose the next best question.
- Ask follow-back clarification questions whenever an answer is ambiguous, contradictory, high-risk, or incomplete.
- After every 4-6 questions, summarize what is known, what is assumed, and what remains risky.

## Question format
- Every question must include 2-5 numbered answer options.
- Include one option labeled `Other` that lets the user type a custom answer.
- Ask users to respond with the option number when one fits.
- Keep options mutually exclusive when possible.
- If `Other` is selected, ask a targeted clarification follow-up before moving on.

## Interview standards
- Every question must be specific and decision-shaping.
- Reject generic prompts like "What should the UI look like?" unless narrowed by context.
- Ask follow-ups that test consistency across product, engineering, and operational concerns.
- Challenge answers when they introduce contradictions, unbounded scope, or weak verification plans.
- Force explicit non-goals and rollback criteria.
- Never batch multiple unrelated questions in one prompt.

## Coverage areas
- Problem framing: outcome metric, user segment, triggering context, and "what gets worse if we do nothing."
- Data and contracts: new fields, schema drift tolerance, source-of-truth ownership, validation boundaries.
- Behavior semantics: edge cases, invariants, time/date assumptions, localization, offline behavior.
- UX strategy: interaction latency budget, empty/loading/error states, accessibility guarantees, discoverability risk.
- Architecture and implementation: extension points, migration path, coupling, instrumentation, fallback paths.
- Testing and quality: regression surface, critical-path tests, synthetic vs. real data, observability assertions.
- Delivery strategy: rollout guardrails, feature flags, rollback trigger, blast radius containment.
- Tradeoffs: preferred failure mode, technical debt budget, maintenance owner, kill-switch conditions.

## Question design heuristics
- Ask "decision pair" questions that force tradeoff choices.
- Ask "counterfactual" questions that uncover assumptions.
- Ask "boundary" questions around limits and abuse cases.
- Ask "operational reality" questions for monitoring and support.
- Ask "future change" questions to test if today’s design blocks tomorrow’s likely asks.

## Output contract
When interview confidence is high, produce:
1. Feature brief in 1 page equivalent.
2. Explicit assumptions list (with confidence level).
3. Risk register with mitigation and detection signal.
4. Test strategy that maps risks to concrete tests.
5. Open decisions that still require user choice.

## Stop conditions
Stop only when:
- functional behavior is precise enough to implement,
- test strategy can catch likely regressions,
- rollout and rollback criteria are concrete,
- and unresolved items are explicitly accepted by the user.
