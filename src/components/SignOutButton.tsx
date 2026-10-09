"use client";
import { signOut } from "next-auth/react";
export function SignOutButton() { return <button className="btn-primary" onClick={() => signOut({ callbackUrl: "/login" })}>ออกจากระบบ</button>; }
