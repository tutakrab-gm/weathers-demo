/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp", "exceljs", "ioredis", "googleapis", "nodemailer", "pdf-lib", "@pdf-lib/fontkit"],
  poweredByHeader: false,
  // ฟอนต์ไทยสำหรับ PDF ต้องถูกรวมเข้า standalone output
  outputFileTracingIncludes: { "/api/export": ["./assets/fonts/**"] },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
      ],
    }, { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] }];
  },
};
export default nextConfig;
