import fs from "node:fs";
import path from "node:path";

/**
 * Next file-tracing ตกหล่นไฟล์ที่ถูกโหลดผ่าน exports map (.mjs) ของ dependency ลึก ๆ ของ exceljs/googleapis
 * จึงคำนวณ closure ของ dependencies แล้วบังคับรวมเข้า standalone output (ทำงานเฉพาะตอน build)
 */
function closure(roots) {
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    const pj = path.join(process.cwd(), "node_modules", name, "package.json");
    if (!fs.existsSync(pj)) return;
    seen.add(name);
    const j = JSON.parse(fs.readFileSync(pj, "utf8"));
    for (const d of Object.keys(j.dependencies ?? {})) visit(d);
  };
  roots.forEach(visit);
  return [...seen].map((n) => `./node_modules/${n}/**`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp", "exceljs", "ioredis", "googleapis", "nodemailer", "pdf-lib", "@pdf-lib/fontkit"],
  poweredByHeader: false,
  outputFileTracingIncludes: {
    "/api/export": ["./assets/fonts/**", ...closure(["exceljs", "pdf-lib", "@pdf-lib/fontkit"])],
  },
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
