<p align="center"><img src="public/brand/kdi-logo.png" alt="KDI Education" height="64"></p>

# Hệ thống khảo sát STEM — KDI Education

Nền tảng **tạo, phân phối, thu thập và phân tích khảo sát** tổng quát. "STEM" là tên thương hiệu và là template đầu tiên (*Khảo sát nhu cầu chủ đề STEM 2026–2027*) — template này được dựng **100% bằng Builder**, không có dòng code nào riêng cho STEM.

| Module | Chức năng chính |
|---|---|
| **01 · Survey Workspace** | Khảo sát theo dự án/phòng ban; tạo trống / từ mẫu / nhân bản; vòng đời Draft → Published → Paused → Closed → Archived; thư viện mẫu; dashboard tổng quan |
| **02 · Dynamic Form Builder** | Kéo-thả 3 vùng; 33 loại câu hỏi & khối nội dung; logic AND/OR lồng nhau (hiển thị, bắt buộc có điều kiện, ẩn/hiện phần); media (ảnh, YouTube/Vimeo/MP4, link, tài liệu); undo/redo; autosave; xem trước desktop/mobile + kiểm tra logic; **versioning bất biến** |
| **03 · Survey Distribution** | Link công khai, mã truy cập, **link mời riêng** (token 128-bit, chỉ lưu hash, dùng 1 lần, thu hồi được, có hạn); QR có logo (PNG/SVG); thời gian mở/đóng; giới hạn số phản hồi; 1 phản hồi/thiết bị; **tự lưu nháp & tiếp tục** |
| **04 · Response Intelligence** | Danh sách phản hồi (lọc, tìm, sắp xếp, phân trang); xem chi tiết **theo đúng phiên bản** đã trả lời; gắn cờ không xóa dữ liệu; dashboard tự chọn biểu đồ theo loại câu hỏi; cross-filter, cross-tab, drill-down; funnel bỏ dở theo phần; xuất Excel (5 sheet) / CSV; views cho Power BI |

---

## Chạy thử ngay (chế độ demo, không cần backend)

```bash
npm install
npm run dev          # http://localhost:5173
```

Không có biến `VITE_SUPABASE_*` ⇒ app chạy **chế độ demo**: dữ liệu lưu trong localStorage của trình duyệt, có sẵn 3 khảo sát mẫu và ~100 phản hồi giả lập.

- Quản trị: `/admin/login` → `admin@kdi.edu.vn` (mật khẩu bất kỳ). Tài khoản `analyst@kdi.edu.vn` để thử quyền chỉ xem.
- Trả lời thử: `/s/nhu-cau-stem-2026-2027`

> Chế độ demo mô phỏng đúng nghiệp vụ (versioning, chuyển trạng thái, validate khi gửi, idempotent submit) nhưng **không phải ranh giới bảo mật**. Dùng cho trình diễn và đào tạo.

---

## Triển khai thật với Supabase

### 1. Tạo project Supabase
1. Tạo project tại [supabase.com](https://supabase.com) (region Singapore cho người dùng VN).
2. Cài CLI: `npm i -g supabase` → `supabase login` → `supabase link --project-ref <ref>`.

### 2. Database
```bash
supabase db push                       # chạy 3 migration trong supabase/migrations
psql "$SUPABASE_DB_URL" -f supabase/seed.sql   # hoặc dán seed.sql vào SQL Editor
```
Migration tạo: bảng, chỉ mục, RLS, các hàm RPC (`publish_survey`, `set_survey_status`, `duplicate_survey`, `create_invitations`, `revoke_invitation`, `flag_response`, `finalize_response`), 2 storage bucket, schema `analytics` với 6 view.

### 3. Edge Function (API cho người trả lời)
```bash
supabase functions deploy survey-public --no-verify-jwt
supabase secrets set ALLOWED_ORIGINS=https://khaosat.kdi.edu.vn IP_SALT=$(openssl rand -hex 16)
# tùy chọn: RATE_LIMIT_PER_10MIN=30
```
`SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` được Supabase tự cấp cho function — **service role key không bao giờ xuất hiện ở frontend**.

### 4. Auth
- Dashboard → Authentication → URL Configuration: thêm domain production vào *Site URL* và *Redirect URLs*.
- **Tài khoản đăng ký đầu tiên tự động là Super Admin.** Sau đó có thể tắt *Allow new users to sign up* và mời người dùng qua email.

### 5. Frontend (Vercel hoặc Cloudflare Pages)
```bash
cp .env.example .env.local   # điền VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_PUBLIC_SITE_URL
npm run build                # output: dist/
```
- **Vercel**: import repo → Framework *Vite* → thêm 3 biến môi trường → Deploy (`vercel.json` đã cấu hình SPA rewrite + header bảo mật).
- **Cloudflare Pages**: build command `npm run build`, output `dist` (`public/_redirects` đã có).

---

## Kiến trúc

```
apps (src/)                      packages/survey-core (TS thuần, 0 dependency)
├─ pages/public   ── PublicApi ─┐   ├─ registry.ts   33 loại câu hỏi (mở rộng = thêm 1 định nghĩa)
├─ pages/admin    ── AdminApi ──┤   ├─ logic.ts      engine AND/OR + lint (tham chiếu sai/vòng)
├─ survey/        renderer      │   ├─ validate.ts   validate + sanitize (dùng cả FE lẫn server)
└─ data/                        │   ├─ normalize.ts  answers → dòng typed cho DB/BI
   ├─ demo.ts     localStorage  │   ├─ analytics.ts  KPI, funnel, thống kê theo loại câu hỏi
   └─ supabase.ts ──────────────┘   └─ export.ts     wide / long / choices / codebook
                         │
                 Supabase: Postgres + RLS + RPC
                 Edge Function survey-public  ← import cùng survey-core (supabase/functions/_shared)
```

**Nguyên tắc dữ liệu**
- `surveys.draft_schema` là bản nháp; mỗi lần xuất bản tạo `survey_versions` **bất biến** và materialize sang `survey_sections / survey_questions / question_options`.
- Mỗi phản hồi gắn `version_id` → luôn hiển thị đúng câu hỏi lúc trả lời.
- `question_code` / `option_code` ổn định; Builder **khóa mã** đã dùng trong phiên bản đã xuất bản và chỉ cho **ẩn** (không xóa) lựa chọn đã có dữ liệu.
- Lưu song song: `survey_responses.answers` (raw, để render lại chính xác) + `response_answers` (cột typed) + `response_answer_options` (1 dòng/lượt chọn, có `row_code`, `rank`, `quantity`) để đếm/tổng hợp nhanh.
- Mẫu số của mọi tỷ lệ theo câu hỏi = **số người được hiển thị câu hỏi** (theo logic). Câu nhiều lựa chọn hiển thị riêng *% người trả lời* và *% lượt chọn* — không ép tổng 100%.

**Bảo mật**
- RLS trên mọi bảng; người trả lời **không** chạm bảng trực tiếp — mọi thao tác qua Edge Function.
- Đổi trạng thái/xuất bản chỉ qua RPC `SECURITY DEFINER` có kiểm tra quyền + ghi `audit_logs` (trigger chặn update trực tiếp).
- Server kiểm tra: trạng thái & thời hạn → quyền truy cập (mã / token) → giới hạn lượt & rate limit IP → logic hiển thị → validate từng câu → ghi trong 1 transaction (`finalize_response`, idempotent) → chỉ báo thành công sau khi commit.
- Tệp người trả lời: bucket private, upload bằng signed URL, xem bằng signed URL 5 phút.
- Video chỉ nhúng từ allowlist (YouTube-nocookie, Vimeo, MP4 https); nguồn khác hiển thị dạng link. Không render HTML do người dùng nhập.

---

## Kiểm thử

```bash
npm test          # 15 test survey-core: logic, validate, normalize, analytics, NPS, export, clone
npm run test:db   # chạy migrations trên Postgres in-memory (PGlite): publish/versioning, chuyển trạng thái,
                  # chặn update trực tiếp, chặn người lạ xuất bản, finalize idempotent, analytics views
npm run ci        # typecheck + tất cả test + kiểm tra đồng bộ core + build
python3 tests/e2e_demo.py   # e2e trình duyệt (demo mode): trả lời khảo sát đầy đủ, builder, lời mời, phân tích, export
```
CI (GitHub Actions) chạy toàn bộ, kèm `deno check` cho Edge Function.

> Sau khi sửa `packages/survey-core`, chạy `npm run sync:core` để cập nhật bản copy cho Edge Function.

---

## Phạm vi MVP & việc tiếp theo

**Đã có:** toàn bộ Phase 1–4 trong kế hoạch, gồm nhóm câu hỏi A, B đầy đủ; nhóm C: địa chỉ (34 tỉnh/thành sau sáp nhập), liên hệ, số lượng theo nhóm, danh mục × cấp độ (có số lượng), upload tệp, đồng ý; nhóm D: tiêu đề, đoạn văn, hộp hướng dẫn, ảnh, video, link/tài liệu, phân cách.

**Chưa có (đề xuất Phase 5):**
- Vai trò *Viewer* chỉ xem số liệu tổng hợp không thấy PII (hiện có Owner / Editor / Analyst + cờ `is_pii` ẩn trong view phân tích).
- Gửi lời mời qua email (Resend/SendGrid), AI tóm tắt câu trả lời mở, trình tạo báo cáo tùy chỉnh.
- Câu hỏi: danh sách lặp, bảng dữ liệu, chữ ký, audio, embed tùy ý; danh mục lựa chọn dùng chung (hiện dùng *dán danh sách/CSV*); tính điểm.
- Captcha (Cloudflare Turnstile) và job tự xóa theo `retentionDays` (cấu hình đã lưu, chưa có job chạy).
- Phân tích hiện tính ở trình duyệt — phù hợp đến khoảng 10–20 nghìn phản hồi/khảo sát; lớn hơn nên chuyển sang SQL view/RPC tổng hợp (`analytics.v_question_metrics` đã sẵn).

Kết nối Power BI: xem [docs/POWER_BI.md](docs/POWER_BI.md).
