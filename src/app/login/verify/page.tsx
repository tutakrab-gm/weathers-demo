"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

function Verify() {
  const token = useSearchParams().get("token") ?? "";
  const [err, setErr] = useState(false);
  useEffect(() => {
    signIn("magic", { token, redirect: false }).then((r) => { if (r?.error || !r?.ok) setErr(true); else location.href = "/"; });
  }, [token]);
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      {err ? <div className="card space-y-3"><p>ลิงก์ไม่ถูกต้องหรือหมดอายุแล้ว</p><a className="btn-primary" href="/login">กลับไปหน้าเข้าสู่ระบบ</a></div> : <p className="text-slate-600">กำลังเข้าสู่ระบบ…</p>}
    </main>
  );
}
export default function Page() { return <Suspense><Verify /></Suspense>; }
