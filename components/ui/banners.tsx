export function EmptyState({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="paper rounded-md px-6 py-12 text-center">
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm opacity-80">{body}</p>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}

export function ErrorBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </p>
  );
}

export function OkBanner({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm text-primary">
      {message}
    </p>
  );
}
