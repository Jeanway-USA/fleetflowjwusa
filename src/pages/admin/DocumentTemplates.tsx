import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Loader2, Plus, Save } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DocumentTemplate {
  id: string;
  org_id: string;
  document_type: string;
  name: string | null;
  content: string;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

const VARIABLES: Array<{ token: string; description: string }> = [
  {
    token: "{{today_date}}",
    description: "Auto-fills with the current date when the document is generated.",
  },
  {
    token: "{{company_address}}",
    description: 'Auto-fills with "4700 Diplomacy Rd, Fort Worth, TX 76155".',
  },
  {
    token: "{{driver_address}}",
    description: "Renders an input field for the driver to fill in their address.",
  },
  {
    token: "{{owner_signature}}",
    description: "Displays a placeholder signature block (signed off-platform for now).",
  },
  {
    token: "{{driver_signature}}",
    description: "Renders the SignaturePad component for the driver to sign.",
  },
];

export default function DocumentTemplates() {
  const { orgId, user } = useAuth();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<DocumentTemplate>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newType, setNewType] = useState("");
  const [newName, setNewName] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["document_templates", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .eq("org_id", orgId!)
        .order("document_type", { ascending: true });
      if (error) throw error;
      return data as DocumentTemplate[];
    },
  });

  // Auto-select first template when list loads
  useEffect(() => {
    if (!selectedId && templates.length > 0) {
      setSelectedId(templates[0].id);
    }
  }, [templates, selectedId]);

  // Hydrate draft when selection changes
  useEffect(() => {
    const current = templates.find((t) => t.id === selectedId);
    if (current) {
      setDraft({
        id: current.id,
        document_type: current.document_type,
        name: current.name,
        content: current.content,
        is_active: current.is_active,
      });
    }
  }, [selectedId, templates]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft.id) throw new Error("No template selected");
      const { error } = await supabase
        .from("document_templates")
        .update({
          document_type: draft.document_type ?? "",
          name: draft.name ?? null,
          content: draft.content ?? "",
          is_active: draft.is_active ?? true,
        })
        .eq("id", draft.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template saved");
      queryClient.invalidateQueries({ queryKey: ["document_templates", orgId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to save template");
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("No organization");
      if (!newType.trim()) throw new Error("Document type is required");
      const { data, error } = await supabase
        .from("document_templates")
        .insert({
          org_id: orgId,
          document_type: newType.trim(),
          name: newName.trim() || null,
          content: "",
          is_active: true,
          created_by: user?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as DocumentTemplate;
    },
    onSuccess: (row) => {
      toast.success("Template created");
      setCreateOpen(false);
      setNewType("");
      setNewName("");
      queryClient.invalidateQueries({ queryKey: ["document_templates", orgId] });
      setSelectedId(row.id);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create template");
    },
  });

  const copyToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token);
      toast.success(`Copied ${token}`);
    } catch {
      toast.error("Unable to copy");
    }
  };

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Document Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage editable contracts and forms sent to drivers during onboarding.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="h-12">
          <Plus className="h-4 w-4 mr-2" />
          New template
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Editor */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Editor</CardTitle>
              <CardDescription>
                Pick a template, edit its content (markdown supported), then save.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  No templates yet. Create your first one to get started.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Select
                      value={selectedId ?? undefined}
                      onValueChange={(v) => setSelectedId(v)}
                    >
                      <SelectTrigger className="h-12">
                        <SelectValue placeholder="Select a template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name ? `${t.name} · ${t.document_type}` : t.document_type}
                            {!t.is_active && " (inactive)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selected && (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="doc-type">Document type</Label>
                          <Input
                            id="doc-type"
                            className="h-12 pl-4 sm:pl-3"
                            value={draft.document_type ?? ""}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d, document_type: e.target.value }))
                            }
                            placeholder="driver_agreement"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="doc-name">Display name</Label>
                          <Input
                            id="doc-name"
                            className="h-12 pl-4 sm:pl-3"
                            value={draft.name ?? ""}
                            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                            placeholder="2026 Driver Agreement"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <Label htmlFor="doc-active" className="text-sm font-medium">
                            Active
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            Only the active template per type is used for new drivers.
                          </p>
                        </div>
                        <Switch
                          id="doc-active"
                          checked={!!draft.is_active}
                          onCheckedChange={(v) => setDraft((d) => ({ ...d, is_active: v }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="doc-content">Content</Label>
                        <Textarea
                          id="doc-content"
                          value={draft.content ?? ""}
                          onChange={(e) =>
                            setDraft((d) => ({ ...d, content: e.target.value }))
                          }
                          className="min-h-[500px] font-mono text-sm"
                          placeholder={"# Driver Agreement\n\nDate: {{today_date}}\nCompany: {{company_address}}\nDriver address: {{driver_address}}\n\nSigned by owner: {{owner_signature}}\nSigned by driver: {{driver_signature}}"}
                        />
                      </div>

                      <div className="flex justify-end">
                        <Button
                          onClick={() => saveMutation.mutate()}
                          disabled={saveMutation.isPending}
                          className="h-12"
                        >
                          {saveMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Save changes
                        </Button>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Variable Reference Guide */}
        <div className="lg:col-span-1">
          <Card className="lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle className="text-lg">Variable Reference Guide</CardTitle>
              <CardDescription>
                Insert these tokens into your template — they'll be replaced when the document is
                rendered to the driver.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {VARIABLES.map((v) => (
                <div
                  key={v.token}
                  className="rounded-md border bg-muted/30 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-xs font-mono text-primary break-all">{v.token}</code>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-8 shrink-0"
                      onClick={() => copyToken(v.token)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{v.description}</p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground pt-2 border-t">
                Tokens are case-sensitive. Use exact double-brace syntax — extra spaces inside the
                braces will not be replaced.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New template</DialogTitle>
            <DialogDescription>
              Create a new document template. You can edit its content after creating it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-type">Document type</Label>
              <Input
                id="new-type"
                className="h-12 pl-4 sm:pl-3"
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                placeholder="driver_agreement"
              />
              <p className="text-xs text-muted-foreground">
                Use snake_case. Common values: <code>driver_agreement</code>,{" "}
                <code>direct_deposit</code>, <code>driver_profile</code>.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name">Display name (optional)</Label>
              <Input
                id="new-name"
                className="h-12 pl-4 sm:pl-3"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="2026 Driver Agreement"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending || !newType.trim()}
            >
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
