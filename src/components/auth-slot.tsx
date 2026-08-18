import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export function AuthSlot() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="size-9 shrink-0 animate-pulse rounded-full bg-elevated" />;
  }
  if (user) {
    return (
      <div className="max-w-40 truncate text-fg [&_button]:text-muted [&_button]:hover:text-fg [&_img]:size-8 [&_span.grid]:bg-elevated [&_span.grid]:text-fg">
        <UserButton />
      </div>
    );
  }
  return (
    <Link
      to="/login"
      className="inline-flex h-9 items-center rounded-sm border border-border px-3 text-sm text-fg transition-colors duration-150 hover:bg-elevated"
    >
      Entrar
    </Link>
  );
}
