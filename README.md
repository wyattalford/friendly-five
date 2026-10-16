# FriendlyFive

FriendlyFive is a local web application for two friends to record clear wager
terms, resolve the outcome, and track the resulting obligation. It was built for
the MIT 6.1040 Fall 2026 P2 Alpha milestone using Bun, TypeScript, MongoDB, Vue,
and MIT's sync-engine.

FriendlyFive records obligations but does not process payments or enforce a
real-world stake. A designated resolver is optional. When the participants
disagree about an outcome, an agreed resolver can make the final decision from
the terms both participants accepted.

## Implemented MVP

- Account registration, sign-in, session restoration, and sign-out
- Two-party agreement proposals with versioned counterproposals
- Optional designated resolvers agreed upon as part of the terms
- Opaque invitation links that identify an agreement without granting access
- Acceptance, rejection, withdrawal, and pending-proposal link retrieval
- Outcome reporting after the agreed cutoff, with optional evidence
- Outcome confirmation or a dispute with a required explanation
- Final resolver decisions for disputed outcomes
- Automatic creation of the correct participant obligation for `TRUE` and
  `FALSE` outcomes, with no obligation for `VOID`
- Completion reporting, receipt confirmation, and completion disputes
- A dashboard that reports the effective agreement, resolution, or obligation
  status and names the participant whose acceptance is pending
- Persistent MongoDB state and backend authorization for every private workflow

The maintained [core user journey](design/core-user-journey.md) demonstrates the
complete path from an empty database through registration, agreement,
disagreement, resolver decision, and confirmed obligation completion.
A narrated walkthrough of this journey is available in the
[P2 demo recording](https://drive.google.com/file/d/1LJoGqUKwzpq3sLEaH6UJ4NyfNUX2rSIS/view?usp=sharing).

## Architecture

Each concept owns its own state and rules. Concepts do not call one another or
read one another's collections. The
[FriendlyFive composition](design/compositions/FriendlyFive.md) coordinates
them with sync-engine endpoints, views, formers, and reactions.

| Concept | Independent responsibility |
| --- | --- |
| [Authenticating](design/concepts/Authenticating.md) | Accounts, password verification, and expiring sessions |
| [Agreeing](design/concepts/Agreeing.md) | Two-party proposals, term versions, and acceptance state |
| [Linking](design/concepts/Linking.md) | Opaque, revocable references to application items |
| [Resolving](design/concepts/Resolving.md) | Outcome reports, disputes, confirmations, and final decisions |
| [ObligationTracking](design/concepts/ObligationTracking.md) | Resulting obligations and confirmation of their completion |

The Vue frontend calls the generated sync-engine HTTP wire through
[`web/api.ts`](web/api.ts). Browser request and response types therefore come
from the same endpoint definitions used by the backend instead of a separate
handwritten API contract.

Agreement acceptance opens one resolution case through a reaction. A final
`TRUE` or `FALSE` result creates one obligation through another reaction using
the accepted version's stakes. This coordination remains outside the concept
implementations so the concepts stay independent.

## Requirements

- [Bun](https://bun.sh/) 1.4.2
- [Podman](https://podman.io/) with Compose support
- A current web browser

On macOS, start the Podman virtual machine before running the application if it
is not already running:

```sh
podman machine start
```

## Run locally from a fresh clone

Clone the repository and enter it:

```sh
git clone https://github.com/wyattalford/friendly-five.git
cd friendly-five
```

Install the pinned dependencies and create the local environment file:

```sh
bun install
cp .env.example .env
```

Generate the typed sync-engine artifacts before the first build or type check:

```sh
bun run generate
```

Start MongoDB, the sync-engine backend, and the Vue development server:

```sh
bun run dev
```

Open <http://127.0.0.1:5173>. The Vite server proxies `/api` to the backend at
<http://127.0.0.1:3000>, keeping local browser requests on one origin.

The default development configuration in `.env.example` uses the MongoDB
container defined in `compose.yaml`. Change `MONGODB_URL` and `PUBLIC_ORIGIN`
when using a different database or frontend origin. Do not commit `.env`.

### Start services separately

The individual commands are useful when separate logs are needed:

```sh
bun run db:up
bun run dev:backend
bun run dev:frontend
```

Run the backend and frontend commands in separate terminals. Useful database
commands are:

```sh
bun run db:logs
bun run db:shell
```

### Preview the production build

The production preview uses the same single-server layout as the class
deployment. It generates the typed sync-engine artifacts, builds the Vue app,
starts MongoDB, and serves the API and built pages from port 3000:

```sh
bun run preview
```

Open <http://127.0.0.1:3000>. The health check at
<http://127.0.0.1:3000/health> returns `ok` only when MongoDB is reachable and
the frontend build exists. Reload a nested Vue route during deployment checks
to verify that the server returns the application entry page rather than a
404.

### Reset to an empty database

The core journey begins with an empty database. This command permanently removes
the local development MongoDB volume and all FriendlyFive development records:

```sh
bun run db:reset
bun run dev
```

## Verification

Start MongoDB before running the tests. The test suite derives isolated database
names from `MONGODB_URL` and refuses to reset a database unless it has the
expected test-only name.

```sh
bun run db:up
bun test
bun run check
bun run check:design
bun run build:frontend
```

These commands cover concept behavior, composition and HTTP integration,
authentication cookies, access control, generated-artifact consistency,
TypeScript, specification form, and the production frontend build. To inspect
sync-engine's advisory diagnostics in full, run:

```sh
bunx sync-engine check --show-advisories
```

## Authentication and access control

Passwords are stored as Argon2id verifiers. Successful sign-in creates a
30-minute server-side session and sends its identifier in a `Secure`,
`HttpOnly`, `SameSite=Strict` cookie. The browser cannot read the session value,
and signing out invalidates the server-side session before the cookie is
cleared.

The backend derives the acting user from that session. It does not trust a user
identifier supplied by the browser. Agreement participants and accepted
resolvers receive only the access their concept-owned roles allow. Invitation
tokens identify an agreement, but possession of a token does not authorize an
outsider to read or change it. Obligation details remain limited to the owing
person and recipient.

## Design sources

The files under `design/` are the maintained behavioral contract for the P2
implementation:

- [Core user journey](design/core-user-journey.md)
- [Shared types](design/types.md)
- [Concept specifications](design/concepts/)
- [Application composition](design/compositions/FriendlyFive.md)

The `Design-Documents/` directory preserves the earlier P1 submission material
as design history:

- [Problem framing](Design-Documents/problem-framing.md)
- [Application pitch](Design-Documents/application-pitch.md)
- [Original concept design](Design-Documents/concept-design.md)
- [UI sketches](Design-Documents/UI-sketches.md)
- [Original user journey](Design-Documents/user-journey.md)

When an earlier artifact and a maintained specification differ, the files under
`design/` describe the current MVP behavior.

## P3 work

P3 work includes public deployment, displaying chronological report history,
additional mobile and accessibility review, and further loading and visual
polish. Broader dashboard filtering and policies for long-running completion
disputes can be evaluated without expanding the P2 core journey.
