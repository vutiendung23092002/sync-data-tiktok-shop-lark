# 04 — Quy tắc đồng bộ (retry, dedup, diff, nguồn dữ liệu)

Đây là tài liệu quan trọng nhất cho người viết code. Đọc kỹ trước khi thiết kế luồng xử lý.

## 1. Nguồn giá vốn: chuyển sang Postgres, bỏ gọi API KiotViet trực tiếp

**Thay đổi có chủ đích so với code cũ.** Code cũ gọi trực tiếp KiotViet API (2 tài khoản
`kiot_new`/`kiot_old`) mỗi lần sync order để dựng cost map — chậm, phụ thuộc uptime KiotViet, và có
bug lệch hoa/thường khi map cost theo `seller_sku`.

Dự án mới: đọc "Giá vốn" trực tiếp từ Postgres `kiot_legiahan.product_cost` (giống n8n), match
bằng `LOWER(TRIM(seller_sku)) = LOWER(TRIM(sku))`. Việc đồng bộ dữ liệu KiotViet API → bảng
`product_cost` (nếu vẫn cần) là một luồng **riêng biệt, độc lập**, không nằm trong scope của pipeline
đồng bộ đơn hàng — không được lồng việc gọi KiotViet API vào trong flow sync order.

Với các SKU chưa có trong `product_cost` → set `cost = null`, không lỗi, không chặn sync các field
khác của item đó.

## 2. Field "Video đóng hàng" / "Nhân viên đóng hàng"

Mọi lần sync Order (cả real-time lẫn batch định kỳ) phải:

1. Lấy `tracking_number` của đơn.
2. Nếu có `tracking_number` → query `han_logistics.cam_dong_hang WHERE tracking_number = ?`.
3. Nếu tìm thấy → set field `"Video đóng hàng"` = `{ text: "Link video đóng hàng", link: link_drive }`,
   `"Nhân viên đóng hàng"` = `employee`.
4. Nếu không có `tracking_number`, hoặc không tìm thấy dòng tương ứng → để 2 field này trống
   (không set giá trị), **không được coi là lỗi** (đơn hàng có thể chưa đóng gói xong).

2 field này áp dụng cùng cơ chế diff field-by-field như các field khác — nếu giá trị không đổi so
với Lark hiện tại thì không gửi lại trong payload update.

Mọi lần sync Return Order áp dụng cùng nguồn lookup:

1. Lấy `return_tracking_number` (field Lark `Mã vận đơn trả hàng`).
2. Query `han_logistics.cam_dong_hang` với `tracking_number = return_tracking_number`, chọn dòng
   có `date`/`time` mới nhất như Orders.
3. Nếu có `link_drive`, set `Video trả hàng` =
   `{ text: "Link video trả hàng", link: link_drive }`.
4. Nếu tracking hoặc kết quả lookup trống thì không set field và không coi là lỗi.

`Video trả hàng` cũng phải đi qua diff field-by-field, không update lại nếu URL không đổi.

## 3. So sánh update/tạo mới: diff theo từng field, không dùng hash

Đây là thay đổi có chủ đích so với code cũ (dùng SHA-256 hash gộp toàn bộ record). Lý do đổi: hash
gộp đã gây lệch giả thực tế giữa code cũ và n8n (2 hệ thống format ngày giờ khác nhau → hash khác
nhau dù dữ liệu giống hệt → sinh update thừa liên tục).

Quy trình bắt buộc cho mỗi bảng (Orders/Order Items/Finance/Return Orders/SKUS):

1. Trước khi đọc/ghi record, gọi Lark List Fields và đối chiếu với `LARK_SCHEMAS`. Field thiếu được
   tạo bằng đúng `type`, `ui_type` và property bắt buộc (`date_formatter`, `currency_code`,
   `formatter`...). Nếu field cùng tên đã tồn tại nhưng sai type/cấu hình thì fail-fast; không tự
   đổi type của field đang chứa dữ liệu. Khi `DRY_RUN=true`, không tạo field và fail với danh sách
   field thiếu.
2. Format dữ liệu mới từ nguồn (TikTok API / Postgres) thành object theo đúng field key ở
   [01-lark-schema.md](01-lark-schema.md), normalize giá trị theo type Lark (number/datetime/
   text/boolean) — dùng đúng 1 hàm normalize dùng chung cho toàn bộ pipeline (khớp cả lúc format
   dữ liệu mới lẫn lúc đọc dữ liệu cũ từ Lark về để so sánh — nếu 2 bên normalize khác nhau, diff
   sẽ sai).
3. Preload record hiện có theo `[FROM, TO)` rồi dựng index theo `"ID định danh (TTS)"`; riêng SKUS
   preload toàn bảng và index theo `id_sku`.
4. Nếu **không tìm thấy** → tạo mới (create), gửi đủ toàn bộ field.
5. Nếu **tìm thấy** → so sánh từng field (giá trị mới đã normalize vs. giá trị hiện tại đọc từ Lark
   record, cũng phải normalize về cùng dạng trước khi so sánh):
   - Field nào giá trị khác nhau → đưa vào payload update.
   - Field nào giống hệt → bỏ qua, không gửi.
   - Field nằm trong danh sách **protected fields** của bảng đó (xem 01-lark-schema.md, hiện chỉ
     áp dụng cho Order Items: "Giá vốn", "Mã sản phẩm") → luôn loại khỏi payload update nếu Lark đã
     có giá trị khác rỗng, bất kể có khác giá trị mới hay không.
   - Nếu sau khi áp dụng 2 quy tắc trên, payload update **rỗng** (không field nào cần đổi) → bỏ
     qua record này hoàn toàn, không gọi API update (giảm tải, tránh field "Last modified" đổi vô
     ích trên Lark nếu bảng có field đó).

## 4. Retry

Áp dụng cho mọi lời gọi HTTP ra ngoài: TikTok API, Lark API, (và KiotViet API nếu vẫn còn dùng ở
luồng đồng bộ cost riêng biệt). Dùng chung 1 module retry, không viết riêng cho từng API.

- **Retry khi**: HTTP 429, HTTP 5xx, lỗi mạng (`ECONNRESET`, `ETIMEDOUT`, "socket hang up", timeout
  do chính client set).
- **Không retry khi**: HTTP 4xx khác 429 (lỗi tham số/dữ liệu — retry không giải quyết được gì, log
  rõ ràng và coi record đó là fail).
- **Backoff**: ưu tiên header `Retry-After` nếu server trả về; nếu không có, dùng exponential
  backoff (ví dụ 1s → 2s → 4s → 8s → 16s).
- **Số lần thử tối đa**: 5 lần là mặc định hợp lý (khớp với cả code cũ và n8n) — có thể chỉnh theo
  API cụ thể nhưng phải có giới hạn, không retry vô hạn.
- **Refresh token khi hết hạn**: coi là 1 bước riêng, không phải "retry" — nếu access_token hết hạn
  giữa chừng, refresh 1 lần rồi thử lại toàn bộ request đó; nếu refresh cũng fail (refresh_token đã
  hết hạn) → dừng hẳn job, log lỗi rõ ràng yêu cầu re-auth thủ công (không được lặp vô hạn).
- Log mỗi lần retry: attempt số mấy, delay bao lâu, lỗi gì — để debug khi có sự cố hàng loạt.

## 5. Trống trùng / dedup — ĐẶC BIỆT LƯU Ý

Đây là hệ thống ghi dữ liệu đơn hàng/tài chính thật — ghi trùng hoặc mất dữ liệu đều có hậu quả vận
hành thực tế (dữ liệu tài chính sai, nhân viên nhìn nhầm số liệu). Liệt kê đầy đủ các nguồn gây
trùng đã biết và quy tắc xử lý:

### 5.1. Trùng do 2 lần xử lý cùng lúc (webhook bắn lại / cron chồng lịch)

Ví dụ: TikTok gửi webhook đơn hàng 2 lần (retry phía TikTok), hoặc cron job trước chưa chạy xong đã
tới giờ cron job sau.

**Quyết định triển khai hiện tại**: không khoá từng Order/Statement/Return trong Postgres. GitHub
Actions `concurrency` ngăn hai lượt của cùng một workflow chạy chồng nhau; source vẫn được dedupe
trong RAM và Lark vẫn được preload + diff trước khi ghi. Cơ chế này cũng tránh hàng nghìn thao tác
INSERT/DELETE lock khi chạy backfill dài ngày.

Webhook n8n không dùng chung lock với dự án này, nên entity lock trong `sync-tiktok` vốn cũng không
thể điều phối hai hệ thống. Việc tránh race với n8n được thực hiện bằng chính sách ngày: cron
Orders/Finance tối đa đến hôm qua; Return Orders tối đa đến hôm nay theo quyết định vận hành.

`sync_tiktok.dedup_lock` chỉ được giữ cho `entity_type='token_refresh'`, vì ba workflow có concurrency
group khác nhau và có thể cùng refresh token. Lock này không nằm trên đường xử lý từng record.

### 5.2. Trùng do phân trang bị lặp

TikTok/Lark trả nhiều trang (`next_page_token`), nếu 1 trang giữa chừng bị lỗi và job retry lại từ
đầu (thay vì tiếp tục từ token cuối), có thể fetch trùng dữ liệu ở các trang đã lấy trước đó.

**Quy tắc**: sau khi gom toàn bộ record 1 lần fetch, **dedupe theo khoá định danh** (order_id/
item_id/transaction_id) trước khi đưa vào bước diff. Nếu 2 bản ghi trùng ID trong cùng 1 lần fetch,
giữ bản có timestamp cập nhật mới nhất (nếu API trả timestamp), hoặc bản xuất hiện sau (giả định
trang sau là dữ liệu mới hơn) nếu không có timestamp để so.

### 5.3. Trùng đã tồn tại sẵn trên Lark (di sản từ các lần sync lỗi trước đó)

Có thể xảy ra do 2 hệ thống cũ (script + n8n) từng ghi đè nhau, hoặc do bug trong quá khứ.

**Quy tắc**: preload Lark theo khoảng ngày của job (SKUS preload toàn bảng), dựng index theo
`"ID định danh (TTS)"` hoặc `id_sku`. Nếu index có **nhiều hơn 1 record** cho cùng 1 ID, không được
chọn đại 1 bản để update. Xử lý:

1. Chọn bản ghi có `created_time` (metadata Lark) mới nhất làm bản chính thức để update.
2. Ghi log rõ ràng (record_id nào, ID định danh nào, có bao nhiêu bản trùng) để người vận hành dọn
   tay — **không tự động xoá** record trên Lark trừ khi đã có yêu cầu rõ ràng cho phép tự xoá.

### 5.4. Trùng do lệch tháng (timezone) khi chọn bảng

Xem chi tiết ở [02-table-mapping.md](02-table-mapping.md) mục "Quy tắc quy đổi timezone". Tóm tắt:
luôn dùng giờ VN (UTC+7) nhất quán ở MỌI bước cần biết "tháng" của 1 record — nếu không, cùng 1
order_id có thể bị ghi vào 2 bảng tháng khác nhau ở 2 lần chạy khác nhau.

### 5.5. Idempotency ở tầng ghi (write)

Không bao giờ "create mù" — mọi lần ghi đều phải preload vùng dữ liệu liên quan và dựng index ID
trước. Nếu 1 batch create/update bị lỗi giữa chừng (vd timeout sau khi Lark đã nhận nhưng response
không về kịp), lần chạy lại phải tự phát hiện record đã tồn tại trong vùng preload và chuyển sang
nhánh update thay vì tạo thêm bản trùng.

Lark Search Records đọc tối đa 500 record/request. DateTime filter dùng `isGreater`/`isLess` với
`["ExactDate", "<epoch milliseconds>"]`; code query rộng thêm một ngày ở hai biên rồi lọc chính xác
`[FROM, TO)` trong RAM để không lệch ngày do timezone của Base.

## 6. Batching

Gộp nhiều record vào 1 request `batch_create`/`batch_update` khi ghi Lark thay vì gọi API cho từng
record — giảm số request, tránh rate limit. Xác nhận lại giới hạn record/request hiện hành của Lark
Bitable API tại thời điểm code (code cũ dùng 500/request, cần double-check với tài liệu Lark hiện
tại vì giới hạn có thể đã đổi).

## 7. Tham chiếu nhanh TikTok Partner API (dữ kiện API, không phải thuật toán)

Các thông tin dưới đây là **thông tin kỹ thuật của bản thân TikTok API** (không phải logic riêng
của dự án cũ), cần thiết để gọi đúng API:

- Base URL: `https://open-api.tiktokglobalshop.com`; Auth URL: `https://auth.tiktok-shops.com`.
- Ký request (`sign`): HMAC-SHA256, secret bọc trước/sau chuỗi `path + sorted(key+value của params,
  loại trừ "sign"/"access_token") + (JSON.stringify(body) nếu POST JSON)`, dùng chính `appSecret`
  làm HMAC key. Đây là quy tắc ký chuẩn của TikTok Shop Partner API — giữ đúng logic, khác đi sẽ bị
  TikTok từ chối request.
- Endpoint chính cần dùng: order search (`/order/202309/orders/search`), lấy shop được uỷ quyền
  (`/authorization/202309/shops`), statement (`/finance/202309/statements`), transaction theo
  statement (`/finance/202501/statements/{statement_id}/statement_transactions`), return/refund
  search (`/return_refund/202309/returns/search`), refresh token
  (`/api/v2/token/refresh`).
- Timestamp trong params luôn là epoch giây tại thời điểm gửi request (không cache lại).
