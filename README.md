# FriendlyFive

FriendlyFive helps two friends agree on wager terms, resolve an outcome, and
confirm fulfillment of the resulting obligation. Built for MIT 6.1040 Software
Design with Bun, TypeScript, MongoDB, Vue, and MIT's sync-engine, it records
stakes without processing payments or enforcing real-world obligations.

**[Open FriendlyFive](https://friendly-five.mit-sdg.dev/)**

## Project materials

- [Final design document](design/FriendlyFive-Final-Design.md)
- [Final demo video](https://drive.google.com/file/d/1U_kXFZup3HIj6tVQDC5XS1aaPw47Iyaq/view?usp=sharing)
- [Core user journey](design/core-user-journey.md) — invitation, agreement,
  third-party resolution, and fulfillment
- [Current concept specifications](design/concepts/) and [shared types](design/types.md)
- [Reactions and API endpoints](design/compositions/FriendlyFive.md)
- [Concept and integration tests](tests/) and [validation results](#validation-results)

## Run locally

Install [Bun](https://bun.sh/) 1.4.2 and [Podman](https://podman.io/) with Compose
support. On macOS, start the Podman virtual machine with `podman machine start`.
Then run:

```sh
git clone https://github.com/wyattalford/friendly-five.git
cd friendly-five
bun install --frozen-lockfile
cp .env.example .env
bun run generate
bun run dev
```

Open [127.0.0.1:5173](http://127.0.0.1:5173). The development command starts
MongoDB, the backend on port 3000, and Vite on port 5173. Vite proxies `/api`
to the backend. For separate service logs, run `bun run db:up`, then run
`bun run dev:backend` and `bun run dev:frontend` in separate terminals.

### Configuration

The supplied `.env.example` matches the local MongoDB container in
`compose.yaml`. Keep credentials in `.env`, which is excluded from Git.

| Variable | Purpose and default |
| --- | --- |
| `MONGODB_URL` | Required MongoDB URL, including database and authentication configuration |
| `PUBLIC_ORIGIN` | Exact browser origin; defaults to `http://127.0.0.1:5173` |
| `HOST` | Backend listener address; defaults to `127.0.0.1` |
| `PORT` | Backend port; defaults to `3000` |
| `NODE_ENV` | Set to `production` for production-mode operation |

### Production build and preview

```sh
bun run preview
```

This starts MongoDB, generates the typed API, builds Vue, and serves the API and
frontend together at [127.0.0.1:3000](http://127.0.0.1:3000). The
[/health](http://127.0.0.1:3000/health) endpoint returns `ok` when MongoDB is
reachable and the frontend build exists.

The course-managed deployment uses the same single-server application. Its
build and startup commands are `bun run build` and `bun run start`. Configure
`MONGODB_URL`, `PUBLIC_ORIGIN`, and the listener address/port for that environment.

## Try the app

Follow the [core journey](design/core-user-journey.md), or use these steps with
synthetic accounts:

1. Register the proposer. Enter an existing username or email for the counterpart
   and optional resolver, or invite either person by an unused email. Share each
   person's separate invitation link privately. New users choose their username
   and password through their own link; the resolver can register before or
   after the participants accept.
2. Have the other participant review and accept the exact current version before
   its cutoff. Acceptance fixes the terms and the resolver arrangement.
3. After cutoff, submit an outcome. Ordinary evidence is optional. The other
   participant may confirm or dispute it with a required explanation.
4. For a disputed outcome, the agreed resolver may record a final decision with
   an explanation. Without a resolver, a replacement report must be confirmed by
   the other participant. Both may agree to VOID with no obligation.
5. Complete any resulting stake outside the app. The owing person reports
   completion, and the recipient confirms receipt or explains a dispute.

For an empty local database, `bun run db:reset` permanently removes the local
MongoDB volume and all development records. Then run `bun run dev` again.
Database logs and an interactive shell are available through `bun run db:logs`
and `bun run db:shell`.

## Test and check

Complete local setup above, then run:

```sh
bun run db:up
bun test
bun run check
bun run check:design
bun run build
```

Tests use guarded, isolated database names derived from `MONGODB_URL`.
`check` verifies concept source, generated contracts, and TypeScript;
`check:design` validates specification form. For framework advisories, run
`bun run check:advisories`.

An optional HTTP walkthrough creates identifiable synthetic accounts and
agreements through the running app. Select the environment explicitly. It
never resets or deletes records.

```sh
bun scripts/smoke-test.ts http://127.0.0.1:3000
```

### Validation results

Local checks on October 21, 2026 used Bun 1.4.2, MongoDB 8, and sync-engine
1.1.0.

| Check | Result |
| --- | --- |
| Concept and HTTP suite | 56 tests passed across ten files |
| Source, contracts, TypeScript, and specifications | Passed; 38 framework advisories |
| Production build | Passed, with upstream browser-externalization warnings |
| Clean source setup | Installation, generation, checks, tests, startup, health, and nested routes passed using the existing MongoDB container |
| HTTP walkthrough | Confirmation, third-party resolution, fulfillment, resolver-free VOID, malformed inputs, outsider restrictions, and new-session persistence passed |

Tests cover all four existing/new counterpart and resolver combinations,
role-specific activation, obsolete invitations, stale acceptance, unauthorized
reads and mutations, private evidence, and persisted state in a fresh application
instance. Five concurrency tests reproduced defects before correction and now
check that competing actions cannot both succeed or change accepted terms.

Manual browser checks confirmed immediate outcome and resolver-decision updates
and session restoration after reload. [Desktop](docs/images/desktop-outcome.png)
and [390-pixel phone-width](docs/images/phone-history.png) inspections covered
long content and history. Phone inspection used an iframe, not a physical device.
Screen-reader testing and manual photo uploads were not performed. The new
invitation flow was also checked in the browser with two unregistered invitees,
separate links, resolver registration before acceptance, the waiting screen,
first-version acceptance, and subsequent resolver access.

Final deployed checks on October 21 passed for all four existing/new counterpart
and resolver combinations, registration before and after acceptance, obsolete
invitations, stale acceptance, confirmation, third-party resolution, resolver-free
VOID, private photo evidence, concurrent resolver decisions, fulfillment disputes
and retries, malformed inputs, outsider restrictions, cookie protections,
sign-out, and new-session persistence. An account and completed obligation from
the preceding deployment also survived redeployment. The browser walkthrough
verified separate registration links, the resolver waiting screen, first-version
acceptance, automatic reporting availability at cutoff, dispute validation,
resolver decisions, fulfillment reporting, receipt confirmation, and completed
state after reload. No browser console errors were recorded during that journey.

## Architecture and access control

Concepts own their state and rules independently. The sync-engine
[composition](design/compositions/FriendlyFive.md) coordinates them, opens a
resolution case after acceptance, and records the losing stake after a final
TRUE or FALSE outcome. VOID creates no obligation. Vue uses the generated typed
HTTP client through [web/api.ts](web/api.ts).

| Concept | Responsibility |
| --- | --- |
| [Authenticating](design/concepts/Authenticating.md) | Accounts, passwords, and expiring sessions |
| [Agreeing](design/concepts/Agreeing.md) | Proposals, immutable term versions, and acceptance |
| [Linking](design/concepts/Linking.md) | Opaque, revocable invitation references |
| [Resolving](design/concepts/Resolving.md) | Reports, disputes, confirmation, and final decisions |
| [ObligationTracking](design/concepts/ObligationTracking.md) | Fulfillment reports and receipt confirmation |

Passwords use Argon2id. Sessions expire after 30 minutes and travel in Secure,
HttpOnly, SameSite=Strict cookies. The backend derives the actor from the session
and enforces permissions independently of frontend controls or supplied user IDs.
Invitation links identify agreements without granting access to private terms.
Accepted resolvers may review outcomes; fulfillment details remain private to
the two participants. Optional JPEG, PNG, and WebP evidence photos have a 2 MB
stored-image limit and the same role-based access as their reports.

Email ownership verification and automatic invitation delivery are not
implemented. Share invitation links privately. Conditional database writes
protect competing actions but do not provide multi-document crash recovery.

## Earlier milestone materials

The maintained behavior is specified in `design/`. Earlier submissions are
preserved in [Design-Documents/](Design-Documents/), the
[P3 visual design study](design/FriendlyFive-Visual-Design-Study.pdf), and
[P3 test output](docs/p3-test-output.txt). Previous recordings are available for
[P2](https://drive.google.com/file/d/1LJoGqUKwzpq3sLEaH6UJ4NyfNUX2rSIS/view?usp=sharing)
and [P3](https://drive.google.com/file/d/1mGXkJDHUEMHToegp6cs7LKL0_ci6V_rs/view?usp=sharing).
