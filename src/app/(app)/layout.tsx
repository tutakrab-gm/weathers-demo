import { redirect } from "next/navigation";
import { Nav, type NavItem } from "@/components/Nav";
import { getSession } from "@/lib/server/session";

const ROLE_TH = { staff: "เจ้าหน้าที่โครงการ", manager: "ผู้จัดการ", executive: "ผู้บริหาร", admin: "ผู้ดูแลระบบ" } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  if (s.state === "anonymous") redirect("/login");
  if (s.state !== "active") redirect("/pending");
  const { user } = s;
  const items: NavItem[] = [
    { href: "/", label: "ภาพรวม", icon: "🏠" },
    { href: "/chat", label: "ถามตอบ", icon: "💬" },
    ...(user.role === "admin" ? [{ href: "/admin", label: "จัดการ", icon: "⚙️" }] : []),
  ];
  return (
    <>
      <Nav items={items} name={user.display_name} role={ROLE_TH[user.role]} />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 md:pb-10">{children}</main>
    </>
  );
}
