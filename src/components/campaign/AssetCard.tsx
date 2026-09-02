import Image from "next/image";

import type { Asset, Campaign, CampaignManifest } from "@/domain/types";
import { RightsPanel } from "@/components/campaign/RightsPanel";
import {
  getAssetEvidence,
  getAssetProofDelta,
} from "@/components/campaign/workspace-view";

interface AssetCardProps {
  asset: Asset;
  campaign: Campaign;
  manifest: CampaignManifest | null;
  selected: boolean;
}

export function AssetCard({ asset, campaign, manifest, selected }: AssetCardProps) {
  const evidence = getAssetEvidence(asset, campaign);
  const proofDelta = getAssetProofDelta(asset, manifest);
  const visualLabel = proofDelta?.stale
    ? `PROOF STALE · v${proofDelta.recordedVersion} → v${proofDelta.currentVersion}`
    : selected
      ? "In manifest"
      : evidence.eligible
        ? "Available"
        : "Blocked";

  return (
    <article
      className={`asset-card ${selected ? "asset-card--selected" : ""} ${
        evidence.eligible ? "" : "asset-card--blocked"
      }`}
    >
      <div className="asset-visual">
        <Image
          alt={`${asset.title} synthetic campaign preview`}
          fill
          sizes="(max-width: 540px) 100vw, (max-width: 1120px) 50vw, 25vw"
          src={asset.thumbnailUrl}
        />
        <span className={proofDelta?.stale ? "proof-stale-badge" : ""}>
          {visualLabel}
        </span>
      </div>
      <div className="asset-copy">
        <div className="asset-heading">
          <h3>{asset.title}</h3>
          <span className={`eligibility-dot eligibility-dot--${evidence.eligible ? "ok" : "blocked"}`} />
        </div>
        <RightsPanel asset={asset} campaign={campaign} />
      </div>
    </article>
  );
}
