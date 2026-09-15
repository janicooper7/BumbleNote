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
}: {
  user?: SidebarUser;
  students?: PickStudent[];
  quota: LessonQuotaView;
}) {
  const pathname = usePathname();
  const displayName = user?.name || user?.email || "Tutor";
  const initial = (user?.name?.[0] || user?.email?.[0] || "?").toUpperCase();

  return (
    <aside className="sticky top-0 hidden h-screen w-[260px] flex-none flex-col border-r border-line bg-surface/70 px-5 py-6 backdrop-blur md:flex">
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
              className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 font-medium transition-all duration-200 ${
                active
                  ? "bg-brand-soft text-brand-deep"
                  : "text-ink-soft hover:bg-brand-soft/50 hover:text-ink"
              }`}
            >
              <Icon
                className={`transition-colors ${
                  active ? "text-brand-deep" : "text-muted group-hover:text-ink-soft"
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
          <CombineLessonsButton students={students} />
        </div>

        <div className="rounded-xl border border-line bg-white/60 p-3">
          <div className="flex items-center gap-3">
            <span
              className="grid h-9 w-9 flex-none place-items-center rounded-lg font-display font-semibold text-ink"
              style={{ background: "linear-gradient(145deg,#ffd143,#f0a500)" }}
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
              className="w-full rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink-soft transition-colors hover:border-brand-line hover:text-ink"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
