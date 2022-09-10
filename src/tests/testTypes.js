import { int, obj, string, email } from "@apparts/types";

export const type = obj({
  id: int().semantic("id").key().auto(),
  test: int(),
  a: int().optional(),
});
export const multiKeyType = obj({
  id: int().semantic("id").key().auto(),
  test: int().key(),
  a: int().optional(),
});
export const noAutoType = obj({
  email: email().key(),
  name: string().key(),
  a: int().optional(),
});
export const foreignType = obj({
  id: int().semantic("id").key().auto(),
  userid: int().semantic("id").key(),
  comment: string().optional(),
});
export const derivedType = obj({
  id: int().semantic("id").key().auto(),
  test: int().public(),
  derivedId: int()
    .semantic("id")
    .public()
    .derived((c) => c.id),
  derivedAsync: string()
    .public()
    .derived(async () => new Promise((res) => res("test"))),
});
