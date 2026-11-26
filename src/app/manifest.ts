import type { MetadataRoute } from "next";

// Manifest PWA: cài từ Microsoft Edge thành ứng dụng cửa sổ độc lập trên Windows.
// (Service worker và trang ngoại tuyến được hoàn thiện ở giai đoạn PWA.)
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Hana Power – Quản trị công việc",
    short_name: "Hana Power",
    description: "Giao việc, báo cáo tiến độ và trao đổi nội bộ",
    lang: "vi",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    background_color: "#fafafa",
    theme_color: "#1f6b43",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Việc của tôi", url: "/viec-cua-toi" },
      { name: "Báo cáo ngày", url: "/bao-cao" },
    ],
  };
}
