import type { Metadata, Viewport } from "next";
import "@fontsource/noto-sans-thai/thai-400.css";
import "@fontsource/noto-sans-thai/thai-500.css";
import "@fontsource/noto-sans-thai/thai-700.css";
import "@fontsource/noto-sans-thai/latin-400.css";
import "@fontsource/noto-sans-thai/latin-500.css";
import "@fontsource/noto-sans-thai/latin-700.css";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: { default: "ระบบติดตามสถานการณ์น้ำ", template: "%s • ระบบติดตามสถานการณ์น้ำ" },
  description: "รับแจ้งและติดตามสถานการณ์น้ำของโครงการบ้านจัดสรร",
  applicationName: "สถานการณ์น้ำ",
  appleWebApp: { capable: true, title: "สถานการณ์น้ำ", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};
export const viewport: Viewport = { themeColor: "#1d4ed8", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-dvh antialiased">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
