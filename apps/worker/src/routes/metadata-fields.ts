import { Hono } from 'hono';
import {
  getMetadataFields,
  getMetadataFieldById,
  createMetadataField,
  updateMetadataField,
  deleteMetadataField,
} from '@line-crm/db';
import type { MetadataField as DbMetadataField, MetadataFieldType } from '@line-crm/db';
import type { Env } from '../index.js';

const metadataFields = new Hono<Env>();

const VALID_TYPES: MetadataFieldType[] = ['text', 'number', 'date', 'select'];
// metadata のキーとして安全な文字だけ許可（JSON キー・SQL 参照で扱いやすくする）。
const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function serialize(row: DbMetadataField) {
  let options: string[] = [];
  if (row.options) {
    try {
      const parsed = JSON.parse(row.options);
      if (Array.isArray(parsed)) options = parsed.map(String);
    } catch {
      options = [];
    }
  }
  return {
    id: row.id,
    fieldKey: row.field_key,
    label: row.label,
    fieldType: row.field_type,
    options,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// GET /api/metadata-fields - list field definitions
metadataFields.get('/api/metadata-fields', async (c) => {
  try {
    const items = await getMetadataFields(c.env.DB);
    return c.json({ success: true, data: items.map(serialize) });
  } catch (err) {
    console.error('GET /api/metadata-fields error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/metadata-fields - create field definition
metadataFields.post('/api/metadata-fields', async (c) => {
  try {
    const body = await c.req.json<{
      fieldKey?: string;
      label?: string;
      fieldType?: string;
      options?: string[];
      sortOrder?: number;
    }>();

    const fieldKey = (body.fieldKey ?? '').trim();
    const label = (body.label ?? '').trim();
    if (!fieldKey || !label) {
      return c.json({ success: false, error: 'fieldKey and label are required' }, 400);
    }
    if (!KEY_PATTERN.test(fieldKey)) {
      return c.json(
        { success: false, error: 'fieldKey must be alphanumeric/underscore and start with a letter or underscore' },
        400,
      );
    }
    const fieldType = (body.fieldType ?? 'text') as MetadataFieldType;
    if (!VALID_TYPES.includes(fieldType)) {
      return c.json({ success: false, error: 'invalid fieldType' }, 400);
    }

    const field = await createMetadataField(c.env.DB, {
      fieldKey,
      label,
      fieldType,
      options: fieldType === 'select' ? body.options ?? [] : null,
      sortOrder: body.sortOrder,
    });
    return c.json({ success: true, data: serialize(field) }, 201);
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      return c.json({ success: false, error: 'A field with this key already exists' }, 409);
    }
    console.error('POST /api/metadata-fields error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/metadata-fields/:id - update field definition
metadataFields.patch('/api/metadata-fields/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{
      fieldKey?: string;
      label?: string;
      fieldType?: string;
      options?: string[];
      sortOrder?: number;
    }>();

    const existing = await getMetadataFieldById(c.env.DB, id);
    if (!existing) {
      return c.json({ success: false, error: 'Field not found' }, 404);
    }

    if (body.fieldKey !== undefined && !KEY_PATTERN.test(body.fieldKey.trim())) {
      return c.json(
        { success: false, error: 'fieldKey must be alphanumeric/underscore and start with a letter or underscore' },
        400,
      );
    }
    if (body.label !== undefined && body.label.trim() === '') {
      return c.json({ success: false, error: 'label must not be empty' }, 400);
    }
    if (body.fieldType !== undefined && !VALID_TYPES.includes(body.fieldType as MetadataFieldType)) {
      return c.json({ success: false, error: 'invalid fieldType' }, 400);
    }

    const updated = await updateMetadataField(c.env.DB, id, {
      fieldKey: body.fieldKey?.trim(),
      label: body.label?.trim(),
      fieldType: body.fieldType as MetadataFieldType | undefined,
      options: body.options,
      sortOrder: body.sortOrder,
    });
    return c.json({ success: true, data: serialize(updated!) });
  } catch (err) {
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      return c.json({ success: false, error: 'A field with this key already exists' }, 409);
    }
    console.error('PATCH /api/metadata-fields/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/metadata-fields/:id - delete field definition.
// 定義を消しても、各友だちの metadata に既に入っている値は残る（値の実体は
// friends.metadata にあり、このテーブルは「項目の定義」だけを管理するため）。
metadataFields.delete('/api/metadata-fields/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await deleteMetadataField(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/metadata-fields/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { metadataFields };
