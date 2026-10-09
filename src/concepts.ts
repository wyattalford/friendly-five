import { conceptSet } from "@mit-sdg/sync-engine/assembly";
import { agreeing } from "./concepts/Agreeing.registry.ts";
import { authenticating } from "./concepts/Authenticating.registry.ts";
import { resolving } from "./concepts/Resolving.registry.ts";

export const applicationConceptSet = conceptSet({
  Authenticating: authenticating,
  Agreeing: agreeing,
  Resolving: resolving,
});
export const { concepts } = applicationConceptSet;
