# 05 — Biến môi trường

Danh sách dưới đây gộp từ ENV mà hệ thống cũ (script + GitHub Actions) đang dùng, cộng thêm biến
mới cần cho dự án này. Tên biến cụ thể có thể đổi khi implement, miễn nhất quán và được document
lại trong `.env.example` của dự án mới.

## Môi trường / vận hành

| Biến | Ví dụ | Ghi chú |
|---|---|---|
| `SYNC_ENV` | `production` \| `test` | bắt buộc — chọn base_id/table_id theo [02-table-mapping.md](02-table-mapping.md). Không có giá trị mặc định ngầm định là production — phải set tường minh, thiếu thì fail-fast |
| `FROM` | `2026/05/01` | bắt buộc cho mọi lần chạy; workflow thủ công lấy từ input, cron lấy từ GitHub Repository Variable `FROM` |
| `TO` | `2026/05/23` | bắt buộc; cron lấy từ Variable `TO`. Orders/Finance giới hạn tối đa hôm qua; Return Orders giới hạn tối đa hôm nay theo giờ Việt Nam |
| `DRY_RUN` | `true`/`false` | chạy thử không ghi Lark, chỉ log ra sẽ tạo/update gì — hữu ích khi kiểm thử mapping bảng mới |
| `LOG_LEVEL` | `info`/`debug` | |

## TikTok Partner API

| Biến | Ghi chú |
|---|---|
| `TIKTOK_PARTNER_APP_KEY_<shop_id>` | app key TikTok, đặt tên theo shop_id để hỗ trợ nhiều shop |
| `TIKTOK_PARTNER_APP_SECRET_<shop_id>` | app secret TikTok |

## Lark

| Biến | Ghi chú |
|---|---|
| `LARK_APP_ID` | app Lark dùng để ghi các bảng ở [01-lark-schema.md](01-lark-schema.md) |
| `LARK_APP_SECRET` | |

Quyết định thiết kế: **không lưu Lark access token xuống DB**. Khởi tạo Lark SDK
(`@larksuiteoapi/node-sdk`) với `disableTokenCache: false` để SDK tự quản lý
`tenant_access_token` trong bộ nhớ process bằng `LARK_APP_ID`/`LARK_APP_SECRET` — mỗi lần chạy
job (process mới) SDK tự lấy token mới, không cần bảng DB nào cho việc này (khác với n8n, xem
[03-postgres-schema.md](03-postgres-schema.md)). Do đó Lark token **không cần** qua
`AES_256_CBC_APP_SECRET_KEY` bên dưới.

## Postgres / Supabase

| Biến | Ghi chú |
|---|---|
| `DATABASE_URL` hoặc `DATABASE_SERVICE_KEY` + project URL | kết nối tới Postgres chứa `kiot_legiahan.product_cost`, `han_logistics.cam_dong_hang`, và bảng token/dedup của chính dự án mới |
| `AES_256_CBC_APP_SECRET_KEY` | dùng mã hoá access_token/refresh_token **của TikTok Partner** (và KiotViet nếu còn giữ luồng đó) lưu ở `sync_tiktok.tiktok_token`; bảng `sync_tiktok.token` chỉ còn phục vụ import/đối chiếu legacy — đây là 2 nguồn duy nhất cần mã hoá, **không áp dụng cho Lark** (xem trên). **Lưu ý bug đã phát hiện ở code cũ**: IV phải tạo mới cho MỖI lần encrypt, không được tạo 1 lần rồi dùng lại xuyên suốt process (xem ghi chú trong [06-references.md](06-references.md)) |

## Không đưa vào ENV / KHÔNG commit

- Không commit `.env` thật lên git — chỉ commit `.env.example` với placeholder.
- File `temp/app_lark.txt` hiện có trong thư mục dự án (App ID + App Secret Lark ở dạng plaintext)
  — **cần xoá hoặc chuyển giá trị vào `.env` (đã gitignore) rồi xoá file này**, không được để lại
  trong thư mục sẽ commit vào git.
