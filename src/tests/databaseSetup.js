export const SETUPDB = `
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

CREATE TABLE wdefault (
  id SERIAL PRIMARY KEY,
  "hasDefault" INT NOT NULL,
  "hasDefaultFn" INT NOT NULL,
  "objWithDefault" JSON NOT NULL
);
`;
