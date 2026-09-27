import { demoteToUserAction, promoteToAdminAction, setUserDisabledAction } from "@/lib/admin/user-actions";
import { PillButton } from "@/app/components/ui";

/**
 * One row's actions (G-075 M3). `own` hides every action for the signed-in admin's own row -- the server
 * actions also refuse self-demotion/self-disable, but there is no reason to show a button that can only fail.
 */
export function UserRowActions({
  userId,
  role,
  disabled,
  own,
}: {
  userId: string;
  role: "USER" | "ADMIN";
  disabled: boolean;
  own: boolean;
}) {
  if (own) return <span className="text-xs text-faint">You</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {role === "ADMIN" ? (
        <form action={demoteToUserAction.bind(null, userId)}>
          <PillButton type="submit" size="xs">
            Demote
          </PillButton>
        </form>
      ) : (
        <form action={promoteToAdminAction.bind(null, userId)}>
          <PillButton type="submit" size="xs">
            Promote
          </PillButton>
        </form>
      )}
      <form action={setUserDisabledAction.bind(null, userId, !disabled)}>
        <PillButton type="submit" size="xs" variant={disabled ? "outline" : "raised"}>
          {disabled ? "Enable login" : "Disable login"}
        </PillButton>
      </form>
    </div>
  );
}
