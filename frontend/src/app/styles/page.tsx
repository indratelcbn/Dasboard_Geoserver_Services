'use client';

import useSWR from 'swr';
import { Palette } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/states';
import { fetcher, type NamedRef } from '@/lib/api';

export default function StylesPage() {
  const { data, error, isLoading } = useSWR<NamedRef[]>('/geoserver/styles', fetcher);

  return (
    <div>
      <Header title="Styles" subtitle="SLD / CSS styles yang tersedia" />
      <div className="p-6">
        {error ? (
          <ErrorState message={error.message} />
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState message="Tidak ada style ditemukan." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {data.map((style) => (
              <Card key={style.name}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                    <Palette className="h-5 w-5" />
                  </div>
                  <span className="truncate text-sm font-medium" title={style.name}>
                    {style.name}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
