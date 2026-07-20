import { jstNow } from './utils.js';
export interface Tag {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface FriendTag {
  friend_id: string;
  tag_id: string;
  assigned_at: string;
}

export async function getTags(db: D1Database): Promise<Tag[]> {
  const result = await db
    .prepare(`SELECT * FROM tags ORDER BY name ASC`)
    .all<Tag>();
  return result.results;
}

export interface CreateTagInput {
  name: string;
  color?: string;
}

export async function createTag(
  db: D1Database,
  input: CreateTagInput,
): Promise<Tag> {
  const id = crypto.randomUUID();
  const now = jstNow();
  const color = input.color ?? '#3B82F6';

  await db
    .prepare(
      `INSERT INTO tags (id, name, color, created_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(id, input.name, color, now)
    .run();

  return (await db
    .prepare(`SELECT * FROM tags WHERE id = ?`)
    .bind(id)
    .first<Tag>())!;
}

export interface UpdateTagInput {
  name?: string;
  color?: string;
}

export async function getTagById(
  db: D1Database,
  id: string,
): Promise<Tag | null> {
  return db.prepare(`SELECT * FROM tags WHERE id = ?`).bind(id).first<Tag>();
}

export async function updateTag(
  db: D1Database,
  id: string,
  input: UpdateTagInput,
): Promise<Tag | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) {
    fields.push('name = ?');
    values.push(input.name);
  }
  if (input.color !== undefined) {
    fields.push('color = ?');
    values.push(input.color);
  }
  if (fields.length > 0) {
    await db
      .prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values, id)
      .run();
  }
  return getTagById(db, id);
}

export async function deleteTag(db: D1Database, id: string): Promise<void> {
  await db.prepare(`DELETE FROM tags WHERE id = ?`).bind(id).run();
}

/**
 * Aggregate every place a tag is referenced, so the admin UI can warn the
 * operator before a destructive delete (or a rename that changes what
 * operators see in scenario/form screens). Covers all FK references to
 * tags(id) in the schema plus the soft reference in
 * scenario_steps.condition_value (tag_exists / tag_not_exists conditions
 * store the tag id as TEXT with no FK, so a delete leaves them dangling).
 */
export interface TagUsage {
  friendsCount: number;
  scenariosAsTrigger: Array<{ id: string; name: string }>;
  scenarioStepsAsCondition: Array<{
    scenarioId: string;
    scenarioName: string;
    stepId: string;
    stepOrder: number;
    conditionType: string;
  }>;
  scenarioStepsAsOnReach: Array<{
    scenarioId: string;
    scenarioName: string;
    stepId: string;
    stepOrder: number;
  }>;
  formsOnSubmit: Array<{ id: string; name: string }>;
  broadcastsAsTarget: Array<{ id: string; title: string; status: string }>;
  trackedLinks: Array<{ id: string; name: string }>;
  entryRoutes: Array<{ id: string; name: string }>;
  menusAutoTag: Array<{ id: string; name: string }>;
}

export async function getTagUsage(
  db: D1Database,
  tagId: string,
): Promise<TagUsage> {
  const [
    friendsCount,
    scenariosAsTrigger,
    stepsAsCondition,
    stepsAsOnReach,
    formsOnSubmit,
    broadcastsAsTarget,
    trackedLinks,
    entryRoutes,
    menusAutoTag,
  ] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM friend_tags WHERE tag_id = ?`)
      .bind(tagId)
      .first<{ cnt: number }>(),
    db
      .prepare(`SELECT id, name FROM scenarios WHERE trigger_tag_id = ?`)
      .bind(tagId)
      .all<{ id: string; name: string }>(),
    db
      .prepare(
        `SELECT st.id AS step_id, st.step_order, st.condition_type,
                s.id AS scenario_id, s.name AS scenario_name
         FROM scenario_steps st
         INNER JOIN scenarios s ON s.id = st.scenario_id
         WHERE st.condition_type IN ('tag_exists', 'tag_not_exists')
           AND st.condition_value = ?
         ORDER BY s.name, st.step_order`,
      )
      .bind(tagId)
      .all<{
        step_id: string;
        step_order: number;
        condition_type: string;
        scenario_id: string;
        scenario_name: string;
      }>(),
    db
      .prepare(
        `SELECT st.id AS step_id, st.step_order,
                s.id AS scenario_id, s.name AS scenario_name
         FROM scenario_steps st
         INNER JOIN scenarios s ON s.id = st.scenario_id
         WHERE st.on_reach_tag_id = ?
         ORDER BY s.name, st.step_order`,
      )
      .bind(tagId)
      .all<{
        step_id: string;
        step_order: number;
        scenario_id: string;
        scenario_name: string;
      }>(),
    db
      .prepare(`SELECT id, name FROM forms WHERE on_submit_tag_id = ?`)
      .bind(tagId)
      .all<{ id: string; name: string }>(),
    db
      .prepare(
        `SELECT id, title, status FROM broadcasts
         WHERE target_tag_id = ? AND status IN ('draft', 'scheduled')`,
      )
      .bind(tagId)
      .all<{ id: string; title: string; status: string }>(),
    db
      .prepare(`SELECT id, name FROM tracked_links WHERE tag_id = ?`)
      .bind(tagId)
      .all<{ id: string; name: string }>(),
    db
      .prepare(`SELECT id, name FROM entry_routes WHERE tag_id = ?`)
      .bind(tagId)
      .all<{ id: string; name: string }>(),
    db
      .prepare(`SELECT id, name FROM menus WHERE auto_tag_id = ?`)
      .bind(tagId)
      .all<{ id: string; name: string }>(),
  ]);

  return {
    friendsCount: friendsCount?.cnt ?? 0,
    scenariosAsTrigger: scenariosAsTrigger.results,
    scenarioStepsAsCondition: stepsAsCondition.results.map((r) => ({
      scenarioId: r.scenario_id,
      scenarioName: r.scenario_name,
      stepId: r.step_id,
      stepOrder: r.step_order,
      conditionType: r.condition_type,
    })),
    scenarioStepsAsOnReach: stepsAsOnReach.results.map((r) => ({
      scenarioId: r.scenario_id,
      scenarioName: r.scenario_name,
      stepId: r.step_id,
      stepOrder: r.step_order,
    })),
    formsOnSubmit: formsOnSubmit.results,
    broadcastsAsTarget: broadcastsAsTarget.results,
    trackedLinks: trackedLinks.results,
    entryRoutes: entryRoutes.results,
    menusAutoTag: menusAutoTag.results,
  };
}

/** Per-tag assigned-friend counts for the tag management list. */
export async function getTagFriendCounts(
  db: D1Database,
): Promise<Record<string, number>> {
  const result = await db
    .prepare(
      `SELECT tag_id, COUNT(*) AS cnt FROM friend_tags GROUP BY tag_id`,
    )
    .all<{ tag_id: string; cnt: number }>();
  const counts: Record<string, number> = {};
  for (const row of result.results) counts[row.tag_id] = row.cnt;
  return counts;
}

export async function addTagToFriend(
  db: D1Database,
  friendId: string,
  tagId: string,
): Promise<void> {
  const now = jstNow();
  await db
    .prepare(
      `INSERT OR IGNORE INTO friend_tags (friend_id, tag_id, assigned_at)
       VALUES (?, ?, ?)`,
    )
    .bind(friendId, tagId, now)
    .run();
}

export async function removeTagFromFriend(
  db: D1Database,
  friendId: string,
  tagId: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM friend_tags WHERE friend_id = ? AND tag_id = ?`,
    )
    .bind(friendId, tagId)
    .run();
}

export async function getFriendTags(
  db: D1Database,
  friendId: string,
): Promise<Tag[]> {
  const result = await db
    .prepare(
      `SELECT t.*
       FROM tags t
       INNER JOIN friend_tags ft ON ft.tag_id = t.id
       WHERE ft.friend_id = ?
       ORDER BY t.name ASC`,
    )
    .bind(friendId)
    .all<Tag>();
  return result.results;
}

import type { Friend } from './friends';

export async function getFriendsByTag(
  db: D1Database,
  tagId: string,
): Promise<Friend[]> {
  const result = await db
    .prepare(
      `SELECT f.*
       FROM friends f
       INNER JOIN friend_tags ft ON ft.friend_id = f.id
       WHERE ft.tag_id = ?
       ORDER BY f.created_at DESC`,
    )
    .bind(tagId)
    .all<Friend>();
  return result.results;
}
