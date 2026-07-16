# 02 — Mapping bảng Lark theo tháng (production / test)

## Cơ chế môi trường

Dùng 1 biến ENV để chọn base_id/table_id, ví dụ `SYNC_ENV=production|test` (tên biến cụ thể xem
[05-environment.md](05-environment.md)). Không được để code tự suy luận môi trường từ nơi khác
(branch git, hostname...) — phải tường minh qua ENV để tránh lỡ tay ghi nhầm vào bảng production.

Khuyến nghị tổ chức mapping thành 1 module cấu hình tĩnh (immutable) trong code, kiểu:

```js
export const LARK_TABLE_MAPPING = {
  production: {
    baseId: "Fg8lbmhRuaDGBwsDbcKlCCf3g6b",
    orders: { 1: "tblRnv8YY56TbQGY", 2: "tbl7POESgrMyJACV", /* ... đến 12 */ },
    orderItems: { 1: "tblYgB3iwNP13M7Z", /* ... đến 12 */ },
    finance: { 1: "tbldO66icmmaewCV", /* ... đến 12 */ },
    returnOrders: "tblnjLBEA5z2YPWi",
  },
  test: {
    baseId: "Df3WbKnmyaeUKJsphablcI8Jgeh",
    orders: {},      // chưa tạo bảng — xem mục "Môi trường test" bên dưới
    orderItems: {},
    finance: {},
    returnOrders: null,
  },
};
```

Đây chỉ là gợi ý hình dạng dữ liệu (tham khảo cách `sync-pos` tổ chức
`src/config/larkTableMapping.js` — xem [06-references.md](06-references.md)). Có thể thay bằng
DB-driven config nếu thấy cần thay đổi mapping mà không muốn deploy lại — nhưng nếu chọn hướng đó
thì phải có cơ chế cache + fallback rõ ràng, không được query DB đó cho mỗi record.

**Bắt buộc validate ngay khi khởi động app**: mỗi `type` (orders/orderItems/finance) ở môi trường
`production` phải có đủ 12 table_id (tháng 1–12), thiếu bất kỳ tháng nào phải fail-fast, không
được chạy sync rồi mới lỗi giữa chừng.

## Bảng chính (production) — base_id: `Fg8lbmhRuaDGBwsDbcKlCCf3g6b`

### Tiktok Orders K

| Tháng | table_id |
|---|---|
| 1 | tblRnv8YY56TbQGY |
| 2 | tbl7POESgrMyJACV |
| 3 | tblJsM8YkpssnudP |
| 4 | tblGbz3L9icMNoFa |
| 5 | tblFdtnKTOdSWmc4 |
| 6 | tbloOvkxhdZjQzXv |
| 7 | tblDhITfQhIBGcla |
| 8 | tblat1p1bNvPOaGV |
| 9 | tblgtlatMYJdBPEM |
| 10 | tblnqnoqrHTB8cxg |
| 11 | tblfoO3snnymo6sb |
| 12 | tblIGF42hFnZNhWl |

### Tiktok Order Items K

| Tháng | table_id |
|---|---|
| 1 | tblYgB3iwNP13M7Z |
| 2 | tblZlC2P0wt79uZS |
| 3 | tblPqWKwCWweDBqS |
| 4 | tbldvthqZpvUSzHs |
| 5 | tblvqYCD2W4VWILx |
| 6 | tbl4io1NqSsmf4Ru |
| 7 | tblywgctf8AraqFb |
| 8 | tblNks1NqBuvQG6U |
| 9 | tblnJFK900GfNMAW |
| 10 | tblGNP0NGvWEnzAB |
| 11 | tblUaFFYNxE7lWSl |
| 12 | tblbobWaNgI8elHo |

### Finance Cty Hân Korea

| Tháng | table_id |
|---|---|
| 1 | tbldO66icmmaewCV |
| 2 | tblKRtsT8LuImW9i |
| 3 | tblCTLuzfmr1i04i |
| 4 | tblD8EcTBGPfU3FM |
| 5 | tbli2sHoithGe6pC |
| 6 | tblSij8kGKQjMm7y |
| 7 | tbljb1XG0NvizvhA |
| 8 | tblS6CLBwvdp7j82 |
| 9 | tblzSeO242kdzjMd |
| 10 | tblhMbFVkYB3ORLe |
| 11 | tblTil5RUu73N0d9 |
| 12 | tbld5VD8m5083JAH |

### Return Orders Shop K

Không tách theo tháng — số lượng record thấp, không đáng để tách bảng.

| table_id |
|---|
| tblnjLBEA5z2YPWi |

### SKUS Tiktok

Không tách theo tháng.

| Môi trường | table_id |
|---|---|
| production | tblLQJtTQeHekkcm |
| test | tblSu9mTdLHf6CRI |

## Bảng phụ (test) — base_id: `Df3WbKnmyaeUKJsphablcI8Jgeh`

**Đã tạo đủ 38 bảng ngày 2026-07-15** (37 bảng nghiệp vụ ban đầu + SKUS). Mapping chính thức được version-control trong
`src/config/larkTableMapping.js`. Provisioning có thể chạy lại an toàn bằng
`npm run lark:provision:test`; script tái sử dụng bảng trùng tên thay vì tạo bản sao.

Trước đây môi trường test chưa có bảng; quy trình dựng mới là:

1. Tạo 12 bảng/tháng cho Orders, 12 bảng/tháng cho Order Items, 12 bảng/tháng cho Finance, 1 bảng
   cho Return Orders và 1 bảng SKUS — cùng schema như [01-lark-schema.md](01-lark-schema.md) (dùng chức năng
   "duplicate table" trên Lark từ bảng production tương ứng để đảm bảo đúng field, hoặc để code
   tự tạo bảng nếu chưa tồn tại — xem ghi chú "auto-create table" bên dưới).
2. Điền `table_id` tương ứng vào mapping môi trường `test`.

### Auto-create table khi chưa có

Code cũ có sẵn cơ chế: nếu tra theo tên bảng không thấy → tự tạo bảng mới với field schema định
nghĩa sẵn (`ensureLarkBaseTable`). Dự án mới có thể giữ hành vi này **cho môi trường test only**
để tiện dựng dữ liệu thử nghiệm; **không nên tự tạo bảng ở production** — mapping production phải
là danh sách cố định đã biết trước (tạo bảng mới ở production phải là hành động chủ động, có review
trước khi thêm table_id vào mapping).

## Quy tắc chọn bảng theo tháng

| Loại dữ liệu | Field dùng để xác định tháng | Ghi chú |
|---|---|---|
| Tiktok Orders K | `create_time` của **đơn hàng** | |
| Tiktok Order Items K | `create_time` của **đơn hàng cha** (không phải create_time riêng của item — TikTok không trả create_time cho từng item) | |
| Finance Cty Hân Korea | `statement_time` ("Ngày quyết toán") | KHÔNG dùng `order_create_time` |
| Return Orders Shop K | không áp dụng (1 bảng duy nhất) | |

**Quy tắc quy đổi timezone bắt buộc nhất quán:** luôn quy đổi timestamp epoch (UTC) sang giờ Việt
Nam (UTC+7) trước khi lấy `getMonth()`. Phải dùng **cùng một hàm quy đổi** ở mọi nơi cần biết
tháng (khi ghi mới, khi tính lại để filter/search Lark, khi so sánh diff...). Nếu không nhất quán,
một đơn hàng tạo lúc 23:30–23:59 giờ VN cuối tháng có thể bị ghi vào bảng tháng sau ở lần chạy này
nhưng lại tính vào bảng tháng trước ở lần chạy khác → **sinh ra 2 bản ghi trùng ở 2 bảng tháng khác
nhau**. Đây là lỗi cần tránh tuyệt đối — xem thêm mục dedup trong
[04-sync-rules.md](04-sync-rules.md).

## Vấn đề chưa giải quyết: mapping không phân biệt năm

Bảng mapping ở trên chỉ có 12 slot theo tháng (1–12), không có khái niệm năm. Cần làm rõ trước khi
hệ thống chạy qua năm mới:

- Nếu bảng tháng 1 dùng lại mỗi năm (nối tiếp dữ liệu nhiều năm trong cùng 1 bảng) → không cần đổi
  gì, nhưng cần đảm bảo `id` định danh (record key) là duy nhất xuyên năm (hiện tại
  `order_id + "_" + shop_id` — TikTok order_id có khả năng trùng giữa các năm không? Cần xác nhận
  với TikTok hoặc kiểm tra dữ liệu thực tế trước khi giả định là an toàn).
- Nếu cần tách theo năm → phải mở rộng mapping thành `{ [year]: { [month]: table_id } }` và tạo bộ
  bảng Lark mới mỗi năm — ảnh hưởng tới cả cấu trúc mapping lẫn quy trình vận hành (phải nhớ tạo
  bảng mới đầu mỗi năm).

Đánh dấu đây là quyết định cần chốt với chủ dự án trước khi cứng hoá logic chọn bảng.
