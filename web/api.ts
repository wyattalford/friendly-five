import type { Client } from "@mit-sdg/sync-engine/client";
import {
  createHttpClient,
  type HttpClientError,
} from "@mit-sdg/sync-engine-http/client";
import type { FriendlyFiveWireHttp } from "../generated/wire.ts";

export type FriendlyFiveClient = Client<FriendlyFiveWireHttp, HttpClientError>;

export const api: FriendlyFiveClient = createHttpClient<FriendlyFiveWireHttp>({
  baseUrl: "/api",
});
