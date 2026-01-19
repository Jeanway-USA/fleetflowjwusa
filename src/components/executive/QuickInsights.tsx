import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Lightbulb, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Insight {
  id: string;
  type: 'success' | 'warning' | 'info' | 'alert';
  message: string;
}

interface QuickInsightsProps {
  insights: Insight[];
  isLoading: boolean;
}

function getInsightIcon(type: Insight['type']) {
  switch (type) {
    case 'success':
      return <TrendingUp className="h-4 w-4 text-green-500" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case 'alert':
      return <TrendingDown className="h-4 w-4 text-destructive" />;
    default:
      return <Info className="h-4 w-4 text-blue-500" />;
  }
}

function getInsightStyles(type: Insight['type']) {
  switch (type) {
    case 'success':
      return 'bg-green-500/10 border-green-500/20';
    case 'warning':
      return 'bg-yellow-500/10 border-yellow-500/20';
    case 'alert':
      return 'bg-destructive/10 border-destructive/20';
    default:
      return 'bg-blue-500/10 border-blue-500/20';
  }
}

export function QuickInsights({ insights, isLoading }: QuickInsightsProps) {
  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-primary" />
          Quick Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">No insights available at this time.</p>
        ) : (
          insights.map((insight) => (
            <div
              key={insight.id}
              className={cn(
                'flex items-start gap-3 p-3 rounded-lg border',
                getInsightStyles(insight.type)
              )}
            >
              <div className="mt-0.5">{getInsightIcon(insight.type)}</div>
              <span className="text-sm">{insight.message}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
