import { FemaleAvatarIcon, MaleAvatarIcon, PersonAvatarIcon } from "./icons";

const GENDER_STYLES = {
  male: {
    background: "linear-gradient(145deg,#8ec5fc,#4f8ef7)",
    Icon: MaleAvatarIcon,
  },
  female: {
    background: "linear-gradient(145deg,#f6a8c9,#ea5fa0)",
    Icon: FemaleAvatarIcon,
  },
  neutral: {
    background: "linear-gradient(145deg,#c7ccd6,#9aa1b0)",
    Icon: PersonAvatarIcon,
  },
} as const;

/**
 * Renders a student's icon: a gender-specific glyph on a gradient background
 * when `gender` is known, falling back to the classic initial-letter tile
 * (used where we only have a session's `studentInitial`, not the full
 * student record — e.g. lesson lists) when it isn't.
 */
export default function Avatar({
  gender,
  initial,
  size = 44,
  className = "",
}: {
  gender?: "male" | "female";
  initial?: string;
  size?: number;
  className?: string;
}) {
  if (!gender && initial) {
    return (
      <span
        className={`grid flex-none place-items-center rounded-[13px] font-display font-semibold text-ink ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          background: "linear-gradient(145deg,#ffd143,#f0a500)",
        }}
      >
        {initial}
      </span>
    );
  }

  const { background, Icon } = GENDER_STYLES[gender ?? "neutral"];

  return (
    <span
      className={`grid flex-none place-items-center rounded-[13px] text-white ${className}`}
      style={{ width: size, height: size, background }}
    >
      <Icon size={size * 0.56} />
    </span>
  );
}
