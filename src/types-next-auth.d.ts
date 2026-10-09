import "next-auth/jwt";
declare module "next-auth/jwt" {
  interface JWT { uid?: string | null; ident_email?: string | null; ident_line?: string | null; provider?: string }
}
