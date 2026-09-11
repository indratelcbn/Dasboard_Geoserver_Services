'use client';

import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/** Friendly error card shown when a backend call fails (e.g. GeoServer down). */
export function ErrorState({ message }: { message: string }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardContent className="flex items-start gap-3 p-5">
        <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
        <div>
          <p className="font-medium text-destructive">Unable to load data</p>
          <p className="text-sm text-muted-foreground">{message}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Check that the backend API and GeoServer are running and reachable.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
