import { DocumentTemplatesPanel } from "@/components/settings/DocumentTemplatesPanel";

export default function DocumentTemplates() {
  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Document Templates</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage editable contracts and forms sent to drivers during onboarding.
        </p>
      </div>
      <DocumentTemplatesPanel hideHeader />
    </div>
  );
}
