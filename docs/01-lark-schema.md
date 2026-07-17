# 01 — Schema các bảng Lark (đã hợp nhất)

Quy ước kiểu Lark dùng trong tài liệu này (theo `field_name`/`type` của Lark Bitable API):

| Type code | Ý nghĩa |
|---|---|
| `1` | Text |
| `2` | Number |
| `3` | Boolean/Checkbox |
| `5` | DateTime |
| `Currency` (ui_type) | Number hiển thị dạng tiền tệ (property `currency_code`, `formatter`) |

Cột **Nguồn** ghi rõ field lấy từ đâu để người viết code không phải đoán. Cột **Ghi chú** đánh dấu
những field bị lệch giữa code cũ và n8n đã được xử lý ở bản hợp nhất này.

ID định danh dùng để match record khi upsert luôn là field `"ID định danh (TTS)"`, giá trị dạng
`<id gốc TikTok>_<shop_id>` (đơn hàng/item) hoặc `<transaction_id>_<shop_id>` (finance) —
xem chi tiết theo từng bảng bên dưới.

---

## 1. Tiktok Orders K

ID định danh: `order_id + "_" + shop_id`.

| Key | Label Lark | Type | Nguồn | Ghi chú |
|---|---|---|---|---|
| id | ID định danh (TTS) | Text | `${order.id}_${shop_id}` | khoá match record |
| order_id | Mã đơn hàng | Text | TikTok `order.id` | |
| tracking_number | Mã vận đơn | Text | TikTok `order.tracking_number` | dùng để tra "Video đóng hàng" |
| create_time | Ngày tạo đơn | DateTime | TikTok `order.create_time` (epoch giây) | dùng để **chọn bảng theo tháng** — xem 02 |
| paid_time | Thời gian thanh toán | DateTime | TikTok `order.paid_time` | |
| status | Trạng thái | Text | TikTok `order.status` | |
| total_amount | Tổng tiền | Currency (VND) | `order.payment.total_amount` | = Tổng phụ + phí vận chuyển + thuế |
| sub_total | Tổng tiền tạm tính | Currency (VND) | `order.payment.sub_total` | = Tổng giá gốc sp - giảm giá người bán - giảm giá sàn |
| platform_discount | Giảm giá sàn | Currency (VND) | `order.payment.platform_discount` | |
| seller_discount | Giảm giá người bán | Currency (VND) | `order.payment.seller_discount` | |
| original_total_product_price | Tổng giá gốc sản phẩm | Currency (VND) | `order.payment.original_total_product_price` | |
| shipping_fee | Phí vận chuyển | Currency (VND) | `order.payment.shipping_fee` | |
| cancel_reason | Lý do huỷ | Text | `order.cancel_reason` | |
| tax | Thuế | Currency (VND) | `order.payment.tax` | |
| product_tax | Thuế sản phẩm | Currency (VND) | `order.payment.product_tax` | |
| shop_name | Tên shop | Text | TikTok shop info | |
| handling_fee | Phí xử lý | Currency (VND) | `order.payment.handling_fee` | phí cho người mua |
| fulfillment_type | Nơi xử lý đơn | Text | `order.fulfillment_type` | |
| cancel_order_sla_time | Thời hạn tự huỷ đơn | DateTime | `order.cancel_order_sla_time` | |
| cancellation_initiator | Người khởi tạo huỷ | Text | `order.cancellation_initiator` | |
| packages | ID gói hàng | Text | `order.packages` (array → JSON string nếu > 1 phần tử) | |
| cancel_time | Thời gian huỷ | DateTime | `order.cancel_time` | |
| delivery_due_time | Thời hạn giao hàng | DateTime | `order.delivery_due_time` | |
| delivery_time | Thời gian giao hàng | DateTime | `order.delivery_time` | |
| commerce_platform | Nền tảng thương mại | Text | `order.commerce_platform` | |
| shipping_provider | Đơn vị VC | Text | `order.shipping_provider` | |
| rts_time | RTS time | DateTime | `order.rts_time` | ⚠️ **có ở code cũ, KHÔNG có ở n8n** — bắt buộc thêm lại trong dự án mới |
| packing_video | Video đóng hàng | Text (URL/rich text) | Postgres `han_logistics.cam_dong_hang.link_drive`, match theo `tracking_number` | ⚠️ **có ở n8n, KHÔNG có ở code cũ** — bắt buộc bổ sung. Nếu không tìm thấy tracking_number tương ứng → để trống, không lỗi |
| packing_employee | Nhân viên đóng hàng | Text | Postgres `han_logistics.cam_dong_hang.employee`, match theo `tracking_number` | như trên |

> Field `hash` của bản cũ **không còn** trong bảng này — thay bằng diff field-by-field
> (xem [04-sync-rules.md](04-sync-rules.md)).

---

## 2. Tiktok Order Items K

ID định danh: `item_id + "_" + shop_id`. Bảng cha (order) xác định bằng `order_id`.

| Key | Label Lark | Type | Nguồn | Ghi chú |
|---|---|---|---|---|
| id | ID định danh (TTS) | Text | `${item.id}_${shop_id}` | khoá match record |
| order_id | Mã đơn hàng | Text | `order.id` | |
| item_id | Mã Item | Text | `item.id` | |
| tracking_number | Mã vận đơn | Text | `item.tracking_number` | |
| create_time | Ngày tạo đơn | DateTime | `order.create_time` (kế thừa từ order cha) | dùng để **chọn bảng theo tháng** — dùng ngày tạo của ĐƠN, không phải của item |
| sku_id | Mã SKU | Text | `item.sku_id` | |
| seller_sku | **Mã sản phẩm** | Text | `item.seller_sku` | 🔒 **protected field** — xem dưới |
| product_name | Tên sản phẩm | Text | `item.product_name` | |
| is_gift | Là quà tặng? | Text | `item.is_gift` (boolean → text) | |
| status | Trạng thái | Text | `item.display_status` | |
| shop_name | Tên shop | Text | TikTok shop info | |
| gift_retail_price | Giá bán lẻ của quà tặng | Currency (VND) | `item.gift_retail_price` | |
| platform_discount | Giảm giá sàn | Currency (VND) | `item.platform_discount` | |
| seller_discount | Giảm giá người bán | Currency (VND) | `item.seller_discount` | |
| original_price | Giá gốc | Currency (VND) | `item.original_price` | |
| sale_price | Giá bán sản phẩm | Currency (VND) | `item.sale_price` | |
| cost | **Giá vốn** | Currency (VND) | Postgres `kiot_legiahan.product_cost.cost`, match theo `LOWER(TRIM(seller_sku)) = LOWER(TRIM(sku))` | 🔒 **protected field** — xem dưới |

### Protected fields (Order Items)

`"Giá vốn"` và `"Mã sản phẩm"` **không được ghi đè** một khi record đã tồn tại trên Lark VÀ field
đó đã có giá trị khác rỗng — nhân viên có thể sửa tay 2 field này trên Lark. Quy tắc cụ thể:

- Nếu record **chưa tồn tại** trên Lark (tạo mới) → luôn set cả 2 field bình thường.
- Nếu record **đã tồn tại** và field hiện tại trên Lark **có giá trị** (khác null/rỗng/0) → loại
  field đó khỏi payload update, giữ nguyên giá trị cũ.
- Nếu record đã tồn tại nhưng field hiện tại **rỗng/null/0** → cho phép ghi giá trị mới (để tự
  "lấp" các bản ghi cũ chưa có giá vốn).

> Code cũ bảo vệ cả 2 field này; n8n chỉ bảo vệ "Giá vốn". Bản hợp nhất áp dụng theo code cũ
> (bảo vệ cả 2) vì an toàn hơn cho dữ liệu nhập tay.

---

## 3. SKUS

Bảng phụ không tách theo tháng. Production table: `tblLQJtTQeHekkcm`; test table:
`tblSu9mTdLHf6CRI`. Pipeline chỉ ghi 5 field nguồn dưới đây, không ghi `hash` hay các field
formula/link được cấu hình thủ công trên bảng production:

| Key | Label Lark | Type | Nguồn |
|---|---|---|---|
| id_sku | id_sku | Text | `line_item.sku_id` |
| seller_sku | seller_sku | Text | `line_item.seller_sku` |
| sku_name | sku_name | Text | `line_item.sku_name` |
| product_id | product_id | Text | `line_item.product_id` |
| product_name | product_name | Text | `line_item.product_name` |

Khi 1 `id_sku` xuất hiện nhiều lần trong các đơn khác nhau, giữ bản ghi có **nhiều field khác rỗng
nhất** (đầy đủ thông tin nhất) làm bản chính thức — đây là hành vi hiện tại của code cũ, giữ lại vì
hợp lý (dữ liệu SKU có thể thiếu field ở 1 số đơn).

---

## 4. Finance Cty Hân Korea

ID định danh: `transaction_id + "_" + shop_id`. Đây là bảng field-map **khớp tuyệt đối** giữa code
cũ và n8n — không có field nào lệch, giữ nguyên toàn bộ danh sách dưới đây.

| Key | Label Lark | Type | Nguồn |
|---|---|---|---|
| id | ID định danh (TTS) | Text | `${transaction.id}_${shop_id}` |
| order_create_time | Ngày tạo đơn | DateTime | `transaction.order_create_time` |
| statement_time | Ngày quyết toán | DateTime | `transaction.statement_time` — dùng để **chọn bảng theo tháng** |
| statement_id | Mã statemen | Text | `transaction.statement_id` |
| order_id | Mã đơn hàng | Text | `transaction.order_id` hoặc `adjustment_order_id` |
| transaction_id | Mã giao dịch | Text | `transaction.id` |
| adjustment_id | Mã điều chỉnh | Text | `transaction.adjustment_id` |
| type | Loại giao dịch | Text | `transaction.type` |
| shop_id | ID Shop | Text | shop context |
| shop_name | Tên Shop | Text | shop context |
| revenue_amount | Doanh thu (Gross) | Currency | `transaction.revenue_amount` |
| settlement_amount | Thực thu (Net) | Currency | `transaction.settlement_amount` |
| fee_tax_amount | Tổng phí & thuế | Currency | `transaction.fee_tax_amount` |
| — | Tổng phí | Formula | Do Lark tự tính; luồng sync không tạo hoặc ghi field này |
| adjustment_amount | Số tiền điều chỉnh | Currency | `transaction.adjustment_amount` |
| shipping_cost_amount | Phí ship người bán | Currency | `transaction.shipping_cost_amount` |
| customer_payment_amount | Khách hàng thanh toán | Currency | `supplementary_component.customer_payment_amount` |
| customer_refund_amount | Hoàn tiền cho khách | Currency | `supplementary_component.customer_refund_amount` |
| platform_cofunded_discount_amount | Phí CFV (Sàn) | Currency | `supplementary_component.platform_cofunded_discount_amount` |
| platform_cofunded_discount_refund_amount | Hoàn phí CFV (Sàn) | Currency | `supplementary_component.platform_cofunded_discount_refund_amount` |
| platform_discount_amount | Giảm giá sàn | Currency | `supplementary_component.platform_discount_amount` |
| platform_discount_refund_amount | Hoàn giảm giá sàn | Currency | `supplementary_component.platform_discount_refund_amount` |
| retail_delivery_fee_amount | Phí giao hàng bán lẻ | Currency | `supplementary_component.retail_delivery_fee_amount` |
| retail_delivery_fee_payment_amount | Thanh toán phí giao hàng bán lẻ | Currency | `supplementary_component.retail_delivery_fee_payment_amount` |
| retail_delivery_fee_refund_amount | Hoàn phí giao hàng bán lẻ | Currency | `supplementary_component.retail_delivery_fee_refund_amount` |
| sales_tax_amount | Thuế bán hàng | Currency | `supplementary_component.sales_tax_amount` |
| sales_tax_payment_amount | Thanh toán thuế bán hàng | Currency | `supplementary_component.sales_tax_payment_amount` |
| sales_tax_refund_amount | Hoàn thuế bán hàng | Currency | `supplementary_component.sales_tax_refund_amount` |
| seller_cofunded_discount_amount | Phí CFV (Người bán) | Currency | `supplementary_component.seller_cofunded_discount_amount` |
| seller_cofunded_discount_refund_amount | Hoàn phí CFV (Người bán) | Currency | `supplementary_component.seller_cofunded_discount_refund_amount` |
| subtotal_before_discount_amount | Tổng tiền tạm tính trước giảm giá | Currency | `revenue_breakdown.subtotal_before_discount_amount` |
| refund_subtotal_before_discount_amount | Hoàn tiền trước giảm giá | Currency | `revenue_breakdown.refund_subtotal_before_discount_amount` |
| seller_discount_amount | Giảm giá người bán | Currency | `revenue_breakdown.seller_discount_amount` |
| seller_discount_refund_amount | Hoàn giảm giá người bán | Currency | `revenue_breakdown.seller_discount_refund_amount` |
| affiliate_ads_commission_amount | Hoa hồng Affiliate Ads | Currency | `fee_tax_breakdown.fee.affiliate_ads_commission_amount` |
| affiliate_commission_amount | Hoa hồng Affiliate | Currency | `fee_tax_breakdown.fee.affiliate_commission_amount` |
| affiliate_commission_amount_before_pit | Hoa hồng Affiliate (trước PIT) | Currency | `fee_tax_breakdown.fee.affiliate_commission_amount_before_pit` |
| affiliate_partner_commission_amount | Hoa hồng đối tác Affiliate | Currency | `fee_tax_breakdown.fee.affiliate_partner_commission_amount` |
| live_specials_fee_amount | Phí Live Specials | Currency | `fee_tax_breakdown.fee.live_specials_fee_amount` |
| platform_commission_amount | Phí nền tảng (Platform Commission) | Currency | `fee_tax_breakdown.fee.platform_commission_amount` |
| pre_order_service_fee_amount | Phí đặt trước (Pre-order) | Currency | `fee_tax_breakdown.fee.pre_order_service_fee_amount` |
| transaction_fee_amount | Phí giao dịch (Transaction Fee) | Currency | `fee_tax_breakdown.fee.transaction_fee_amount` |
| vn_fix_infrastructure_fee | Phí cơ sở hạ tầng (Infrastructure Fee) | Currency | `fee_tax_breakdown.fee.vn_fix_infrastructure_fee` |
| voucher_xtra_service_fee_amount | Phí Voucher Xtra | Currency | `fee_tax_breakdown.fee.voucher_xtra_service_fee_amount` |
| shipping_fee_guarantee_service_fee | Phí Piship | Currency | `fee_tax_breakdown.fee.shipping_fee_guarantee_service_fee` |
| pit_amount | Thuế thu nhập cá nhân (PIT) | Currency | `fee_tax_breakdown.tax.pit_amount` |
| vat_amount | Thuế VAT | Currency | `fee_tax_breakdown.tax.vat_amount` |
| actual_shipping_fee_amount | Phí vận chuyển thực tế | Currency | `shipping_cost_breakdown.actual_shipping_fee_amount` |
| shipping_fee_discount_amount | Giảm giá phí vận chuyển | Currency | `shipping_cost_breakdown.shipping_fee_discount_amount` |
| platform_shipping_fee_discount_amount | Giảm phí vận chuyển từ nền tảng | Currency | `shipping_cost_breakdown.supplementary_component.platform_shipping_fee_discount_amount` |

> Chỉ đồng bộ statement có `payment_status === "SETTLED"` (theo hành vi n8n hiện tại) — statement
> chưa quyết toán thì transaction có thể còn thay đổi, không nên ghi vào Lark.

---

## 4.1. Unsettled Transactions Cty Hân Korea

ID định danh vẫn là `transaction_id + "_" + shop_id`. Các khái niệm trùng Finance dùng đúng cùng label
Lark, ví dụ `Doanh thu (Gross)`, `Thực thu (Net)`, `Tổng phí & thuế`, `Phí ship người bán` và toàn bộ
fee/tax breakdown đang dùng chung. Giá trị lấy từ các field ước tính tương ứng: `est_revenue_amount`,
`est_settlement_amount`, `est_fee_tax_amount` và `est_shipping_cost_amount`.

Các field riêng của snapshot unsettled:

| Label Lark | Type | Nguồn TikTok |
|---|---|---|
| Trạng thái | Text | `status` |
| Lý do chưa quyết toán | Text | `unsettled_reason` |
| Dự kiến quyết toán | Text | `estimated_settlement` |
| Phí vận chuyển khách trả | Currency | `shipping_cost_breakdown.customer_paid_shipping_fee_amount` |
| Phí dịch vụ COD | Currency | `revenue_breakdown.cod_service_fee_amount` |
| Hoàn phí dịch vụ COD | Currency | `revenue_breakdown.refund_cod_service_fee_amount` |

Bảng này là snapshot, không phải lịch sử. Record còn trong API được create/update/giữ nguyên; record thuộc đúng
shop nhưng không còn trong API được xoá khỏi Lark. Job chỉ ghi sau khi số ID giao dịch duy nhất tải được khớp
`total_count` của API.

---

## 5. Return Orders Shop K

Bảng này **chỉ có ở code cũ**, n8n hiện chưa có workflow tương ứng — không có gì để đối chiếu, giữ
nguyên theo code cũ. Không tách theo tháng (1 bảng duy nhất, xem 02-table-mapping.md).

ID định danh: `return_id + "_" + shop_id`.

| Key | Label Lark | Type | Nguồn |
|---|---|---|---|
| id | ID định danh (TTS) | Text | `${return.return_id}_${shop_id}` |
| order_id | Mã đơn hàng | Text | `return.order_id` |
| return_id | Mã trả hàng | Text | `return.return_id` |
| combined_return_id | Mã trả hàng gộp | Text | `return.combined_return_id` |
| create_time | Ngày tạo | DateTime | `return.create_time` |
| handover_method | Phương thức bàn giao | Text | `return.handover_method` |
| is_combined_return | Trả hàng gộp | Text | `return.is_combined_return` |
| return_method | Phương thức trả hàng | Text | `return.return_method` |
| return_provider_id | ID đơn vị vận chuyển | Text | `return.return_provider_id` |
| return_provider_name | Tên đơn vị vận chuyển | Text | `return.return_provider_name` |
| return_reason_text | Lý do trả hàng | Text | `return.return_reason_text` |
| return_status | Trạng thái trả hàng | Text | `return.return_status` |
| return_line_items | Sản phẩm trả hàng | Text | join `return.return_line_items[].product_name` |
| return_tracking_number | Mã vận đơn trả hàng | Text | `return.return_tracking_number` |
| return_video | Video trả hàng | URL | Postgres `han_logistics.cam_dong_hang.link_drive`, match `tracking_number = return.return_tracking_number` |
| return_type | Loại trả hàng | Text | `return.return_type` |
| role | Vai trò | Text | `return.role` |
| shipment_type | Loại vận chuyển | Text | `return.shipment_type` |
| update_time | Thời gian cập nhật | DateTime | `return.update_time` |
| shop_id | ID Shop | Text | shop context |
| shop_name | Tên Shop | Text | shop context |
| refund_shipping_fee | Phí ship được refund | Currency | `return.refund_amount.refund_shipping_fee` |
| refund_subtotal | Subtotal refund | Currency | `return.refund_amount.refund_subtotal` |
| refund_tax | Thuế được refund | Currency | `return.refund_amount.refund_tax` |
| refund_total | Tổng refund | Currency | `return.refund_amount.refund_total` |
| product_platform_discount | Giảm giá nền tảng (sản phẩm) | Currency | `return.discount_amount[0].product_platform_discount` |
| product_seller_discount | Giảm giá người bán (sản phẩm) | Currency | `return.discount_amount[0].product_seller_discount` |
| shipping_fee_platform_discount | Giảm giá vận chuyển nền tảng | Currency | `return.discount_amount[0].shipping_fee_platform_discount` |
| shipping_fee_seller_discount | Giảm giá vận chuyển người bán | Currency | `return.discount_amount[0].shipping_fee_seller_discount` |
| buyer_paid_return_shipping_fee | Phí trả hàng do người mua trả | Currency | `return.shipping_fee_amount[0].buyer_paid_return_shipping_fee` |
| platform_paid_return_shipping_fee | Phí trả hàng nền tảng trả | Currency | `return.shipping_fee_amount[0].platform_paid_return_shipping_fee` |
| seller_paid_return_shipping_fee | Phí trả hàng người bán trả | Currency | `return.shipping_fee_amount[0].seller_paid_return_shipping_fee` |

> Code cũ có tính thêm `return_warehouse_address`, `discount_amount_raw`, `shipping_fee_amount_raw`
> nhưng **không** map các field này lên Lark (dead field trong code cũ). Bản hợp nhất bỏ hẳn,
> trừ khi có yêu cầu hiển thị thêm trên Lark thì bổ sung field mới tương ứng.
