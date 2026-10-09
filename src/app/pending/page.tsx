import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import { SignOutButton } from "@/components/SignOutButton";
export const dynamic = "force-dynamic";

export default async function Pending() {
  const s = await getSession();
  if (s.state === "anonymous") redirect("/login");
  if (s.state === "active") redirect("/");
  const disabled = s.state === "disabled";
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center p-6">
      <div className="card w-full space-y-3 text-center">
        <div className="text-4xl">{disabled ? "🚫" : "⏳"}</div>
        <h1 className="text-xl font-bold">{disabled ? "บัญชีถูกปิดการใช้งาน" : "รอการอนุมัติ"}</h1>
        <p className="text-sm text-slate-600">
          {disabled ? "กรุณาติดต่อผู้ดูแลระบบหากคิดว่าเป็นความผิดพลาด" : "คุณเข้าสู่ระบบสำเร็จ แต่ยังไม่ได้ลงทะเบียนในระบบ ระบบได้แจ้งผู้ดูแลระบบแล้ว เมื่อได้รับอนุมัติให้รีเฟรชหน้านี้"}
        </p>
        {s.state === "pending" && <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">{s.email || s.line || ""}</p>}
        <div className="flex justify-center gap-2"><a href="/pending" className="btn-ghost">รีเฟรช</a><SignOutButton /></div>
      </div>
    </main>
  );
}
