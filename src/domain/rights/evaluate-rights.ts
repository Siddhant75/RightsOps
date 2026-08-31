import type {
  Asset,
  Campaign,
  RightsEvaluation,
  RightsFailureReason,
  RightsGrant,
} from "@/domain/types";

function evaluateGrant(
  grant: RightsGrant,
  campaign: Campaign,
): RightsFailureReason[] {
  const reasons: RightsFailureReason[] = [];

  if (grant.status !== "ACTIVE") {
    reasons.push("GRANT_INACTIVE");
  }
  if (campaign.commercialUse && !grant.commercialAllowed) {
    reasons.push("COMMERCIAL_USE_NOT_ALLOWED");
  }
  if (!grant.territories.includes(campaign.territory)) {
    reasons.push("TERRITORY_NOT_ALLOWED");
  }
  if (!campaign.channels.every((channel) => grant.channels.includes(channel))) {
    reasons.push("CHANNEL_NOT_ALLOWED");
  }
  if (Date.parse(grant.validFrom) > Date.parse(campaign.startsAt)) {
    reasons.push("RIGHTS_START_AFTER_CAMPAIGN_START");
  }
  if (Date.parse(grant.validUntil) < Date.parse(campaign.endsAt)) {
    reasons.push("RIGHTS_EXPIRE_BEFORE_CAMPAIGN_END");
  }

  return reasons;
}

export function evaluateRights(
  asset: Asset,
  campaign: Campaign,
): RightsEvaluation {
  const failedReasons = new Set<RightsFailureReason>();

  for (const grant of asset.rightsGrants) {
    const reasons = evaluateGrant(grant, campaign);
    if (reasons.length === 0) {
      return { eligible: true, grantId: grant.id, reasons: [] };
    }
    for (const reason of reasons) {
      failedReasons.add(reason);
    }
  }

  if (asset.rightsGrants.length === 0) {
    failedReasons.add("GRANT_INACTIVE");
  }

  return { eligible: false, reasons: [...failedReasons] };
}
