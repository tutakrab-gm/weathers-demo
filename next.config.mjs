/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["sharp", "exceljs", "ioredis", "googleapis", "nodemailer", "pdf-lib", "@pdf-lib/fontkit"],
  poweredByHeader: false,
};
export default nextConfig;
