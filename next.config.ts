import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BUILD_STANDALONE=1 (Dockerfile) bật "standalone": cho phép đóng gói chạy bằng `node server.js` trong Docker (cấu hình tại văn phòng).
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  poweredByHeader: false,
  // Cho phép tải tệp Excel (nhập dữ liệu) tối đa 10 MB qua server action.
  experimental: { serverActions: { bodySizeLimit: "10mb" } },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
