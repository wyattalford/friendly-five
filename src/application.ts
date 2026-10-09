import { createGateway } from "@mit-sdg/sync-engine/boundary";
import type { FriendlyFiveWire } from "../generated/wire.ts";
import { assembleApplication } from "./assembly.ts";

export function createFriendlyFive() {
  const application = assembleApplication();
  const gateway = createGateway<FriendlyFiveWire>({ application });
  return { application, gateway };
}
