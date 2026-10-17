import { useEffect, useState } from "react";
import type { AdminUser } from "../../types/domain";
export function Avatar({
  user,
}: {
  user: Pick<AdminUser, "first_name" | "last_name" | "email" | "avatar_url">;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [user.avatar_url]);
  const initials =
    `${user.first_name?.[0] ?? ""}${user.last_name?.[0] ?? ""}` ||
    user.email?.[0]?.toUpperCase() ||
    "A";
  return (
    <span className="avatar">
      {user.avatar_url && !failed ? (
        <img
          src={user.avatar_url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        initials
      )}
    </span>
  );
}
