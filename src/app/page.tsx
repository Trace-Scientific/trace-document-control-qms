import { DocumentControlDashboard } from "@/components/document-control-dashboard";

export default function HomePage() {
  return (
    <DocumentControlDashboard
      developmentPreview={process.env.DEPLOYMENT_TIER === "development-preview"}
    />
  );
}
