import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { createFriendlyFive } from "./application.ts";
import { policy } from "./http.ts";

const { application, gateway } = createFriendlyFive();
const api = createHttpHandler({ application, gateway, policy });

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  fetch: api,
});

console.log(`FriendlyFive backend listening on ${server.url}`);
