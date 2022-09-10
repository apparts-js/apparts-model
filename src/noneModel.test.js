const { setup, teardown } = require("./tests/database");
const { SETUPDB } = require("./tests/databaseSetup");
const { useModel } = require("./index");

import {
  type,
  multiKeyType,
  noAutoType,
  foreignType,
  derivedType,
} from "./tests/testTypes";

const [, Model, NoModel] = useModel({ typeSchema: type, collection: "users" });
const [,] = useModel({ typeSchema: multiKeyType, collection: "users2" });
const [,] = useModel({ typeSchema: noAutoType, collection: "users3" });
const [,] = useModel({ typeSchema: foreignType, collection: "comment" });
const [,] = useModel({ typeSchema: derivedType, collection: "derived" });

let dbs;
beforeAll(async () => {
  dbs = await setup([SETUPDB], null, "appartsnonemodeltests");
});
afterAll(async () => {
  await teardown();
});

describe("NoneModel", () => {
  test("loadOne success", async () => {
    const m = new NoModel(dbs);

    await expect(m.loadNone({ test: 777 })).resolves.toBe(m);
  });

  test("loadOne fail (too many)", async () => {
    await new Model(dbs, { test: 777 }).store();

    const m = new NoModel(dbs);
    await expect(m.loadNone({ test: 777 })).rejects.toMatchObject({
      message: "[Model] Object does exist",
    });
  });
});
