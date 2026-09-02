import type { Asset, CampaignManifest, CampaignStatus } from "@/domain/types";
import { getAssetProofDelta } from "@/components/campaign/workspace-view";

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
  const staleEntries = manifestAssets.flatMap((asset) => {
    if (!asset) return [];
    const delta = getAssetProofDelta(asset, manifest);
    return delta?.stale ? [{ asset, delta }] : [];
  });

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
            {manifestAssets.map((asset, index) => {
              const proofDelta = asset ? getAssetProofDelta(asset, manifest) : null;
              return (
              <li className={proofDelta?.stale ? "manifest-list-item--stale" : ""} key={manifest.assetIds[index]}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span className="manifest-asset-name">
                  <strong>{asset?.title ?? manifest.assetIds[index]}</strong>
                  {proofDelta?.stale ? (
                    <small>PROOF STALE · v{proofDelta.recordedVersion} → v{proofDelta.currentVersion}</small>
                  ) : null}
                </span>
                <code>proof v{manifest.proofs[index]?.rightsVersion ?? "?"}</code>
              </li>
              );
            })}
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
            <div className="stale-warning" role="status">
              <strong>Publish authority removed: authorization evidence became stale.</strong>
              {staleEntries.map(({ asset, delta }) => (
                <p key={asset.id}>
                  {asset.title} changed after review: recorded proof v{delta.recordedVersion}, current rights v{delta.currentVersion}.
                </p>
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
