import { assemble } from "@mit-sdg/sync-engine/assembly";
import { AgreeingConcept } from "./concepts/Agreeing.ts";
import { AuthenticatingConcept } from "./concepts/Authenticating.ts";
import { applicationConceptSet } from "./concepts.ts";
import { db } from "./db.ts";
import { composition } from "./compositions/FriendlyFive.ts";
import { ResolvingConcept } from "./concepts/Resolving.ts";
import { ObligationTrackingConcept } from "./concepts/ObligationTracking.ts";
import type { Db } from "mongodb";

export function assembleApplication(database: Db = db) {
  return assemble({
    conceptSet: applicationConceptSet,
    instances: {
      Authenticating: new AuthenticatingConcept(database),
      Agreeing: new AgreeingConcept(database),
      Resolving: new ResolvingConcept(database),
      ObligationTracking: new ObligationTrackingConcept(database),
    },
    composition: { FriendlyFive: composition },
    rawFaultReporter: ({ error }) => console.error(error),
  });
}
