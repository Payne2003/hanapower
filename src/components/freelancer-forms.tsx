import { RpcForm } from "@/components/rpc-form";
import type { Row } from "@/lib/entities";

export function FreelancerForm({ f, collabUsers, revalidate }: { f?: Row; collabUsers: [string, string][]; revalidate: string[] }) {
  return (
    <RpcForm rpc="save_freelancer" fixed={{ p_id: f?.id ?? null }} submitLabel={f ? "Lưu hồ sơ" : "Thêm cộng tác viên"} revalidate={revalidate} redirectTo={f ? undefined : "/cong-tac-vien/{}"} columns={3}
      fields={[
        { name: "p_name", label: "Họ tên", required: true, defaultValue: (f?.full_name as string) ?? "" },
        { name: "p_phones", label: "Số điện thoại", type: "tags", defaultValue: (f?.phones as string[]) ?? [] }, { name: "p_emails", label: "Email", type: "tags", defaultValue: (f?.emails as string[]) ?? [] },
        { name: "p_skills", label: "Kỹ năng", type: "tags", defaultValue: (f?.skills as string[]) ?? [], hint: "Cách nhau dấu phẩy: thiết kế, lồng tiếng…" },
        { name: "p_rate_note", label: "Mức thù lao thường dùng", defaultValue: (f?.rate_note as string) ?? "" },
        { name: "p_user_id", label: "Tài khoản đăng nhập (vai trò Cộng tác viên)", type: "select", as: "uuid", options: collabUsers, defaultValue: (f?.user_id as string) ?? "", hint: "Tạo tài khoản ở mục Nhân viên với vai trò Cộng tác viên" },
        { name: "p_note", label: "Ghi chú", type: "textarea", defaultValue: (f?.note as string) ?? "" },
        { name: "p_active", label: "Trạng thái", type: "checkbox", placeholder: "Đang hợp tác", defaultValue: f ? f.is_active === true : true },
      ]} />
  );
}
