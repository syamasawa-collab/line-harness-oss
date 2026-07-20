import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

vi.mock('@line-crm/db', () => ({
  getTags: vi.fn(),
  createTag: vi.fn(),
  deleteTag: vi.fn(),
  getTagById: vi.fn(),
  updateTag: vi.fn(),
  getTagUsage: vi.fn(),
  getTagFriendCounts: vi.fn(),
}));

import {
  getTags,
  getTagById,
  updateTag,
  getTagUsage,
  getTagFriendCounts,
} from '@line-crm/db';
import { tags } from './tags.js';
import type { Env } from '../index.js';

const TAG = {
  id: 'tag-1',
  name: '既存タグ',
  color: '#3B82F6',
  created_at: '2026-07-20T00:00:00.000',
};

const EMPTY_USAGE = {
  friendsCount: 0,
  scenariosAsTrigger: [],
  scenarioStepsAsCondition: [],
  scenarioStepsAsOnReach: [],
  formsOnSubmit: [],
  broadcastsAsTarget: [],
  trackedLinks: [],
  entryRoutes: [],
  menusAutoTag: [],
};

function makeApp() {
  const app = new Hono<Env>();
  app.route('/', tags);
  return (path: string, init?: RequestInit) =>
    app.fetch(
      new Request(`https://worker.example.com${path}`, init),
      { DB: {} as D1Database } as Env['Bindings'],
    );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/tags?includeCounts=true', () => {
  it('adds friendsCount to each tag', async () => {
    vi.mocked(getTags).mockResolvedValue([TAG]);
    vi.mocked(getTagFriendCounts).mockResolvedValue({ 'tag-1': 42 });
    const res = await makeApp()('/api/tags?includeCounts=true');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Array<{ friendsCount: number }> };
    expect(body.data[0].friendsCount).toBe(42);
  });

  it('defaults missing counts to 0', async () => {
    vi.mocked(getTags).mockResolvedValue([TAG]);
    vi.mocked(getTagFriendCounts).mockResolvedValue({});
    const res = await makeApp()('/api/tags?includeCounts=true');
    const body = (await res.json()) as { data: Array<{ friendsCount: number }> };
    expect(body.data[0].friendsCount).toBe(0);
  });
});

describe('PATCH /api/tags/:id', () => {
  const patch = (id: string, body: unknown) =>
    makeApp()(`/api/tags/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('400 when neither name nor color is given', async () => {
    const res = await patch('tag-1', {});
    expect(res.status).toBe(400);
  });

  it('400 for an empty name', async () => {
    const res = await patch('tag-1', { name: '   ' });
    expect(res.status).toBe(400);
  });

  it('400 for a malformed color', async () => {
    const res = await patch('tag-1', { color: 'red' });
    expect(res.status).toBe(400);
  });

  it('404 for an unknown tag', async () => {
    vi.mocked(getTagById).mockResolvedValue(null);
    const res = await patch('nope', { name: '新名称' });
    expect(res.status).toBe(404);
  });

  it('renames a tag (trimmed) and returns the updated row', async () => {
    vi.mocked(getTagById).mockResolvedValue(TAG);
    vi.mocked(updateTag).mockResolvedValue({ ...TAG, name: '新名称' });
    const res = await patch('tag-1', { name: ' 新名称 ' });
    expect(res.status).toBe(200);
    expect(vi.mocked(updateTag)).toHaveBeenCalledWith({}, 'tag-1', {
      name: '新名称',
      color: undefined,
    });
    const body = (await res.json()) as { data: { name: string } };
    expect(body.data.name).toBe('新名称');
  });

  it('409 when the new name collides with an existing tag (UNIQUE)', async () => {
    vi.mocked(getTagById).mockResolvedValue(TAG);
    vi.mocked(updateTag).mockRejectedValue(
      new Error('D1_ERROR: UNIQUE constraint failed: tags.name'),
    );
    const res = await patch('tag-1', { name: '重複名' });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/tags/:id/usage', () => {
  it('404 for an unknown tag', async () => {
    vi.mocked(getTagById).mockResolvedValue(null);
    const res = await makeApp()('/api/tags/nope/usage');
    expect(res.status).toBe(404);
  });

  it('returns the aggregated usage', async () => {
    vi.mocked(getTagById).mockResolvedValue(TAG);
    vi.mocked(getTagUsage).mockResolvedValue({
      ...EMPTY_USAGE,
      friendsCount: 210,
      scenariosAsTrigger: [{ id: 's1', name: '入会後フォロー' }],
    });
    const res = await makeApp()('/api/tags/tag-1/usage');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { friendsCount: number; scenariosAsTrigger: Array<{ name: string }> };
    };
    expect(body.data.friendsCount).toBe(210);
    expect(body.data.scenariosAsTrigger[0].name).toBe('入会後フォロー');
  });
});
