interface ErrorBoxProps {
  message: string
  onRetry: () => void
  retryLabel: string
}

export function ErrorBox({ message, onRetry, retryLabel }: ErrorBoxProps) {
  return (
    <div className="rounded border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
      <p className="mb-2 text-sm text-red-700 dark:text-red-300">{message}</p>
      <button
        onClick={onRetry}
        className="text-sm font-medium text-red-700 underline dark:text-red-300"
      >
        {retryLabel}
      </button>
    </div>
  )
}
