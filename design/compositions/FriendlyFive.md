# FriendlyFive

FriendlyFive records two friends' accepted wager terms, the final outcome, and
the resulting fulfillment without processing the stake itself. The core journey
starts with three registered users: Wyatt, Alex, and Morgan.

Authenticated requests must use the user returned for that request's session.
The application authorizes each domain action from roles owned by the relevant
concept. It never accepts a user identifier supplied by the browser as proof of
who is acting.

The account setup endpoints are [registration](reaction:FriendlyFive.Accounts.Register)
and [sign-in](reaction:FriendlyFive.Accounts.SignIn). The proposal flow resolves
counterpart and resolver usernames before invoking [Agreeing.propose](reaction:FriendlyFive.Agreements.Propose).
Participants and an agreed resolver can read the accepted terms through [agreement review](reaction:FriendlyFive.Agreements.Get),
and the counterpart accepts through [agreement acceptance](reaction:FriendlyFive.Agreements.Accept).

When the counterpart accepts the current agreement version, the application
opens one resolution case using the accepted participants, deadline, resolution
rule, and optional resolver. When a case becomes final with TRUE or FALSE, the
application records exactly one obligation using the losing party's accepted
stake. VOID produces no obligation. Invitation links identify an agreement but
do not grant authority to accept, revise, report, dispute, decide, or view
private terms. The accepted-agreement reaction opens a case even when no
resolver was designated, allowing the participants to confirm an ordinary
outcome themselves.

```endpoints
FriendlyFive.Accounts.Register at /auth/register
FriendlyFive.Accounts.SignIn at /auth/sign-in
FriendlyFive.Agreements.Propose at /agreements/propose
FriendlyFive.Agreements.Get at /agreements/get
FriendlyFive.Agreements.Accept at /agreements/accept
FriendlyFive.Outcomes.GetResolution at /resolutions/get
FriendlyFive.Outcomes.GetCurrentReport at /resolutions/current
FriendlyFive.Outcomes.ReportOutcome at /resolutions/report
FriendlyFive.Outcomes.ConfirmOutcome at /resolutions/confirm
FriendlyFive.Outcomes.DisputeOutcome at /resolutions/dispute
FriendlyFive.Outcomes.DecideOutcome at /resolutions/decide
FriendlyFive.Obligations.GetObligation at /obligations/get
FriendlyFive.Obligations.ReportCompletion at /obligations/report
FriendlyFive.Obligations.ConfirmReceipt at /obligations/confirm
FriendlyFive.Obligations.DisputeReceipt at /obligations/dispute
```

The resolution endpoints are [case review](reaction:FriendlyFive.Outcomes.GetResolution),
[current report review](reaction:FriendlyFive.Outcomes.GetCurrentReport),
[outcome reporting](reaction:FriendlyFive.Outcomes.ReportOutcome),
[outcome confirmation](reaction:FriendlyFive.Outcomes.ConfirmOutcome),
[outcome disputes](reaction:FriendlyFive.Outcomes.DisputeOutcome), and
[resolver decisions](reaction:FriendlyFive.Outcomes.DecideOutcome).

The cross-concept link is [accepted agreements open resolution cases](reaction:FriendlyFive.Outcomes.AcceptedAgreementOpensCase).
Final TRUE decisions are linked to [TRUE-side obligation recording](reaction:FriendlyFive.Outcomes.FinalTrueDecisionRecordsObligation), and final FALSE decisions are linked to [FALSE-side obligation recording](reaction:FriendlyFive.Outcomes.FinalFalseDecisionRecordsObligation). Mutual confirmations use [TRUE confirmation obligation recording](reaction:FriendlyFive.Outcomes.ConfirmedTrueOutcomeRecordsObligation) and [FALSE confirmation obligation recording](reaction:FriendlyFive.Outcomes.ConfirmedFalseOutcomeRecordsObligation).

Obligation fulfillment uses [obligation review](reaction:FriendlyFive.Obligations.GetObligation), [completion reporting](reaction:FriendlyFive.Obligations.ReportCompletion), [receipt confirmation](reaction:FriendlyFive.Obligations.ConfirmReceipt), and [receipt disputes](reaction:FriendlyFive.Obligations.DisputeReceipt).
