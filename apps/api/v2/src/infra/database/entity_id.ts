import { Prisma } from '@prisma/client';

let LAST_ENTITY_ID = 0;
const MODELS = new Map(
  Prisma.dmmf.datamodel.models.map((model) => [model.name, model]),
);
const records = (value: unknown): Record<string, unknown>[] =>
  (Array.isArray(value) ? value : [value]).filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === 'object' && !Array.isArray(item),
  );

export const prepare_entity_data = (
  modelName: string,
  value: unknown,
  creating: boolean,
): void => {
  const model = MODELS.get(modelName);
  if (!model) return;
  for (const data of records(value)) {
    if (
      creating &&
      !data.id &&
      model.fields.some(
        (field) => field.name === 'id' && field.type === 'String',
      )
    ) {
      LAST_ENTITY_ID = Math.max(Date.now(), LAST_ENTITY_ID + 1);
      data.id = LAST_ENTITY_ID.toString();
    }
    for (const relation of model.fields.filter(
      (field) => field.kind === 'object' && field.relationName,
    )) {
      for (const operation of records(data[relation.name])) {
        prepare_entity_data(relation.type, operation.create, true);
        for (const batch of records(operation.createMany))
          prepare_entity_data(relation.type, batch.data, true);
        for (const entry of records(operation.connectOrCreate))
          prepare_entity_data(relation.type, entry.create, true);
        for (const entry of records(operation.upsert)) {
          prepare_entity_data(relation.type, entry.create, true);
          prepare_entity_data(relation.type, entry.update, false);
        }
        for (const entry of records(operation.update))
          prepare_entity_data(relation.type, entry.data ?? entry, false);
        for (const entry of records(operation.updateMany))
          prepare_entity_data(relation.type, entry.data, false);
      }
    }
  }
};
