import type { MetadataRoute } from "next";

// Manifest PWA: cài từ Microsoft Edge thành ứng dụng cửa sổ độc lập trên Windows.
// (Service worker và trang ngoại tuyến được hoàn thiện ở giai đoạn PWA.)
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "HANA Studio",
    short_name: "HANA Studio",
    description: "Quản lý sản xuất video của HANA MEDIA",
    lang: "vi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    background_color: "#fafafa",
    theme_color: "#0f4a30",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Video", url: "/video" },
      { name: "Báo cáo tháng", url: "/bao-cao" },
    ],
  };
}
