import { conceptSet } from "@mit-sdg/sync-engine/assembly";
import { agreeing } from "./concepts/Agreeing.registry.ts";
import { authenticating } from "./concepts/Authenticating.registry.ts";
import { resolving } from "./concepts/Resolving.registry.ts";
import { obligationTracking } from "./concepts/ObligationTracking.registry.ts";

export const applicationConceptSet = conceptSet({
  Authenticating: authenticating,
  Agreeing: agreeing,
  Resolving: resolving,
  ObligationTracking: obligationTracking,
});
export const { concepts } = applicationConceptSet;
