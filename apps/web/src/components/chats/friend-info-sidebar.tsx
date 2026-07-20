'use client'

import { useState, useEffect } from 'react'
import type { Tag } from '@line-crm/shared'
import { api } from '@/lib/api'

interface FriendDetail {
  id: string
  displayName: string | null
  pictureUrl: string | null
  isFollowing: boolean
  metadata: Record<string, unknown>
  refCode: string | null
  createdAt: string
  tags: Array<{ id: string; name: string; color: string }>
}

interface ChatStatusInfo {
  status: 'unread' | 'in_progress' | 'resolved' | null
  notes: string | null
}

interface Props {
  friendId: string | null
  /** 親 (ChatDetail) が持っている chat 側の情報 — status / notes */
  chatStatus?: ChatStatusInfo
  /** 担当者名 (ChatDetail で operatorId → name 変換済を渡す想定) */
  operatorName?: string | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const statusLabels: Record<NonNullable<ChatStatusInfo['status']>, { label: string; className: string }> = {
  unread: { label: '未対応', className: 'bg-red-100 text-red-700' },
  in_progress: { label: '対応中', className: 'bg-yellow-100 text-yellow-700' },
  resolved: { label: '解決済', className: 'bg-green-100 text-green-700' },
}

/** Render a metadata value safely as text. Objects/arrays → JSON, primitives → as-is. */
function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'string') return value || '-'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return '[unparseable]'
  }
}

/** metadata 編集テーブルの1行。value は編集用に文字列化して保持し、
 *  未編集の行は保存時に元の値（original）をそのまま書き戻すことで
 *  オブジェクト/数値などの非文字列値を壊さない。 */
interface MetaRow {
  key: string
  value: string
  original?: unknown
  dirty: boolean
}

function toMetaRows(metadata: Record<string, unknown>): MetaRow[] {
  return Object.entries(metadata).map(([key, value]) => ({
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value) ?? '',
    original: value,
    dirty: false,
  }))
}

export default function FriendInfoSidebar({ friendId, chatStatus, operatorName }: Props) {
  const [friend, setFriend] = useState<FriendDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // --- タグ編集 ---
  const [editingTags, setEditingTags] = useState(false)
  const [allTags, setAllTags] = useState<Tag[]>([])
  const [selectedTagId, setSelectedTagId] = useState('')
  const [tagBusy, setTagBusy] = useState(false)
  const [tagError, setTagError] = useState('')

  // --- metadata 編集 ---
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaRows, setMetaRows] = useState<MetaRow[]>([])
  const [metaBusy, setMetaBusy] = useState(false)
  const [metaError, setMetaError] = useState('')

  const refreshFriend = async () => {
    if (!friendId) return
    const res = await api.friends.get(friendId)
    if (res.success && res.data) setFriend(res.data as unknown as FriendDetail)
  }

  const startTagEdit = async () => {
    setEditingTags(true)
    setTagError('')
    try {
      const res = await api.tags.list()
      if (res.success) setAllTags(res.data)
    } catch {
      setTagError('タグ一覧の取得に失敗しました')
    }
  }

  const handleAddTag = async () => {
    if (!friendId || !selectedTagId) return
    setTagBusy(true)
    setTagError('')
    try {
      await api.friends.addTag(friendId, selectedTagId)
      setSelectedTagId('')
      await refreshFriend()
    } catch {
      setTagError('タグの追加に失敗しました')
    } finally {
      setTagBusy(false)
    }
  }

  const handleRemoveTag = async (tagId: string) => {
    if (!friendId) return
    setTagBusy(true)
    setTagError('')
    try {
      await api.friends.removeTag(friendId, tagId)
      await refreshFriend()
    } catch {
      setTagError('タグの削除に失敗しました')
    } finally {
      setTagBusy(false)
    }
  }

  const startMetaEdit = () => {
    setMetaRows(toMetaRows(friend?.metadata ?? {}))
    setMetaError('')
    setEditingMeta(true)
  }

  const handleMetaSave = async () => {
    if (!friendId) return
    const keys = metaRows.map((r) => r.key.trim())
    if (keys.some((k) => k === '')) {
      setMetaError('キー名が空の行があります')
      return
    }
    if (new Set(keys).size !== keys.length) {
      setMetaError('キー名が重複しています')
      return
    }
    const next: Record<string, unknown> = {}
    for (const row of metaRows) {
      // 未編集の行は元の値をそのまま維持（非文字列値を文字列化しない）
      next[row.key.trim()] =
        !row.dirty && row.original !== undefined ? row.original : row.value
    }
    setMetaBusy(true)
    setMetaError('')
    try {
      // 全置換で送信 — 行の削除（キー削除）はマージでは反映できないため
      const res = await api.friends.updateMetadata(friendId, next, { replace: true })
      if (res.success && res.data) {
        setFriend(res.data as unknown as FriendDetail)
        setEditingMeta(false)
      } else {
        setMetaError('保存に失敗しました')
      }
    } catch {
      setMetaError('保存に失敗しました')
    } finally {
      setMetaBusy(false)
    }
  }

  useEffect(() => {
    // 友だちが切り替わったら編集状態を破棄する
    setEditingTags(false)
    setSelectedTagId('')
    setTagError('')
    setEditingMeta(false)
    setMetaError('')
    if (!friendId) {
      setFriend(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    api.friends.get(friendId).then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        setFriend(res.data as unknown as FriendDetail)
      } else {
        setError((res as { error?: string }).error ?? '友だち情報を取得できませんでした')
      }
    }).catch((err) => {
      if (cancelled) return
      setError(err instanceof Error ? err.message : String(err))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [friendId])

  // リッチメニュー — loading / error / data を区別して、null=未設定 を取得失敗と
  // 混同しないようにする。Codex review (P3) の指摘で導入。
  type RichMenuState =
    | { kind: 'loading' }
    | { kind: 'error' }
    | { kind: 'data'; id: string | null; name: string | null; isDefault: boolean }
  const [richMenu, setRichMenu] = useState<RichMenuState>({ kind: 'loading' })

  useEffect(() => {
    if (!friendId) {
      setRichMenu({ kind: 'loading' })
      return
    }
    let cancelled = false
    setRichMenu({ kind: 'loading' })
    api.friends.richMenu(friendId).then((res) => {
      if (cancelled) return
      if (res.success && res.data) {
        setRichMenu({ kind: 'data', ...res.data })
      } else {
        setRichMenu({ kind: 'error' })
      }
    }).catch(() => {
      if (cancelled) return
      setRichMenu({ kind: 'error' })
    })
    return () => { cancelled = true }
  }, [friendId])

  if (!friendId) return null

  return (
    <div className="w-full lg:w-80 lg:flex-shrink-0 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">友だち詳細</h3>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-3 animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-32" />
                <div className="h-2 bg-gray-100 rounded w-20" />
              </div>
            </div>
          </div>
        ) : error ? (
          <div className="p-4 text-xs text-red-600">{error}</div>
        ) : friend ? (
          <div className="divide-y divide-gray-100">
            {/* Profile Header */}
            <div className="p-4 flex items-start gap-3">
              {friend.pictureUrl ? (
                <img src={friend.pictureUrl} alt="" className="w-12 h-12 rounded-full flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-gray-500 text-base">{(friend.displayName || '?').charAt(0)}</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 truncate">{friend.displayName || '名前なし'}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  登録日: {formatDate(friend.createdAt)}
                </p>
                {!friend.isFollowing && (
                  <span className="inline-block mt-1 px-1.5 py-0 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                    ブロック済
                  </span>
                )}
              </div>
            </div>

            {/* Status / Operator */}
            {(chatStatus?.status || operatorName) && (
              <div className="p-4 space-y-2">
                {chatStatus?.status && statusLabels[chatStatus.status] && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-gray-500">対応状況</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusLabels[chatStatus.status].className}`}>
                      {statusLabels[chatStatus.status].label}
                    </span>
                  </div>
                )}
                {operatorName && (
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] text-gray-500">担当者</span>
                    <span className="text-xs text-gray-700">{operatorName}</span>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {chatStatus?.notes && (
              <div className="p-4">
                <h4 className="text-[11px] font-medium text-gray-500 mb-1.5">個別メモ</h4>
                <p className="text-xs text-gray-700 whitespace-pre-wrap break-words">{chatStatus.notes}</p>
              </div>
            )}

            {/* Tags */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-[11px] font-medium text-gray-500">タグ</h4>
                <button
                  type="button"
                  onClick={() => (editingTags ? setEditingTags(false) : startTagEdit())}
                  className="text-[10px] text-blue-600 hover:text-blue-800 underline"
                >
                  {editingTags ? '完了' : '編集'}
                </button>
              </div>
              {friend.tags.length === 0 && !editingTags ? (
                <p className="text-[11px] text-gray-400 italic">タグなし</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {friend.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                      }}
                    >
                      {tag.name}
                      {editingTags && (
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(tag.id)}
                          disabled={tagBusy}
                          aria-label={`${tag.name} を外す`}
                          className="hover:opacity-70 disabled:opacity-40 leading-none"
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {editingTags && (
                <div className="mt-2 flex items-center gap-1.5">
                  <select
                    value={selectedTagId}
                    onChange={(e) => setSelectedTagId(e.target.value)}
                    className="flex-1 min-w-0 text-[11px] border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                  >
                    <option value="">タグを選択...</option>
                    {allTags
                      .filter((t) => !friend.tags.some((ft) => ft.id === t.id))
                      .map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddTag}
                    disabled={!selectedTagId || tagBusy}
                    className="px-2 py-1 text-[11px] font-medium rounded text-white disabled:opacity-50"
                    style={{ backgroundColor: '#06C755' }}
                  >
                    追加
                  </button>
                </div>
              )}
              {tagError && (
                <p className="mt-1.5 text-[10px] text-red-600">{tagError}</p>
              )}
            </div>

            {/* Rich Menu */}
            <div className="p-4">
              <h4 className="text-[11px] font-medium text-gray-500 mb-1.5">リッチメニュー</h4>
              {richMenu.kind === 'loading' ? (
                <p className="text-[11px] text-gray-400 italic">読み込み中...</p>
              ) : richMenu.kind === 'error' ? (
                <p className="text-[11px] text-red-500 italic">取得に失敗しました</p>
              ) : richMenu.id === null ? (
                <p className="text-[11px] text-gray-400 italic">未設定</p>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-700">{richMenu.name ?? '(名前なし)'}</span>
                  {richMenu.isDefault && (
                    <span className="px-1.5 py-0 rounded text-[10px] font-medium bg-gray-100 text-gray-500">
                      デフォルト
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Metadata custom fields */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-[11px] font-medium text-gray-500">友だち情報</h4>
                {!editingMeta && (
                  <button
                    type="button"
                    onClick={startMetaEdit}
                    className="text-[10px] text-blue-600 hover:text-blue-800 underline"
                  >
                    編集
                  </button>
                )}
              </div>

              {editingMeta ? (
                <div className="space-y-2">
                  {metaRows.map((row, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <div className="flex-1 min-w-0 space-y-1">
                        <input
                          type="text"
                          value={row.key}
                          onChange={(e) => {
                            const rows = [...metaRows]
                            rows[i] = { ...rows[i], key: e.target.value }
                            setMetaRows(rows)
                          }}
                          placeholder="キー名"
                          className="w-full text-[11px] border border-gray-300 rounded px-1.5 py-1 font-mono focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                        <input
                          type="text"
                          value={row.value}
                          onChange={(e) => {
                            const rows = [...metaRows]
                            rows[i] = { ...rows[i], value: e.target.value, dirty: true }
                            setMetaRows(rows)
                          }}
                          placeholder="値"
                          className="w-full text-[11px] border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setMetaRows(metaRows.filter((_, j) => j !== i))}
                        aria-label="項目を削除"
                        className="mt-1 px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 rounded"
                      >
                        削除
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => setMetaRows([...metaRows, { key: '', value: '', dirty: true }])}
                    className="text-[11px] text-green-600 hover:text-green-700 font-medium"
                  >
                    ＋ 項目を追加
                  </button>

                  {metaError && (
                    <p className="text-[10px] text-red-600">{metaError}</p>
                  )}

                  <div className="flex items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={handleMetaSave}
                      disabled={metaBusy}
                      className="px-2.5 py-1 text-[11px] font-medium rounded text-white disabled:opacity-50"
                      style={{ backgroundColor: '#06C755' }}
                    >
                      {metaBusy ? '保存中...' : '保存'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingMeta(false)}
                      disabled={metaBusy}
                      className="px-2.5 py-1 text-[11px] font-medium rounded text-gray-600 bg-gray-100 hover:bg-gray-200"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              ) : friend.metadata && Object.keys(friend.metadata).length > 0 ? (
                <dl className="space-y-2 text-xs">
                  {Object.entries(friend.metadata).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-[10px] text-gray-400 uppercase tracking-wide">{key}</dt>
                      <dd className="text-gray-700 mt-0.5 whitespace-pre-wrap break-words">{renderValue(value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-[11px] text-gray-400 italic">項目なし</p>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 text-xs text-gray-400">友だち情報がありません</div>
        )}
      </div>
    </div>
  )
}
