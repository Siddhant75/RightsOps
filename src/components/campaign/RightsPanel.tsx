import type { Asset, Campaign } from "@/domain/types";
import { getAssetEvidence } from "@/components/campaign/workspace-view";

interface RightsPanelProps {
  asset: Asset;
  campaign: Campaign;
}

export function RightsPanel({ asset, campaign }: RightsPanelProps) {
  const evidence = getAssetEvidence(asset, campaign);
  const grant = asset.rightsGrants[0];

  return (
    <div className="rights-panel">
      <div className="rights-chips" aria-label={`${asset.title} rights evidence`}>
        <span>{grant?.territories.join(" / ") || "No territory"}</span>
        <span>{grant?.commercialAllowed ? "Commercial" : "Editorial only"}</span>
        <span>v{asset.rightsVersion}</span>
      </div>
      <p className={evidence.eligible ? "evidence-ok" : "evidence-blocked"}>
        {evidence.eligible
          ? "Eligible for this brief"
          : evidence.reasonLabels.join(" · ")}
      </p>
    </div>
  );
}
