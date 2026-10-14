# Kết nối Power BI

Dữ liệu khảo sát được thiết kế dạng **long/tidy** để Power BI đọc trực tiếp, so sánh được giữa các phiên bản và các đợt khảo sát nhờ `question_code` / `option_code` ổn định.

## Các view (schema `analytics`)

| View | Hạt (grain) | Dùng cho |
|---|---|---|
| `v_survey_summary` | 1 dòng / khảo sát | KPI tổng: bắt đầu, đã gửi, tỷ lệ hoàn thành, thời lượng TB |
| `v_response_status` | 1 dòng / phản hồi | Fact phản hồi: trạng thái, cờ, thời gian, phiên bản |
| `v_answers_long` | 1 dòng / câu trả lời | Text / number / date theo `question_code` (PII đã được ẩn ở `answer_text`) |
| `v_choice_selections` | 1 dòng / lượt chọn hoặc ô lưới | Đếm lựa chọn, ma trận, xếp hạng (`rank`), số lượng (`quantity`) |
| `v_question_metrics` | 1 dòng / survey × câu × hàng × lựa chọn | Bảng tổng hợp sẵn (chỉ phản hồi đã gửi, không gắn cờ) |
| `v_codebook` | 1 dòng / câu × lựa chọn × phiên bản | Dimension nhãn câu hỏi & lựa chọn |

## Tạo user chỉ đọc cho Power BI

Chạy trong SQL Editor (đổi mật khẩu):

```sql
create role powerbi_reader with login password 'ĐỔI_MẬT_KHẨU_MẠNH' bypassrls;
grant usage on schema analytics, public to powerbi_reader;
grant select on all tables in schema analytics to powerbi_reader;
grant select on public.surveys, public.survey_responses, public.response_answers, public.response_answer_options,
  public.survey_questions, public.question_options, public.survey_sections, public.survey_versions, public.projects
  to powerbi_reader;
```

> `bypassrls` cho phép đọc **mọi** khảo sát. Nếu cần giới hạn theo dự án, bỏ `bypassrls` và tạo view lọc theo `project_id` riêng cho từng nhóm.

## Kết nối

Power BI Desktop → *Get Data* → **PostgreSQL database**
- Server: `db.<project-ref>.supabase.co:5432` (hoặc *Session pooler* host trong Supabase → Connect)
- Database: `postgres`
- Chế độ: **Import** (khuyến nghị, refresh theo lịch) — DirectQuery chỉ nên dùng với `v_question_metrics`.
- Đăng nhập: `powerbi_reader` / mật khẩu ở trên.

## Mô hình gợi ý

```
v_codebook (dim)  1 ──*  v_choice_selections (fact)  *── 1  v_response_status (fact/dim phản hồi)
                                                      *── 1  v_survey_summary (dim khảo sát)
```
Khóa nối: `survey_id` + `question_code` (+ `option_code`), `response_id`.

### DAX mẫu

```DAX
Respondents = DISTINCTCOUNT ( v_choice_selections[response_id] )

-- % người trả lời chọn đáp án (câu nhiều lựa chọn: tổng có thể > 100%)
Pct Respondents =
DIVIDE (
    [Respondents],
    CALCULATE ( [Respondents], REMOVEFILTERS ( v_choice_selections[option_code], v_choice_selections[option_label] ) )
)

Total Quantity = SUM ( v_choice_selections[quantity] )   -- ví dụ: tổng số lớp theo chủ đề STEM × cấp học
```

Lọc mặc định trong report: `status = "submitted"` và `flag` trống.
