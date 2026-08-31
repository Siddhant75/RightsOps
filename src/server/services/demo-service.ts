import type { Asset } from "@/domain/types";
import type { WorkflowRepository } from "@/server/db/client";
import {
  createDemoScenario,
  type DemoWorkflowState,
} from "@/server/seed/demo-scenario";

export class DemoService {
  constructor(
    private readonly repository: WorkflowRepository,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async reset(): Promise<DemoWorkflowState> {
    const state = createDemoScenario(this.now());
    await this.repository.reset(state);
    return structuredClone(state);
  }

  async getState(): Promise<DemoWorkflowState> {
    const state = await this.repository.read();
    if (!state) throw new Error("Demo workflow has not been initialized");
    return state;
  }

  async revokeAssetRights(assetId: string): Promise<Asset> {
    return this.repository.mutate((state) => {
      const asset = state.assets.find((candidate) => candidate.id === assetId);
      if (!asset) throw new Error(`Asset not found: ${assetId}`);

      asset.rightsVersion += 1;
      asset.rightsGrants = asset.rightsGrants.map((grant) => ({
        ...grant,
        status: "REVOKED",
      }));

      const currentManifest = state.currentManifest;
      if (
        currentManifest &&
        currentManifest.assetIds.includes(assetId) &&
        currentManifest.status !== "CONSUMED"
      ) {
        currentManifest.status = "STALE";
        state.campaign.status = "STALE";
      }

      const createdAt = this.now();
      state.auditEvents.push({
        actor: "SYSTEM",
        createdAt,
        entityId: asset.id,
        id: `audit-${state.nextAuditSequence}`,
        kind: "RIGHTS_REVOKED",
        summary: `Revoked ${asset.id} and incremented its evidence version.`,
      });
      state.nextAuditSequence += 1;

      return structuredClone(asset);
    });
  }
}
