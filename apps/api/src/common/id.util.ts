import { randomUUID } from 'node:crypto';

/** Basit UUID üretici (in-memory iskelet için; üretimde DB gen_random_uuid()). */
export const newId = (): string => randomUUID();
