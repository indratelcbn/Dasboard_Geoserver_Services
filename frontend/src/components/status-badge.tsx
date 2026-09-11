import { Badge } from '@/components/ui/badge';

export function StatusBadge({ online }: { online: boolean | undefined }) {
  if (online === undefined) return <Badge variant="secondary">Unknown</Badge>;
  return online ? (
    <Badge variant="success">Online</Badge>
  ) : (
    <Badge variant="destructive">Offline</Badge>
  );
}
