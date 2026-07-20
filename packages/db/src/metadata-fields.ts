import { jstNow } from './utils.js';

export type MetadataFieldType = 'text' | 'number' | 'date' | 'select';

export interface MetadataField {
  id: string;
  field_key: string;
  label: string;
  field_type: MetadataFieldType;
  options: string | null; // JSON array string for 'select'
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function getMetadataFields(
  db: D1Database,
): Promise<MetadataField[]> {
  const result = await db
    .prepare(
      `SELECT * FROM metadata_fields ORDER BY sort_order ASC, created_at ASC`,
    )
    .all<MetadataField>();
  return result.results;
}

export async function getMetadataFieldById(
  db: D1Database,
  id: string,
): Promise<MetadataField | null> {
  return db
    .prepare(`SELECT * FROM metadata_fields WHERE id = ?`)
    .bind(id)
    .first<MetadataField>();
}

export interface CreateMetadataFieldInput {
  fieldKey: string;
  label: string;
  fieldType?: MetadataFieldType;
  options?: string[] | null;
  sortOrder?: number;
}

export async function createMetadataField(
  db: D1Database,
  input: CreateMetadataFieldInput,
): Promise<MetadataField> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const optionsJson =
    input.options && input.options.length > 0
      ? JSON.stringify(input.options)
      : null;
  await db
    .prepare(
      `INSERT INTO metadata_fields
         (id, field_key, label, field_type, options, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.fieldKey,
      input.label,
      input.fieldType ?? 'text',
      optionsJson,
      input.sortOrder ?? 0,
      now,
      now,
    )
    .run();
  return (await getMetadataFieldById(db, id))!;
}

export interface UpdateMetadataFieldInput {
  fieldKey?: string;
  label?: string;
  fieldType?: MetadataFieldType;
  options?: string[] | null;
  sortOrder?: number;
}

export async function updateMetadataField(
  db: D1Database,
  id: string,
  input: UpdateMetadataFieldInput,
): Promise<MetadataField | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.fieldKey !== undefined) {
    fields.push('field_key = ?');
    values.push(input.fieldKey);
  }
  if (input.label !== undefined) {
    fields.push('label = ?');
    values.push(input.label);
  }
  if (input.fieldType !== undefined) {
    fields.push('field_type = ?');
    values.push(input.fieldType);
  }
  if (input.options !== undefined) {
    fields.push('options = ?');
    values.push(
      input.options && input.options.length > 0
        ? JSON.stringify(input.options)
        : null,
    );
  }
  if (input.sortOrder !== undefined) {
    fields.push('sort_order = ?');
    values.push(input.sortOrder);
  }
  if (fields.length > 0) {
    fields.push('updated_at = ?');
    values.push(jstNow());
    await db
      .prepare(`UPDATE metadata_fields SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values, id)
      .run();
  }
  return getMetadataFieldById(db, id);
}

export async function deleteMetadataField(
  db: D1Database,
  id: string,
): Promise<void> {
  await db.prepare(`DELETE FROM metadata_fields WHERE id = ?`).bind(id).run();
}
