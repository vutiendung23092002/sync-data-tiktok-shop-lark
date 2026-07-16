# 06 — Tài liệu tham khảo (cách dùng đúng, tránh hiểu lầm)

## `.n8n/1.webhook_order.json` và `.n8n/2.cron_sync_finance.json`

Copy nguyên bản từ dự án `sync-data-tiktok-shop` (không chỉnh sửa). Đây là 2 workflow n8n **đang
chạy thật** ở hệ thống hiện tại, dùng để:

- Tra cứu chính xác field nào đang được gửi lên Lark, format giá trị ra sao (đã tổng hợp sẵn vào
  [01-lark-schema.md](01-lark-schema.md), nhưng nếu có nghi vấn, tra lại file gốc trong
  `.n8n/` là nguồn chính xác nhất).
- Tra cứu quy tắc nghiệp vụ hiện có (vd: chỉ đồng bộ statement `payment_status === "SETTLED"`,
  cách build field "Video đóng hàng").

**Không dùng để**: copy state machine/luồng node của n8n sang code Node.js. n8n dùng nhiều
Postgres query rời rạc cho từng bước (lấy token, refresh token, lock dedup...) vì bản chất n8n là
low-code kéo-thả node; khi viết bằng code thường, không cần giữ cấu trúc "mỗi bước 1 lần round-trip
DB" như vậy — có thể gộp lại hợp lý hơn miễn giữ đúng *quy tắc* (dedup, protected field, retry...)
đã mô tả ở [04-sync-rules.md](04-sync-rules.md).

### Vấn đề đã biết trong 2 workflow n8n (tham khảo, không bắt buộc sửa)

- `2.cron_sync_finance.json`, node "Format Finance": tham số `statement_time` truyền vào là
  `$('Get Transaction By Statement').first().json.data.create_time` — cần xác minh lại đây có đúng
  là "ngày quyết toán" (statement_time) hay nhầm với field `create_time` khác trong response TikTok
  trước khi tin tưởng hoàn toàn vào field map này cho việc chọn bảng theo tháng.
- SKU sync trong `1.webhook_order.json` hardcode thẳng `app_token=Fg8lbmhRuaDGBwsDbcKlCCf3g6b`,
  `table_id=tblLQJtTQeHekkcm` trong URL thay vì tra bảng động — không áp dụng cho dự án mới vì
  bảng SKUS còn đang là open question (xem README).

## Repo tham khảo kiến trúc: `sync-pos`

`https://github.com/vutiendung23092002/sync-pos` — dự án Node.js 20 cùng tác giả, đồng bộ đơn hàng
PagesFM POS sang Lark Bitable, đã có test suite và đang chạy production. **Không cùng domain dữ
liệu** (POS ≠ TikTok Shop) nên không copy field/schema, nhưng kiến trúc & pattern xử lý rất đáng
tham khảo cho dự án này:

| File tham khảo trong `sync-pos` | Áp dụng cho phần nào của dự án này |
|---|---|
| `src/config/larkTableMapping.js` | Hình dạng config mapping base_id/table_id theo tháng + theo môi trường prod/test — xem [02-table-mapping.md](02-table-mapping.md) |
| `src/services/tableConfigService.js` | Factory cho phép chọn nguồn mapping "tĩnh trong code" hay "qua DB" qua 1 interface chung |
| `src/utils/retry.js` | Mẫu retry wrapper: phân biệt status retryable, tôn trọng `Retry-After`, exponential backoff, có `onRetry` callback để log |
| `src/utils/dedupe.js` | Mẫu xử lý trùng: `dedupeMappedRecords` (giữ bản ghi có timestamp mới nhất khi dữ liệu nguồn bị trùng), `buildLarkUniqueIndex` (phát hiện & xử lý record trùng ID đã tồn tại sẵn trên Lark — đúng vấn đề nêu ở [04-sync-rules.md](04-sync-rules.md) mục 5.3) |
| `sql/seed-test-table-config-12-months.sql` | Mẫu cách seed dữ liệu test cho 12 bảng/tháng |
| README (`FROM`/`TO`, `SYNC_ENV`, `DRY_RUN`, advisory lock chống các lượt sync chồng lịch) | Tham khảo cho [05-environment.md](05-environment.md) và mục dedup 5.1 |

Khuyến nghị người viết code đọc trực tiếp các file trên (repo public) để lấy ý tưởng cụ thể, thay vì
chỉ dựa vào mô tả tóm tắt ở đây.

## Dự án cũ: `sync-data-tiktok-shop`

Chỉ dùng `src/utils/larkbase/field-maps.js` và các file `src/utils/tiktok/format-*.js` làm tài
liệu đối chiếu field gốc khi có nghi vấn — **không copy nguyên file/logic sang dự án mới**. Một số
vấn đề đã phát hiện ở dự án cũ, liệt kê để dự án mới **tránh lặp lại**:

- `src/utils/common/AES-256-CBC.js`: IV (initialization vector) được tạo **1 lần duy nhất** ở
  module scope rồi dùng lại cho mọi lần `encrypt()` trong suốt vòng đời process — vi phạm yêu cầu
  bảo mật cơ bản của AES-CBC (phải tạo IV mới mỗi lần mã hoá). Dự án mới phải tạo IV mới trong mỗi
  lần gọi hàm encrypt. **Phạm vi sử dụng thực tế của hàm này trong code cũ**: chỉ mã hoá
  access_token/refresh_token của **TikTok Partner** (`re-auth-tiktok.js`,
  `refresh-access-token.js`) và **KiotViet** (`kiot/get-access-token.js`) lưu ở Postgres —
  **không liên quan gì tới Lark**. Lark token trong code cũ được SDK Lark quản lý hoàn toàn trong
  bộ nhớ (không lưu DB, không mã hoá); dự án mới giữ nguyên cách tiếp cận đó cho Lark (xem
  [05-environment.md](05-environment.md)) và chỉ cần AES-256-CBC cho token TikTok/KiotViet.
- `src/services/kiot/get-access-token.js`: upsert token với 1 id nhưng lại `select().eq("id", <id
  khác>)` để đọc lại — bug logic khi thao tác DB, cần cẩn thận khi viết code tương tự (đảm bảo
  id dùng để ghi và đọc lại phải khớp nhau).
- `src/utils/tiktok/format-order.js`: map "Giá vốn" theo `seller_sku` **không chuẩn hoá** hoa/thường
  — đã ghi rõ cách xử lý đúng ở [04-sync-rules.md](04-sync-rules.md) mục 1.
- Cơ chế hash gộp toàn record để diff — đã thay bằng diff field-by-field, xem
  [04-sync-rules.md](04-sync-rules.md) mục 3, lý do đổi đã giải thích ở đó.
