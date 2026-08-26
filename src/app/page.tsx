import { DocumentControlDashboard } from "@/components/document-control-dashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <DocumentControlDashboard
      developmentPreview={process.env.DEPLOYMENT_TIER === "development-preview"}
    />
  );
}
