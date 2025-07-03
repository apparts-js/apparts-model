function safeStringify(value: unknown) {
  const seen = new Set();
  return JSON.stringify(value, (_, v) => {
    if (seen.has(v)) {
      return "...";
    }
    if (typeof v === "object") {
      seen.add(v);
    }
    return v;
  });
}

const buildErrorMessage = (more = {}) =>
  Object.keys(more)
    .filter((key) => more[key])
    .map((key) => key + ": " + safeStringify(more[key]))
    .join("\n");

export class NotUnique extends Error {
  constructor(model, more) {
    super(
      `Object not unique.
Collection: ${model}
${buildErrorMessage(more)}`
    );
  }
}

export class NotFound extends Error {
  constructor(model, more) {
    super(
      `Object not found.
Collection: ${model}
${buildErrorMessage(more)}`
    );
  }
}

export class DoesExist extends Error {
  constructor(model, more) {
    super(
      `Object does exist.
Collection: ${model}
${buildErrorMessage(more)}`
    );
  }
}

export class IsReference extends Error {
  constructor(model, more) {
    super(
      `Object is still reference.
Collection: ${model}
${buildErrorMessage(more)}`
    );
  }
}

export class ConstraintFailed extends Error {
  constructor(model, more) {
    super(
      `Object fails to meet constraints
Collection: ${model}
${buildErrorMessage(more)}`
    );
  }
}

export class TypeMissmatchError extends Error {
  constructor(
    collection: string,
    content: unknown,
    key: string,
    explanation: string
  ) {
    super(
      `[AnyModel] type-constraints not met in collection "${collection}". Content: ` +
        JSON.stringify(content, undefined, 2) +
        `
Issue with key: "${key}": ${explanation}`
    );
  }
}

export class UnexpectedModelError extends Error {
  constructor(model, err) {
    super(
      model +
        " Unexpected error in store: " +
        (err instanceof Error ? err.message : err)
    );
  }
}

export class NotAllKeysGivenError extends Error {
  constructor(model, more) {
    super(
      `Not all keys given:
Collection: ${model}
${buildErrorMessage(more)}`
    );
  }
}

export class ConcurrencyError extends Error {
  constructor(model, keys, unchanged) {
    super(
      `Concurrency error, object changed in DB since last read:
Collection: ${model}
Keys: ${JSON.stringify(keys, undefined, 2)}
Unchanged: ${JSON.stringify(unchanged, undefined, 2)}`
    );
  }
}
