import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ระบบติดตามสถานการณ์น้ำ", short_name: "สถานการณ์น้ำ", description: "รับแจ้งและติดตามสถานการณ์น้ำของโครงการบ้านจัดสรร",
    start_url: "/", display: "standalone", background_color: "#f1f5f9", theme_color: "#1d4ed8", lang: "th",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
