import { PersonAvatarIcon } from "./icons";

/**
 * Renders a student's icon: the classic initial-letter tile on a warm
 * gradient when a name is available, falling back to a neutral person glyph
 * when it isn't (e.g. a picker rendered before any student is loaded).
 */
export default function Avatar({
  initial,
  size = 44,
  className = "",
}: {
  initial?: string;
  size?: number;
  className?: string;
}) {
  if (initial) {
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

  return (
    <span
      className={`grid flex-none place-items-center rounded-[13px] text-white ${className}`}
      style={{ width: size, height: size, background: "linear-gradient(145deg,#c7ccd6,#9aa1b0)" }}
    >
      <PersonAvatarIcon size={size * 0.56} />
    </span>
  );
}
