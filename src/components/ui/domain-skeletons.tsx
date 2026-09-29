import { SkeletonBlock } from "@/components/ui/skeleton-block";
import { cn } from "@/lib/cn";

export function StudyPackCardSkeleton({ className }: { className?: string }) {
  return (
    <article
      aria-hidden="true"
      className={cn("surface-card p-5 space-y-4 animate-pulse", className)}
    >
      <div className="flex items-center gap-3">
        <SkeletonBlock width={28} height={28} rounded="md" />
        <SkeletonBlock width="65%" height={22} rounded="md" />
      </div>
      <SkeletonBlock width="45%" height={14} rounded="sm" />
      <SkeletonBlock width="55%" height={14} rounded="sm" />
      <div className="pt-2 flex items-center gap-2">
        <SkeletonBlock width={100} height={36} rounded="lg" />
        <SkeletonBlock width={80} height={36} rounded="lg" />
      </div>
    </article>
  );
}

export function ProgressChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("surface-card p-6 space-y-5 animate-pulse", className)}
    >
      <div className="flex items-center justify-between">
        <SkeletonBlock width={140} height={20} rounded="md" />
        <SkeletonBlock width={60} height={16} rounded="sm" />
      </div>
      <div className="grid grid-cols-7 gap-2 pt-4 items-end h-32">
        {[40, 65, 30, 85, 50, 95, 70].map((h, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <SkeletonBlock width="100%" height={`${h}%`} rounded="md" />
            <SkeletonBlock width={24} height={12} rounded="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FriendRowSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex items-center justify-between p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] animate-pulse", className)}
    >
      <div className="flex items-center gap-3">
        <SkeletonBlock width={40} height={40} rounded="full" />
        <div className="space-y-1.5">
          <SkeletonBlock width={120} height={16} rounded="sm" />
          <SkeletonBlock width={80} height={12} rounded="sm" />
        </div>
      </div>
      <SkeletonBlock width={72} height={32} rounded="lg" />
    </div>
  );
}

export function MessageThreadSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("space-y-4 p-4 animate-pulse", className)}
    >
      <div className="flex items-start gap-3">
        <SkeletonBlock width={32} height={32} rounded="full" className="shrink-0" />
        <SkeletonBlock width="60%" height={48} rounded="xl" />
      </div>
      <div className="flex items-start justify-end gap-3">
        <SkeletonBlock width="50%" height={40} rounded="xl" />
        <SkeletonBlock width={32} height={32} rounded="full" className="shrink-0" />
      </div>
      <div className="flex items-start gap-3">
        <SkeletonBlock width={32} height={32} rounded="full" className="shrink-0" />
        <SkeletonBlock width="70%" height={56} rounded="xl" />
      </div>
    </div>
  );
}

export function TutorMessageSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("flex items-start gap-3.5 p-4 rounded-2xl bg-[var(--surface-subtle)] animate-pulse", className)}
    >
      <SkeletonBlock width={36} height={36} rounded="full" className="shrink-0" />
      <div className="space-y-2 flex-1">
        <SkeletonBlock width="30%" height={14} rounded="sm" />
        <SkeletonBlock width="90%" height={14} rounded="sm" />
        <SkeletonBlock width="75%" height={14} rounded="sm" />
      </div>
    </div>
  );
}

export function StreamingIndicator({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Generating response..."
      className={cn("inline-flex items-center gap-1.5 text-xs text-[var(--fetch-blue-700)] font-semibold", className)}
    >
      <span className="size-1.5 rounded-full bg-[var(--fetch-blue-600)] animate-bounce [animation-delay:-0.3s]" />
      <span className="size-1.5 rounded-full bg-[var(--fetch-blue-600)] animate-bounce [animation-delay:-0.15s]" />
      <span className="size-1.5 rounded-full bg-[var(--fetch-blue-600)] animate-bounce" />
    </span>
  );
}
