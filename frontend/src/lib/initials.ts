/**
 * Up to two initials from a display name.
 *
 * Lives here rather than in the navbar because two surfaces need it: the
 * account menu and the profile header. Both render an `Avatar` whose
 * `avatarUrl` is null for every account created through the standard flow —
 * nothing uploads a picture at registration — and an `AvatarImage` with no
 * `AvatarFallback` sibling renders a zero-content circle. In the navbar that
 * made the sign-out unreachable; on the profile it showed an empty ring where
 * the user expected themselves.
 *
 * A copy in each file is how one of them keeps a bug the other already fixed,
 * so the function is shared and the fallback is not optional.
 */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}
