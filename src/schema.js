// Minimal JSON-Schema generation from the Zod shapes we use, so we don't pull
// in an extra dependency just for schema conversion.
export function zodToJsonSchema(schema) {
  const shape = schema._def.shape ? schema._def.shape() : {};
  const properties = {};
  const required = [];
  for (const [key, field] of Object.entries(shape)) {
    properties[key] = describeField(field);
    if (!field.isOptional()) required.push(key);
  }
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

function describeField(field) {
  let f = field;
  let description = f._def.description;
  // Unwrap optional / default wrappers to reach the base type.
  while (
    f._def.typeName === "ZodOptional" ||
    f._def.typeName === "ZodDefault"
  ) {
    description = description || f._def.description;
    f = f._def.innerType;
  }
  description = description || f._def.description;
  const base = baseType(f);
  return description ? { ...base, description } : base;
}

function baseType(f) {
  switch (f._def.typeName) {
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: f._def.values };
    case "ZodArray":
      return { type: "array", items: describeField(f._def.type) };
    case "ZodObject":
      return zodToJsonSchema(f);
    default:
      return {};
  }
}
