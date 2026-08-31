import type { CampaignManifest } from "@/domain/types";
import { hashCampaignManifest } from "@/domain/campaign/manifest";
import { isRightsProofFresh } from "@/domain/rights/proof";

export function assertManifestHashMatchesContents(
  manifest: CampaignManifest,
): void {
  const currentHash = hashCampaignManifest({
    assetIds: manifest.assetIds,
    campaignId: manifest.campaignId,
    proofs: manifest.proofs,
  });
  if (currentHash !== manifest.manifestHash) {
    throw new Error("Manifest hash does not match manifest contents");
  }
}

export function assertManifestPublishable(
  manifest: CampaignManifest,
  currentRightsVersions: ReadonlyMap<string, number>,
): void {
  if (manifest.status !== "APPROVED") {
    throw new Error(`Manifest is not approved: ${manifest.status}`);
  }
  if (manifest.approvedManifestHash !== manifest.manifestHash) {
    throw new Error("Approved manifest hash does not match current manifest");
  }
  assertManifestHashMatchesContents(manifest);

  for (const proof of manifest.proofs) {
    const currentRightsVersion = currentRightsVersions.get(proof.assetId);
    if (
      currentRightsVersion === undefined ||
      !isRightsProofFresh(proof, currentRightsVersion)
    ) {
      throw new Error(`Rights proof is stale for asset: ${proof.assetId}`);
    }
  }
}
