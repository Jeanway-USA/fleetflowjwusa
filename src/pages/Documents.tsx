import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Upload, FolderOpen } from 'lucide-react';

export default function Documents() {
  return (
    <DashboardLayout>
      <PageHeader title="Documents" description="Upload and manage BOLs, PODs, receipts, and other documents" />
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Upload Documents
            </CardTitle>
            <CardDescription>Upload new documents to the system</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Click or drag files here to upload</p>
              <p className="text-xs text-muted-foreground mt-1">Supports PDF, JPG, PNG</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              BOL / POD
            </CardTitle>
            <CardDescription>Bills of Lading and Proof of Delivery</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-10 w-10 mx-auto mb-3" />
              <p>No documents yet</p>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Receipts
            </CardTitle>
            <CardDescription>Fuel receipts and expense documentation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-10 w-10 mx-auto mb-3" />
              <p>No documents yet</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground text-center mt-8">
        Document storage will be fully implemented once you start adding loads and need to attach documents to them.
      </p>
    </DashboardLayout>
  );
}
