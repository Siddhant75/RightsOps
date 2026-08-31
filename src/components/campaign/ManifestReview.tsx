import type { Asset, CampaignManifest, CampaignStatus } from "@/domain/types";

interface ManifestReviewProps {
  assets: Asset[];
  campaignStatus: CampaignStatus;
  manifest: CampaignManifest | null;
  onApprove: () => void;
  pending: boolean;
}

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-6)}`;
}

export function ManifestReview({
  assets,
  campaignStatus,
  manifest,
  onApprove,
  pending,
}: ManifestReviewProps) {
  const manifestAssets =
    manifest?.assetIds.map((assetId) => assets.find((asset) => asset.id === assetId)) ?? [];

  return (
    <section className={`manifest-panel ${campaignStatus === "STALE" ? "manifest-panel--stale" : ""}`} aria-labelledby="manifest-heading">
      <div className="section-heading section-heading--compact">
        <div>
          <p className="workspace-kicker">Exact package</p>
          <h2 id="manifest-heading">Manifest review</h2>
        </div>
        <span className={`state-pill state-pill--${campaignStatus.toLowerCase()}`}>
          {campaignStatus.replace("_", " ")}
        </span>
      </div>

      {!manifest ? (
        <div className="manifest-empty">
          <strong>No review manifest</strong>
          <p>Prepare the recommended eligible set to create current proofs.</p>
        </div>
      ) : (
        <>
          <ol className="manifest-list">
            {manifestAssets.map((asset, index) => (
              <li key={manifest.assetIds[index]}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{asset?.title ?? manifest.assetIds[index]}</strong>
                <code>v{manifest.proofs[index]?.rightsVersion ?? "?"}</code>
              </li>
            ))}
          </ol>
          <dl className="manifest-meta">
            <div>
              <dt>Manifest</dt>
              <dd>{manifest.id}</dd>
            </div>
            <div>
              <dt>Bound hash</dt>
              <dd><code>{shortHash(manifest.manifestHash)}</code></dd>
            </div>
          </dl>
          {campaignStatus === "REVIEW_READY" ? (
            <div className="human-gate">
              <p><strong>Human gate.</strong> Approval binds this exact asset set and hash.</p>
              <button className="workspace-button workspace-button--primary" disabled={pending} onClick={onApprove} type="button">
                Approve exact manifest
              </button>
            </div>
          ) : null}
          {campaignStatus === "STALE" ? (
            <p className="stale-warning">
              Approval authority removed. A selected asset no longer matches its recorded proof version.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
