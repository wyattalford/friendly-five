# FriendlyFive Final Design

## Purpose and scope

FriendlyFive helps two friends agree on a bet before they have conflicting incentives, decide its outcome, and confirm that the resulting obligation was fulfilled. I named it after the friendly five-dollar bets my friends and I used to make. The final app keeps P1’s focus on one-on-one agreements, with payments and other stakes handled outside the app.

The central distinction remains between agreeing on terms, deciding who won, and confirming settlement. Winning a lunch bet does not establish that lunch was delivered. Keeping these stages separate lets the app record progress without treating one person’s claim as the other person’s confirmation.

## Refinements to the P1 concept design

- **Preserving the lifecycle boundaries.** Agreeing maintains versioned terms, Resolving determines the outcome, and ObligationTracking records fulfillment. Authenticating establishes identity, while Linking identifies shared invitations. Reactions connect the concepts. An obligation is created only after a final outcome, and a void result creates none. I retained this structure because each stage answers a different question, and keeping the stages apart helps maintain modularity.
- **Making evidence proportional to the task.** I changed ordinary outcome evidence from required to optional so a straightforward result does not require extra explanation. Disputes still require an explanation or supporting evidence. P3 added an optional photo for practical evidence such as a box-score screenshot or receipt.
- **Making retained history useful.** I changed report collections to chronological sequences and exposed agreement versions and outcome reports through authorized history endpoints. The interface now shows earlier terms, evidence, and objections alongside the current version or final report. Separate history queries keep ordinary actions focused on the current record.
- **Clarifying resolver authority.** A resolver can decide only after an outcome is disputed. This preserves the participants’ opportunity to confirm a result themselves. Without a resolver, participants can submit a replacement report and seek mutual confirmation. Disagreement does not automatically void the bet or eliminate an obligation.

## Access control and reliability

Implementation exposed weaknesses that were not apparent from the initial specifications alone.

- **Checking the authenticated user explicitly.** Testing revealed that a user value matched through reaction outputs could be rebound by another query. I moved agreement read authorization into a concept-owned query taking the authenticated user as an input. Participants can view pending agreements, while designated resolvers gain access after acceptance. Shared links identify agreements but do not replace role checks. Fulfillment details remain restricted to the owing person and recipient.
- **Protecting sessions.** I replaced browser session storage with Secure, HTTP-only, SameSite Strict cookies. The backend enforces session expiration, and signing out invalidates the server-side session. A current-user endpoint restores the signed-in interface without exposing the credential to browser JavaScript.
- **Handling timing and missing data.** Production testing showed that device-clock differences could enable reporting too early. The browser now estimates its offset from server time, while Resolving remains authoritative. I also added explicit responses for missing reports and unauthorized lookups so requests do not wait indefinitely.
- **Preventing competing actions.** P4 concurrent-request tests exposed cases where competing operations could both succeed. Conditional database updates now check that the relevant state has not changed before acceptance, revision, reporting, or resolution succeeds. Runtime request validation also rejects malformed API requests that generated TypeScript types cannot prevent.

## Interface evolution and changes since P3

I kept agreement review, resolution, and fulfillment together because users are following one agreement through its lifecycle. The dashboard shows its furthest visible state, helping users distinguish an accepted proposal from a resolved outcome or completed obligation.

During P3, I replaced the green palette with blue, retained the cream background, and introduced a five-dot logo across the landing page, header, and favicon. The landing page emphasizes the product name, while signed-in pages use a smaller branded header. Responsive layouts stack forms and actions, with core screens checked at 390 and 320 pixels.

Since P3, the main documented interaction change is invitation setup. A proposer can now invite both the counterpart and a third-party resolver by email without waiting for the counterpart to register. Each receives a separate link and chooses their own username. A resolver may register early but must wait for participant acceptance before viewing the agreement. This removes a setup dependency while preserving the authority established by the accepted terms. P4 has otherwise focused on reliability rather than introducing another visual redesign.

## Validation and remaining limits

I developed the app incrementally using concept tests, composition tests, browser walkthroughs, and checks against the maintained specifications. All 56 automated tests passed, along with the type, specification, generated-artifact, and frontend build checks. Tests cover all four combinations of existing and unregistered counterparts and resolvers, access control, malformed requests, competing actions, and persistence. A database-index upgrade regression also verifies that existing accounts, sessions, and unclaimed invitations are preserved.

Deployed testing verified agreements between existing accounts, confirmation, third-party resolution, resolver-free void outcomes, private photo evidence, fulfillment disputes and retries, access restrictions, and new-session persistence. A browser walkthrough also verified required dispute explanations, resolver decisions, and persistence after reload. The revised invitations were checked locally with two unregistered invitees and still require verification after the final deployment.

Email verification and automatic invitation delivery remain future work, so links need private sharing. Without a resolver, the app cannot force cooperation. Conditional database updates protect competing actions but do not provide multi-document crash recovery. P5 user testing will examine whether people understand these boundaries and can complete the journey without guidance.
