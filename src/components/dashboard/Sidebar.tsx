"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "../Logo";
import { useState } from "react";
import {
  GridIcon,
  UsersIcon,
  MicIcon,
  GearIcon,
  PlayCircleIcon,
  ChevronDownIcon,
} from "./icons";
import { GUIDES } from "@/lib/guides";
import RecordLessonButton, { type LessonQuotaView } from "./RecordLessonButton";
import CombineLessonsButton from "./CombineLessonsButton";
import FeedbackButton from "./FeedbackButton";
import { signOutAction } from "@/app/actions/auth";

const nav = [
  { href: "/dashboard", label: "Overview", Icon: GridIcon, exact: true },
  { href: "/dashboard/students", label: "Students", Icon: UsersIcon, exact: false },
  { href: "/dashboard/lessons", label: "Lessons", Icon: MicIcon, exact: false },
  { href: "/dashboard/settings", label: "Settings", Icon: GearIcon, exact: false },
];

// "How-to guides" toggles a list of walkthrough videos (lib/guides). Starts
// open while a guide is being viewed, so the current one stays visible.
function GuidesMenu({ pathname }: { pathname: string }) {
  const inGuides = pathname.startsWith("/dashboard/guides");
  const [open, setOpen] = useState(inGuides);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="guides-menu"
        className={`group flex w-full items-center gap-3 rounded-full px-4 py-2.5 text-left text-[.875rem] font-medium uppercase tracking-[.16em] transition-all duration-200 ${
          inGuides ? "bg-butter text-cocoa" : "text-ink-soft hover:bg-butter-soft hover:text-cocoa"
        }`}
      >
        <PlayCircleIcon
          className={`transition-colors ${
            inGuides ? "text-cocoa" : "text-muted group-hover:text-cocoa"
          }`}
        />
        <span className="flex-1">How-to guides</span>
        <ChevronDownIcon
          className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul id="guides-menu" className="mt-1 ml-[1.6rem] flex flex-col gap-0.5 border-l border-cocoa/15 pl-3">
          {GUIDES.map((g) => {
            const href = `/dashboard/guides/${g.slug}`;
            const active = pathname === href;
            return (
              <li key={g.slug}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-full px-3 py-1.5 text-[.82rem] transition-colors ${
                    active
                      ? "bg-butter-soft font-semibold text-cocoa"
                      : "text-ink-soft hover:bg-butter-soft hover:text-cocoa"
                  }`}
                >
                  {g.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type SidebarUser ={ name?: string | null; email?: string | null } | null;
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
    <aside className="sticky top-0 hidden h-screen w-[300px] flex-none flex-col border-r border-cocoa/15 bg-white px-5 py-6 overflow-y-auto md:flex">
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
              className={`group flex items-center gap-3 rounded-full px-4 py-2.5 text-[.875rem] font-medium uppercase tracking-[.16em] transition-all duration-200 ${
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
        <GuidesMenu pathname={pathname} />
        <FeedbackButton inSidebar />
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
              className="w-full rounded-full border-[1.5px] border-cocoa/25 px-3 py-2 text-[.78rem] font-semibold uppercase tracking-[.14em] text-cocoa transition-colors hover:border-cocoa hover:bg-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
