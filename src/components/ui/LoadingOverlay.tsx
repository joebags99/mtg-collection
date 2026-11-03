export function LoadingOverlay({ message, submessage }: { message?: string; submessage?: string }) {
  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="flex flex-col items-center gap-4 p-8">
        <div className="loading-spinner" />
        {message && <p className="text-gray-200 font-medium text-center">{message}</p>}
        {submessage && <p className="text-gray-500 text-sm text-center max-w-xs">{submessage}</p>}
      </div>
    </div>
  );
}
