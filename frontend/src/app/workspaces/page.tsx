'use client';

import useSWR from 'swr';
import { FolderTree } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState, EmptyState } from '@/components/states';
import { fetcher, type Workspace } from '@/lib/api';

export default function WorkspacesPage() {
  const { data, error, isLoading } = useSWR<Workspace[]>('/geoserver/workspaces', fetcher);

  return (
    <div>
      <Header title="Workspaces" subtitle="Daftar workspace pada GeoServer" />
      <div className="p-6">
        {error ? (
          <ErrorState message={error.message} />
        ) : isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !data || data.length === 0 ? (
          <EmptyState message="Tidak ada workspace ditemukan." />
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>
                      <span className="inline-flex items-center gap-2">
                        <FolderTree className="h-4 w-4" /> Name
                      </span>
                    </TableHead>
                    <TableHead>REST Href</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((ws, i) => (
                    <TableRow key={ws.name}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{ws.name}</TableCell>
                      <TableCell className="max-w-md truncate text-muted-foreground" title={ws.href}>
                        {ws.href}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
