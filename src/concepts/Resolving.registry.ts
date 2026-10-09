import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Resolving.md" with { type: "text" };
import {
  CaseAlreadyOpen,
  CaseInvalidRule,
  CaseSameParticipant,
  ConfirmationNotAuthorized,
  ConfirmationNotCurrent,
  DecisionCaseClosed,
  DecisionEvidenceRequired,
  DecisionNotResolver,
  DecisionTooEarly,
  DisputeEvidenceRequired,
  DisputeNotAuthorized,
  DisputeNotCurrent,
  ResolvingConcept,
  SubmissionCaseClosed,
  SubmissionInvalidEvidence,
  SubmissionNotParticipant,
  SubmissionTooEarly,
} from "./Resolving.ts";

export const resolving = registerConcept({
  class: ResolvingConcept,
  spec,
  refusals: {
    CASE_ALREADY_OPEN: CaseAlreadyOpen,
    CASE_SAME_PARTICIPANT: CaseSameParticipant,
    CASE_INVALID_RULE: CaseInvalidRule,
    SUBMISSION_CASE_CLOSED: SubmissionCaseClosed,
    SUBMISSION_NOT_PARTICIPANT: SubmissionNotParticipant,
    SUBMISSION_TOO_EARLY: SubmissionTooEarly,
    SUBMISSION_INVALID_EVIDENCE: SubmissionInvalidEvidence,
    CONFIRMATION_NOT_CURRENT: ConfirmationNotCurrent,
    CONFIRMATION_NOT_AUTHORIZED: ConfirmationNotAuthorized,
    DISPUTE_NOT_CURRENT: DisputeNotCurrent,
    DISPUTE_NOT_AUTHORIZED: DisputeNotAuthorized,
    DISPUTE_EVIDENCE_REQUIRED: DisputeEvidenceRequired,
    DECISION_CASE_CLOSED: DecisionCaseClosed,
    DECISION_NOT_RESOLVER: DecisionNotResolver,
    DECISION_TOO_EARLY: DecisionTooEarly,
    DECISION_EVIDENCE_REQUIRED: DecisionEvidenceRequired,
  },
});
