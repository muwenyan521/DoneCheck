import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

export interface NormalizationGuide {
  readonly nullableFields: ReadonlySet<string>;
  readonly nested: ReadonlyMap<string, NormalizationGuide>;
  readonly arrayItems?: NormalizationGuide;
}

export interface StrictCompatSchema {
  readonly responseFormat: ReturnType<typeof zodResponseFormat>;
  readonly guide: NormalizationGuide;
}

type JsonSchema = Record<string, unknown>;

export function buildStrictCompatResponseFormat<T>(
  schema: z.ZodType<T>,
  schemaName: string,
  strict: boolean,
): StrictCompatSchema {
  const base = silentZodResponseFormat(schema, schemaName);
  const guide = buildGuide(schema);
  const transformedSchema = transformJsonSchema(
    deepClone(base.json_schema.schema as JsonSchema),
    guide,
  );
  const responseFormat = makeParseable(
    {
      type: "json_schema" as const,
      json_schema: {
        name: schemaName,
        strict,
        schema: transformedSchema,
      },
    },
    (content: string) => normalizeProviderOutput(JSON.parse(content), guide),
  );
  return { responseFormat, guide };
}

export function normalizeProviderOutput(parsed: unknown, guide: NormalizationGuide): unknown {
  if (parsed === null || typeof parsed !== "object") return parsed;
  if (Array.isArray(parsed)) {
    const arrayItems = guide.arrayItems;
    if (arrayItems === undefined) return parsed;
    return parsed.map((item) => normalizeProviderOutput(item, arrayItems));
  }
  const source = parsed as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (guide.nullableFields.has(key) && (value === null || value === "")) continue;
    const nestedGuide = guide.nested.get(key);
    if (nestedGuide !== undefined && value !== null && typeof value === "object") {
      result[key] = normalizeProviderOutput(value, nestedGuide);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function silentZodResponseFormat<T>(
  schema: z.ZodType<T>,
  name: string,
): ReturnType<typeof zodResponseFormat> {
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    return zodResponseFormat(schema, name);
  } finally {
    console.warn = originalWarn;
  }
}

function buildGuide(schema: z.ZodType): NormalizationGuide {
  return buildGuideInner(schema);
}

function buildGuideInner(schema: z.ZodType): NormalizationGuide {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>;
    const nullableFields = new Set<string>();
    const nested = new Map<string, NormalizationGuide>();
    for (const [key, field] of Object.entries(shape)) {
      const unwrapped = unwrapOptionalDefault(field);
      if (unwrapped.isNullableForCompat) {
        nullableFields.add(key);
      }
      const innerGuide = buildGuideInner(unwrapped.inner);
      if (
        innerGuide.nullableFields.size > 0 ||
        innerGuide.nested.size > 0 ||
        innerGuide.arrayItems
      ) {
        nested.set(key, innerGuide);
      }
    }
    return { nullableFields, nested };
  }
  if (schema instanceof z.ZodArray) {
    const elementGuide = buildGuideInner(schema.element);
    return { nullableFields: new Set(), nested: new Map(), arrayItems: elementGuide };
  }
  if (schema instanceof z.ZodOptional) {
    return buildGuideInner(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return buildGuideInner(schema.removeDefault());
  }
  return { nullableFields: new Set(), nested: new Map() };
}

function unwrapOptionalDefault(field: z.ZodType): {
  inner: z.ZodType;
  isNullableForCompat: boolean;
} {
  if (field instanceof z.ZodOptional) {
    const inner = field.unwrap();
    if (inner instanceof z.ZodNullable) {
      return { inner: inner.unwrap(), isNullableForCompat: false };
    }
    return { inner, isNullableForCompat: true };
  }
  if (field instanceof z.ZodDefault) {
    const inner = field.removeDefault();
    if (inner instanceof z.ZodNullable) {
      return { inner: inner.unwrap(), isNullableForCompat: false };
    }
    return { inner, isNullableForCompat: true };
  }
  if (field instanceof z.ZodNullable) {
    return { inner: field.unwrap(), isNullableForCompat: false };
  }
  return { inner: field, isNullableForCompat: false };
}

function transformJsonSchema(jsonSchema: JsonSchema, guide: NormalizationGuide): JsonSchema {
  if (jsonSchema.type === "object" && typeof jsonSchema.properties === "object") {
    // biome-ignore lint/performance/noDelete: JSON schema output must not include $schema
    delete jsonSchema.$schema;
    const properties = jsonSchema.properties as Record<string, JsonSchema>;
    for (const field of guide.nullableFields) {
      const prop = properties[field];
      if (prop !== undefined) {
        properties[field] = makeNullable(prop);
        // biome-ignore lint/performance/noDelete: JSON schema output must not include default
        delete prop.default;
      }
    }
    for (const [key, nestedGuide] of guide.nested) {
      const prop = properties[key];
      if (prop !== undefined) {
        properties[key] = transformJsonSchema(prop, nestedGuide);
      }
    }
  }
  if (guide.arrayItems !== undefined && jsonSchema.items !== undefined) {
    jsonSchema.items = transformJsonSchema(jsonSchema.items as JsonSchema, guide.arrayItems);
  }
  return jsonSchema;
}

function makeNullable(jsonSchema: JsonSchema): JsonSchema {
  const result = { ...jsonSchema };
  // biome-ignore lint/performance/noDelete: JSON schema output must not include default
  delete result.default;
  if (typeof result.type === "string") {
    result.type = [result.type, "null"];
  } else if (Array.isArray(result.type)) {
    if (!result.type.includes("null")) {
      result.type = [...result.type, "null"];
    }
  } else {
    result.type = ["null"];
  }
  return result;
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function makeParseable(
  responseFormat: Record<string, unknown>,
  parseFn: (content: string) => unknown,
): ReturnType<typeof zodResponseFormat> {
  Object.defineProperties(responseFormat, {
    $brand: { value: "auto-parseable-response-format", enumerable: false },
    $parseRaw: { value: parseFn, enumerable: false },
  });
  return responseFormat as unknown as ReturnType<typeof zodResponseFormat>;
}
