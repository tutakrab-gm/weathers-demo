"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import clsx from "clsx";

export interface NavItem { href: string; label: string; icon: string }

export function Nav({ items, name, role }: { items: NavItem[]; name: string; role: string }) {
  const path = usePathname();
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <Link href="/" className="flex items-center gap-2 font-bold text-brand-700"><span className="text-xl">💧</span><span className="hidden sm:inline">ระบบติดตามสถานการณ์น้ำ</span></Link>
          <nav className="ml-4 hidden gap-1 md:flex">
            {items.map((i) => <Link key={i.href} href={i.href} className={clsx("rounded-lg px-3 py-1.5 text-sm", active(i.href) ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-100")}>{i.label}</Link>)}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <div className="text-right leading-tight"><div className="max-w-40 truncate font-medium">{name}</div><div className="text-xs text-slate-500">{role}</div></div>
            <button className="btn-ghost !min-h-9 !px-3" onClick={() => signOut({ callbackUrl: "/login" })}>ออก</button>
          </div>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={clsx("flex flex-col items-center gap-0.5 py-2 text-xs", active(i.href) ? "font-semibold text-brand-700" : "text-slate-500")}>
            <span className="text-lg leading-none">{i.icon}</span>{i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
