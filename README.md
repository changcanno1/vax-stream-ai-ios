# 🎬 VAX Stream AI — Ứng Dụng Xem Phim Không Quảng Cáo & AI Plugin Converter

Ứng dụng xem phim đa nền tảng (**iOS `.ipa`**, **Android `.apk`**, **Web App / PWA**) được thiết kế dựa trên kiến trúc chuẩn của hệ sinh thái **VAX IPA**, tích hợp sẵn **15+ Plugin nguồn phim** bạn đang dùng và bổ sung tính năng **Điền link website bất kỳ -> Tự động phân tích & tạo Plugin qua Server AI**.

---

## ✨ Tính Năng Nổi Bật

1. **Tương thích 100% với chuẩn Plugin VAX IPA**:
   - Hỗ trợ đầy đủ các hàm lifecycle: `getManifest()`, `getHomeSections()`, `getPrimaryCategories()`, `getFilterConfig()`, `getUrlList()`, `getUrlSearch()`, `getUrlDetail()`, `parseListResponse()`, `parseSearchResponse()`, `parseMovieDetail()`, `parseDetailResponse()`, `parseEmbedResponse()`, `getStreamLink()`.
   - Tích hợp sẵn thư viện DOM ảo `_$(html)` (hỗ trợ `:content("A|B")`, `:first`, `:last`, `:eq(n)`, `.find()`, `.each()`, `.next()`, `.parent()`, `.closest()`).
   - Tích hợp sẵn `httpRequest()`, `fetchAll()`, `BASE64`, `getparam()`, `AppCrypto` và cơ chế 2-pass `extra` (tự động nhảy từ trang giới thiệu sang trang Xem Phim như *PhimChill*, *PhimBom*).
2. **Tích hợp sẵn 15+ Plugin trong file đính kèm của bạn**:
   - **Sài Gòn Phim** (4K/FHD + KKPhim/PhimAPI Auto-Fallback)
   - **Hoạt Hình 1** (`tutien.com.vn` 480p-4K + Auto Skip Intro/Outro)
   - **TuTiênTV** (`api.tutien.com.vn` + Subtitle VTT Resolver)
   - **Dexter** (`dexter.pw` 4K HDR + Vietsub Worker)
   - **DANET Phim** (`danet.vn` AVOD miễn phí)
   - **Film4K** (`film4k.pl` + Ticket TTL & Refresh Source)
   - **Onflix** (`k8s.onflixcdn.com`)
   - **HHPanda** (`hhpanda.st` Anime 3D)
   - **City Phim** (`chill.phim.city` 123Embed + TMDB)
   - **Phim Chill**, **Phim Fun**, **Phim Ngắn**, **Phim Bom**, **PineDrama (TikTok)**, **FreeReels**.
3. **✨ AI Plugin Converter Studio (Điền Link Web -> Tự Convert Ra Plugin)**:
   - Dán bất kỳ đường dẫn website xem phim nào (ví dụ `https://rophim.me`, `https://motchilltv.me`, `https://kkphim.vip`...).
   - Tự động cào trang chủ & trang chi tiết phim mẫu, nhận diện CMS (HalimThemes, Next.js, Ophim/KKPhim, JSON API, HTML DOM), bóc tách danh mục và thẻ phim.
   - Kết nối linh hoạt với **Google Gemini API (`gemini-2.5-flash`)**, **OpenAI (`gpt-4o`)**, **Custom AI Server riêng của bạn**, hoặc **VAX Neural Heuristic Synthesizer** (chạy ngay lập tức kể cả khi không điền API Key).
   - Biên dịch và chạy thử (**Test Sandbox**) ngay trên giao diện trước khi bấm **Cài Đặt Vào App**.
4. **Trình Phát Video HLS (`.m3u8`) / MP4 Không Quảng Cáo**:
   - Hỗ trợ luồng `.m3u8` (HLS.js + Native iOS HLS), `.mp4`, phụ đề rời `.vtt`/`.srt`, chọn chất lượng / đổi Server.
   - Tự động bỏ qua quảng cáo chèn giữa phim và Intro/Outro dựa trên `skipTimes`.

---

## 🚀 Cách Chạy Ngay & Đóng Gói File IPA / APK

### Cách 1: Chạy trực tiếp trên Máy tính hoặc Điện thoại (Không cần cài đặt)
- Mở trực tiếp file [`www/index.html`](file:///C:/Users/Admin/.gemini/antigravity/scratch/vax-film-app/www/index.html) bằng bất kỳ trình duyệt nào (Chrome, Safari, Edge, Opera).
- Hoặc chạy qua Node Server kèm Local CORS Proxy:
  ```bash
  node server/index.js
  # Mở http://localhost:8787
  ```

### Cách 2: Tự động Build ra file `.IPA` (iOS) và `.APK` (Android) qua GitHub Actions
Dự án đã được cấu hình sẵn file [`.github/workflows/build-ipa-apk.yml`](file:///C:/Users/Admin/.gemini/antigravity/scratch/vax-film-app/.github/workflows/build-ipa-apk.yml):
1. Đẩy thư mục `vax-film-app` này lên một Repository trên GitHub của bạn.
2. Vào tab **Actions** trên GitHub -> Chọn workflow **Build VAX Stream AI (iOS Unsigned IPA & Android APK)** -> Bấm **Run workflow**.
3. Sau khoảng 3 phút, GitHub Actions sẽ xuất ra 2 file trong mục **Artifacts**:
   - **`VAX-Stream-AI-Unsigned.ipa`**: Cài trực tiếp lên iPhone/iPad không quảng cáo qua **TrollStore**, **Sideloadly**, **AltStore**, hoặc chứng chỉ cá nhân (**ESign / Scarlet / GBox**).
   - **`VAX-Stream-AI.apk`**: Cài trực tiếp lên điện thoại Android hoặc Android TV Box.

### Cách 3: Triển khai Server Proxy / AI lên Cloudflare Workers (Miễn phí)
- Copy nội dung file [`server/cloudflare-worker.js`](file:///C:/Users/Admin/.gemini/antigravity/scratch/vax-film-app/server/cloudflare-worker.js) dán vào Cloudflare Workers.
- Lấy đường dẫn Worker (ví dụ `https://vax-proxy.ten-ban.workers.dev/?url={url}`) điền vào mục **Cài đặt ⚙️ -> CORS Proxy Server** trong App.
