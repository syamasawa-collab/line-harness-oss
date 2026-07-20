import { Hono } from 'hono';
import {
  getTags,
  createTag,
  deleteTag,
  getTagById,
  updateTag,
  getTagUsage,
  getTagFriendCounts,
} from '@line-crm/db';
import type { Tag as DbTag } from '@line-crm/db';
import type { Env } from '../index.js';

const tags = new Hono<Env>();

function serializeTag(row: DbTag) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

// GET /api/tags - list all tags
// ?includeCounts=true adds friendsCount (assigned friends) to each tag,
// used by the tag management page.
tags.get('/api/tags', async (c) => {
  try {
    const items = await getTags(c.env.DB);
    if (c.req.query('includeCounts') === 'true') {
      const counts = await getTagFriendCounts(c.env.DB);
      return c.json({
        success: true,
        data: items.map((t) => ({
          ...serializeTag(t),
          friendsCount: counts[t.id] ?? 0,
        })),
      });
    }
    return c.json({ success: true, data: items.map(serializeTag) });
  } catch (err) {
    console.error('GET /api/tags error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/tags - create tag
tags.post('/api/tags', async (c) => {
  try {
    const body = await c.req.json<{ name: string; color?: string }>();

    if (!body.name) {
      return c.json({ success: false, error: 'name is required' }, 400);
    }

    const tag = await createTag(c.env.DB, {
      name: body.name,
      color: body.color,
    });

    return c.json({ success: true, data: serializeTag(tag) }, 201);
  } catch (err) {
    console.error('POST /api/tags error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// PATCH /api/tags/:id - rename tag and/or change color.
// References elsewhere are by UUID, so a rename never breaks scenario/form
// logic — only the displayed name changes.
tags.patch('/api/tags/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json<{ name?: string; color?: string }>();

    if (body.name === undefined && body.color === undefined) {
      return c.json(
        { success: false, error: 'name or color is required' },
        400,
      );
    }
    if (body.name !== undefined && body.name.trim() === '') {
      return c.json({ success: false, error: 'name must not be empty' }, 400);
    }
    if (
      body.color !== undefined &&
      !/^#[0-9A-Fa-f]{6}$/.test(body.color)
    ) {
      return c.json(
        { success: false, error: 'color must be a #RRGGBB hex value' },
        400,
      );
    }

    const existing = await getTagById(c.env.DB, id);
    if (!existing) {
      return c.json({ success: false, error: 'Tag not found' }, 404);
    }

    const updated = await updateTag(c.env.DB, id, {
      name: body.name?.trim(),
      color: body.color,
    });
    return c.json({ success: true, data: serializeTag(updated!) });
  } catch (err) {
    // tags.name is UNIQUE — surface a conflict instead of a 500.
    if (err instanceof Error && /UNIQUE/i.test(err.message)) {
      return c.json(
        { success: false, error: 'A tag with this name already exists' },
        409,
      );
    }
    console.error('PATCH /api/tags/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// GET /api/tags/:id/usage - everywhere this tag is referenced, for the
// impact alert shown before delete/rename.
tags.get('/api/tags/:id/usage', async (c) => {
  try {
    const id = c.req.param('id');
    const existing = await getTagById(c.env.DB, id);
    if (!existing) {
      return c.json({ success: false, error: 'Tag not found' }, 404);
    }
    const usage = await getTagUsage(c.env.DB, id);
    return c.json({ success: true, data: usage });
  } catch (err) {
    console.error('GET /api/tags/:id/usage error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// DELETE /api/tags/:id - delete tag
tags.delete('/api/tags/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await deleteTag(c.env.DB, id);
    return c.json({ success: true, data: null });
  } catch (err) {
    console.error('DELETE /api/tags/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { tags };
