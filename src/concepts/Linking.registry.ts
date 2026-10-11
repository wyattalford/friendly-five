import { registerConcept } from "@mit-sdg/sync-engine/assembly";
import spec from "@design/concepts/Linking.md" with { type: "text" };
import { LinkNotActive, LinkNotOwner, LinkingConcept } from "./Linking.ts";

export const linking = registerConcept({
  class: LinkingConcept,
  spec,
  refusals: {
    LINK_NOT_ACTIVE: LinkNotActive,
    LINK_NOT_OWNER: LinkNotOwner,
  },
});
