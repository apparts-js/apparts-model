function safeStringify(value) {
  const seen = new Set();
  return JSON.stringify(value, (k, v) => {
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

function NotUnique(name, more) {
  this.message = `[Model] Object not unique`;
  this.collection = name;
  this.moreInfo = buildErrorMessage(more);
  this.toString = () =>
    `${this.message}\nCollection: ${this.collection}\n${this.moreInfo}`;
}
function NotFound(name, loadFilter) {
  this.message = `[Model] Object not found`;
  this.collection = name;
  this.moreInfo = buildErrorMessage({ loadFilter });
  this.toString = () =>
    `${this.message}\nCollection: ${this.collection}\n${this.moreInfo}`;
}
function DoesExist(name, more) {
  this.message = `[Model] Object does exist`;
  this.collection = name;
  this.moreInfo = buildErrorMessage(more);
  this.toString = () =>
    `${this.message}\nCollection: ${this.collection}\n${this.moreInfo}`;
}
function IsReference(name, loadFilter) {
  this.message = `[Model] Object is still reference`;
  this.collection = name;
  this.moreInfo = buildErrorMessage({
    loadFilter,
  });
  this.toString = () =>
    `${this.message}\nCollection: ${this.collection}\n${this.moreInfo}`;
}
function ConstraintFailed(name, newObject) {
  this.message = `[Model] Object fails to meet constraints`;
  this.collection = name;
  this.moreInfo = buildErrorMessage({
    newObj: newObject,
  });
  this.toString = () =>
    `${this.message}\nCollection: ${this.collection}\n${this.moreInfo}`;
}

module.exports = {
  NotUnique,
  NotFound,
  DoesExist,
  IsReference,
  ConstraintFailed,
};
