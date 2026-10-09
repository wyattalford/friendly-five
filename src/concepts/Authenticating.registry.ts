import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Authenticating.md" with { type: "text" };
import {
  AuthenticatingConcept,
  InvalidCredentials,
  UnknownSession,
  UsernameTaken,
} from "./Authenticating.ts";

export const authenticating = registerConcept({
  class: AuthenticatingConcept,
  spec,
  refusals: {
    INVALID_CREDENTIALS: InvalidCredentials,
    USERNAME_TAKEN: UsernameTaken,
    UNKNOWN_SESSION: UnknownSession,
  },
});
