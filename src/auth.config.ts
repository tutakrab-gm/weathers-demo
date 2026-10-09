import type { NextAuthConfig } from "next-auth";

/** ส่วนที่ปลอดภัยกับ Edge runtime (ใช้ใน middleware) — ห้าม import repository/ioredis ที่นี่ */
const PUBLIC = [/^\/login(\/|$)/, /^\/api\/auth(\/|$)/, /^\/api\/login(\/|$)/, /^\/api\/health$/, /^\/_next\//, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/offline\.html$/, /^\/icons\//, /^\/favicon/];

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  providers: [],
  trustHost: true,
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC.some((r) => r.test(pathname))) return true;
      // cron ใช้ Bearer CRON_SECRET ตรวจใน route เอง (เครื่องเรียก ไม่มี session)
      if (/^\/api\/cron\//.test(pathname)) return true;
      if (auth?.user) return true;
      if (pathname.startsWith("/api/")) return Response.json({ error: "unauthorized", message: "กรุณาเข้าสู่ระบบ" }, { status: 401 });
      return false; // redirect ไป /login
    },
  },
} satisfies NextAuthConfig;
