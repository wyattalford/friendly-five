import { conceptSet } from "@mit-sdg/sync-engine/assembly";
import { agreeing } from "./concepts/Agreeing.registry.ts";
import { authenticating } from "./concepts/Authenticating.registry.ts";

export const applicationConceptSet = conceptSet({
  Authenticating: authenticating,
  Agreeing: agreeing,
});
export const { concepts } = applicationConceptSet;
