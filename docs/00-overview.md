# 00 — Tổng quan dự án

## Mục tiêu

Xây dựng hệ thống Node.js chạy cron đồng bộ dữ liệu TikTok Shop của Cty Hân Korea sang LarkBase,
thay thế các cron cũ. Theo quyết định cập nhật ngày 2026-07-15:

- Script cron cũ (`sync-data-tiktok-shop`, chạy qua GitHub Actions mỗi 20 phút).
- Workflow n8n `2.cron_sync_finance.json` (cron 30 phút, đồng bộ finance).

Workflow n8n `1.webhook_order.json` **tiếp tục chạy webhook real-time** và nằm ngoài phạm vi triển
khai của repository này.

Sau khi dự án mới chạy ổn định, tắt script cron cũ và workflow finance cron; giữ workflow webhook
n8n. Cả cron Node.js và webhook n8n phải tuân theo schema/protected fields thống nhất trong tài
liệu để hạn chế ghi đè lẫn nhau.

## Phạm vi dữ liệu

| Nguồn | Đích | Tần suất mong muốn |
|---|---|---|
| TikTok Order Search API | Bảng **Tiktok Orders K** + **Tiktok Order Items K** (theo tháng) | Gần real-time (đơn mới) + quét định kỳ để bắt các đơn bị cập nhật trạng thái sau đó (huỷ, hoàn, giao...) |
| TikTok Finance Statement/Transaction API | Bảng **Finance Cty Hân Korea** (theo tháng) | Định kỳ (statement chỉ có sau khi TikTok quyết toán, không real-time) |
| TikTok Return/Refund API | Bảng **Return Orders Shop K** (1 bảng duy nhất) | Định kỳ |
| Postgres `kiot_legiahan.product_cost` | Field "Giá vốn" trong Order Items | Đọc mỗi lần sync order items |
| Postgres `han_logistics.cam_dong_hang` | Field "Video đóng hàng" / "Nhân viên đóng hàng" trong Orders và "Video trả hàng" trong Return Orders | Match theo tracking number tương ứng |

## Nguyên tắc thiết kế

1. **Tự thiết kế kiến trúc.** Không bê nguyên state machine/luồng của n8n hay script cũ. Hai
   nguồn đó chỉ để đối chiếu field và hành vi nghiệp vụ (field nào bắt buộc, field nào được bảo
   vệ khỏi ghi đè...).
2. **Một nguồn sự thật cho schema.** Toàn bộ field gửi lên Lark phải khớp với
   [01-lark-schema.md](01-lark-schema.md) — tài liệu này là bản hợp nhất, đã xử lý các chỗ lệch
   giữa code cũ và n8n.
3. **Idempotent trước, nhanh sau.** Chạy lại nhiều lần cho cùng một khoảng thời gian không được
   sinh dữ liệu trùng hoặc dữ liệu sai. Hiệu năng là ưu tiên thấp hơn tính đúng đắn.
4. **Không mất dữ liệu nhập tay.** Một số field trên Lark được nhân viên chỉnh tay (giá vốn, mã
   sản phẩm...) — pipeline không được ghi đè các field này một khi đã có giá trị (chi tiết ở
   [04-sync-rules.md](04-sync-rules.md), mục "Protected fields").
5. **Diff theo field, không dùng hash.** Đây là thay đổi có chủ đích so với code cũ (dùng SHA-256
   hash gộp toàn record) — lý do: hash gộp dễ gây lệch giả khi 2 hệ thống format dữ liệu khác nhau
   (đã xảy ra thực tế giữa code cũ và n8n — ngày giờ format khác nhau ra hash khác nhau dù dữ liệu
   giống hệt). So theo field vừa tránh được vấn đề này, vừa cho biết chính xác field nào đổi để
   log/debug dễ hơn.
6. **Retry + dedup là bắt buộc, không phải optional.** Đây là hệ thống ghi tiền/đơn hàng thật, ghi
   trùng hoặc mất dữ liệu đều gây hậu quả vận hành. Xem chi tiết
   [04-sync-rules.md](04-sync-rules.md).

## Ngoài phạm vi (không làm ở giai đoạn này)

- Đồng bộ Ads/GMV Max (dự án cũ có field-map cho GMV nhưng chưa có luồng lấy dữ liệu thực tế).
- Đồng bộ shop "K Lady Care" (xem open question trong README gốc).
- Xây UI quản trị — cấu hình vẫn qua ENV/DB, không có dashboard riêng.
- Webhook server/endpoint trong Node.js — webhook order tiếp tục chạy trên n8n.
