import type { AuthorizationSummary } from "@/components/campaign/workspace-view";
import type { DemoWorkflowState } from "@/server/seed/demo-scenario";
import type { RegisteredTool, RegistryObservation } from "@/webmcp/registry";
import {
  getCampaignToolSurfaceKey,
  type CampaignToolsStatus,
} from "@/webmcp/use-campaign-tools";

export interface PublishAuthorityNarrative {
  detail: string;
  headline: string;
  tone: "granted" | "neutral" | "removed";
}

export function getPublishAuthorityNarrative(
  state: DemoWorkflowState,
): PublishAuthorityNarrative {
  switch (state.campaign.status) {
    case "DRAFT":
      return {
        detail:
          "No exact campaign manifest has been prepared for human review.",
        headline: "Publish authority unavailable",
        tone: "neutral",
      };
    case "REVIEW_READY":
      return {
        detail:
          "The exact manifest is ready, but only a human can grant approval.",
        headline: "Publish authority awaiting approval",
        tone: "neutral",
      };
    case "APPROVED": {
      const manifestId = state.currentManifest?.id;
      if (!manifestId) {
        return {
          detail:
            "Server state has no approved manifest to bind a publish capability.",
          headline: "Publish authority unavailable",
          tone: "removed",
        };
      }
      return {
        detail: `Exact human approval is current for ${manifestId}. The browser may expose its one-shot publish capability.`,
        headline: "Publish authority granted",
        tone: "granted",
      };
    }
    case "STALE":
      return {
        detail:
          "Authorization evidence became stale. Repair the manifest and obtain a new exact human approval.",
        headline: "Publish authority removed",
        tone: "removed",
      };
    case "PUBLISHED":
      return {
        detail:
          "The approved capability completed successfully and was consumed after its result returned.",
        headline: "Publish authority consumed",
        tone: "neutral",
      };
  }
}

export function getCapabilityToolBadges(tool: RegisteredTool): string[] {
  const badges: string[] = [];

  if (tool.annotations?.readOnlyHint) badges.push("read-only");
  if (tool.annotations?.untrustedContentHint) badges.push("untrusted content");
  if (tool.name.startsWith("publish_approved_campaign_")) {
    badges.push("one-shot action");
  } else if (!tool.annotations?.readOnlyHint) {
    badges.push("action");
  }

  return badges;
}

export function getRecentRegistryEvidence(
  events: RegistryObservation[],
): RegistryObservation[] {
  return events.slice(-3).reverse();
}

export function getVisibleObservedTools(
  state: DemoWorkflowState,
  observedTools: RegisteredTool[],
  synchronizedSurfaceKey: string | null,
): RegisteredTool[] {
  if (synchronizedSurfaceKey !== getCampaignToolSurfaceKey(state)) return [];

  return [...observedTools].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function describeRegistryEvent(event: RegistryObservation | undefined): string {
  if (!event) return "No registry operation observed yet.";
  if (event.kind === "toolchange") {
    return "Browser reported a WebMCP surface change.";
  }

  return `${event.toolName} ${event.kind}.`;
}

interface CapabilitySurfaceProps {
  authorization: AuthorizationSummary;
  state: DemoWorkflowState;
  tools: CampaignToolsStatus;
}

export function CapabilitySurface({
  authorization,
  state,
  tools,
}: CapabilitySurfaceProps) {
  const narrative = getPublishAuthorityNarrative(state);
  const observedTools = getVisibleObservedTools(
    state,
    tools.observedTools,
    tools.synchronizedSurfaceKey,
  );
  const surfaceIsCurrent =
    tools.synchronizedSurfaceKey === getCampaignToolSurfaceKey(state);
  const displayedAvailability =
    tools.availability === "unavailable" || tools.availability === "error"
      ? tools.availability
      : surfaceIsCurrent
        ? tools.availability
        : "checking";
  const recentRegistryEvents = getRecentRegistryEvidence(tools.registryEvents);
  const latestToolChange = tools.toolChangeEvents.at(-1);
  const latestAgentAction = [...state.auditEvents]
    .reverse()
    .find((event) => event.actor === "AGENT");

  return (
    <section className="capability-surface" aria-labelledby="capability-heading">
      <div className="section-heading capability-heading">
        <div>
          <p className="workspace-kicker">Observed WebMCP authority</p>
          <h2 id="capability-heading">Capability Surface</h2>
        </div>
        <span className={`capability-live capability-live--${displayedAvailability}`}>
          {displayedAvailability}
        </span>
      </div>

      <div className={`authority-story authority-story--${narrative.tone}`}>
        <p>{narrative.headline}</p>
        <strong>{narrative.detail}</strong>
      </div>

      <dl className="capability-facts">
        <div>
          <dt>Server state</dt>
          <dd>{state.campaign.status.replace("_", " ")}</dd>
        </div>
        <div>
          <dt>Authorization</dt>
          <dd>{authorization.label}</dd>
        </div>
        <div>
          <dt>Observed source</dt>
          <dd>
            {tools.availability === "unavailable"
              ? "Unavailable in this browser"
              : "document.modelContext.getTools()"}
          </dd>
        </div>
      </dl>

      <div className="capability-tools" aria-label="Observed WebMCP tools">
        {observedTools.length > 0 ? (
          <ul>
            {observedTools.map((tool) => (
              <li key={tool.name}>
                <code>{tool.name}</code>
                <span>
                  {getCapabilityToolBadges(tool).map((badge) => (
                    <small key={badge}>{badge}</small>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>
            {tools.availability === "unavailable"
              ? "This browser does not expose WebMCP; the human workflow remains available."
              : !surfaceIsCurrent
                ? "Reconciling browser tools for the current server state."
              : "No browser tools have been reconciled yet."}
          </p>
        )}
      </div>

      <div className="capability-evidence">
        <div>
          <span>Recent registry operations</span>
          {recentRegistryEvents.length > 0 ? (
            <ol>
              {recentRegistryEvents.map((event) => (
                <li key={`${event.observedAt}-${event.kind}-${event.toolName}`}>
                  {describeRegistryEvent(event)}
                </li>
              ))}
            </ol>
          ) : (
            <p>No registry operation observed yet.</p>
          )}
        </div>
        <div>
          <span>Latest toolchange telemetry</span>
          <p>
            {latestToolChange
              ? describeRegistryEvent(latestToolChange)
              : "No toolchange event observed yet."}
          </p>
        </div>
        <div>
          <span>Latest agent action</span>
          <p>{latestAgentAction?.summary ?? "No agent mutation recorded yet."}</p>
        </div>
      </div>
    </section>
  );
}
