# sync-tiktok

Đồng bộ dữ liệu TikTok Shop sang LarkBase bằng các job Node.js chạy local
hoặc GitHub Actions.

## Các luồng đồng bộ

| Job | Nguồn | Đích Lark | Khóa định danh |
|---|---|---|---|
| Orders | TikTok Order Search API + Postgres | 12 bảng Orders theo tháng | `order_id + shop_id` |
| Order Items | Line items của Orders + giá vốn Postgres | 12 bảng Order Items theo tháng | `item_id + shop_id` |
| SKUS | Line items của Orders | Bảng `SKUS Tiktok` | `sku_id` |
| Finance | TikTok Statements và Statement Transactions | 12 bảng Finance theo tháng quyết toán | `transaction_id + shop_id` |
| Unsettled Transactions | TikTok Get Unsettled Transactions | Một bảng snapshot hiện tại | `transaction_id + shop_id` |
| Return Orders | TikTok Search Returns API | Một bảng Return Orders | `return_id + shop_id` |

## Quy tắc ngày `FROM` và `TO`

Mọi job đều bắt buộc nhận ngày theo định dạng `YYYY/MM/DD`. Không có `SYNC_MODE`.

- `FROM` và `TO` đều là ngày bao gồm toàn bộ ngày đó.
- Orders và Finance chỉ xử lý tối đa đến **hôm qua** theo giờ Việt Nam. Nếu `TO` là hôm nay hoặc
  tương lai, runtime tự hạ về hôm qua để tránh race với webhook Orders và cron Finance trên n8n.
- Return Orders được xử lý đến **hôm nay** vì n8n không có cron Return Orders. Chỉ khi `TO` nằm
  trong tương lai thì runtime mới hạ về hôm nay.
- Unsettled Transactions không dùng `FROM/TO`; job luôn tải snapshot đầy đủ mà TikTok còn trả về
  (mặc định từ `2025-01-01`) để có thể xác định chính xác record cần xoá khỏi Lark.
- Nếu `FROM` lớn hơn `TO` sau khi áp dụng giới hạn trên, job fail-fast và không ghi Lark.

Ví dụ tại ngày `2026/07/16`:

| Job | `TO` nhập | `TO` thực tế |
|---|---:|---:|
| Orders/Finance | `2026/07/20` | `2026/07/15` |
| Orders/Finance | `2026/07/14` | `2026/07/14` |
| Return Orders | `2026/07/20` | `2026/07/16` |
| Return Orders | `2026/07/14` | `2026/07/14` |

## Yêu cầu hệ thống

- Node.js 20 trở lên.
- PostgreSQL có quyền đọc:
  - `kiot_legiahan.product_cost`
  - `han_logistics.cam_dong_hang`
- Lark app có quyền đọc/ghi Bitable tương ứng.
- TikTok Partner app và token đã được shop Hân Korea ủy quyền.

## Chạy local

### 1. Cài dependencies

```powershell
npm ci
```

### 2. Tạo `.env`

```powershell
Copy-Item .env.example .env
```

Điền đầy đủ các biến sau:

```dotenv
SYNC_ENV=test
FROM=2026/06/01
TO=2026/07/15
DRY_RUN=true
LOG_LEVEL=info

TIKTOK_SHOP_ID=<shop_id>
TIKTOK_PARTNER_APP_KEY=<partner_app_key>
TIKTOK_PARTNER_APP_SECRET=<partner_app_secret>

LARK_APP_ID=<lark_app_id>
LARK_APP_SECRET=<lark_app_secret>
LARK_BATCH_SIZE=500

DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require
AES_256_CBC_APP_SECRET_KEY=<32_byte_key>
```

Lưu ý:

- `SYNC_ENV` bắt buộc là `test` hoặc `production`; không có default ngầm định.
- Khi kiểm tra mapping hoặc dữ liệu mới, luôn bắt đầu bằng `SYNC_ENV=test` và `DRY_RUN=true`.
- `AES_256_CBC_APP_SECRET_KEY` phải giải mã thành đúng 32 byte. Có thể dùng chuỗi UTF-8 32 byte,
  `hex:<value>` hoặc `base64:<value>`.
- `.env` đã được gitignore và không được commit.
- Có thể dùng `TIKTOK_SHOP_IDS` cùng các key động theo hướng dẫn trong [`.env.example`](.env.example)
  nếu sau này chạy nhiều shop.

### 3. Kiểm tra kết nối và khởi tạo database

```powershell
npm run db:check
npm run db:migrate
npm run lark:check
npm run tiktok:token:check
```

Nếu cần chuyển token từ bảng legacy sang token store mã hóa của dự án:

```powershell
npm run tiktok:token:import-legacy
```

Token TikTok được lưu trong Postgres bằng AES-256-CBC với IV mới cho mỗi lần mã hóa. Dự án không
lưu Lark access token xuống database.

### Cấu hình hai workflow n8n

Hai file import nằm trong `.n8n/1.webhook_order.json` và `.n8n/2.cron_sync_finance.json`.
Workflow không còn đọc mapping từ `han_lark_base.tables` và không còn đọc token từ
`sync_tiktok.token` (bảng legacy; token đang dùng nằm ở `sync_tiktok.tiktok_token`).

- Các giá trị `TIKTOK_SHOP_ID`, TikTok Partner app key/secret và khóa AES được nhúng trực tiếp
  trong file workflow; workflow không đọc `$env` của n8n.
- Node `Workflow Settings` trong mỗi workflow giữ cờ `syncEnv`. Chỉ nhận `test` hoặc
  `production`; đổi cờ này trước khi chuyển base.
- Mapping base/table test và production nằm trực tiếp trong từng workflow.
- Trước khi ghi, workflow lấy schema hiện tại của Lark, tạo tuần tự field còn thiếu đúng
  `type`, `ui_type` và property trong `src/config/larkSchemas.js`; nếu field đã có nhưng sai type,
  workflow dừng để tránh ghi dữ liệu sai.
- Workflow không tạo hoặc so sánh `hash`. Orders, Order Items, SKUS và Finance chuẩn hóa rồi diff
  từng field; chỉ những field thực sự thay đổi mới được gửi lên Lark. Record không đổi không phát
  sinh request ghi.
- Với Order Items, `Giá vốn` và `Mã sản phẩm` không bị ghi đè khi Lark đã có giá trị; nếu đang
  rỗng hoặc bằng `0` thì workflow vẫn được phép điền dữ liệu mới.
- Các field chuỗi legacy đang là `SingleSelect` được coi là tương thích với schema `Text`; field
  thiếu vẫn được tạo đúng là `Text`. Sai kiểu giữa text/number/date/URL vẫn làm workflow dừng.
- Field `DateTime` hiện có được phép giữ `date_formatter` riêng của từng bảng (ví dụ chỉ hiển thị ngày);
  formatter chỉ ảnh hưởng cách hiển thị, dữ liệu vẫn đọc/ghi bằng timestamp mili-giây.
- Token được đọc từ `sync_tiktok.tiktok_token`, giải mã theo format
  `v1:<iv_base64>:<ciphertext_base64>`. Khi refresh, access token và refresh token được mã hóa lại
  bằng IV mới trước khi update Postgres.
- Hai workflow dùng module built-in `crypto`. Nếu instance n8n đang chặn module này thì phải cho
  phép `crypto` ở cấu hình tiến trình n8n; quyền này không thể đặt bên trong JSON workflow.
- Toàn bộ `.n8n/` đã được gitignore vì các file này chứa dữ liệu nhạy cảm và không được push Git.

### 4. Kiểm tra cấu hình và chạy test

```powershell
npm start
npm test
```

`npm start` chỉ kiểm tra ENV và mapping lúc khởi động; nó không chạy scheduler.

### 5. Chạy từng job

```powershell
npm run sync:orders
npm run sync:finance
npm run sync:unsettled-transactions
npm run sync:return-orders
```

Các job dùng trực tiếp `FROM`, `TO`, `SYNC_ENV` và `DRY_RUN` trong `.env`.

Để ép DRY_RUN cho một lần chạy mà không sửa `.env`:

```powershell
$env:DRY_RUN="true"
npm run sync:orders
```

Đóng terminal hoặc chạy `Remove-Item Env:DRY_RUN` sau đó nếu muốn quay lại giá trị trong `.env`.

Nếu log tiếng Việt trên Windows từng hiển thị dạng mojibake, đó là lớp chuyển mã của terminal,
không phải dữ liệu Lark bị hỏng. Các entrypoint luôn chuyển Windows console sang UTF-8. Riêng khi
phát hiện Git Bash/MSYS, logger chuyển phần hiển thị sang ASCII dễ đọc (`Trạng thái` →
`Trang thai`) vì ConPTY có thể vẫn giải mã output Node bằng code page 437. Việc này chỉ áp dụng cho
log; tên field và dữ liệu gửi Lark vẫn giữ nguyên Unicode tiếng Việt. Log local/Git Bash được trình
bày dạng nhiều dòng có màu để dễ đọc; khi chạy trong CI/GitHub Actions vẫn giữ JSON một dòng để dễ
tìm kiếm và xử lý tự động.

## Chạy bằng GitHub Actions

Repository có ba workflow:

| Workflow | File | Lịch chạy |
|---|---|---|
| Orders + Items + SKUS | [sync-orders.yml](.github/workflows/sync-orders.yml) | Mỗi 20 phút |
| Finance | [sync-finance.yml](.github/workflows/sync-finance.yml) | Phút 07 và 37 mỗi giờ |
| Return Orders | [sync-return-orders.yml](.github/workflows/sync-return-orders.yml) | Mỗi 20 phút |

GitHub Actions cron dùng UTC. Các lịch trên lặp theo phút trong giờ nên phút chạy nhìn từ Việt Nam
vẫn tương ứng `00/20/40` hoặc `07/37`.

### Repository Variables

Tạo tại **Settings → Secrets and variables → Actions → Variables**:

| Variable | Ví dụ | Ghi chú |
|---|---|---|
| `SYNC_ENV` | `test` | Chuyển thành `production` sau khi đã nghiệm thu |
| `FROM` | `2026/06/01` | Cron dùng giá trị này |
| `TO` | `2099/12/31` | Runtime tự giới hạn về hôm qua hoặc hôm nay tùy job |
| `DRY_RUN` | `true` | Đặt `false` mới ghi thật lên Lark |
| `TIKTOK_SHOP_ID` | `<shop_id>` | Shop Hân Korea |

### Repository Secrets

Tạo tại **Settings → Secrets and variables → Actions → Secrets**:

| Secret |
|---|
| `TIKTOK_PARTNER_APP_KEY` |
| `TIKTOK_PARTNER_APP_SECRET` |
| `LARK_APP_ID` |
| `LARK_APP_SECRET` |
| `DATABASE_URL` |
| `AES_256_CBC_APP_SECRET_KEY` |

Không lưu các giá trị này trong workflow YAML, README hoặc source code.

### Chạy thủ công

1. Mở tab **Actions** trên GitHub.
2. Chọn một trong ba workflow.
3. Chọn **Run workflow**.
4. Nhập `from` và `to` theo `YYYY/MM/DD`.
5. Chạy và kiểm tra log tổng kết `fetched`, `creates`, `updates`, `unchanged`.

Khi chạy thủ công, input `from/to` được ưu tiên hơn Repository Variables. `SYNC_ENV` và `DRY_RUN`
vẫn lấy từ Repository Variables.

### Cron tự động

Khi event là `schedule`, workflow lấy `FROM` và `TO` từ Repository Variables. Có thể đặt
`TO=2099/12/31` để không phải cập nhật mỗi ngày; code sẽ tự áp dụng giới hạn ngày an toàn của từng
job.

Các workflow dùng concurrency group riêng và `cancel-in-progress: false`, vì vậy cùng một workflow
không bị hủy giữa chừng khi lượt cron tiếp theo đến. Orders, Finance và Return Orders không dùng
dedup lock theo từng entity nữa; `sync_tiktok.dedup_lock` chỉ còn bảo vệ thao tác refresh TikTok token
khi các workflow khác nhau chạy đồng thời.

## Quy tắc ghi dữ liệu

- Trước khi đọc/ghi một bảng, job lấy danh sách field và đối chiếu với `LARK_SCHEMAS`.
  Field thiếu được tạo đúng `type`, `ui_type` và property bắt buộc khi `DRY_RUN=false`. Field đã có
  nhưng sai kiểu/cấu hình làm job fail-fast; code không tự đổi type của field đang chứa dữ liệu.
- `DRY_RUN=true` không tạo field. Nếu bảng thiếu field, job dừng và liệt kê field thiếu để bảo đảm
  chế độ dry-run không thực hiện bất kỳ write nào lên Lark.
- Với Orders, Order Items, Finance và Return Orders: preload record Lark theo đúng khoảng ngày
  `[FROM, TO)`, phân trang 500 record/lần, rồi dựng index trong RAM theo khóa định danh.
- Với SKUS: preload toàn bảng một lần vì bảng không có field ngày.
- Với Unsettled Transactions: preload toàn bảng nhưng chỉ đối chiếu record thuộc đúng `ID Shop`. API có/Lark
  không có thì create; cả hai có thì diff field; Lark có/API không có thì batch delete. Tổng số ID duy nhất tải
  được phải khớp `total_count` của API trước khi thực hiện bất kỳ write nào.
- Không search từng nhóm 20 ID và không create mù.
- So sánh từng field đã normalize; chỉ gửi field thực sự thay đổi.
- Không dùng hash gộp record.
- Order Items bảo vệ hai field `Giá vốn` và `Mã sản phẩm`: không ghi đè nếu Lark đã có giá trị.
- Giá vốn đọc từ `kiot_legiahan.product_cost`, match bằng `LOWER(TRIM(seller_sku))`.
- Video và nhân viên đóng hàng đọc từ `han_logistics.cam_dong_hang` theo tracking number. Return
  Orders dùng `Mã vận đơn trả hàng` để lookup cùng bảng và ghi field URL `Video trả hàng`.
- Source pagination được dedup trước khi ghi.
- Record trùng sẵn trên Lark không bị tự động xóa ở các luồng upsert thông thường; bản có `created_time` mới
  nhất được chọn để update và duplicate được ghi log để dọn thủ công. Riêng Unsettled Transactions là snapshot
  nên duplicate và record không còn trong API được tự động xoá.
- TikTok và Lark API có retry tối đa 5 lần cho HTTP 429, 5xx và lỗi mạng, ưu tiên `Retry-After`,
  nếu không có thì exponential backoff.
- `DRY_RUN=true` vẫn đọc TikTok/Postgres/Lark và tính create/update nhưng không gọi batch write.

## Cấu trúc chính

```text
src/
  clients/       TikTok, Lark, PostgreSQL clients
  config/        ENV, Lark schema và table mapping
  crypto/        AES-256-CBC token encryption
  mappers/       Orders, Finance, Return Orders, SKUS → field Lark
  repositories/  Postgres queries và lock riêng cho refresh TikTok token
  services/      Điều phối từng luồng sync và Lark upsert
  utils/         retry, dedupe, diff, normalize, timezone, FROM/TO
scripts/         entrypoint chạy job, migration và công cụ kiểm tra
sql/migrations/  schema riêng của dự án
test/unit/       unit tests
.github/workflows/ GitHub Actions cron và workflow_dispatch
```

## Triển khai production

Checklist đề xuất:

1. Chạy `npm test`.
2. Đặt local hoặc GitHub Variables thành `SYNC_ENV=test`, `DRY_RUN=true`; chạy đủ ba job.
3. Xác nhận table mapping, số lượng create/update và field tiền/ngày trên base test.
4. Đổi `SYNC_ENV=production`, vẫn giữ `DRY_RUN=true`; chạy lại để xem kế hoạch ghi production.
5. Khi kết quả đúng, đổi `DRY_RUN=false` và chạy thủ công một khoảng nhỏ trước.
6. Chạy lại cùng khoảng để xác nhận idempotency: kỳ vọng `creates=0`, `updates=0` và record nằm ở
   `unchanged` nếu nguồn không đổi.
7. Bật cron mới, theo dõi log ít nhất một ngày.
8. Tắt script cron Node.js cũ và cron Finance cũ khi đã chuyển giao hoàn tất. Giữ webhook Orders
   trên n8n.

## Trạng thái hiện tại

- Đã tạo và xác minh 39 bảng trên Lark test base: 12 Orders, 12 Order Items, 12 Finance, một Return
  Orders, một SKUS và một Unsettled Transactions (`tbl0uBF1PCAVgEne`).
- Unsettled Transactions đã ghi snapshot TikTok thật lên base test và xác minh đủ create/update/unchanged/delete.
- Orders, Order Items, SKUS và Finance đã được ghi thử/idempotency trên base test.
- Return Orders đã DRY_RUN thành công với dữ liệu TikTok thật; chưa batch write trong lần xác minh
  gần nhất.
- Mapping hiện dùng lại 12 bảng tháng cho mọi năm; chưa tách `year → month`.
- K Lady Care và webhook server nằm ngoài phạm vi hiện tại.

## Tài liệu chi tiết

1. [Tổng quan và phạm vi](docs/00-overview.md)
2. [Lark schema](docs/01-lark-schema.md)
3. [Mapping bảng production/test](docs/02-table-mapping.md)
4. [Postgres schema](docs/03-postgres-schema.md)
5. [Quy tắc sync, retry và dedup](docs/04-sync-rules.md)
6. [Biến môi trường](docs/05-environment.md)
