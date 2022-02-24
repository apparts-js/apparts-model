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
  test: { type: "int" },
  derivedId: {
    type: "id",
    derived: (c) => c.id,
  },
  derivedAsync: {
    type: "string",
    derived: async () => new Promise((res) => res("test")),
  },
};
const [, Model, NoModel] = useModel(type, "users");
const [,] = useModel(multiKeyType, "users2");
const [,] = useModel(noAutoType, "users3");
const [,] = useModel(foreignType, "comment");
const [,] = useModel(derivedType, "derived");

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
