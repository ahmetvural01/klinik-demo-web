export function ListRowSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="ui-skeleton-shimmer h-12 rounded-md bg-slate-100"
        />
      ))}
    </div>
  );
}

export function TableRowsSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <td key={columnIndex} className="px-4 py-3">
              <div
                className="ui-skeleton-shimmer h-3.5 rounded bg-slate-100"
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
