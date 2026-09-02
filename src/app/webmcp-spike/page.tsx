"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getModelContext } from "@/webmcp/feature-detect";
import {
  WebMcpRegistry,
  type ModelContextTool,
  type RegisteredTool,
  type RegistryObservationStatus,
} from "@/webmcp/registry";

const APPROVED_TOOL_NAME = "execute_approved_spike";
const STORAGE_KEY = "webmcp-deployment-spike-state-v1";

interface SpikeState {
  approved: boolean;
  approvalCycle: number;
  executions: number;
}

interface TimelineEvent {
  id: number;
  message: string;
  source: "registry" | "system" | "toolchange";
  time: string;
}

type Availability = "checking" | "available" | "unavailable" | "error";

const INITIAL_STATE: SpikeState = {
  approved: false,
  approvalCycle: 0,
  executions: 0,
};

const EMPTY_SCHEMA = {
  additionalProperties: false,
  properties: {},
  type: "object",
} as const;

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadPersistedState(): SpikeState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return INITIAL_STATE;
    }

    const parsed = JSON.parse(stored) as Partial<SpikeState>;
    return {
      approved: parsed.approved === true,
      approvalCycle:
        typeof parsed.approvalCycle === "number" ? parsed.approvalCycle : 0,
      executions: typeof parsed.executions === "number" ? parsed.executions : 0,
    };
  } catch {
    return INITIAL_STATE;
  }
}

function createReadTool(getState: () => SpikeState): ModelContextTool {
  return {
    annotations: { readOnlyHint: true },
    description:
      "Return the current human approval state for the WebMCP deployment spike.",
    execute: async () => JSON.stringify(getState()),
    inputSchema: EMPTY_SCHEMA,
    name: "get_spike_state",
    title: "Get deployment spike state",
  };
}

export function createApprovedTool(
  executeApprovedSpike: () => SpikeState,
  getState: () => SpikeState,
): ModelContextTool {
  return {
    description:
      "Execute the transient deployment-spike action that the human currently approved. This tool accepts no decision-bearing input.",
    execute: async (_input, options) => {
      if (options?.signal.aborted) {
        throw new Error("The approved spike execution was cancelled.");
      }
      if (!getState().approved) {
        throw new Error("The human approval is no longer active.");
      }
      const state = executeApprovedSpike();
      return JSON.stringify({
        approvalCycle: state.approvalCycle,
        executions: state.executions,
        status: "approved spike executed",
      });
    },
    inputSchema: EMPTY_SCHEMA,
    name: APPROVED_TOOL_NAME,
    title: "Execute approved deployment spike",
  };
}

export default function WebMcpSpikePage() {
  const [availability, setAvailability] = useState<Availability>("checking");
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [observedTools, setObservedTools] = useState<RegisteredTool[]>([]);
  const [observation, setObservation] = useState<RegistryObservationStatus>({
    reconciliation: "unavailable",
    toolchange: false,
  });
  const [spikeState, setSpikeState] = useState<SpikeState>(INITIAL_STATE);
  const eventId = useRef(0);
  const registryRef = useRef<WebMcpRegistry | null>(null);
  const stateRef = useRef<SpikeState>(INITIAL_STATE);

  const appendEvent = useCallback(
    (source: TimelineEvent["source"], message: string) => {
      eventId.current += 1;
      const nextEvent: TimelineEvent = {
        id: eventId.current,
        message,
        source,
        time: new Date().toLocaleTimeString(),
      };
      setEvents((current) => [nextEvent, ...current].slice(0, 12));
    },
    [],
  );

  const applyState = useCallback((nextState: SpikeState) => {
    stateRef.current = nextState;
    setSpikeState(nextState);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    } catch {
      // The live session still works when storage is blocked.
    }
  }, []);

  const recordExecution = useCallback(() => {
    const nextState = {
      ...stateRef.current,
      executions: stateRef.current.executions + 1,
    };
    applyState(nextState);
    appendEvent(
      "registry",
      `${APPROVED_TOOL_NAME} executed for approval cycle ${nextState.approvalCycle}.`,
    );
    return nextState;
  }, [appendEvent, applyState]);

  useEffect(() => {
    let cancelled = false;
    const restoredState = loadPersistedState();

    const modelContext = getModelContext();
    if (!modelContext) {
      queueMicrotask(() => {
        if (cancelled) return;
        applyState(restoredState);
        setAvailability("unavailable");
        appendEvent(
          "system",
          "document.modelContext is unavailable; the human state toggle remains usable.",
        );
      });
      return;
    }

    const registry = new WebMcpRegistry(modelContext, (event) => {
      if (!cancelled && event.kind === "toolchange") {
        appendEvent(
          "toolchange",
          "Observed browser toolchange event (instrumentation only).",
        );
      }
    });
    registryRef.current = registry;

    const initialize = async () => {
      try {
        applyState(restoredState);
        let tools = await registry.register(
          createReadTool(() => stateRef.current),
        );
        if (cancelled) return;
        setObservedTools(tools);
        setObservation(registry.observationStatus);
        appendEvent(
          "registry",
          "Registered get_spike_state.",
        );

        if (restoredState.approved) {
          tools = await registry.register(
            createApprovedTool(recordExecution, () => stateRef.current),
          );
          if (cancelled) return;
          setObservedTools(tools);
          setObservation(registry.observationStatus);
          appendEvent(
            "registry",
            "Restored approved state and registered execute_approved_spike.",
          );
        }

        setAvailability("available");
      } catch (error) {
        if (cancelled) return;
        const message = formatError(error);
        setAvailability("error");
        setLastError(message);
        appendEvent("system", `WebMCP initialization failed: ${message}`);
      }
    };

    void initialize();

    return () => {
      cancelled = true;
      registry.dispose();
      registryRef.current = null;
    };
  }, [appendEvent, applyState, recordExecution]);

  const toggleApproval = async () => {
    const previousState = stateRef.current;
    const approving = !previousState.approved;
    const nextState: SpikeState = {
      ...previousState,
      approved: approving,
      approvalCycle: approving
        ? previousState.approvalCycle + 1
        : previousState.approvalCycle,
    };
    applyState(nextState);
    setBusy(true);
    setLastError(null);

    const registry = registryRef.current;
    if (!registry) {
      appendEvent(
        "system",
        `Human ${approving ? "approved" : "revoked"} locally; no WebMCP registration was attempted.`,
      );
      setBusy(false);
      return;
    }

    try {
      const tools = approving
        ? await registry.register(
            createApprovedTool(recordExecution, () => stateRef.current),
          )
        : await registry.unregister(APPROVED_TOOL_NAME);
      setObservedTools(tools);
      setObservation(registry.observationStatus);
      setAvailability("available");
      appendEvent(
        "registry",
        approving
          ? "Human approved: registered execute_approved_spike."
          : "Human revoked: aborted execute_approved_spike.",
      );
    } catch (error) {
      const message = formatError(error);
      if (approving) {
        applyState(previousState);
      }
      setLastError(message);
      setAvailability("error");
      appendEvent("system", `Registration change failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const synchronizeNow = async () => {
    const registry = registryRef.current;
    if (!registry) return;

    setBusy(true);
    setLastError(null);
    try {
      let tools = registry.has("get_spike_state")
        ? await registry.reconcile()
        : await registry.register(createReadTool(() => stateRef.current));

      if (stateRef.current.approved && !registry.has(APPROVED_TOOL_NAME)) {
        tools = await registry.register(
          createApprovedTool(recordExecution, () => stateRef.current),
        );
      } else if (
        !stateRef.current.approved &&
        registry.has(APPROVED_TOOL_NAME)
      ) {
        tools = await registry.unregister(APPROVED_TOOL_NAME);
      }

      setObservedTools(tools);
      setObservation(registry.observationStatus);
      setAvailability("available");
      appendEvent(
        "registry",
        "Synchronized the desired registrations; attempted optional browser tool enumeration.",
      );
    } catch (error) {
      const message = formatError(error);
      setLastError(message);
      setAvailability("error");
      appendEvent("system", `Tool synchronization failed: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = {
    available: "WebMCP available",
    checking: "Checking WebMCP",
    error: "WebMCP error",
    unavailable: "WebMCP unavailable",
  }[availability];

  return (
    <main className="spike-shell">
      <header className="spike-header">
        <div>
          <p className="eyebrow">Phase 0 · deployment spike</p>
          <h1>Can the agent see authority change?</h1>
          <p className="lede">
            One read-only tool stays registered. Human approval exposes one
            transient action; revocation removes it. When supported, the list below comes from
            <code> document.modelContext.getTools()</code>, not an app mirror.
          </p>
        </div>
        <div className={`availability availability--${availability}`}>
          <span aria-hidden="true" />
          {statusLabel}
        </div>
      </header>

      {availability === "unavailable" ? (
        <section className="compatibility" role="status">
          <strong>This client does not expose document.modelContext.</strong>
          <span>
            The human toggle still persists. Open this HTTPS page in the target
            WebMCP client or WebMCP-enabled Chrome to perform live discovery.
          </span>
        </section>
      ) : null}

      {lastError ? (
        <section className="compatibility compatibility--error" role="alert">
          <strong>WebMCP operation failed.</strong>
          <span>{lastError}</span>
        </section>
      ) : null}

      <div className="spike-grid">
        <section className="panel approval-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Human state</p>
              <h2>{spikeState.approved ? "Approved" : "Not approved"}</h2>
            </div>
            <span
              className={`state-seal ${spikeState.approved ? "state-seal--approved" : ""}`}
            >
              {spikeState.approved ? "LIVE" : "CLOSED"}
            </span>
          </div>

          <dl className="state-metrics">
            <div>
              <dt>Approval cycle</dt>
              <dd>{spikeState.approvalCycle}</dd>
            </div>
            <div>
              <dt>Agent executions</dt>
              <dd>{spikeState.executions}</dd>
            </div>
          </dl>

          <button
            className={spikeState.approved ? "button button--revoke" : "button"}
            disabled={busy || availability === "checking"}
            onClick={() => void toggleApproval()}
            type="button"
          >
            {busy
              ? "Synchronizing…"
              : spikeState.approved
                ? "Revoke transient tool"
                : spikeState.approvalCycle > 0
                  ? "Approve a new tool"
                  : "Approve transient tool"}
          </button>
          <p className="microcopy">
            This is a local spike state, persisted only to prove refresh
            reconstruction. It is not the later campaign approval workflow.
          </p>
        </section>

        <section className="panel tools-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Observed capability surface</p>
              <h2>
                {observation.reconciliation === "available"
                  ? <>{observedTools.length} actual tools</>
                  : "Browser enumeration unavailable"}
              </h2>
            </div>
            <button
              className="text-button"
              disabled={
                availability === "checking" ||
                availability === "unavailable" ||
                busy
              }
              onClick={() => void synchronizeNow()}
              type="button"
            >
              {availability === "error" ? "Retry synchronization" : "Reconcile now"}
            </button>
          </div>

          {observedTools.length > 0 ? (
            <ul className="tool-list">
              {observedTools.map((tool) => (
                <li key={`${tool.origin ?? "same-origin"}:${tool.name}`}>
                  <div>
                    <code>{tool.name}</code>
                    <span>{tool.description}</span>
                  </div>
                  <span className="tool-kind">
                    {tool.annotations?.readOnlyHint ? "READ ONLY" : "ACTION"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-state">
              {availability === "available" && observation.reconciliation !== "available"
                ? "WebMCP registration is active; optional browser enumeration is unavailable. Inspect the agent's Site Tools for callable capabilities."
                : "No tools observed yet. In an unavailable client this is expected."}
            </p>
          )}
          <p className="source-note">
            {observation.reconciliation === "available" ? (
              <>Source: same-origin <code>document.modelContext.getTools()</code>
                {" "}after each resolved registration change.</>
            ) : (
              "Optional browser enumeration is unavailable; no observed tool list is claimed."
            )}
          </p>
        </section>

        <section className="panel events-panel">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Instrumentation</p>
              <h2>Lifecycle evidence</h2>
            </div>
          </div>
          {events.length > 0 ? (
            <ol className="event-list">
              {events.map((event) => (
                <li key={event.id}>
                  <span className={`event-source event-source--${event.source}`}>
                    {event.source}
                  </span>
                  <p>{event.message}</p>
                  <time>{event.time}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">Waiting for initialization.</p>
          )}
          <p className="source-note">
            <code>toolchange</code> is logged as observation only. It never
            authorizes an action or drives the displayed tool list.
            {!observation.toolchange && " Optional toolchange observation unavailable."}
          </p>
        </section>

        <section className="panel probe-panel">
          <p className="panel-kicker">Target-client run</p>
          <h2>Live probe sequence</h2>
          <ol className="probe-steps">
            <li>Ask the agent to call <code>get_spike_state</code>.</li>
            <li>Approve, then start the next agent turn and discover the action.</li>
            <li>Revoke, then confirm the agent no longer sees the action.</li>
            <li>Approve again and confirm the new transient tool is discoverable.</li>
            <li>Refresh while approved and verify both tools reconstruct.</li>
          </ol>
          <p className="microcopy">
            If mid-turn refresh is unreliable, use the documented fallback:
            explicit next turn, then controlled page refresh.
          </p>
        </section>
      </div>
    </main>
  );
}
