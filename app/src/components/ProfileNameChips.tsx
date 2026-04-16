import { AppliedProfileName } from "../types";

type ProfileNameChipsProps = {
  profiles: AppliedProfileName[];
  className?: string;
  emptyLabel?: string;
};

/**
 * Small badge chips for profile names (e.g. per-profile applied on an application).
 */
export const ProfileNameChips = ({
  profiles,
  className = "",
  emptyLabel = "—"
}: ProfileNameChipsProps) => {
  if (!profiles.length) {
    return <span className="text-xs opacity-50">{emptyLabel}</span>;
  }
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {profiles.map((p) => (
        <span key={p.profile_id} className="badge badge-outline badge-sm max-w-[140px] truncate" title={p.profile_name}>
          {p.profile_name}
        </span>
      ))}
    </div>
  );
};
