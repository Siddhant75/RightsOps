# RightsOps — Rights-aware Campaign Operations

RightsOps is a WebMCP-enabled creative-operations workspace where a human can
delegate an exact campaign to an agent without delegating open-ended publish
authority. If the authorization evidence behind that approval changes, the
site withdraws the agent's publish capability until the campaign is repaired
and explicitly approved again.

**Live demo:**
[Open RightsOps](https://webmcp-rightsops-phase0.vercel.app/campaign/campaign-japan-social)

**Video:** [Watch the 2:50 demo on YouTube](https://youtu.be/Ie_SSwNdAVM)

> Demo rights metadata is structured input for workflow authorization; this
> project does not provide legal advice. Rights updates and social publication
> are simulated. The WebMCP lifecycle, server validation, human approval,
> stale-proof rejection, and one-shot capability consumption are real.

## The moment authority disappears

[![Stale manifest: authorization falls from 3/3 to 2/3 and publish authority is withdrawn](docs/evidence/phase-8-stale.png)](docs/evidence/phase-8-stale.png)

One selected asset's evidence changes from v1 to v2. The approved proof is now
stale: authorization falls from **3/3 to 2/3**, and the publish tool disappears.
Repair and exact human reapproval are required before publication.

Supporting Phase 8 frames: [Approved authority](docs/evidence/phase-8-approved.png)
→ [Stale withdrawal](docs/evidence/phase-8-stale.png)
→ [Published receipt and audit](docs/evidence/phase-8-published.png).

## Why WebMCP is necessary

Ordinary UI automation can click whatever controls happen to be visible, but
it does not give the website a structured way to express which actions an agent
is currently authorized to perform. RightsOps uses the WebMCP tool surface as a
live, inspectable capability boundary:

- the agent reads structured campaign and authorization evidence instead of
  scraping asset cards;
- the agent can prepare a review manifest but cannot approve it;
- the human approves the exact manifest in the application UI;
- only then does the page expose one decision-free, manifest-bound publish
  tool;
- stale authorization evidence removes that tool; and
- successful publication consumes it once.

This makes the collaboration faster than manually transferring rights details
between a person and an agent, while keeping the consequential decision visible
and human-owned.

## Three-minute judge path

1. Open the [campaign workspace](https://webmcp-rightsops-phase0.vercel.app/campaign/campaign-japan-social)
   in a WebMCP-capable client with Site Tools enabled. Under **Demo controls**,
   use **Reset deterministic demo** to start a fresh run. Reset replaces the shared demo state;
   do not reset during another person's demonstration.
2. Give the agent the starter prompt below. It inspects the campaign, finds
   eligible assets, and prepares the initial manifest, stopping for your review.
3. Click **Approve exact campaign**. Observe the exact
   `publish_approved_campaign_manifest-<id>` tool appear.
4. Under **Demo controls**, trigger the rights update. Observe
   `PROOF STALE · v1 → v2`, `3/3 → 2/3`, and publish authority removal.
5. Ask the agent to inspect the stale proof, select a replacement, and prepare
   a new manifest.
6. Approve the replacement, then ask the agent to invoke the new publish tool.
7. Observe the server-generated receipt, causal audit trail, and consumed tool
   removal.

Copy-paste starter prompt:

```text
Using only RightsOps Site Tools, get the current campaign, list the assets,
inspect asset-sakura, and find assets eligible for the current campaign.
If asset-sakura, asset-neon, and asset-train are eligible, prepare the exact
three-asset manifest with those assets. Otherwise explain the mismatch and stop.
Report the result and wait for my review. Do not approve or publish anything.
```

`registerTool` support is sufficient for agent tools. In-page tool enumeration
and event observation are optional; clients without them show unavailable
observability, not an inferred tool inventory. Use the agent's own discovery
surface to inspect its actual callable tools.

The demo uses labelled original Site Tools history for readable agent-side
evidence. The full live WebMCP lifecycle is reproducible through the judge path
above.

## Architecture

The server owns workflow truth and authorization. The human UI and WebMCP tools
call the same Next.js route handlers and application services. The browser
registry exposes only the subset of tools valid for the current
server-authoritative state.

```mermaid
flowchart LR
    Human[Human operator] --> UI[Next.js campaign UI]
    Agent[WebMCP-aware agent] --> MC[document.modelContext]
    MC --> Registry[State-aware WebMCP registry]
    Registry --> API[Next.js route handlers]
    UI --> API
    API --> Services[Campaign, rights, approval, publish services]
    Services --> DB[(Postgres)]
    Services --> Audit[Audit events and publish receipt]
    DB --> Services
```

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> ReviewReady: agent prepares exact manifest
    ReviewReady --> Approved: human approves exact manifest
    Approved --> Stale: rights evidence version changes
    Stale --> ReviewReady: agent repairs manifest
    Approved --> Published: one-shot publish succeeds
    Published --> [*]

    note right of ReviewReady
      No approval tool exists
    end note
    note right of Approved
      Exact parameterless publish tool appears
    end note
    note right of Stale
      Publish tool is withdrawn
    end note
```

### WebMCP implementation

RightsOps uses the direct Imperative API through
`document.modelContext.registerTool(...)`:

- [`src/webmcp/feature-detect.ts`](src/webmcp/feature-detect.ts) enables core
  WebMCP whenever `document.modelContext.registerTool` exists and keeps the
  human workflow usable when it is unavailable.
- [`src/webmcp/registry.ts`](src/webmcp/registry.ts) binds every registration to
  an `AbortController`, unregisters by aborting that signal, and reconciles the
  observed surface with `document.modelContext.getTools()` when available.
  Missing enumeration never disables registration or produces a fake tool list.
- [`src/webmcp/use-campaign-tools.ts`](src/webmcp/use-campaign-tools.ts)
  derives the desired tool set from server state. `toolchange` is telemetry
  only; it never drives authorization or workflow state.
- [`src/webmcp/tools/read-tools.ts`](src/webmcp/tools/read-tools.ts) exposes
  structured reads with `readOnlyHint: true`.
- [`src/webmcp/tools/draft-tools.ts`](src/webmcp/tools/draft-tools.ts) lets the
  agent prepare or repair a manifest, but exposes no approval operation.
- [`src/webmcp/tools/approved-tools.ts`](src/webmcp/tools/approved-tools.ts)
  creates exactly one empty-input publish tool bound to the approved manifest.
  It awaits the server response before later Published-state synchronization
  removes the registration.
- [`src/webmcp/tools/published-tools.ts`](src/webmcp/tools/published-tools.ts)
  exposes the completed receipt and audit record as read-only tools.

The server independently verifies exact approval, current proof versions,
manifest binding, and one-shot consumption. Removing a client tool improves the
agent experience; it is not the only security control.

## Local setup

### Prerequisites

- Node.js **20.19+ (20.x), 22.12+ (22.x), or 24+**. Next.js itself requires
  `>=20.9.0`, but the locked Vite/Vitest test stack needs the higher versions
  listed here. This cleanup was verified on Node 22.14.0.
- npm 10 or newer
- a dedicated **Neon Postgres** development database. The runtime uses Neon's
  HTTP driver; a plain local PostgreSQL URL alone is not sufficient.

### Run the project

```bash
npm ci
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` for the copy command. Edit `.env`
with your development database's connection string without committing it:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Use `.env`, not `.env.local`, so both Next.js and the Drizzle CLI load the same
configuration. The checked-in Drizzle CLI already loads `.env` automatically.
If upgrading an existing checkout, reconcile any old `DATABASE_URL` in
`.env.local` (or environment-specific env files) first: those values override
`.env` in Next.js but are not loaded by the Drizzle CLI. An exported shell
`DATABASE_URL` also takes precedence. Confirm both commands target your
development database before pushing the schema or resetting demo data.
Apply the schema to that dedicated database and start the development server:

```bash
npm run db:push
npm run dev
```

Open
[`http://localhost:3000/campaign/campaign-japan-social`](http://localhost:3000/campaign/campaign-japan-social).
Click **Demo controls → Reset deterministic demo** to seed the complete eight-asset scenario.
Schema push changes the configured database; reset replaces its demo workflow
data. Never point local setup or tests at the shared production database.

## Verification

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

The database-backed integration suite runs when `DATABASE_URL` is present in
the test process and is explicitly skipped otherwise. Vitest does not load
`.env` automatically. This suite resets and mutates its configured database;
use only a disposable development/test database. Playwright builds and starts the production
application, exercises the human fallback path, and verifies Approved, Stale,
Published, refresh-reconstruction, reset, and error states. Native target-client
WebMCP evidence is recorded separately because Playwright is regression proof,
not a substitute for a WebMCP-capable client.

The checked-in tests cover rights evaluation, exact manifest binding, human
approval boundaries, stale-evidence rejection, one-shot consumption and clients
with registration but no optional observation APIs. For live client verification,
follow the judge path above and inspect the agent's actual discovered tools after
each transition; do not infer that surface from a screenshot or a test harness.

## Technology

Next.js 16, React 19, TypeScript, direct WebMCP Imperative API, Drizzle ORM,
Postgres, Zod, Vitest, and Playwright.

## License

Released under the [MIT License](LICENSE).
