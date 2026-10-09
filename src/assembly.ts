import { assemble } from "@mit-sdg/sync-engine/assembly";
import { AgreeingConcept } from "./concepts/Agreeing.ts";
import { AuthenticatingConcept } from "./concepts/Authenticating.ts";
import { applicationConceptSet } from "./concepts.ts";
import { db } from "./db.ts";
import { composition } from "./compositions/FriendlyFive.ts";
import { ResolvingConcept } from "./concepts/Resolving.ts";
import { ObligationTrackingConcept } from "./concepts/ObligationTracking.ts";

export function assembleApplication() {
  return assemble({
    conceptSet: applicationConceptSet,
    instances: {
      Authenticating: new AuthenticatingConcept(db),
      Agreeing: new AgreeingConcept(db),
      Resolving: new ResolvingConcept(db),
      ObligationTracking: new ObligationTrackingConcept(db),
    },
    composition: { FriendlyFive: composition },
    rawFaultReporter: ({ error }) => console.error(error),
  });
}
