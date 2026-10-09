# ObligationTracking

## Purpose

Distinguish outstanding obligations from obligations that are verified done, so
friends can see what remains to be settled without relying on memory.

## Principle

An obligation records that Wyatt owes Alex lunch. Wyatt reports completing it,
and Alex confirms receipt. If Alex disputes the completion report with a reason,
Wyatt may make a new report. Once Alex confirms, the obligation is complete.

## Types

```types
external User
  The person who owes or receives an obligation.
external Item
  The external item that creates one obligation.
ObligationStatus is DUE or REPORTED or DISPUTED or COMPLETE
  The lifecycle state of an obligation.
```

## State

```state
a set of Obligations with
  a unique item Item
  an owing User
  a recipient User
  a description String
  a status ObligationStatus
  an optional currentReport CompletionReport
  an optional confirmedAt DateTime

a seq of CompletionReports with
  an obligation Obligation
  an optional evidence String
  a reportedAt DateTime
  an optional disputeEvidence String

Rule: Each currentReport belongs to its obligation. Report evidence and reportedAt are immutable.
Rule: confirmedAt exists exactly when status is COMPLETE.
```

## Actions

```actions
record(item: Item, owing: User, recipient: User, description: String) : returns (obligation: Obligation)
  where no obligation exists for item, owing and recipient are distinct, and description is not blank
  then
    add a new obligation with the supplied item, users, and description, status DUE, and no currentReport or confirmedAt
    returns obligation

reportCompletion(user: User, obligation: Obligation, evidence?: String) : returns (report: CompletionReport)
  where obligation exists with status DUE or DISPUTED, user is its owing user, and evidence, if supplied, is not blank
  then
    add a new completion report with obligation, reportedAt set to the current time, the supplied evidence if any, and no disputeEvidence
    set obligation's currentReport to report and status to REPORTED
    returns report

confirmReceipt(user: User, obligation: Obligation, report: CompletionReport) : returns ()
  where obligation has status REPORTED, user is its recipient, and report is its currentReport
  then
    set obligation's status to COMPLETE
    set obligation's confirmedAt to the current time
    returns

disputeReceipt(user: User, obligation: Obligation, report: CompletionReport, evidence: String) : returns ()
  where obligation has status REPORTED, user is its recipient, report is its currentReport, and evidence is not blank
  then
    set report's disputeEvidence to evidence
    set obligation's status to DISPUTED
    returns
```

## Queries

```queries
```
