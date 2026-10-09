# FriendlyFive agent instructions

## Purpose and source of truth

This repository is Wyatt Alford's FriendlyFive project for MIT 6.1040 Software Design, Fall 2026. Help Wyatt build and understand the app while meeting the course's concept design and implementation requirements.

This file combines the supplied P2 assignment and eight course background documents with project decisions visible in earlier chat summaries. It is a handoff guide, not a replacement for the submitted P1 specifications. The live repository and complete P1 documents were not inspected when this file was created on October 8, 2026. Do not assume historical plans are already implemented.

Follow the user's latest instructions. For course compliance, use the current assignment. For exact product behavior, read the current concept specifications, reactions, sketches, and journey. If these conflict with this summary, explain the conflict and reconcile it before changing behavior. Code that disagrees with the specifications is a discrepancy to investigate, not automatic authority to rewrite the design.

## Product and established decisions

FriendlyFive supports informal one-on-one bets between people who already know each other. The value is making terms and outcomes clear so friendly competition does not turn into conflict.

- Exactly two parties make an agreement.
- A stake may describe money, food, push-ups, or bragging rights. The app records the agreement and outcome. It does not process payments.
- Terms include the claim, stake, any applicable odds or multiplier, and the resolution date. Verify exact fields against the current P1 specification.
- A resolver is optional and must be agreed upon by both parties. A resolver may be one of the parties if both agree. Do not silently require an independent third person in every case.
- Evidence is optional for ordinary outcome reporting and completion. Evidence is required for a dispute.
- The P1 demonstration journey deliberately includes a disagreement resolved with a third party and ends amicably. This was chosen to demonstrate the app's value beyond a straightforward agreement.
- Early brainstorming included prediction markets and multi-person trading. The settled scope is one-on-one agreements. Do not introduce order books, tradable positions, market liquidity, wallets, escrow, or payment integrations without a new user request.

The motivating problems include friends remembering different terms and disagreeing about an outcome. Do not claim the app guarantees payment, enforces real-world obligations, or prevents every disagreement. Judge features by how they address a concrete problem in this domain.

## Historical design inventory

These names and outlines are remembered project decisions. Read the actual documents before using exact signatures, fields, guards, or transitions.

| Element | Remembered responsibility |
| --- | --- |
| Agreeing | Proposing and agreeing to terms, including versions and PENDING, ACCEPTED, REJECTED, and WITHDRAWN states |
| Reporting | Opening outcome reporting, submitting outcomes, and confirming them, with the agreed evidence rules |
| Authenticating | Establishing user identity |
| Requesting boundary | Representing incoming application requests so reactions can authorize and compose concept actions |

Previously designed screens are Create Agreement, Agreement Details, Report Outcome, Dispute Submission, and Resolver View. The reporting and dispute sketches were revised to reflect optional ordinary evidence and required dispute evidence. Treat the sketches as design input, not proof these components exist.

Do not invent a new Disputing or Resolving concept merely because those words appear in the UI. Inspect the existing decomposition and determine where the behavior belongs. If a split is justified, explain the independent purpose and update specifications and reactions together.

Historical repository reference is https://github.com/wyattalford/friendly-five. A design document folder was previously referred to as `Design-Documents`. Confirm current spelling and structure locally. P2 specifically requires design specifications in `design/`. Preserve earlier submission artifacts and establish one maintained specification source rather than leaving contradictory copies.

## Current milestone requirements

The supplied P2 Alpha (MVP) assignment is due October 13, 2026 at 11:59 PM in America/New_York. It requires a locally running app. Public deployment belongs to P3.

Required platform components are Bun, TypeScript concept implementations, MongoDB persistent storage, Vue.js, and MIT's sync-engine. Follow the provided sync-engine tutorial and installed framework documentation. Do not replace this architecture with a generic route-handler backend or another frontend framework.

P2 requires the following deliverables.

- A working MVP with a Vue frontend and sync-engine backend.
- A one-paragraph informal core user journey.
- P1 concept and reaction specifications brought into `design/` and kept consistent with implementation.
- Concept implementations with a suite of test cases for each implemented concept.
- Reactions, views, API endpoints, and response formers needed for the journey.
- An initial incremental implementation plan shorter than half a page, plus design notes showing actual progress and plan adjustments.
- A narrated screen recording of the journey, no longer than two minutes.
- A brief account of what remains for P3.

The core journey must begin with an empty database and include necessary setup. It must work through concepts, reactions, frontend, and persistent storage with necessary access controls. The UI must update without page refreshes and provide validation and informative error messages for the journey.

The narrative need not enumerate every failure case, and P2 need not implement every final feature. This does not excuse missing access control, fake persistence, or broken validation along the chosen journey. Visual polish can wait.

The supplied milestone table lists P3 on October 19, P4 on October 26, and P5 on November 2, 2026, each at 11:59 PM in America/New_York. Recheck the relevant assignment before later milestone work.

## Default MVP journey and scope

Reuse the P1 dispute journey unless Wyatt selects another. The following is an implementation outline inferred from that decision, not a recovered verbatim scenario.

1. Create the users needed for two parties and a third-party resolver through the supported setup flow.
2. One party proposes a concrete bet with clear terms and a resolver.
3. The other party accepts the same version and resolver.
4. After the relevant outcome, a party submits a report.
5. The other party disputes the report and supplies required evidence.
6. The agreed resolver reviews the information and records the permitted decision.
7. Both parties can see the final recorded outcome and the agreement ends amicably, with any real-world stake handled outside the app.

Read the actual journey to recover names, event, stake, and resolution details. Do not substitute a newly invented story into submitted work without explaining the change. Agree on what is in P2 before adding unrelated functionality.

Important unresolved details must be recovered from P1 or decided explicitly. Examples include the exact version and acceptance protocol, reporting availability relative to the resolution date, dispute representation, resolver authority and consent, evidence format, and what happens when a dispute has no designated resolver. Do not silently add timeout outcomes, automatic winners, unilateral term edits, or new resolver-selection policies.

## Concept architecture rules

- Give each concept one specific, need-focused, evaluable purpose and an understandable course of action.
- Keep concepts independent. A concept must not call another concept, read or mutate another concept's state, or assume properties of another concept's external individuals.
- Compose concepts through sync-engine reactions. Put application-specific coordination in reactions instead of burying it in concept implementations or HTTP handlers.
- Pass identities for external individuals and immutable values for data. Do not share mutable objects between concepts.
- A concept's queries access only its own state. Use the framework's documented views and queries to supply reaction conditions.
- Reactions can trigger actions, not undo an unauthorized action after it occurs. Protect domain actions behind the requesting and authorization flow.
- Bind authentication results, action completions, and responses to the particular request and relevant agreement/version. Matching only identical text or terms can mix up simultaneous requests.
- Use the typed frontend API library provided by sync-engine. Follow its generation workflow rather than maintaining a competing handwritten contract.
- Read the installed framework guidance for endpoints, formers, views, and reaction DSL syntax. Do not guess these APIs from generic TypeScript patterns.

Keep corresponding specifications with all components as required by sync-engine. A behavior change must update the specification, implementation, applicable reactions, and tests together.

## Specification rules from the course sources

A concept definition includes its name, purpose, operational principle, types, state, actions, and queries when needed. The principle is a short archetypal story showing how the purpose is fulfilled. It does not replace the full state and action definition.

Use Simple State Form for state. Preserve indentation and multiplicities. Distinguish an individually unique field from a unique combination of fields. Optional scalars may be absent, while set-valued fields use an empty set instead of `optional`. Use `seq` when order matters. Declare enumerations in types with uppercase values. Add explicit rules for constraints the notation cannot express directly.

Actions need named inputs and outputs, local preconditions, effects, and successful return behavior. Specify refusal cases when the distinction matters to callers. Unmentioned state is unchanged. Queries do not mutate state or require preconditions, and specify one, optional, or many rows, unknown-input behavior, and ordering when relevant.

The specification guide permits optional action inputs. The decomposition guide warns that unrelated optional modes can reveal incoherence. Preserve legitimate optional evidence and resolver behavior while avoiding catch-all actions with unrelated effects.

## Implementation workflow

At the start of a coding task, inspect the repository's existing instructions, README, `package.json`, lockfile, design files, design notebook, sync-engine documentation, and relevant code. Discover actual setup, generation, development, test, and build commands. Do not claim unverified scripts, ports, file paths, or package APIs exist.

Work in small steps that Wyatt can understand and evaluate. A suggested sequence is framework and database setup, identity setup, agreement creation and acceptance, outcome reporting, dispute and resolver behavior, then a complete browser walkthrough. Adjust this sequence to existing progress and record meaningful changes to the plan.

For each step, explain the behavior being added, implement the smallest coherent change, verify its outcome, and identify the next step. Keep specifications synchronized throughout. Avoid generating the whole app in one opaque pass or adding broad abstractions before they are needed.

Respect existing work and uncommitted edits. Use the repository's conventions and dependencies. Keep secrets in local environment files and out of source control. Never expose credentials in logs or documentation. Use isolated test databases and do not reset real user data.

The assignment recommends frequent commits and pushes. Follow the user's repository permissions and workflow, and report exactly what was committed or pushed. Never fabricate incremental history or notebook entries for work that did not happen.

## Validation and review

Use meaningful concept tests covering successful actions, specified refusals, state transitions, and invariants. For implemented features, cover acceptance of the intended version, refusal of stale or unauthorized changes, optional ordinary evidence, required dispute evidence, and authorized resolver decisions as defined by the specs.

Test the reaction and endpoint flow so that outsiders cannot read private agreement data or act as a party or resolver by submitting another user's ID. Client-side button visibility alone is not authorization. Verify concurrent request correlation and repeated submissions where they could violate the selected protocol.

Walk through the chosen journey from an empty isolated database using actual users, API calls, and Vue UI. Confirm persisted state survives an appropriate reload or restart and that ordinary UI actions update without forced page refreshes. Mocked frontend data alone does not satisfy P2.

Run the relevant repository tests, type checks, and build checks available for the change. Report what actually passed, what failed, and what could not be run. Do not claim readiness from code inspection alone or guarantee a grade.

Before calling P2 ready, check every deliverable, including the prose journey, short initial plan, authentic progress notes, P3 remaining work, and narrated recording. Distinguish implemented features from planned work.

## Writing and collaboration with Wyatt

Use clear, direct explanations and concrete examples. Wyatt prefers step-by-step help, minimal edits that preserve his voice, and exact copy-and-paste replacements when revising text. Explain changes so he can understand and defend his implementation. Avoid colons and semicolons in ordinary prose where practical. Preserve punctuation required by code and formal notation.

Apply the technical writing rubric by making explanations precise, self-contained, organized, concise, and accessible. Avoid marketing language, padding, formulaic contrasts, and claims unsupported by the work.

Design notes should record actual decisions, alternatives, challenges, evidence, and remaining work. The known P1 reflection explains choosing a disagreement that ends happily instead of a vanilla case. Preserve that rationale without inventing personal reactions. Ask for Wyatt's experience when a reflection depends on feelings or lessons unavailable in the work record.

When reviewing problem framing, check the domain, concrete bad situations, fair corroboration, relevant workarounds and comparables, and a realistic solution sketch. Treat bad situations as the yardstick for value rather than turning them into a feature wishlist. Do not fabricate interviews, observations, citations, or evidence of prevalence.

## Source inventory

This guide was grounded in the supplied copies of the following documents. Keep the PDFs or an accessible source folder alongside the project when handing it to another agent. This Markdown summarizes their guidance but does not embed the original sources.

| Source | Guidance used here |
| --- | --- |
| P2_ Alpha (MVP) — 6.1040 Software Design.pdf | Platform, local MVP scope, incremental work, validation, deliverables, recording, deadline |
| Rubric for problem framing — 6.1040 Software Design.pdf | Domain, concrete problems, corroboration, comparables, realistic solution |
| Technical Writing — 6.1040 Software Design.pdf | Precision, clarity, self-contained explanations, concise writing |
| Reflective Practice — 6.1040 Software Design.pdf | Grounded reflection, personal insight, useful future lessons |
| How to innovate from bad situations — 6.1040 Software Design.pdf | Concrete recurring problems and evidence as measures of value |
| How to write concept state_ SSF — 6.1040 Software Design.pdf | State syntax, multiplicities, uniqueness, enumerations, constraints |
| How to write concept specifications — 6.1040 Software Design.pdf | Purpose, principle, types, actions, queries, refusals |
| How to define a concept — 6.1040 Software Design.pdf | Courses of action, identities, sufficient remembered state |
| How to decompose into concepts — 6.1040 Software Design.pdf | Cohesion, independence, reuse, reactions, request boundaries |

Also read the complete P1 concept and reaction specifications, UI sketches, journey, and design notebook in the repository. Those exact files and the live implementation were unavailable during this handoff. This guide intentionally excludes unrelated academic, medical, career, and personal memories.