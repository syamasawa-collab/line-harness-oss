import { describe, it, expect } from 'vitest';
import { parseTagRules, resolveTagRules, type TagRule } from './form-tag-rules.js';

const FOOD = 'tag-food';
const NONFOOD = 'tag-nonfood';

// 属性フォームの実運用と同じ形: どちらか一方を付け、もう一方を外す。
const RULES: TagRule[] = [
  { field: 'industry_type', equals: '飲食業', addTagIds: [FOOD], removeTagIds: [NONFOOD] },
  { field: 'industry_type', equals: '非飲食業', addTagIds: [NONFOOD], removeTagIds: [FOOD] },
];

describe('parseTagRules', () => {
  it('returns [] for null / invalid JSON / non-array', () => {
    expect(parseTagRules(null)).toEqual([]);
    expect(parseTagRules('')).toEqual([]);
    expect(parseTagRules('{')).toEqual([]);
    expect(parseTagRules('{"field":"a"}')).toEqual([]);
  });

  it('drops entries missing field/equals instead of throwing', () => {
    const parsed = parseTagRules(
      JSON.stringify([{ field: 'a', equals: 'b' }, { field: 'a' }, null, 'x']),
    );
    expect(parsed).toEqual([{ field: 'a', equals: 'b' }]);
  });
});

describe('resolveTagRules', () => {
  it('adds the matching tag and removes the opposite one', () => {
    expect(resolveTagRules(RULES, { industry_type: '飲食業' })).toEqual({
      addTagIds: [FOOD],
      removeTagIds: [NONFOOD],
    });
  });

  it('follows a changed answer (非飲食 → 飲食) so the stale tag is dropped', () => {
    // 会員情報の編集で属性を変えたケース。旧回答由来の「非飲食」が残らないこと。
    const result = resolveTagRules(RULES, { industry_type: '飲食業' });
    expect(result.addTagIds).toContain(FOOD);
    expect(result.removeTagIds).toContain(NONFOOD);
  });

  it('does nothing when the field is absent or blank', () => {
    expect(resolveTagRules(RULES, {})).toEqual({ addTagIds: [], removeTagIds: [] });
    expect(resolveTagRules(RULES, { industry_type: '' })).toEqual({
      addTagIds: [],
      removeTagIds: [],
    });
  });

  it('matches a checkbox answer when the value is among the selections', () => {
    const rules: TagRule[] = [
      { field: 'interests', equals: '採用', addTagIds: ['tag-hiring'] },
    ];
    expect(resolveTagRules(rules, { interests: ['広報', '採用'] }).addTagIds).toEqual([
      'tag-hiring',
    ]);
    expect(resolveTagRules(rules, { interests: ['広報'] }).addTagIds).toEqual([]);
  });

  it('prefers add over remove when rules conflict', () => {
    const rules: TagRule[] = [
      { field: 'a', equals: '1', addTagIds: ['t'] },
      { field: 'b', equals: '2', removeTagIds: ['t'] },
    ];
    expect(resolveTagRules(rules, { a: '1', b: '2' })).toEqual({
      addTagIds: ['t'],
      removeTagIds: [],
    });
  });
});
