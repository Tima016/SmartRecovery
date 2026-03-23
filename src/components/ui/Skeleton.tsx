import clsx from 'clsx';

interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={clsx(
                'animate-pulse rounded-sm bg-bg-elevated/80 border border-bg-border/50',
                className
            )}
        />
    );
}

export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
    return (
        <div className="w-full flex flex-col divide-y divide-bg-border/30">
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex items-center gap-4 px-4 py-3">
                    {Array.from({ length: columns }).map((_, c) => (
                        <Skeleton
                            key={c}
                            className={clsx('h-4', {
                                'w-1/4': c === 0,
                                'flex-1': c === 1 || c === 2,
                                'w-24': c === 3,
                                'w-16': c === 4,
                            })}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
