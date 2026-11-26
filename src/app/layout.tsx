import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "HANA MEDIA – Quản lý sản xuất video", template: "%s · HANA MEDIA" },
  description: "Quản lý sản xuất video: Content, bàn giao, dựng, duyệt và đăng kênh",
  applicationName: "HANA MEDIA",
  appleWebApp: { capable: true, title: "HANA MEDIA", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#1f6b43",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
