const { setup, teardown } = require("./tests/database");
const { useModel } = require("./index.js");

const SETUPDB = `
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  test INT NOT NULL,
  a INT
);

CREATE TABLE users2 (
  id SERIAL NOT NULL,
  test INT NOT NULL,
  a INT,
  PRIMARY KEY (id, test)
);

CREATE TABLE users3 (
  email VARCHAR(128) NOT NULL,
  name VARCHAR(128) NOT NULL,
  a INT,
  PRIMARY KEY (name, email)
);

CREATE TABLE comment (
  id SERIAL NOT NULL,
  userid INT NOT NULL,
  comment TEXT,
  PRIMARY KEY (id, userid),
  FOREIGN KEY (userid) REFERENCES users(id)
);

CREATE TABLE derived (
  id SERIAL PRIMARY KEY,
  test INT NOT NULL
);
`;

const type = {
  id: { type: "id", key: true, auto: true },
  test: { type: "int" },
  a: { type: "int", optional: true },
};
const multiKeyType = {
  id: { type: "id", key: true, auto: true },
  test: { type: "int", key: true },
  a: { type: "int", optional: true },
};
const noAutoType = {
  email: { type: "email", key: true },
  name: { type: "string", key: true },
  a: { type: "int", optional: true },
};
const foreignType = {
  id: { type: "id", key: true, auto: true },
  userid: { type: "id", key: true },
  comment: { type: "string", optional: true },
};
const derivedType = {
  id: { type: "id", key: true, auto: true },
  test: { type: "int", public: true },
  derivedId: {
    type: "id",
    derived: (c) => c.id,
    public: true,
  },
  derivedAsync: {
    type: "string",
    public: true,
    derived: async () => new Promise((res) => res("test")),
  },
};
const [, Model] = useModel(type, "users");
const [, Model2] = useModel(multiKeyType, "users2");
const [, Model3] = useModel(noAutoType, "users3");
const [, Model4] = useModel(foreignType, "comment");
const [, Model5] = useModel(derivedType, "derived");

let dbs;
beforeAll(async () => {
  dbs = await setup([SETUPDB], null, "appartsmodeltests");
});
afterAll(async () => {
  await teardown();
});

describe("OneModel", () => {
  test("creation of one", async () => {
    const m = new Model(dbs, { test: 1 });
    await expect(m.store()).resolves.toBeTruthy();
    expect(m.content).toMatchObject({ test: 1, id: 1 });
  });

  test("creation of one with derived", async () => {
    const m = new Model5(dbs, { test: 1 });
    await expect(m.store()).resolves.toBeTruthy();
    expect(m.content).toStrictEqual({ id: 1, test: 1 });
  });

  test("creation of many", async () => {
    await expect(() => new Model(dbs, [{ test: 1 }, { test: 2 }])).toThrow({
      message: "[OneModel] cannot create multiple. Use ManyModel instead!",
    });
  });

  test("loadOne success", async () => {
    const m = new Model(dbs);

    await expect(m.load({ test: 1 })).resolves.toBe(m);
    expect(m.content).toMatchObject({ test: 1, id: 1 });
  });

  test("loadOne fail (too many)", async () => {
    await new Model(dbs, { test: 1, a: 2 }).store();

    const m = new Model(dbs);
    await expect(m.load({ test: 1 })).rejects.toMatchObject({
      message: "[Model] Object not unique",
    });
  });

  test("loadOne fail (too few)", async () => {
    const m = new Model(dbs);
    await expect(m.load({ test: 8 })).rejects.toMatchObject({
      message: "[Model] Object not found",
    });
  });

  test("update", async () => {
    const m = new Model(dbs);

    await new Model(dbs, { test: 4, a: 1 }).store();
    await m.load({ test: 4 });
    m.content.a = 2;
    await m.update();
    const m2 = await new Model(dbs).load({ test: 4 });

    expect(m2.content).toMatchObject({
      test: 4,
      a: 2,
    });
  });

  test("update of one with derived", async () => {
    const m = new Model5(dbs);

    await new Model5(dbs, { test: 4 }).store();
    await m.load({ test: 4 });
    m.content.test = 2;
    await m.update();
    const m2 = await new Model5(dbs).load({ test: 2 });

    expect(m2.content).toMatchObject({
      test: 2,
    });
  });

  test("update fails, key changed", async () => {
    const m = new Model(dbs);

    const mOld = await new Model(dbs, { test: 400, a: 1 }).store();
    await m.load({ test: 400 });
    m.content.a = 2;
    m.content.id = "sheesh";
    await expect(async () => await m.update()).rejects.toThrow({
      message:
        "[AnyModel] tried to update but IDs did not match loaded IDs, E46",
    });
    const m2 = await new Model(dbs).load({ test: 400 });
    expect(m2.content).toMatchObject(mOld.content);
  });

  test("update fails, content emptied", async () => {
    const m = new Model(dbs);

    const mOld = await new Model(dbs, { test: 401, a: 1 }).store();
    await m.load({ test: 400 });
    m.content = {};

    await expect(async () => await m.update()).rejects.toThrow({
      message:
        "[AnyModel] tried to update but IDs did not match loaded IDs, E46",
    });

    const m2 = await new Model(dbs).load({ test: 401 });
    expect(m2.content).toMatchObject(mOld.content);
  });

  test("update fails, invalid data", async () => {
    const m = new Model(dbs);

    const mOld = await new Model(dbs, { test: 402, a: 1 }).store();
    await m.load({ test: 400 });
    m.content.a = "brru";
    await expect(async () => await m.update()).rejects.toThrow({
      message:
        '[AnyModel] type-constraints not met: [{"id":4,"test":400,"a":"brru"}]',
    });
    const m2 = await new Model(dbs).load({ test: 402 });
    expect(m2.content).toMatchObject(mOld.content);
  });

  test("delete", async () => {
    await new Model(dbs, { test: 5 }).store();
    await (await new Model(dbs).load({ test: 5 })).delete();

    await expect(new Model(dbs).load({ test: 5 })).rejects.toMatchObject({
      message: "[Model] Object not found",
    });
  });

  test("insert constrained", async () => {
    await expect(
      new Model4(dbs, { userid: 1000, comment: "a" }).store()
    ).rejects.toMatchObject({
      message: "[Model] Object fails to meet constraints",
    });
  });

  test("delete of referenced fails", async () => {
    const m = await new Model(dbs, { test: 5 }).store();
    await new Model4(dbs, { userid: m.content.id }).store();

    const m2 = await new Model(dbs).load({ test: 5 });
    await expect(async () => await m2.delete()).rejects.toMatchObject({
      message: "[Model] Object is still reference",
    });

    await expect(new Model(dbs).load({ test: 5 }));
    await expect(new Model4(dbs).load({ userid: m.content.id }));
  });

  test("loadById, one key", async () => {
    const m1 = await new Model(dbs, { test: 1 }).store();
    await new Model(dbs, { test: 2 }).store();
    const m2 = await new Model(dbs).loadById(m1.content.id);

    expect(m2.content.test).toBe(1);
    expect(m2.content.id).toBe(m1.content.id);
  });

  test("loadById, multi key", async () => {
    const m1 = await new Model2(dbs, { test: 1, a: 7 }).store();
    await new Model2(dbs, { test: 1 }).store();
    await new Model2(dbs, { test: 2 }).store();
    const m2 = await new Model2(dbs).loadById({ id: m1.content.id, test: 1 });

    expect(m2.content).toMatchObject({
      a: 7,
      id: m1.content.id,
      test: 1,
    });
    await expect(new Model2(dbs).loadById(m1.content.id)).rejects.toThrow({
      message: `[OneModel] loadById not all keys given, E49.
Collection: "users2", Keys: "["id","test"]", Id: "${m1.content.id}"`,
    });
    await expect(
      new Model2(dbs).loadById({ id: m1.content.id })
    ).rejects.toThrow({
      message: `[OneModel] loadById not all keys given, E49.
Collection: "users2", Keys: "["id","test"]", Id: "{"id":${m1.content.id}}"`,
    });
  });

  test("insert unique, multi key, no auto", async () => {
    await new Model3(dbs, {
      email: "test@test.de",
      name: "Peter",
      a: 12,
    }).store();
    await expect(
      new Model3(dbs, { email: "test@test.de", name: "Peter" }).store()
    ).rejects.toMatchObject({ message: "[Model] Object does exist" });
  });

  test("delete, multi key, no auto", async () => {
    await new Model3(dbs, { email: "test@test.de", name: "Franz" }).store();
    const m1 = await new Model3(dbs).load({
      email: "test@test.de",
      name: "Franz",
    });
    await expect(m1.delete()).resolves.toBe(m1);
    await expect(
      new Model3(dbs).load({ email: "test@test.de", name: "Franz" })
    ).rejects.toMatchObject({
      message: "[Model] Object not found",
    });
    const peter = await new Model3(dbs).loadById({
      email: "test@test.de",
      name: "Peter",
    });
    expect(peter.content).toMatchObject({
      email: "test@test.de",
      name: "Peter",
      a: 12,
    });
  });

  test("update, multi key, no auto", async () => {
    await new Model3(dbs, { email: "test@test.de", name: "Franz" }).store();
    const peter = await new Model3(dbs).loadById({
      email: "test@test.de",
      name: "Peter",
    });
    peter.content.a = 99;
    await expect(peter.update()).resolves.toBe(peter);
    await expect(
      (
        await new Model3(dbs).loadById({
          email: "test@test.de",
          name: "Peter",
        })
      ).content
    ).toMatchObject({
      email: "test@test.de",
      name: "Peter",
      a: 99,
    });
    await expect(
      (
        await new Model3(dbs).loadById({ email: "test@test.de", name: "Franz" })
      ).content
    ).toMatchObject({ email: "test@test.de", name: "Franz" });
  });

  test("update multi key fails, key changed", async () => {
    const m = new Model3(dbs);

    const mOld = await new Model3(dbs, {
      email: "jesus@god.com",
      name: "jesus",
    }).store();
    await m.load({ email: "jesus@god.com" });
    m.content.email = "400";
    await expect(async () => await m.update()).rejects.toThrow({
      message:
        "[AnyModel] tried to update but IDs did not match loaded IDs, E46",
    });

    const m2 = await new Model3(dbs).load({ email: "jesus@god.com" });
    m2.content.name = "400";
    await expect(async () => await m2.update()).rejects.toThrow({
      message:
        "[AnyModel] tried to update but IDs did not match loaded IDs, E46",
    });

    const m3 = await new Model3(dbs).load({ email: "jesus@god.com" });
    expect(m3.content).toMatchObject(mOld.content);
  });

  test("find by substring", async () => {
    await new Model3(dbs, {
      email: "test1@test.de",
      name: "Hans",
      a: 12,
    }).store();
    await expect(
      (
        await new Model3(dbs).load({ name: { op: "like", val: "%ans" } })
      ).content
    ).toMatchObject({ email: "test1@test.de", name: "Hans" });
  });

  test("getPublic with derived but not generated", async () => {
    const m2 = await new Model5(dbs).load({ test: 1 });
    await expect(() => m2.getPublic()).toThrow(
      "[AnyModel] getPublic called without generating derived first."
    );
  });

  test("getPublic with derived", async () => {
    const m1 = await new Model5(dbs, {
      test: 100,
    }).store();
    const m2 = await new Model5(dbs).load({ test: 100 });
    await m1.generateDerived();
    await m2.generateDerived();
    const publicVals1 = await m1.getPublic();
    const publicVals2 = await m2.getPublic();
    expect(publicVals1).toStrictEqual({
      test: 100,
      derivedId: 3,
      derivedAsync: "test",
    });
    expect(publicVals1).toStrictEqual(publicVals2);
  });
});
