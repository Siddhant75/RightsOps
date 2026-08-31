import type { Asset, Campaign } from "@/domain/types";
import { RightsPanel } from "@/components/campaign/RightsPanel";
import { getAssetEvidence } from "@/components/campaign/workspace-view";

interface AssetCardProps {
  asset: Asset;
  campaign: Campaign;
  selected: boolean;
}

export function AssetCard({ asset, campaign, selected }: AssetCardProps) {
  const evidence = getAssetEvidence(asset, campaign);

  return (
    <article
      className={`asset-card ${selected ? "asset-card--selected" : ""} ${
        evidence.eligible ? "" : "asset-card--blocked"
      }`}
    >
      <div className="asset-visual" data-asset={asset.id} aria-hidden="true">
        <span>{selected ? "In manifest" : evidence.eligible ? "Available" : "Blocked"}</span>
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
