import { conceptSet } from "@mit-sdg/sync-engine/assembly";
import { authenticating } from "./concepts/Authenticating.registry.ts";

export const applicationConceptSet = conceptSet({
  Authenticating: authenticating,
});
export const { concepts } = applicationConceptSet;
