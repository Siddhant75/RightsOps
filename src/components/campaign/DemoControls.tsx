import type { CampaignStatus } from "@/domain/types";

interface DemoControlsProps {
  hasReplacementManifest: boolean;
  onPrepare: () => void;
  onPublish: () => void;
  onReset: () => void;
  onRevoke: () => void;
  pending: boolean;
  status: CampaignStatus;
}

export function DemoControls({
  hasReplacementManifest,
  onPrepare,
  onPublish,
  onReset,
  onRevoke,
  pending,
  status,
}: DemoControlsProps) {
  return (
    <section className="demo-controls" aria-labelledby="demo-controls-heading">
      <div>
        <p className="workspace-kicker">Seeded workflow actions</p>
        <h2 id="demo-controls-heading">Demo controls</h2>
        <p className="control-note">
          Use these deterministic controls to replay the proof loop for judges.
        </p>
      </div>
      {status === "DRAFT" ? (
        <button className="workspace-button workspace-button--primary" disabled={pending} onClick={onPrepare} type="button">
          Prepare eligible manifest
        </button>
      ) : null}
      {status === "REVIEW_READY" ? (
        <p className="control-note">Review the exact package and use the human approval gate above.</p>
      ) : null}
      {status === "APPROVED" && !hasReplacementManifest ? (
        <button className="workspace-button workspace-button--danger" disabled={pending} onClick={onRevoke} type="button">
          Simulate rights update
        </button>
      ) : null}
      {status === "STALE" ? (
        <button className="workspace-button workspace-button--primary" disabled={pending} onClick={onPrepare} type="button">
          Repair with eligible replacement
        </button>
      ) : null}
      {status === "APPROVED" && hasReplacementManifest ? (
        <button className="workspace-button workspace-button--primary" disabled={pending} onClick={onPublish} type="button">
          Simulate approved publish
        </button>
      ) : null}
      {status === "PUBLISHED" ? (
        <p className="control-note">The one-shot approval was consumed. Reset to run the proof loop again.</p>
      ) : null}
      <button className="workspace-button workspace-button--quiet" disabled={pending} onClick={onReset} type="button">
        Reset deterministic demo
      </button>
    </section>
  );
}
