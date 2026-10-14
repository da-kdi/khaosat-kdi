# End-to-end smoke test (demo mode). Requires: pip install playwright && playwright install chromium
# Usage: npm run build && npx vite preview --port 4173 &  then  python3 tests/e2e_demo.py [screenshot_dir]
import sys, re
from playwright.sync_api import sync_playwright, expect
import os
OUT = sys.argv[1] if len(sys.argv) > 1 else 'e2e-shots'
os.makedirs(OUT, exist_ok=True)
BASE = os.environ.get('BASE_URL', 'http://localhost:4173')
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1440, 'height': 900}, locale='vi-VN')
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(f'[{m.type}] {m.text}') if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(f'[pageerror] {e}'))
    def shot(n): page.screenshot(path=f'{OUT}/{n}.png', full_page=False)

    page.goto(BASE + '/'); page.wait_for_load_state('networkidle'); shot('01-home')
    # ---------- public survey: full STEM flow ----------
    page.goto(BASE + '/s/nhu-cau-stem-2026-2027'); page.get_by_text('Bắt đầu khảo sát').wait_for(); shot('02-intro')
    page.get_by_text('Bắt đầu khảo sát').click()
    # try to continue without consent -> error
    page.get_by_role('button', name=re.compile('Tiếp tục')).click()
    page.get_by_text('Bạn cần đồng ý để tiếp tục').wait_for(); print('✓ required consent blocks next')
    page.get_by_role('checkbox').first.click()
    page.get_by_role('button', name=re.compile('Tiếp tục')).click()
    page.get_by_placeholder('VD: Trường THCS Lê Lợi').fill('THCS Kiểm Thử')
    page.get_by_role('radio', name='THCS', exact=True).click()
    # logic: THCS grid should appear, primary grid hidden
    expect(page.get_by_text('Số lớp theo khối (THCS)')).to_be_visible()
    expect(page.get_by_text('Số lớp theo khối (Tiểu học)')).to_have_count(0); print('✓ conditional grade grid')
    page.get_by_label('Tỉnh/Thành phố').select_option('Hải Phòng')
    page.get_by_placeholder('Xã / Phường / Đặc khu').fill('Lê Chân')
    page.get_by_label('Họ và tên').fill('Nguyễn Kiểm Thử')
    page.get_by_label('Chức vụ').fill('Hiệu phó')
    page.get_by_label('Số điện thoại').fill('0912345678')
    page.get_by_label('Email').fill('test@truong.edu.vn')
    page.get_by_label('Khối 6').fill('5'); page.get_by_label('Khối 7').fill('4')
    shot('03-section2')
    page.get_by_role('button', name=re.compile('Tiếp tục')).click()
    page.get_by_text('Chọn chủ đề STEM').wait_for()
    page.get_by_role('checkbox', name='Robotics & lập trình – THCS').first.click()
    page.get_by_label('Số lớp Robotics & lập trình THCS').first.fill('3')
    page.get_by_role('checkbox', name='Trí tuệ nhân tạo & khoa học dữ liệu – THCS').first.click()
    page.get_by_role('checkbox', name='Câu lạc bộ STEM').click()
    page.get_by_role('radio', name='Chưa', exact=True).click()
    expect(page.get_by_text('Nhà trường có nhu cầu tư vấn xây dựng phòng STEM không?')).to_be_visible(); print('✓ yes/no branch shows follow-up')
    page.get_by_role('button', name=re.compile('Tiếp tục')).click()
    page.get_by_text('Câu hỏi này là bắt buộc').first.wait_for(); print('✓ conditional required enforced')
    page.get_by_role('radio', name='Có, trong năm học này').click()
    shot('04-section3')
    page.get_by_role('button', name=re.compile('Tiếp tục')).click()
    page.get_by_text('Xếp hạng mức độ ưu tiên').wait_for()
    page.get_by_role('radio', name='4 sao').click()
    page.get_by_placeholder(re.compile('Chủ đề khác')).fill('Mong có tập huấn robotics cho giáo viên.')
    page.get_by_role('button', name=re.compile('Xem lại')).click()
    page.get_by_text('Xem lại câu trả lời').wait_for(); shot('05-review')
    page.get_by_role('button', name=re.compile('Gửi khảo sát')).click()
    page.get_by_text('Mã phản hồi').wait_for(); shot('06-complete')
    code = page.locator('b.font-mono').inner_text(); print('✓ submitted, code', code)

    # ---------- mobile public ----------
    m = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True).new_page()
    m.goto(BASE + '/s/nhu-cau-stem-2026-2027'); m.get_by_text('Bắt đầu khảo sát').wait_for(); m.screenshot(path=f'{OUT}/07-mobile-intro.png')
    m.get_by_text('Bắt đầu khảo sát').click(); m.get_by_role('checkbox').first.click(); m.get_by_role('button', name=re.compile('Tiếp tục')).click()
    m.get_by_role('radio', name='Liên cấp').click(); m.wait_for_timeout(300); m.screenshot(path=f'{OUT}/08-mobile-section2.png', full_page=True)

    # ---------- admin ----------
    page.goto(BASE + '/admin/login'); page.get_by_role('button', name='Đăng nhập', exact=True).last.click()
    page.get_by_text('Tổng số khảo sát').wait_for(); page.wait_for_timeout(500); shot('10-dashboard')
    page.goto(BASE + '/admin/surveys'); page.get_by_text('Khảo sát nhu cầu chủ đề STEM 2026–2027').first.wait_for(); shot('11-surveys')
    page.get_by_text('Khảo sát nhu cầu chủ đề STEM 2026–2027').first.click()
    page.get_by_text('Kéo vào canvas').wait_for(); page.wait_for_timeout(400); shot('12-builder')
    # add a question via palette click, edit title, set logic
    page.get_by_role('button', name='Chọn một').first.click()
    page.wait_for_timeout(300)
    page.locator('aside textarea').first.fill('Trường có giáo viên phụ trách STEM chưa?')
    page.wait_for_timeout(1500); shot('13-builder-edit')
    expect(page.get_by_text('Đã lưu bản nháp')).to_be_visible(); print('✓ builder autosave')
    page.get_by_role('tab', name='Logic').click(); page.wait_for_timeout(200); shot('14-builder-logic')
    # undo the add
    page.get_by_label('Hoàn tác').click(); page.get_by_label('Hoàn tác').click(); page.wait_for_timeout(1300)
    # preview
    page.get_by_role('link', name='Xem trước').click(); page.get_by_text('Kiểm tra logic').wait_for(); page.wait_for_timeout(400); shot('15-preview')
    page.get_by_role('link', name='Phân phối').click(); page.get_by_text('Mã QR').wait_for(); page.wait_for_timeout(300); shot('16-distribution')
    page.get_by_role('button', name=re.compile('Tạo lời mời')).click()
    page.locator('textarea').fill('THCS A, Cô Lan, lan@a.edu.vn\nTH B')
    page.get_by_role('button', name=re.compile('Tạo 2 lời mời')).click()
    page.get_by_text('Đã tạo 2 lời mời').wait_for(); shot('17-invites')
    link = page.locator('span.font-mono').first.inner_text(); print('✓ invite link', link[:60])
    page.get_by_role('button', name='Xong').click()
    page.get_by_role('link', name='Phản hồi').click(); page.get_by_text(code).wait_for(); shot('18-responses')
    page.get_by_text(code).click(); page.get_by_text('Lưu xác minh').wait_for(); page.wait_for_timeout(300); shot('19-response-detail')
    page.keyboard.press('Escape')
    page.get_by_role('link', name='Phân tích').click(); page.get_by_text('Tỷ lệ bỏ dở theo phần').wait_for(); page.wait_for_timeout(800); shot('20-analytics')
    page.mouse.wheel(0, 900); page.wait_for_timeout(500); shot('21-analytics-2')
    page.mouse.wheel(0, 1200); page.wait_for_timeout(500); shot('22-analytics-3')
    # cross-filter by clicking an option row
    page.get_by_role('button', name=re.compile('^THCS')).first.click(); page.wait_for_timeout(400)
    expect(page.get_by_text('Đang lọc:')).to_be_visible(); print('✓ cross-filter')
    page.get_by_label('Phân tách theo').select_option(label='Cấp học'); page.wait_for_timeout(500); shot('23-analytics-crosstab')
    with page.expect_download() as dl:
        page.get_by_role('button', name=re.compile('Xuất dữ liệu')).click(); page.get_by_text('Excel đầy đủ').click()
    d = dl.value; d.save_as(f'{OUT}/export.xlsx'); print('✓ xlsx export', d.suggested_filename)
    page.get_by_role('link', name='Cài đặt').click(); page.get_by_text('Phân quyền khảo sát').wait_for(); shot('24-settings')
    # invite-only flow: use created link in fresh context
    pub = ctx.new_page(); pub.goto(link if link.startswith('http') else BASE + link); pub.get_by_text('Bắt đầu khảo sát').wait_for(); print('✓ invite link opens survey'); pub.goto(BASE + '/s/nhu-cau-stem-2026-2027?t=fake-token'); pub.get_by_text('không hợp lệ').wait_for(); print('✓ forged token rejected')
    page.goto(BASE + '/admin/templates'); page.get_by_text('Dùng mẫu này').first.wait_for(); shot('25-templates')
    b.close()
print('\nCONSOLE ERRORS:', len(errors)); [print(' ', e[:200]) for e in errors[:15]]
