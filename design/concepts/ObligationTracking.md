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
  an optional evidenceImage String
  an optional evidenceImageName String
  a reportedAt DateTime
  an optional disputeEvidence String
  an optional disputeImage String
  an optional disputeImageName String

Rule: Each currentReport belongs to its obligation. Report evidence and reportedAt are immutable.
Rule: An evidenceImage or disputeImage is a JPEG, PNG, or WebP data URL containing at most 2 MB of decoded image data and always has its corresponding nonblank image name. Image names contain at most 120 characters and no control characters.
Rule: confirmedAt exists exactly when status is COMPLETE.
Rule: Concurrent attempts recheck the observed state. Only one competing transition succeeds for the same version or report. A losing attempt refuses and removes its new insert. Crash recovery across writes is not atomic.

```

## Actions

```actions
record(item: Item, owing: User, recipient: User, description: String) : returns (obligation: Obligation)
  where an obligation already exists for item
  then
    refuses OBLIGATION_ALREADY_EXISTS "This item already has an obligation."
  where owing and recipient are not distinct
  then
    refuses OBLIGATION_SAME_PERSON "The owing and receiving people must be different."
  where description is blank
  then
    refuses OBLIGATION_INVALID_DESCRIPTION "An obligation description is required."
  where the record is valid
  then
    add a new obligation with the supplied item, users, and description, status DUE, and no currentReport or confirmedAt
    returns obligation

reportCompletion(user: User, obligation: Obligation, evidence?: String, evidenceImage?: String, evidenceImageName?: String) : returns (report: CompletionReport)
  where obligation is unknown or has neither status DUE nor DISPUTED
  then
    refuses COMPLETION_NOT_OPEN "This obligation is not open for a completion report."
  where user is not its owing user
  then
    refuses COMPLETION_NOT_OWING "Only the owing person can report completion."
  where evidence is supplied and blank
  then
    refuses COMPLETION_INVALID_EVIDENCE "Evidence cannot be blank when supplied."
  where evidenceImage or evidenceImageName is invalid or supplied without the other
  then
    refuses EVIDENCE_IMAGE_INVALID "Evidence images must be JPEG, PNG, or WebP files no larger than 2 MB."
  where completion is valid
  then
    add a new completion report with obligation, reportedAt set to the current time, the supplied text and image evidence if any, and no dispute evidence
    set obligation's currentReport to report and status to REPORTED
    returns report

confirmReceipt(user: User, obligation: Obligation, report: CompletionReport) : returns ()
  where obligation is unknown, has another status, or report is not its currentReport
  then
    refuses RECEIPT_NOT_CURRENT "Only the current completion report can be confirmed."
  where user is not its recipient
  then
    refuses RECEIPT_NOT_RECIPIENT "Only the recipient can confirm receipt."
  where confirmation is valid
  then
    set obligation's status to COMPLETE
    set obligation's confirmedAt to the current time
    returns

disputeReceipt(user: User, obligation: Obligation, report: CompletionReport, evidence: String, evidenceImage?: String, evidenceImageName?: String) : returns ()
  where obligation is unknown, has another status, or report is not its currentReport
  then
    refuses RECEIPT_DISPUTE_NOT_CURRENT "Only the current completion report can be disputed."
  where user is not its recipient
  then
    refuses RECEIPT_DISPUTE_NOT_RECIPIENT "Only the recipient can dispute completion."
  where evidence is blank
  then
    refuses RECEIPT_DISPUTE_EVIDENCE_REQUIRED "A completion dispute needs an explanation or supporting evidence."
  where evidenceImage or evidenceImageName is invalid or supplied without the other
  then
    refuses EVIDENCE_IMAGE_INVALID "Evidence images must be JPEG, PNG, or WebP files no larger than 2 MB."
  where dispute is valid
  then
    set report's disputeEvidence to evidence and dispute image fields if supplied
    set obligation's status to DISPUTED
    returns
```

## Queries

```queries
_byItem(item: Item) : optional (obligation: Obligation)
  returns the obligation for the item when one exists

_canView(obligation: Obligation, user: User) : optional (obligation: Obligation)
  returns the obligation when user is its owing person or recipient

_get(obligation: Obligation) : optional (item: Item, owing: User, recipient: User, description: String, status: ObligationStatus, currentReport?: CompletionReport, confirmedAt?: DateTime)
  returns the obligation details when the obligation exists

_current(obligation: Obligation) : optional (report: CompletionReport, evidence?: String, reportedAt: DateTime, disputeEvidence?: String)
  returns the current completion report when the obligation has one

_hasEvidence(report: CompletionReport) : optional (report: CompletionReport)
  returns the completion report when it exists and has nonblank evidence

_images(obligation: Obligation) : many (report: CompletionReport, evidenceImage?: String, evidenceImageName?: String, disputeImage?: String, disputeImageName?: String)
  returns image evidence for completion reports in the obligation, in ascending reportedAt order, omitting reports without images
```
