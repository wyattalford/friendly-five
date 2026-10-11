import { createGateway } from "@mit-sdg/sync-engine/boundary";
import type { FriendlyFiveWire } from "../generated/wire.ts";
import { assembleApplication } from "./assembly.ts";
import type { Db } from "mongodb";

export function createFriendlyFive(database?: Db) {
  const application = assembleApplication(database);
  const gateway = createGateway<FriendlyFiveWire>({ application });
  return { application, gateway };
}
