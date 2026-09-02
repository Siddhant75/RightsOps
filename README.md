# RightsOps — Rights-aware Campaign Operations

RightsOps is a WebMCP-enabled creative-operations workspace where a human can
delegate an exact campaign to an agent without delegating open-ended publish
authority. If the authorization evidence behind that approval changes, the
site withdraws the agent's publish capability until the campaign is repaired
and explicitly approved again.

**Live demo:**
[webmcp-rightsops-phase0.vercel.app](https://webmcp-rightsops-phase0.vercel.app/campaign/campaign-japan-social)

> Demo rights metadata is structured input for workflow authorization; this
> project does not provide legal advice. Rights updates and social publication
> are simulated. The WebMCP lifecycle, server validation, human approval,
> stale-proof rejection, and one-shot capability consumption are real.

## The proof in three frames

| Approved | Authorization becomes stale | Published after repair |
|---|---|---|
| [![Approved manifest with exact publish authority](docs/evidence/phase-8-approved.png)](docs/evidence/phase-8-approved.png) | [![Stale manifest with publish authority withdrawn](docs/evidence/phase-8-stale.png)](docs/evidence/phase-8-stale.png) | [![Published campaign with receipt and audit trail](docs/evidence/phase-8-published.png)](docs/evidence/phase-8-published.png) |
| Human approved one exact manifest; its parameterless publish tool is visible. | One proof changes from v1 to v2, authorization falls from 3/3 to 2/3, and publish disappears. | The agent repairs the manifest, the human re-approves, and one-shot publication produces a server receipt. |

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
   in ChatGPT's WebMCP-capable in-app browser or Chrome 149+ with WebMCP testing
   enabled.
2. Ask the agent to inspect the campaign, find three eligible assets, and
   prepare the manifest.
3. Click **Approve exact campaign**. Observe the exact
   `publish_approved_campaign_manifest-<id>` tool appear.
4. Under **Demo controls**, trigger the rights update. Observe
   `PROOF STALE · v1 → v2`, `3/3 → 2/3`, and publish authority removal.
5. Ask the agent to inspect the stale proof, select a replacement, and prepare
   a new manifest.
6. Approve the replacement, then ask the agent to invoke the new publish tool.
7. Observe the server-generated receipt, causal audit trail, and consumed tool
   removal.

The complete timed narration is in
[docs/submission/demo-runbook.md](docs/submission/demo-runbook.md).

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

- [`src/webmcp/feature-detect.ts`](src/webmcp/feature-detect.ts) feature-detects
  the browser API and keeps the human workflow usable when it is unavailable.
- [`src/webmcp/registry.ts`](src/webmcp/registry.ts) binds every registration to
  an `AbortController`, unregisters by aborting that signal, and reconciles the
  observed surface with `document.modelContext.getTools()`.
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

More detail is available in [docs/03_ARCHITECTURE.md](docs/03_ARCHITECTURE.md)
and the judge-facing
[proof architecture](docs/07_PRIZE_PROOF_RETROFIT.md#proof-architecture).

## Local setup

### Prerequisites

- Node.js 20 or newer
- npm 10 or newer
- a PostgreSQL-compatible database; the deployed demo uses managed Postgres

### Run the project

```bash
npm install
```

Create `.env.local` without committing it:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require
```

Apply the checked-in schema and start the development server:

```bash
npm run db:push
npm run dev
```

Open
[`http://localhost:3000/campaign/campaign-japan-social`](http://localhost:3000/campaign/campaign-japan-social).
The deterministic reset action seeds the complete eight-asset scenario.

## Verification

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
```

The database-backed integration suite runs when `DATABASE_URL` is present and
is explicitly skipped otherwise. Playwright builds and starts the production
application, exercises the human fallback path, and verifies Approved, Stale,
Published, refresh-reconstruction, reset, and error states. Native target-client
WebMCP evidence is recorded separately because Playwright is regression proof,
not a substitute for a WebMCP-capable client.

See the current [submission-package verification](docs/evidence/phase-9-verification.md)
and the underlying
[native WebMCP verification](docs/evidence/phase-8-verification.md).

## Technology

Next.js 16, React 19, TypeScript, direct WebMCP Imperative API, Drizzle ORM,
Postgres, Zod, Vitest, and Playwright.

## License

Released under the [MIT License](LICENSE).
