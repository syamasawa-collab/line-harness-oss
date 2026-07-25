import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression coverage: フォームの中間保存 (`POST /api/forms/:id/partial`) は
 * `saveToMetadata` が false のフォームでは友だちの metadata に書いてはいけない。
 *
 * 以前このエンドポイントはフォームの設定を読まず、無条件に
 * `UPDATE friends SET metadata = ...` していた。そのため
 * 「アンケートの回答を友だち詳細に出さないでほしい」という要望に対して
 * `saveToMetadata` を false にしても、ページ分割されたフォームでは
 * 回答が friends.metadata に入り続ける。送信時 (`/submit`) の挙動と
 * 食い違うため気づきにくい。この契約をテストで固定する。
 */

const getFormByIdMock = vi.fn();
const getFriendByIdMock = vi.fn();

vi.mock('@line-crm/db', () => ({
  getForms: vi.fn(),
  getFormsWithStats: vi.fn(),
  getFormById: (...args: unknown[]) => getFormByIdMock(...args),
  createForm: vi.fn(),
  updateForm: vi.fn(),
  deleteForm: vi.fn(),
  getFormSubmissions: vi.fn(),
  createFormSubmission: vi.fn(),
  jstNow: () => '2026-07-25T00:00:00+09:00',
  getFriendByLineUserId: vi.fn(),
  getFriendById: (...args: unknown[]) => getFriendByIdMock(...args),
  enrollFriendInScenario: vi.fn(),
}));

vi.mock('../services/event-bus.js', () => ({
  fireEvent: vi.fn(),
}));

const { forms } = await import('./forms.js');

const FORM_ID = 'form-1';
const FRIEND_ID = 'friend-1';

/** metadata の UPDATE が走ったかを記録する DB スタブ */
function mockDb() {
  const statements: string[] = [];
  const db = {
    prepare: (sql: string) => {
      statements.push(sql);
      return {
        bind: () => ({
          run: async () => ({ meta: { changes: 1 } }),
          first: async () => null,
          all: async () => ({ results: [] }),
        }),
      };
    },
  } as unknown as D1Database;
  return { db, statements };
}

function postPartial(db: D1Database) {
  return forms.request(
    `/api/forms/${FORM_ID}/partial`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendId: FRIEND_ID, data: { likert_a: '5' } }),
    },
    { DB: db },
  );
}

describe('POST /api/forms/:id/partial の metadata 保存', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getFriendByIdMock.mockResolvedValue({ id: FRIEND_ID, metadata: '{}' });
  });

  it('saveToMetadata が false のフォームでは friends.metadata を更新しない', async () => {
    getFormByIdMock.mockResolvedValue({ id: FORM_ID, save_to_metadata: 0 });
    const { db, statements } = mockDb();

    const res = await postPartial(db);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { savedToMetadata: false } });
    expect(statements.some((sql) => /UPDATE friends SET metadata/.test(sql))).toBe(false);
  });

  it('metadataFields があればその項目だけを保存する', async () => {
    getFormByIdMock.mockResolvedValue({
      id: FORM_ID,
      save_to_metadata: 1,
      metadata_fields: '["respondent_name"]',
    });
    const { db, statements } = mockDb();

    const res = await forms.request(
      `/api/forms/${FORM_ID}/partial`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          friendId: FRIEND_ID,
          data: { likert_a: '5', respondent_name: '山澤修平' },
        }),
      },
      { DB: db },
    );

    expect(await res.json()).toMatchObject({
      success: true,
      data: { savedToMetadata: true, savedKeys: ['respondent_name'] },
    });
    expect(statements.some((sql) => /UPDATE friends SET metadata/.test(sql))).toBe(true);
  });

  it('metadataFields に該当しない回答だけの送信では保存しない', async () => {
    getFormByIdMock.mockResolvedValue({
      id: FORM_ID,
      save_to_metadata: 1,
      metadata_fields: '["respondent_name"]',
    });
    const { db, statements } = mockDb();

    const res = await postPartial(db);

    expect(await res.json()).toMatchObject({ success: true, data: { savedToMetadata: false } });
    expect(statements.some((sql) => /UPDATE friends SET metadata/.test(sql))).toBe(false);
  });

  it('saveToMetadata が true で metadataFields 未設定なら従来どおり保存する', async () => {
    getFormByIdMock.mockResolvedValue({ id: FORM_ID, save_to_metadata: 1 });
    const { db, statements } = mockDb();

    const res = await postPartial(db);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { savedToMetadata: true } });
    expect(statements.some((sql) => /UPDATE friends SET metadata/.test(sql))).toBe(true);
  });
});
