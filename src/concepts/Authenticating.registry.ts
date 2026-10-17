import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Authenticating.md" with { type: "text" };
import {
  AuthenticatingConcept,
  EmailTaken,
  InvalidCredentials,
  ActivationNotAvailable,
  ReservationNotAvailable,
  UnknownSession,
  UsernameTaken,
} from "./Authenticating.ts";

export const authenticating = registerConcept({
  class: AuthenticatingConcept,
  spec,
  refusals: {
    INVALID_CREDENTIALS: InvalidCredentials,
    EMAIL_TAKEN: EmailTaken,
    RESERVATION_NOT_AVAILABLE: ReservationNotAvailable,
    ACTIVATION_NOT_AVAILABLE: ActivationNotAvailable,
    USERNAME_TAKEN: UsernameTaken,
    UNKNOWN_SESSION: UnknownSession,
  },
});
