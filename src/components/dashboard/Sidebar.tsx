"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "../Logo";
import { GridIcon, UsersIcon, MicIcon, GearIcon } from "./icons";
import RecordLessonButton, { type LessonQuotaView } from "./RecordLessonButton";
import CombineLessonsButton from "./CombineLessonsButton";
import { signOutAction } from "@/app/actions/auth";

const nav = [
  { href: "/dashboard", label: "Overview", Icon: GridIcon, exact: true },
  { href: "/dashboard/students", label: "Students", Icon: UsersIcon, exact: false },
  { href: "/dashboard/lessons", label: "Lessons", Icon: MicIcon, exact: false },
  { href: "/dashboard/settings", label: "Settings", Icon: GearIcon, exact: false },
];

type SidebarUser = { name?: string | null; email?: string | null } | null;
type PickStudent = { id: string; name: string; initial: string };

export default function Sidebar({
  user,
  students = [],
  quota,
  canCombineLessons = false,
}: {
  user?: SidebarUser;
  students?: PickStudent[];
  quota: LessonQuotaView;
  canCombineLessons?: boolean;
}) {
  const pathname = usePathname();
  const displayName = user?.name || user?.email || "Tutor";
  const initial = (user?.name?.[0] || user?.email?.[0] || "?").toUpperCase();

  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] flex-none flex-col border-r border-cocoa/15 bg-white px-5 py-6 md:flex">
      <Link href="/" className="mb-9 flex items-center gap-2.5 px-2">
        <Logo />
      </Link>

      <nav className="flex flex-col gap-1.5">
        {nav.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`group flex items-center gap-3 rounded-full px-4 py-2.5 text-[.8rem] font-medium uppercase tracking-[.16em] transition-all duration-200 ${
                active
                  ? "bg-butter text-cocoa"
                  : "text-ink-soft hover:bg-butter-soft hover:text-cocoa"
              }`}
            >
              <Icon
                className={`transition-colors ${
                  active ? "text-cocoa" : "text-muted group-hover:text-cocoa"
                }`}
              />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto">
        <div className="mb-4">
          <RecordLessonButton students={students} quota={quota} />
          {canCombineLessons && <CombineLessonsButton students={students} />}
        </div>

        <div className="rounded-[22px] border border-cocoa/15 bg-butter-soft p-3">
          <div className="flex items-center gap-3">
            <span
              className="grid h-9 w-9 flex-none place-items-center rounded-full bg-sky font-display text-lg text-cocoa"
            >
              {initial}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{displayName}</div>
              {user?.email && <div className="truncate text-xs text-muted">{user.email}</div>}
            </div>
          </div>
          <form action={signOutAction} className="mt-2.5">
            <button
              type="submit"
              className="w-full rounded-full border-[1.5px] border-cocoa/25 px-3 py-2 text-[.72rem] font-semibold uppercase tracking-[.14em] text-cocoa transition-colors hover:border-cocoa hover:bg-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
