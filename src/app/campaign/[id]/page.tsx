import { CampaignWorkspace } from "@/components/campaign/CampaignWorkspace";

interface CampaignPageProps {
  params: Promise<{ id: string }>;
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { id } = await params;
  return <CampaignWorkspace campaignId={id} />;
}
