import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/ObligationTracking.md" with { type: "text" };
import {
  CompletionInvalidEvidence,
  CompletionNotOpen,
  CompletionNotOwing,
  ObligationAlreadyExists,
  ObligationInvalidDescription,
  ObligationSamePerson,
  ObligationTrackingConcept,
  ReceiptDisputeEvidenceRequired,
  ReceiptDisputeNotCurrent,
  ReceiptDisputeNotRecipient,
  ReceiptNotCurrent,
  ReceiptNotRecipient,
} from "./ObligationTracking.ts";

export const obligationTracking = registerConcept({
  class: ObligationTrackingConcept,
  spec,
  refusals: {
    OBLIGATION_ALREADY_EXISTS: ObligationAlreadyExists,
    OBLIGATION_SAME_PERSON: ObligationSamePerson,
    OBLIGATION_INVALID_DESCRIPTION: ObligationInvalidDescription,
    COMPLETION_NOT_OPEN: CompletionNotOpen,
    COMPLETION_NOT_OWING: CompletionNotOwing,
    COMPLETION_INVALID_EVIDENCE: CompletionInvalidEvidence,
    RECEIPT_NOT_CURRENT: ReceiptNotCurrent,
    RECEIPT_NOT_RECIPIENT: ReceiptNotRecipient,
    RECEIPT_DISPUTE_NOT_CURRENT: ReceiptDisputeNotCurrent,
    RECEIPT_DISPUTE_NOT_RECIPIENT: ReceiptDisputeNotRecipient,
    RECEIPT_DISPUTE_EVIDENCE_REQUIRED: ReceiptDisputeEvidenceRequired,
  },
});
