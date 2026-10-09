import { redirect } from "next/navigation";
import { devLoginAllowsEmail, devLoginEnabled, emailLoginEnabled, googleLoginEnabled, lineLoginEnabled } from "@/lib/core/env";
import { repoReady } from "@/lib/repo";
import { getSession } from "@/lib/server/session";
import { LoginForm } from "./LoginForm";
export const dynamic = "force-dynamic";
export const metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const s = await getSession();
  if (s.state === "active") redirect("/");
  if (s.state !== "anonymous") redirect("/pending");
  const { error } = await searchParams;
  const dev = devLoginEnabled() ? (await (await repoReady()).list("users")).filter((u) => u.status === "active" && devLoginAllowsEmail(u.email)).map((u) => ({ email: u.email, name: u.display_name, role: u.role })) : [];
  return (
    <main className="mx-auto grid min-h-dvh max-w-md place-items-center p-6">
      <div className="w-full space-y-5">
        <div className="text-center"><div className="text-5xl">💧</div><h1 className="mt-2 text-2xl font-bold">ระบบติดตามสถานการณ์น้ำ</h1><p className="text-sm text-slate-500">สำหรับเจ้าหน้าที่และผู้บริหารโครงการ</p></div>
        <LoginForm line={lineLoginEnabled()} google={googleLoginEnabled()} email={emailLoginEnabled()} dev={dev} error={error} />
      </div>
    </main>
  );
}
