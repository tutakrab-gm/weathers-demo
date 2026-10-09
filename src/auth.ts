import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Line from "next-auth/providers/line";
import { authConfig } from "./auth.config";
import { devLoginAllowsEmail, devLoginEnabled, emailLoginEnabled, env, googleLoginEnabled, lineLoginEnabled } from "./lib/core/env";
import { consumeMagicToken } from "./lib/services/magic";
import { findUserByIdentity, linkIdentity, reportUnknownLogin } from "./lib/services/users";
import { audit } from "./lib/services/audit";

const providers: NextAuthConfig["providers"] = [];
if (lineLoginEnabled()) providers.push(Line({ clientId: env.line.id, clientSecret: env.line.secret }));
if (googleLoginEnabled()) {
  // scope จำกัด openid email profile เท่านั้น (ไม่ขอสิทธิ์ Google Workspace/Drive ใด ๆ)
  providers.push(Google({ clientId: env.google.id, clientSecret: env.google.secret, authorization: { params: { scope: "openid email profile", prompt: "select_account" } } }));
}
if (emailLoginEnabled()) {
  providers.push(Credentials({
    id: "magic", name: "Email link", credentials: { token: {} },
    async authorize(c) {
      const email = await consumeMagicToken(String(c?.token ?? ""));
      return email ? { id: email, email } : null;
    },
  }));
}
if (devLoginEnabled()) {
  providers.push(Credentials({
    id: "dev", name: "Dev login", credentials: { email: {} },
    async authorize(c) {
      if (!devLoginEnabled()) return null; // กันซ้ำ: ปิดเมื่อ production
      const email = String(c?.email ?? "").toLowerCase();
      return email && devLoginAllowsEmail(email) ? { id: email, email } : null;
    },
  }));
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  secret: env.authSecret || undefined,
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      // Google: ต้องเป็นอีเมลที่ยืนยันแล้วเท่านั้น
      if (account?.provider === "google" && (profile as { email_verified?: boolean } | undefined)?.email_verified === false) return false;
      void user;
      return true; // ไม่อยู่ในระบบก็ login ได้ แต่จะเห็นหน้า "รอการอนุมัติ" (ตรวจใน requireUser)
    },
    async jwt({ token, user, account }) {
      if (user && account) {
        const line = account.provider === "line" ? account.providerAccountId : undefined;
        token.ident_email = user.email?.toLowerCase() ?? null;
        token.ident_line = line ?? null;
        token.provider = account.provider;
        const found = await findUserByIdentity({ email: user.email, line_user_id: line });
        if (found) {
          const linked = await linkIdentity(found, { email: user.email, line_user_id: line, avatar: user.image });
          token.uid = linked.user_id;
          await audit(linked.user_id, "login", "user", linked.user_id, "", { provider: account.provider });
        } else {
          token.uid = null;
          await reportUnknownLogin(account.provider, { email: user.email, line_user_id: line, name: user.name });
        }
      }
      return token;
    },
    async session({ session, token }) {
      (session.user as unknown as Record<string, unknown>).uid = token.uid ?? null;
      (session.user as unknown as Record<string, unknown>).ident = { email: token.ident_email ?? null, line: token.ident_line ?? null };
      return session;
    },
  },
});
