# 03 — Schema Postgres liên quan

Hệ thống hiện tại dùng Supabase/Postgres cho token cache + dữ liệu tham chiếu. Các bảng dưới đây
**thuộc hạ tầng đang chạy** (không phải do dự án mới tạo ra) — chỉ biết được qua các câu query
xuất hiện trong `.n8n/*.json` và code cũ, **chưa xác minh đầy đủ schema thực tế**. Trước khi code,
hãy chạy `\d <schema>.<table>` (hoặc tương đương) trên Postgres thật để lấy đầy đủ cột, kiểu dữ
liệu, index, để không giả định sai.

Từ migration `003_move_legacy_tables_to_sync_tiktok.sql`, các bảng legacy
`instance_booking_dedup`, `order_dedup`, `skus`, `token` và sequence sở hữu bởi `token.id` đã được
chuyển nguyên object sang `sync_tiktok`. Schema `tiktok_sync` được cố ý giữ lại nhưng không còn object;
chỉ xoá schema này sau khi đã xác nhận mọi caller bên ngoài dùng tên mới.

## Bảng đọc/tái dùng (read hoặc reuse, không phải do dự án mới sở hữu)

### `kiot_legiahan.product_cost` — nguồn "Giá vốn"

Biết được qua query n8n:

```sql
SELECT sku, cost
FROM kiot_legiahan.product_cost
WHERE LOWER(sku) = ANY (ARRAY[...]::text[]);
```

Cấu trúc đã xác minh trực tiếp trên Postgres ngày 2026-07-15:

| Cột | Kiểu |
|---|---|
| `id` | bigint |
| `shop_id` | text |
| `sku` | text |
| `cost` | numeric |
| `updated_at` | timestamptz |

Nếu có nhiều dòng trùng `LOWER(TRIM(sku))`, chọn dòng có `updated_at` mới nhất; dùng `id` giảm dần
làm tie-breaker để kết quả luôn deterministic.

Quy tắc match bắt buộc: `LOWER(TRIM(order_item.seller_sku)) = LOWER(TRIM(product_cost.sku))` — đây
là điểm code cũ từng thiếu (không lowercase/trim), gây `cost = null` sai khi lệch hoa/thường giữa
TikTok `seller_sku` và Kiot `sku`. Dự án mới bắt buộc chuẩn hoá khi so khớp.

### `han_logistics.cam_dong_hang` — nguồn video đóng/trả hàng và nhân viên đóng hàng

Biết được qua query n8n:

```sql
SELECT * FROM han_logistics.cam_dong_hang WHERE tracking_number = '...'
```

Cấu trúc đã xác minh trực tiếp trên Postgres ngày 2026-07-15:

| Cột | Kiểu |
|---|---|
| `tracking_number` | text |
| `shipping_unit` | text |
| `type` | text |
| `employee` | text |
| `date` | date |
| `time` | time without time zone |
| `duration` | text |
| `link_drive` | text |

Nếu tracking number có nhiều dòng, chọn bản có `date`, rồi `time`, mới nhất. Nếu vẫn hoà và dữ
liệu `employee`/`link_drive` mâu thuẫn, log ambiguity thay vì chọn ngẫu nhiên.

Field Lark tương ứng ("Video đóng hàng") là kiểu rich text/URL trên Lark — n8n build thành:

```json
{ "text": "Link video đóng hàng", "link": "<link_drive>" }
```

Giữ đúng format này khi ghi Lark (Lark field kiểu URL cần object `{text, link}`, không phải chuỗi
thường).

Return Orders dùng cùng query nhưng match `tracking_number` với TikTok `return_tracking_number`.
Field `Video trả hàng` được ghi dưới dạng
`{ "text": "Link video trả hàng", "link": "<link_drive>" }`; không sử dụng cột `employee` cho
Return Orders.

### `sync_tiktok.token` — cache access/refresh token TikTok Partner legacy

Cột đã biết (từ code cũ + n8n): `id` (khoá, hiện dùng `id = 1` cho shop Hân Korea), `app_id`,
`app_secret`, `access_token` (mã hoá AES-256-CBC), `access_token_expire_at` (timestamptz),
`refresh_token` (mã hoá), `refresh_token_expire_at` (timestamptz), `updated_at`.

Đây là bảng **duy nhất thực sự cần AES-256-CBC** trong toàn hệ thống — TikTok token bắt buộc phải
persist xuống DB (script chạy độc lập theo cron/webhook, không có process sống lâu để giữ token
trong bộ nhớ như Lark) nên phải mã hoá tại rest. Nếu dự án mới còn giữ luồng đồng bộ KiotViet API
riêng (xem [04-sync-rules.md](04-sync-rules.md) mục 1), token KiotViet cũng cần mã hoá tương tự.

**Quyết định cần đưa ra**: dự án mới dùng chung bảng này với hệ thống cũ (rủi ro: 2 hệ thống cùng
refresh token, có thể đụng độ nếu chạy song song trong giai đoạn chuyển tiếp) hay tạo bảng token
riêng cho dự án mới? Khuyến nghị: **tạo bảng riêng** (ví dụ `sync_tiktok.tiktok_token`) trong giai
đoạn chạy song song với hệ thống cũ, để tránh 2 hệ thống refresh/ghi đè token của nhau; hợp nhất lại
sau khi hệ thống cũ được tắt hẳn.

### `han_lark_base.token` — **KHÔNG dùng trong dự án mới** (chỉ để biết n8n đang làm gì)

n8n hiện lưu `tenant_access_token` của Lark vào bảng này (cột: `app_id`, `app_secret`,
`tennat_access_token` — tên cột bị gõ sai chính tả trong hệ thống cũ, `access_token_expire_at`,
`updated_at`) để tránh gọi lại API lấy token mỗi lần chạy. Đáng chú ý: n8n lưu token này ở dạng
**plaintext**, không mã hoá.

Quyết định cho dự án mới: **không tạo/không dùng bảng tương đương**. Lark app_id/app_secret đọc
thẳng từ ENV (xem [05-environment.md](05-environment.md)), và dùng SDK Lark chính thức
(`@larksuiteoapi/node-sdk`, khởi tạo với `disableTokenCache: false`) để SDK tự quản lý
`tenant_access_token` trong bộ nhớ process, tự refresh khi hết hạn — đúng như cách code Node.js cũ
(`sync-data-tiktok-shop`) đã làm, khác với n8n. Vì token này không bao giờ chạm DB nên **không cần
mã hoá gì cho Lark token** — xem thêm [06-references.md](06-references.md) về phạm vi thực sự của
AES-256-CBC trong hệ thống cũ.

Đánh đổi cần biết: cache trong bộ nhớ nghĩa là mỗi lần process khởi động lại (mỗi lần cron job chạy
là 1 process mới) sẽ gọi lại API lấy tenant_access_token 1 lần — chấp nhận được vì đây chỉ là 1
request rẻ, không đáng để đổi lấy việc thêm 1 bảng DB + rủi ro token cache bị stale.

### (Tham khảo, không bắt buộc dùng) `han_lark_base.tables` — mapping bảng theo tháng qua DB

n8n hiện lưu mapping base_id/table_id theo tháng trong DB thay vì hardcode:

```sql
SELECT * FROM han_lark_base.tables WHERE type = 'order_tiktok_k' AND month = '5';
```

Đây là **một lựa chọn kiến trúc**, không phải yêu cầu bắt buộc. Dự án mới có thể chọn giữa:

- **(A) Mapping tĩnh trong code** (khuyến nghị) — xem [02-table-mapping.md](02-table-mapping.md),
  đơn giản, versioned trong git, không phụ thuộc DB để biết ghi vào bảng nào.
- **(B) Mapping động qua DB** (như n8n) — linh hoạt hơn (đổi mapping không cần deploy) nhưng thêm
  1 điểm phụ thuộc DB cho một thao tác lẽ ra chỉ cần đọc config tĩnh.

## Bảng đề xuất mới cho riêng dự án (gợi ý, không bắt buộc theo đúng tên/cột)

Schema hiện tại chỉ dùng lock cho thao tác refresh TikTok token giữa các workflow. Không dùng lock
theo Order/Statement/Return; chống trùng record được thực hiện bằng source dedupe và preload/index
Lark như mô tả tại [04-sync-rules.md](04-sync-rules.md).

```sql
-- Chỉ dùng entity_type = 'token_refresh'.
CREATE TABLE sync_tiktok.dedup_lock (
  entity_type   text NOT NULL,       -- 'token_refresh'
  entity_id     text NOT NULL,       -- shop_id
  locked_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

-- (Tuỳ chọn) log các lần chạy để debug/observability, không bắt buộc như DLQ đầy đủ của n8n
CREATE TABLE sync_tiktok.sync_run_log (
  id            bigserial PRIMARY KEY,
  run_type      text NOT NULL,       -- 'orders' | 'finance' | 'return_orders' | 'webhook_order'
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  status        text,                -- 'success' | 'failed' | 'partial'
  detail        jsonb
);
```
