"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AssetGrid } from "@/components/campaign/AssetGrid";
import { AuditTimeline } from "@/components/campaign/AuditTimeline";
import { AuthorizationSummary } from "@/components/campaign/AuthorizationSummary";
import { CampaignBrief } from "@/components/campaign/CampaignBrief";
import { DemoControls } from "@/components/campaign/DemoControls";
import { ManifestReview } from "@/components/campaign/ManifestReview";
import { PublishReceiptView } from "@/components/campaign/PublishReceiptView";
import {
  getAuthorizationSummary,
  getRecommendedManifestAssetIds,
} from "@/components/campaign/workspace-view";
import {
  REPLACEMENT_ASSET_ID,
  type DemoWorkflowState,
} from "@/server/seed/demo-scenario";

interface CampaignWorkspaceProps {
  campaignId: string;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | { error?: string };
  if (!response.ok) {
    const message = "error" in (payload as object) ? (payload as { error?: string }).error : undefined;
    throw new Error(message || `Request failed with ${response.status}`);
  }
  return payload as T;
}

export function CampaignWorkspace({ campaignId }: CampaignWorkspaceProps) {
  const [state, setState] = useState<DemoWorkflowState | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/demo/state", { cache: "no-store" });
    const nextState = await readJson<DemoWorkflowState>(response);
    setState(nextState);
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/demo/state", { cache: "no-store" })
      .then((response) => readJson<DemoWorkflowState>(response))
      .then((nextState) => {
        if (active) setState(nextState);
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const runAction = useCallback(
    async (label: string, path: string, body: Record<string, unknown> = {}) => {
      setPendingAction(label);
      setError(null);
      try {
        await readJson(
          await fetch(path, {
            body: JSON.stringify(body),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
        );
        await refresh();
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setPendingAction(null);
      }
    },
    [refresh],
  );

  const recommendation = useMemo(
    () => (state ? getRecommendedManifestAssetIds(state) : []),
    [state],
  );

  if (!state) {
    return (
      <main className="campaign-workspace campaign-workspace--loading">
        <div className="loading-card">
          <p className="workspace-kicker">RightsOps</p>
          <h1>{error ? "Workspace unavailable" : "Loading campaign authority…"}</h1>
          {error ? <p role="alert">{error}</p> : null}
          {error ? (
            <button className="workspace-button workspace-button--primary" onClick={() => runAction("reset", "/api/demo/reset")} type="button">
              Initialize deterministic demo
            </button>
          ) : null}
        </div>
      </main>
    );
  }

  if (state.campaign.id !== campaignId) {
    return <main className="campaign-workspace"><p role="alert">Campaign not found: {campaignId}</p></main>;
  }

  const authorization = getAuthorizationSummary(state);
  const manifest = state.currentManifest;
  const pending = pendingAction !== null;
  const hasReplacementManifest = Boolean(manifest?.assetIds.includes(REPLACEMENT_ASSET_ID));

  return (
    <main className="campaign-workspace">
      <header className="workspace-topbar">
        <a className="wordmark" href={`/campaign/${state.campaign.id}`}>RIGHTS/OPS</a>
        <div className="topbar-state">
          <span className={`status-light status-light--${authorization.tone}`} />
          Server authority: {state.campaign.status.replace("_", " ")}
        </div>
      </header>

      <CampaignBrief campaign={state.campaign} />
      {error ? <div className="workspace-error" role="alert"><strong>Operation rejected.</strong> {error}</div> : null}
      {pendingAction ? <div className="workspace-progress" role="status">Running {pendingAction}…</div> : null}

      <div className="workspace-layout">
        <div className="workspace-main">
          <AuthorizationSummary summary={authorization} />
          <AssetGrid
            assets={state.assets}
            campaign={state.campaign}
            selectedAssetIds={manifest?.assetIds ?? recommendation}
          />
        </div>
        <aside className="workspace-rail">
          <ManifestReview
            assets={state.assets}
            campaignStatus={state.campaign.status}
            manifest={manifest}
            onApprove={() => manifest && runAction("human approval", `/api/manifests/${manifest.id}/approve`)}
            pending={pending}
          />
          <DemoControls
            hasReplacementManifest={hasReplacementManifest}
            onPrepare={() => runAction("manifest preparation", `/api/campaigns/${state.campaign.id}/manifest`, { assetIds: recommendation })}
            onPublish={() => manifest && runAction("simulated publish", `/api/manifests/${manifest.id}/publish`)}
            onReset={() => runAction("demo reset", "/api/demo/reset")}
            onRevoke={() => runAction("rights update", "/api/demo/revoke")}
            pending={pending}
            status={state.campaign.status}
          />
        </aside>
      </div>

      {state.publishReceipt ? <PublishReceiptView assets={state.assets} receipt={state.publishReceipt} /> : null}
      <AuditTimeline events={state.auditEvents} />
      <footer className="workspace-footer">
        <span>Human workflow active</span>
        <a href="/webmcp-spike">Phase 0 compatibility spike</a>
      </footer>
    </main>
  );
}
