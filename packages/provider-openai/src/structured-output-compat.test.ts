import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  type NormalizationGuide,
  buildStrictCompatResponseFormat,
  normalizeProviderOutput,
} from "./structured-output-compat.js";

function schemaOf(rf: { json_schema: { schema?: unknown } }): Record<string, unknown> {
  return rf.json_schema.schema as Record<string, unknown>;
}

function props(rf: { json_schema: { schema?: unknown } }): Record<string, Record<string, unknown>> {
  return schemaOf(rf).properties as Record<string, Record<string, unknown>>;
}

describe("buildStrictCompatResponseFormat", () => {
  it("makes optional fields nullable in the JSON schema", () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    });
    const { responseFormat } = buildStrictCompatResponseFormat(schema, "Test", true);

    expect(props(responseFormat).optional?.type).toEqual(["string", "null"]);
    expect(props(responseFormat).required?.type).toBe("string");
  });

  it("makes default fields nullable in the JSON schema", () => {
    const schema = z.object({
      required: z.string(),
      withDefault: z.array(z.string()).default([]),
    });
    const { responseFormat } = buildStrictCompatResponseFormat(schema, "Test", true);

    expect(props(responseFormat).withDefault?.type).toEqual(["array", "null"]);
  });

  it("does not make already-nullable fields nullable-for-compat", () => {
    const schema = z.object({
      nullable: z.string().nullable(),
      optionalNullable: z.string().nullable().optional(),
    });
    const { guide } = buildStrictCompatResponseFormat(schema, "Test", true);

    expect(guide.nullableFields.has("nullable")).toBe(false);
    expect(guide.nullableFields.has("optionalNullable")).toBe(false);
  });

  it("sets the strict flag on the response format", () => {
    const schema = z.object({ ok: z.boolean() });
    const strict = buildStrictCompatResponseFormat(schema, "Test", true);
    const nonStrict = buildStrictCompatResponseFormat(schema, "Test", false);

    expect(strict.responseFormat.json_schema.strict).toBe(true);
    expect(nonStrict.responseFormat.json_schema.strict).toBe(false);
  });

  it("keeps all fields in the required array", () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
      withDefault: z.array(z.string()).default([]),
    });
    const { responseFormat } = buildStrictCompatResponseFormat(schema, "Test", true);

    expect(schemaOf(responseFormat).required).toEqual(
      expect.arrayContaining(["required", "optional", "withDefault"]),
    );
  });

  it("removes default and $schema keys from strict JSON schema", () => {
    const schema = z.object({
      withDefault: z.array(z.string()).default([]),
    });
    const { responseFormat } = buildStrictCompatResponseFormat(schema, "Test", true);

    expect(props(responseFormat).withDefault?.default).toBeUndefined();
    expect(schemaOf(responseFormat).$schema).toBeUndefined();
  });

  it("tracks nullable-for-compat fields in the guide", () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
      withDefault: z.array(z.string()).default([]),
    });
    const { guide } = buildStrictCompatResponseFormat(schema, "Test", true);

    expect(guide.nullableFields.has("optional")).toBe(true);
    expect(guide.nullableFields.has("withDefault")).toBe(true);
    expect(guide.nullableFields.has("required")).toBe(false);
  });

  it("handles nested objects with optional fields", () => {
    const schema = z.object({
      nested: z.object({
        innerRequired: z.string(),
        innerOptional: z.string().optional(),
      }),
    });
    const { responseFormat, guide } = buildStrictCompatResponseFormat(schema, "Test", true);

    const nestedProps = props(responseFormat).nested?.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(nestedProps.innerOptional?.type).toEqual(["string", "null"]);
    expect(nestedProps.innerRequired?.type).toBe("string");

    const nestedGuide = guide.nested.get("nested");
    expect(nestedGuide?.nullableFields.has("innerOptional")).toBe(true);
    expect(nestedGuide?.nullableFields.has("innerRequired")).toBe(false);
  });

  it("handles optional nested objects", () => {
    const schema = z.object({
      optionalNested: z
        .object({
          inner: z.string(),
          innerOptional: z.string().optional(),
        })
        .optional(),
    });
    const { guide } = buildStrictCompatResponseFormat(schema, "Test", true);

    expect(guide.nullableFields.has("optionalNested")).toBe(true);
    const nestedGuide = guide.nested.get("optionalNested");
    expect(nestedGuide).toBeDefined();
    expect(nestedGuide?.nullableFields.has("innerOptional")).toBe(true);
  });

  it("handles array items with optional fields", () => {
    const schema = z.object({
      items: z.array(
        z.object({
          itemRequired: z.string(),
          itemOptional: z.string().optional(),
        }),
      ),
    });
    const { responseFormat, guide } = buildStrictCompatResponseFormat(schema, "Test", true);

    const itemsSchema = props(responseFormat).items as Record<string, unknown>;
    const itemProps = (itemsSchema.items as Record<string, unknown>).properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(itemProps.itemOptional?.type).toEqual(["string", "null"]);
    expect(itemProps.itemRequired?.type).toBe("string");

    const itemsGuide = guide.nested.get("items");
    expect(itemsGuide?.arrayItems?.nullableFields.has("itemOptional")).toBe(true);
  });

  it("suppresses SDK optional-without-nullable console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const schema = z.object({
      optional: z.string().optional(),
    });

    buildStrictCompatResponseFormat(schema, "Test", true);

    const zodWarnings = warnSpy.mock.calls.filter((call) =>
      String(call[0]).includes("without .nullable()"),
    );
    expect(zodWarnings).toHaveLength(0);
    warnSpy.mockRestore();
  });
});

describe("normalizeProviderOutput", () => {
  const guide: NormalizationGuide = {
    nullableFields: new Set(["optional", "withDefault"]),
    nested: new Map(),
  };

  it("deletes null values for nullable-for-compat fields", () => {
    const result = normalizeProviderOutput(
      { required: "x", optional: null, withDefault: null },
      guide,
    );

    expect(result).toEqual({ required: "x" });
  });

  it("leaves non-null values unchanged", () => {
    const result = normalizeProviderOutput(
      { required: "x", optional: "value", withDefault: ["a"] },
      guide,
    );

    expect(result).toEqual({ required: "x", optional: "value", withDefault: ["a"] });
  });

  it("leaves null values for non-tracked (required) fields", () => {
    const result = normalizeProviderOutput({ required: null }, guide);

    expect(result).toEqual({ required: null });
  });

  it("recurses into nested objects", () => {
    const nestedGuide: NormalizationGuide = {
      nullableFields: new Set(["innerOptional"]),
      nested: new Map(),
    };
    const guide: NormalizationGuide = {
      nullableFields: new Set(),
      nested: new Map([["nested", nestedGuide]]),
    };

    const result = normalizeProviderOutput(
      { nested: { innerRequired: "x", innerOptional: null } },
      guide,
    );

    expect(result).toEqual({ nested: { innerRequired: "x" } });
  });

  it("recurses into arrays", () => {
    const itemGuide: NormalizationGuide = {
      nullableFields: new Set(["itemOptional"]),
      nested: new Map(),
    };
    const itemsGuide: NormalizationGuide = {
      nullableFields: new Set(),
      nested: new Map(),
      arrayItems: itemGuide,
    };
    const guide: NormalizationGuide = {
      nullableFields: new Set(),
      nested: new Map([["items", itemsGuide]]),
    };

    const result = normalizeProviderOutput(
      {
        items: [
          { itemRequired: "a", itemOptional: "x" },
          { itemRequired: "b", itemOptional: null },
        ],
      },
      guide,
    );

    expect(result).toEqual({
      items: [{ itemRequired: "a", itemOptional: "x" }, { itemRequired: "b" }],
    });
  });

  it("deletes null for optional object fields", () => {
    const guide: NormalizationGuide = {
      nullableFields: new Set(["optionalNested"]),
      nested: new Map([
        [
          "optionalNested",
          {
            nullableFields: new Set(["innerOptional"]),
            nested: new Map(),
          },
        ],
      ]),
    };

    const result = normalizeProviderOutput({ optionalNested: null }, guide);

    expect(result).toEqual({});
  });

  it("normalizes then Zod parse passes for null optional fields", () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
      withDefault: z.array(z.string()).default([]),
    });
    const { guide } = buildStrictCompatResponseFormat(schema, "Test", true);

    const providerResponse = { required: "x", optional: null, withDefault: null };
    const normalized = normalizeProviderOutput(providerResponse, guide);

    expect(() => schema.parse(normalized)).not.toThrow();
    expect(schema.parse(normalized)).toEqual({
      required: "x",
      optional: undefined,
      withDefault: [],
    });
  });

  it("does not locally fill missing required fields", () => {
    const schema = z.object({
      required: z.string(),
      repairSuggestion: z.string(),
    });
    const { guide } = buildStrictCompatResponseFormat(schema, "Test", true);

    const providerResponse = { required: "x" };
    const normalized = normalizeProviderOutput(providerResponse, guide);

    expect(() => schema.parse(normalized)).toThrow("repairSuggestion");
  });

  it("returns non-object values unchanged", () => {
    expect(
      normalizeProviderOutput("string", { nullableFields: new Set(), nested: new Map() }),
    ).toBe("string");
    expect(normalizeProviderOutput(42, { nullableFields: new Set(), nested: new Map() })).toBe(42);
    expect(
      normalizeProviderOutput(null, { nullableFields: new Set(), nested: new Map() }),
    ).toBeNull();
  });
});
