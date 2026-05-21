// Reusable skeleton loader for table/list pages
export default function SkeletonTable({ rows = 8, cols = 5 }) {
  return (
    <div className="animate-pulse">
      <div className="bg-muted border-b border-border px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="h-3 bg-muted-foreground/20 rounded flex-1" style={{ maxWidth: i === 0 ? 160 : 100 }} />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="px-4 py-3 flex gap-4 items-center">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="h-3 bg-muted rounded flex-1" style={{ maxWidth: c === 0 ? 160 : 90, opacity: 1 - c * 0.08 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}