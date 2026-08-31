import type { Asset, Campaign } from "@/domain/types";
import { AssetCard } from "@/components/campaign/AssetCard";

interface AssetGridProps {
  assets: Asset[];
  campaign: Campaign;
  selectedAssetIds: string[];
}

export function AssetGrid({ assets, campaign, selectedAssetIds }: AssetGridProps) {
  return (
    <section className="workspace-section" aria-labelledby="asset-heading">
      <div className="section-heading">
        <div>
          <p className="workspace-kicker">Evidence pool</p>
          <h2 id="asset-heading">Assets &amp; rights</h2>
        </div>
        <p>{assets.length} deterministic candidates</p>
      </div>
      <div className="asset-grid">
        {assets.map((asset) => (
          <AssetCard
            asset={asset}
            campaign={campaign}
            key={asset.id}
            selected={selectedAssetIds.includes(asset.id)}
          />
        ))}
      </div>
    </section>
  );
}
