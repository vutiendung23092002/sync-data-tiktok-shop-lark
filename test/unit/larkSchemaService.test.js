import assert from "node:assert/strict";
import test from "node:test";

import { LARK_SCHEMAS } from "../../src/config/larkSchemas.js";
import { createLarkSchemaService } from "../../src/services/larkSchemaService.js";

function actualField(field, overrides = {}) {
  return {
    field_name: field.field_name,
    type: field.type,
    ui_type: field.ui_type,
    property: field.property ? { ...field.property } : null,
    ...overrides,
  };
}

test("schema service creates missing fields with the exact configured type and caches success", async () => {
  const expected = LARK_SCHEMAS.skus;
  const fields = expected.slice(0, 2).map((field) => actualField(field));
  const created = [];
  let listCalls = 0;
  const service = createLarkSchemaService({
    larkClient: {
      listFields: async () => {
        listCalls += 1;
        return fields;
      },
      createField: async (_baseId, _tableId, field) => {
        created.push(field);
        fields.push(actualField(field));
      },
    },
  });

  const first = await service.ensureTableSchema({ baseId: "base", tableId: "table", schemaType: "skus" });
  const second = await service.ensureTableSchema({ baseId: "base", tableId: "table", schemaType: "skus" });

  assert.deepEqual(created, expected.slice(2));
  assert.deepEqual(first.createdFields, expected.slice(2).map((field) => field.field_name));
  assert.equal(second, first);
  assert.equal(listCalls, 2);
});

test("schema service fails before creating fields when an existing field has the wrong type", async () => {
  const expected = LARK_SCHEMAS.skus;
  let creates = 0;
  const service = createLarkSchemaService({
    larkClient: {
      listFields: async () => [actualField(expected[0], { type: 2, ui_type: "Currency" })],
      createField: async () => { creates += 1; },
    },
  });

  await assert.rejects(
    service.ensureTableSchema({ baseId: "base", tableId: "table", schemaType: "skus" }),
    /id_sku: type expected 1, received 2.*ui_type expected Text, received Currency/,
  );
  assert.equal(creates, 0);
});

test("schema service accepts an existing SingleSelect as a compatible legacy Text field", async () => {
  const expected = LARK_SCHEMAS.orderItems;
  const fields = expected.map((field) => actualField(field));
  const sellerSkuIndex = fields.findIndex((field) => field.field_name === "Mã sản phẩm");
  fields[sellerSkuIndex] = actualField(expected[sellerSkuIndex], {
    type: 3,
    ui_type: "SingleSelect",
    property: { options: [{ id: "option-1", name: "A1" }] },
  });
  const service = createLarkSchemaService({
    larkClient: {
      listFields: async () => fields,
      createField: async () => assert.fail("must not create a compatible existing field"),
    },
  });

  const result = await service.ensureTableSchema({
    baseId: "base",
    tableId: "table",
    schemaType: "orderItems",
  });

  assert.deepEqual(result.createdFields, []);
});

test("schema service accepts a different display formatter on an existing DateTime field", async () => {
  const expected = LARK_SCHEMAS.orders;
  const fields = expected.map((field) => actualField(field));
  const createTimeIndex = fields.findIndex((field) => field.field_name === "Ngày tạo đơn");
  fields[createTimeIndex] = actualField(expected[createTimeIndex], {
    property: { date_formatter: "yyyy/MM/dd" },
  });
  const service = createLarkSchemaService({
    larkClient: {
      listFields: async () => fields,
      createField: async () => assert.fail("must not create a compatible existing field"),
    },
  });

  const result = await service.ensureTableSchema({
    baseId: "base",
    tableId: "table",
    schemaType: "orders",
  });

  assert.deepEqual(result.createdFields, []);
});

test("schema service validates ui_type and required field properties", async () => {
  const dateField = LARK_SCHEMAS.orders.find((field) => field.field_name === "Ngày tạo đơn");
  const service = createLarkSchemaService({
    larkClient: {
      listFields: async () => [actualField(dateField, {
        ui_type: "Date",
        property: { date_formatter: "yyyy/MM/dd" },
      })],
      createField: async () => assert.fail("must fail before creating missing fields"),
    },
  });

  await assert.rejects(
    service.ensureTableSchema({ baseId: "base", tableId: "table", schemaType: "orders" }),
    /ui_type expected DateTime.*property.date_formatter expected "yyyy\/MM\/dd HH:mm"/,
  );
});

test("schema service does not create missing fields in DRY_RUN mode", async () => {
  let creates = 0;
  const service = createLarkSchemaService({
    larkClient: {
      listFields: async () => [],
      createField: async () => { creates += 1; },
    },
  });

  await assert.rejects(
    service.ensureTableSchema({ baseId: "base", tableId: "table", schemaType: "skus", createMissing: false }),
    /DRY_RUN prevents creating them/,
  );
  assert.equal(creates, 0);
});
