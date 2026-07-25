import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression coverage: タグの自動付与は tag_added シナリオを起動しなければならない。
 *
 * フォーム送信 (on_submit_tag_id) とシナリオの到達タグ (on_reach_tag_id) は
 * 以前どちらも生 INSERT (addTagToFriend) を呼んでいたため、tag_added を
 * トリガーにしたシナリオが**黙って起動しなかった**。「フォームやシナリオで
 * タグを付け、そのタグで次のシナリオを走らせる」という基本的な組み方が
 * 動かず、症状は「配信が来ない」だけでエラーも出ないため発見が難しい。
 * この契約をテストで固定する。
 */

const enrollMock = vi.fn();
const getScenariosMock = vi.fn();
const fireEventMock = vi.fn();

vi.mock('@line-crm/db', () => ({
  getScenarios: (...args: unknown[]) => getScenariosMock(...args),
  enrollFriendInScenario: (...args: unknown[]) => enrollMock(...args),
  jstNow: () => '2026-07-25T00:00:00+09:00',
}));

vi.mock('./event-bus.js', () => ({
  fireEvent: (...args: unknown[]) => fireEventMock(...args),
}));

const { attachTagAndFireSideEffects } = await import('./friend-tag-attach.js');

/** insertChanges: INSERT OR IGNORE が実際に行を追加したか（=新規付与か） */
function mockDb(insertChanges: number): D1Database {
  return {
    prepare: () => ({
      bind: () => ({
        run: async () => ({ meta: { changes: insertChanges } }),
        first: async () => null, // 既存 enrollment なし
      }),
    }),
  } as unknown as D1Database;
}

const TAG = 'tag-food';
const FRIEND = 'friend-1';

describe('attachTagAndFireSideEffects', () => {
  beforeEach(() => {
    enrollMock.mockReset();
    getScenariosMock.mockReset();
    fireEventMock.mockReset();
  });

  it('新規付与なら、そのタグを待っている tag_added シナリオに登録する', async () => {
    getScenariosMock.mockResolvedValue([
      { id: 'scenario-survey', trigger_type: 'tag_added', is_active: true, trigger_tag_id: TAG },
    ]);

    const result = await attachTagAndFireSideEffects(mockDb(1), FRIEND, TAG);

    expect(result).toEqual({ added: true });
    expect(enrollMock).toHaveBeenCalledTimes(1);
    expect(enrollMock).toHaveBeenCalledWith(expect.anything(), FRIEND, 'scenario-survey');
    expect(fireEventMock).toHaveBeenCalledWith(expect.anything(), 'tag_change', {
      friendId: FRIEND,
      eventData: { tagId: TAG, action: 'add' },
    });
  });

  it('すでに付いているタグなら何も起動しない（再送・再送信で冪等）', async () => {
    getScenariosMock.mockResolvedValue([
      { id: 'scenario-survey', trigger_type: 'tag_added', is_active: true, trigger_tag_id: TAG },
    ]);

    const result = await attachTagAndFireSideEffects(mockDb(0), FRIEND, TAG);

    expect(result).toEqual({ added: false });
    expect(enrollMock).not.toHaveBeenCalled();
    expect(fireEventMock).not.toHaveBeenCalled();
  });

  it('別のタグ・停止中・trigger 種別違いのシナリオは起動しない', async () => {
    getScenariosMock.mockResolvedValue([
      { id: 'other-tag', trigger_type: 'tag_added', is_active: true, trigger_tag_id: 'tag-nonfood' },
      { id: 'inactive', trigger_type: 'tag_added', is_active: false, trigger_tag_id: TAG },
      { id: 'friend-add', trigger_type: 'friend_add', is_active: true, trigger_tag_id: TAG },
    ]);

    await attachTagAndFireSideEffects(mockDb(1), FRIEND, TAG);

    expect(enrollMock).not.toHaveBeenCalled();
  });
});
