export function LoadingOverlay({ message, submessage }: { message?: string; submessage?: string }) {
  return (
    <div className="fixed inset-0 bg-surface-0/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="loading-spinner" />
        {message && <p className="text-ink font-display text-lg text-center">{message}</p>}
        {submessage && <p className="text-ink-faint text-sm text-center max-w-xs">{submessage}</p>}
      </div>
    </div>
  );
}
