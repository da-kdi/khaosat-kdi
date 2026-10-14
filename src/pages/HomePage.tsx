import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, FolderKanban, Send, Wand2 } from 'lucide-react';
import { isDemo } from '@/data';

const MODULES = [
  { n: '01', icon: FolderKanban, title: 'Survey Workspace', text: 'Quản lý khảo sát theo dự án, chiến dịch, mục đích. Tạo mới, nhân bản, xuất bản, đóng và tái sử dụng mẫu.' },
  { n: '02', icon: Wand2, title: 'Dynamic Form Builder', text: 'Kéo-thả hơn 30 loại câu hỏi và khối nội dung, logic phân nhánh AND/OR, đa phương tiện và xác thực dữ liệu.' },
  { n: '03', icon: Send, title: 'Survey Distribution', text: 'Link công khai, link mời riêng, mã truy cập, QR, giới hạn thời gian & lượt gửi, lưu nháp và tiếp tục.' },
  { n: '04', icon: BarChart3, title: 'Response Intelligence', text: 'Dashboard tự tạo theo loại câu hỏi, lọc & drill-down, xem từng phản hồi, xuất Excel/CSV sẵn cho Power BI.' },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <img src="/brand/kdi-logo.png" alt="KDI Education" className="h-10" />
          <div className="hidden h-7 w-px bg-line sm:block" />
          <span className="hidden font-semibold text-brand-700 sm:block">Hệ thống khảo sát STEM</span>
        </div>
        <Link to="/admin/login" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Đăng nhập quản trị</Link>
      </header>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_80%_0%,#fff3e0_0%,transparent_60%),radial-gradient(50%_50%_at_0%_100%,#e7eefb_0%,transparent_60%)]" />
        <div className="mx-auto max-w-6xl px-5 pb-16 pt-14 sm:pt-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-accent-50 px-3 py-1 text-sm font-medium text-accent-700"><span className="h-1.5 w-1.5 rounded-full bg-accent-400" />KDI Education</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-[1.15] text-ink sm:text-5xl">
            Tạo, phân phối và phân tích <span className="text-brand-600">mọi loại khảo sát</span> trên một nền tảng.
          </h1>
          <p className="prose-vi mt-5 max-w-2xl text-lg text-muted">Từ khảo sát nhu cầu chủ đề STEM của nhà trường đến đánh giá khóa học, đăng ký sự kiện hay nghiên cứu thị trường — không cần lập trình, dữ liệu sẵn sàng cho phân tích.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/admin/login" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 font-semibold text-white shadow-sm hover:bg-brand-700">Vào trang quản trị <ArrowRight className="h-5 w-5" /></Link>
            {isDemo && <Link to="/s/nhu-cau-stem-2026-2027" className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-white px-6 font-semibold text-ink hover:bg-surface">Thử trả lời khảo sát mẫu</Link>}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <div key={m.n} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex items-center justify-between">
                <m.icon className="h-6 w-6 text-brand-600" />
                <span className="font-mono text-sm font-semibold text-accent-600">{m.n}</span>
              </div>
              <h3 className="mt-4 font-semibold">{m.title}</h3>
              <p className="prose-vi mt-1.5 text-sm text-muted">{m.text}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t border-line py-6 text-center text-sm text-muted">© {new Date().getFullYear()} KDI Education · Hệ thống khảo sát STEM</footer>
    </div>
  );
}
