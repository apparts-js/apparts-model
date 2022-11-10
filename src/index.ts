import { Required, Obj } from "@apparts/types";

import { makeManyModel } from "./manyModel";
import { makeOneModel } from "./oneModel";
import { makeNoneModel } from "./noneModel";
import { makeAnyModel } from "./anyModel";
export * from "./errors";

export const makeBaseModel = <TypeSchema extends Obj<Required, any>>(params: {
  typeSchema: TypeSchema;
  collection: string;
  customManyModel?: <
    CustomManyModel extends ReturnType<typeof makeManyModel<TypeSchema>>
  >(
    ManyModel: ReturnType<typeof makeManyModel<TypeSchema>>
  ) => CustomManyModel;
  customOneModel?: <
    CustomOneModel extends ReturnType<typeof makeOneModel<TypeSchema>>
  >(
    OneModel: ReturnType<typeof makeOneModel<TypeSchema>>
  ) => CustomOneModel;
}) => {
  const AnyModel = makeAnyModel(params);
  const ManyModel = makeManyModel(AnyModel);
  const NoneModel = makeNoneModel(AnyModel);

  return { ManyModel, NoneModel };
};

export const makeModel = <Clazz extends ReturnType<typeof makeManyModel>>(
  Clazz: Clazz
) => {
  const OneModel = makeOneModel(Clazz),
    NoneModel = makeNoneModel(Clazz);

  return [
    Clazz,
    OneModel,
    NoneModel,
    () => [Clazz, OneModel, NoneModel] as const,
  ] as const;
};
