import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Hana Power – Quản trị công việc", template: "%s · Hana Power" },
  description: "Giao việc, báo cáo tiến độ và trao đổi nội bộ",
  applicationName: "Hana Power",
  appleWebApp: { capable: true, title: "Hana Power", statusBarStyle: "default" },
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
