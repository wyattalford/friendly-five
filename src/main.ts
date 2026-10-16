import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { resolve, sep } from "node:path";
import { createFriendlyFive } from "./application.ts";
import { db } from "./db.ts";
import { policy } from "./http.ts";

const { application, gateway } = createFriendlyFive();
const api = createHttpHandler({ application, gateway, policy });
const frontendDirectory = resolve(import.meta.dir, "../dist");
const frontendIndex = resolve(frontendDirectory, "index.html");

function frontendFile(pathname: string): string | undefined {
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }

  const candidate = resolve(frontendDirectory, `.${decodedPath}`);
  if (candidate !== frontendDirectory && !candidate.startsWith(`${frontendDirectory}${sep}`)) {
    return undefined;
  }
  return candidate;
}

const server = Bun.serve({
  hostname: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3000),
  async fetch(request) {
    const pathname = new URL(request.url).pathname;

    if (pathname === "/health") {
      try {
        const [frontendExists] = await Promise.all([
          Bun.file(frontendIndex).exists(),
          db.command({ ping: 1 }),
        ]);
        if (!frontendExists) throw new Error("Frontend build is missing.");
        return new Response("ok", {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } catch {
        return new Response("unhealthy", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    }
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      return api(request);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    const path = frontendFile(pathname);
    if (path !== undefined && path !== frontendDirectory) {
      const file = Bun.file(path);
      if (await file.exists()) {
        return new Response(file, {
          headers: { "Content-Type": file.type },
        });
      }
    }

    const index = Bun.file(frontendIndex);
    if (!(await index.exists())) {
      return new Response("Frontend build not found. Run `bun run build` before starting production.", {
        status: 503,
      });
    }
    return new Response(index, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`FriendlyFive backend listening on ${server.url}`);
