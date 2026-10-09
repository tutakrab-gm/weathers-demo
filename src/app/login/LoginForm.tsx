"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";

export function LoginForm({ line, google, email, dev, error }: { line: boolean; google: boolean; email: boolean; dev: Array<{ email: string; name: string; role: string }>; error?: string }) {
  const [mail, setMail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const none = !line && !google && !email && dev.length === 0;

  async function sendLink(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await fetch("/api/login/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: mail }) });
    const j = await r.json().catch(() => ({}));
    setMsg(j.message ?? "ส่งไม่สำเร็จ"); setBusy(false);
  }
  return (
    <div className="card space-y-3">
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่</p>}
      {line && <button className="btn w-full bg-[#06C755] text-white" onClick={() => signIn("line", { callbackUrl: "/" })}>เข้าสู่ระบบด้วย LINE</button>}
      {google && <button className="btn-ghost w-full" onClick={() => signIn("google", { callbackUrl: "/" })}>เข้าสู่ระบบด้วย Google (Gmail)</button>}
      {email && (
        <form onSubmit={sendLink} className="space-y-2 border-t border-slate-100 pt-3">
          <label className="label" htmlFor="em">หรือรับลิงก์ทางอีเมล</label>
          <input id="em" type="email" required value={mail} onChange={(e) => setMail(e.target.value)} className="input" placeholder="name@example.com" autoComplete="email" />
          <button className="btn-primary w-full" disabled={busy}>ส่งลิงก์เข้าสู่ระบบ</button>
          {msg && <p className="text-sm text-slate-600">{msg}</p>}
        </form>
      )}
      {dev.length > 0 && (
        <div className="space-y-2 border-t border-dashed border-amber-300 pt-3">
          <p className="text-xs font-medium text-amber-700">โหมดทดสอบ (Dev login — ปิดอัตโนมัติใน production)</p>
          <div className="grid gap-2">
            {dev.map((u) => <button key={u.email} data-testid={`dev-${u.email}`} className="btn-ghost justify-between" onClick={() => signIn("dev", { email: u.email, callbackUrl: "/" })}><span>{u.name}</span><span className="text-xs text-slate-500">{u.role}</span></button>)}
          </div>
        </div>
      )}
      {none && <p className="text-sm text-slate-600">ยังไม่ได้ตั้งค่าวิธีเข้าสู่ระบบ — ดู README (LINE / Google / SMTP)</p>}
      <p className="pt-1 text-center text-xs text-slate-400">เฉพาะผู้ที่ได้รับการลงทะเบียนโดยผู้ดูแลระบบเท่านั้น</p>
    </div>
  );
}
