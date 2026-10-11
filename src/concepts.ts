import { conceptSet } from "@mit-sdg/sync-engine/assembly";
import { agreeing } from "./concepts/Agreeing.registry.ts";
import { authenticating } from "./concepts/Authenticating.registry.ts";
import { linking } from "./concepts/Linking.registry.ts";
import { resolving } from "./concepts/Resolving.registry.ts";
import { obligationTracking } from "./concepts/ObligationTracking.registry.ts";

export const applicationConceptSet = conceptSet({
  Authenticating: authenticating,
  Agreeing: agreeing,
  Linking: linking,
  Resolving: resolving,
  ObligationTracking: obligationTracking,
}, {
  Blank: ({ value }: { value: string }) => value.trim() === "",
  NonBlank: ({ value }: { value: string }) => value.trim() !== "",
});
export const { concepts, computations } = applicationConceptSet;
