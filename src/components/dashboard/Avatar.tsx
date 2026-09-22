import { PersonAvatarIcon } from "./icons";

/**
 * Renders a student's icon: the classic initial-letter disc in
 * butter when a name is available, falling back to a neutral person glyph
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
        className={`grid flex-none place-items-center rounded-full font-display text-cocoa ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: size * 0.4,
          background: "var(--color-butter)",
          boxShadow: "inset 0 0 0 1.5px rgba(65,46,40,.14)",
        }}
      >
        {initial}
      </span>
    );
  }

  return (
    <span
      className={`grid flex-none place-items-center rounded-full text-white ${className}`}
      style={{ width: size, height: size, background: "var(--color-sky)" }}
    >
      <PersonAvatarIcon size={size * 0.56} />
    </span>
  );
}
