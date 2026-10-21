import { DocumentTemplatesPanel } from "@/components/settings/DocumentTemplatesPanel";
import { PageHeader } from "@/components/shared/PageHeader";

export default function DocumentTemplates() {
  return (
    <div>
      <PageHeader title="Document Templates" description="Manage editable contracts and forms sent to drivers during onboarding." />
      <DocumentTemplatesPanel hideHeader />
    </div>
  );
}
