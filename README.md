# friendly-five
A web app for friends to agree on clear bet terms, resolve outcomes, and track settlement. Built for MIT 6.1040.

## Local development

Install dependencies with `bun install`, copy `.env.example` to `.env`, and make
sure the Podman machine is running. Then start MongoDB, the sync-engine backend,
and the Vue development server together:

```sh
bun run dev
```

The frontend runs at <http://127.0.0.1:5173> and proxies `/api` requests to the
backend at <http://127.0.0.1:3000>. Run `bun run build:frontend` to create a
production frontend build.

## Design Documents:

- [Problem Framing](Design-Documents/problem-framing.md)
- [Application Pitch](Design-Documents/application-pitch.md)
- [Concept Design](Design-Documents/concept-design.md)
- [UI Sketches](Design-Documents/UI-sketches.md)
- [User Journey](Design-Documents/user-journey.md)
