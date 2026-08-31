import type { Campaign } from "@/domain/types";

interface CampaignBriefProps {
  campaign: Campaign;
}

export function CampaignBrief({ campaign }: CampaignBriefProps) {
  return (
    <section className="campaign-brief" aria-labelledby="campaign-title">
      <div>
        <p className="workspace-kicker">Live campaign / Rights operations</p>
        <h1 id="campaign-title">{campaign.title}</h1>
        <p className="campaign-goal">
          Assemble a rights-current, three-asset social package for Japan and
          bind human approval to the exact manifest before simulated publishing.
        </p>
      </div>
      <dl className="brief-facts" aria-label="Campaign policy">
        <div>
          <dt>Market</dt>
          <dd>{campaign.territory}</dd>
        </div>
        <div>
          <dt>Channels</dt>
          <dd>{campaign.channels.join(" + ")}</dd>
        </div>
        <div>
          <dt>Usage</dt>
          <dd>{campaign.commercialUse ? "Commercial" : "Editorial"}</dd>
        </div>
        <div>
          <dt>Package</dt>
          <dd>{campaign.requiredAssetCount} assets</dd>
        </div>
      </dl>
    </section>
  );
}
