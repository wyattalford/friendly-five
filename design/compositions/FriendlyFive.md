# FriendlyFive

FriendlyFive records two friends' accepted wager terms, the final outcome, and
the resulting fulfillment without processing the stake itself. The core journey
starts with three registered users: Wyatt, Alex, and Morgan.

Authenticated requests must use the user returned for that request's session.
The application authorizes each domain action from roles owned by the relevant
concept. It never accepts a user identifier supplied by the browser as proof of
who is acting.

When the counterpart accepts the current agreement version, the application
opens one resolution case using the accepted participants, deadline, resolution
rule, and optional resolver. When a case becomes final with TRUE or FALSE, the
application records exactly one obligation using the losing party's accepted
stake. VOID produces no obligation. Invitation links identify an agreement but
do not grant authority to accept, revise, report, dispute, decide, or view
private terms.

```endpoints
FriendlyFive.Accounts.Register at /auth/register
FriendlyFive.Accounts.SignIn at /auth/sign-in
FriendlyFive.Agreements.Propose at /agreements/propose
FriendlyFive.Agreements.Accept at /agreements/accept
FriendlyFive.Agreements.Get at /agreements/get
FriendlyFive.Outcomes.Submit at /outcomes/submit
FriendlyFive.Outcomes.Dispute at /outcomes/dispute
FriendlyFive.Outcomes.Decide at /outcomes/decide
FriendlyFive.Obligations.ReportCompletion at /obligations/report-completion
FriendlyFive.Obligations.ConfirmReceipt at /obligations/confirm-receipt
```
