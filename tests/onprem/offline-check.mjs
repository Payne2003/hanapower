// Kiểm tra cấu hình "Tại văn phòng" hoạt động KHÔNG cần Internet:
// chạy trong container trên mạng Docker internal (không có đường ra ngoài).
// Kiểm: không ra được Internet; đăng nhập; RPC theo quyền; lưu/tải tệp; Realtime broadcast.
import { createClient } from "@supabase/supabase-js";

const URL = process.env.CHECK_URL ?? "http://gateway:8000";
const ANON = process.env.ANON_KEY;
const SERVICE = process.env.SERVICE_ROLE_KEY;
const results = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    results.push({ name, ok: false, detail: e.message });
    console.log(`✗ ${name} — ${e.message}`);
  }
};

await check("Không có đường ra Internet (mạng cô lập)", async () => {
  try {
    await fetch("https://www.google.com", { signal: AbortSignal.timeout(4000) });
  } catch {
    return "fetch ra ngoài thất bại như mong đợi";
  }
  throw new Error("Vẫn truy cập được Internet — mạng chưa cô lập");
});

const sb = createClient(URL, ANON, { auth: { persistSession: false } });
await check("Đăng nhập bằng GoTrue nội bộ", async () => {
  const { data, error } = await sb.auth.signInWithPassword({ email: "nhanvien1@hanapower.local", password: "MatKhau@123" });
  if (error) throw error;
  return data.user.email;
});

await check("RPC + RLS (get_my_context, project_stats)", async () => {
  const { data, error } = await sb.rpc("get_my_context");
  if (error) throw error;
  const { data: stats, error: e2 } = await sb.from("project_stats").select("project_id, progress");
  if (e2) throw e2;
  return `${data.full_name}, thấy ${stats.length} dự án`;
});

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
await check("Lưu và tải tệp (storage backend file cục bộ)", async () => {
  const bucket = "offline-check";
  await admin.storage.deleteBucket(bucket).catch(() => {});
  const { error: be } = await admin.storage.createBucket(bucket, { public: false });
  if (be && !/exists/i.test(be.message)) throw be;
  const body = new Blob([`Tệp kiểm tra ngoại tuyến – ${new Date().toISOString()}`], { type: "text/plain" });
  const { error: ue } = await admin.storage.from(bucket).upload("bao-cao/kiem-tra.txt", body, { upsert: true });
  if (ue) throw ue;
  const { data, error: de } = await admin.storage.from(bucket).download("bao-cao/kiem-tra.txt");
  if (de) throw de;
  const text = await data.text();
  await admin.storage.from(bucket).remove(["bao-cao/kiem-tra.txt"]);
  await admin.storage.deleteBucket(bucket);
  if (!text.startsWith("Tệp kiểm tra")) throw new Error("Nội dung tải về không khớp");
  return `${text.length} ký tự, tiếng Việt nguyên vẹn`;
});

await check("Realtime (WebSocket qua gateway, broadcast)", async () => {
  const ch = sb.channel(`kiem-tra-${Date.now()}`, { config: { broadcast: { self: true, ack: true } } });
  const received = new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Không nhận được tin broadcast trong 10s")), 10000);
    ch.on("broadcast", { event: "ping" }, (msg) => { clearTimeout(t); resolve(msg.payload); });
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Không SUBSCRIBED được trong 10s")), 10000);
    ch.subscribe((status) => { if (status === "SUBSCRIBED") { clearTimeout(t); resolve(); } });
  });
  await ch.send({ type: "broadcast", event: "ping", payload: { text: "Xin chào văn phòng" } });
  const payload = await received;
  await sb.removeChannel(ch);
  return `nhận "${payload.text}"`;
});

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} kiểm tra thất bại` : "\nTất cả kiểm tra đạt");
process.exit(failed ? 1 : 0);
