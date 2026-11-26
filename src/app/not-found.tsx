import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold">Không tìm thấy trang hoặc bạn không có quyền xem</h1>
        <Link href="/" className="mt-3 inline-block text-primary underline">Về Tổng quan</Link>
      </div>
    </main>
  );
}
