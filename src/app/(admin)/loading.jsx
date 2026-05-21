// Route-level fallback for any page in the (admin) group while it streams.
// Next.js shows this automatically during navigation suspense — no manual
// wiring needed in each page. Pages that need per-section skeletons (e.g.
// /students with its table skeleton) keep doing their own thing.

import SkeletonTable from '@/components/ui/SkeletonTable';

export default function AdminLoading() {
  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6 space-y-2">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="h-3 w-72 bg-muted/70 rounded animate-pulse" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse">
            <div className="w-10 h-10 rounded-xl bg-muted mb-4" />
            <div className="h-6 w-20 bg-muted rounded mb-2" />
            <div className="h-3 w-24 bg-muted/70 rounded" />
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <SkeletonTable rows={8} cols={5} />
      </div>
    </div>
  );
}
