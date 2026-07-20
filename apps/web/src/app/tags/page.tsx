'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type { TagWithCount, TagUsage } from '@/lib/api'
import Header from '@/components/layout/header'

const DEFAULT_COLOR = '#3B82F6'

type ModalState =
  | { kind: 'none' }
  | { kind: 'edit'; tag: TagWithCount }
  | { kind: 'delete'; tag: TagWithCount }

export default function TagsPage() {
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // 新規作成フォーム
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(DEFAULT_COLOR)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [modal, setModal] = useState<ModalState>({ kind: 'none' })

  const loadTags = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.tags.listWithCounts()
      if (res.success) {
        setTags(res.data)
      } else {
        setError(res.error)
      }
    } catch {
      setError('タグの読み込みに失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTags()
  }, [loadTags])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    if (tags.some((t) => t.name === name)) {
      setCreateError('同じ名前のタグが既にあります')
      return
    }
    setCreating(true)
    setCreateError('')
    try {
      await api.tags.create({ name, color: newColor })
      setNewName('')
      setNewColor(DEFAULT_COLOR)
      await loadTags()
    } catch {
      setCreateError('タグの作成に失敗しました')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <Header
        title="タグ管理"
        description="タグの作成・名前変更・削除ができます。削除や名前変更の前に、使用中のシナリオ・フォーム・付与人数を確認できます。"
      />

      {/* 新規作成 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setCreateError('') }}
            placeholder="新しいタグ名"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <label className="flex items-center gap-2 text-xs text-gray-600">
            色:
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-9 h-9 p-0.5 border border-gray-300 rounded cursor-pointer"
            />
          </label>
          <button
            type="submit"
            disabled={!newName.trim() || creating}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {creating ? '作成中...' : 'タグを作成'}
          </button>
        </form>
        {createError && (
          <p className="mt-2 text-xs text-red-600">{createError}</p>
        )}
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* 一覧 */}
      {loading ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 border-b border-gray-100 flex items-center gap-3 animate-pulse">
              <div className="w-4 h-4 rounded bg-gray-200" />
              <div className="h-3 bg-gray-200 rounded w-40" />
              <div className="h-3 bg-gray-100 rounded w-16 ml-auto" />
            </div>
          ))}
        </div>
      ) : tags.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500">タグがまだありません。上のフォームから作成できます。</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="hidden sm:grid grid-cols-[minmax(200px,1fr)_120px_100px_160px] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
            <div>タグ</div>
            <div>付与人数</div>
            <div>色</div>
            <div className="text-right">操作</div>
          </div>
          {tags.map((tag) => (
            <div
              key={tag.id}
              className="grid grid-cols-1 sm:grid-cols-[minmax(200px,1fr)_120px_100px_160px] gap-2 sm:gap-3 px-4 py-3 border-b border-gray-100 items-center"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium truncate"
                  style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                >
                  {tag.name}
                </span>
              </div>
              <div className="text-sm text-gray-700">
                {tag.friendsCount.toLocaleString('ja-JP')}人
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className="w-3.5 h-3.5 rounded-full inline-block border border-gray-200" style={{ backgroundColor: tag.color }} />
                {tag.color}
              </div>
              <div className="flex items-center gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setModal({ kind: 'edit', tag })}
                  className="px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
                >
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => setModal({ kind: 'delete', tag })}
                  className="px-3 py-1.5 text-xs font-medium border border-red-200 text-red-600 rounded-lg bg-white hover:bg-red-50"
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.kind === 'edit' && (
        <TagEditModal
          tag={modal.tag}
          existingNames={tags.filter((t) => t.id !== modal.tag.id).map((t) => t.name)}
          onClose={() => setModal({ kind: 'none' })}
          onSaved={() => { setModal({ kind: 'none' }); loadTags() }}
        />
      )}
      {modal.kind === 'delete' && (
        <TagDeleteModal
          tag={modal.tag}
          onClose={() => setModal({ kind: 'none' })}
          onDeleted={() => { setModal({ kind: 'none' }); loadTags() }}
        />
      )}
    </div>
  )
}

/** タグの使用箇所一覧。編集(rename)と削除の両モーダルで共用する。 */
function UsageSummary({ usage, mode }: { usage: TagUsage; mode: 'edit' | 'delete' }) {
  const sections: Array<{ label: string; items: string[]; danger?: boolean }> = [
    {
      label: '付与されている友だち',
      items: usage.friendsCount > 0 ? [`${usage.friendsCount.toLocaleString('ja-JP')}人`] : [],
      danger: true,
    },
    {
      label: '起動タグにしているシナリオ（削除すると発火しなくなります）',
      items: usage.scenariosAsTrigger.map((s) => s.name),
      danger: true,
    },
    {
      label: '配信条件に使っているシナリオステップ',
      items: usage.scenarioStepsAsCondition.map(
        (s) => `${s.scenarioName} / ステップ${s.stepOrder}（${s.conditionType === 'tag_exists' ? 'タグあり条件' : 'タグなし条件'}）`,
      ),
      danger: true,
    },
    {
      label: '到達時にこのタグを付与するステップ',
      items: usage.scenarioStepsAsOnReach.map((s) => `${s.scenarioName} / ステップ${s.stepOrder}`),
    },
    {
      label: '送信時にこのタグを付与するフォーム',
      items: usage.formsOnSubmit.map((f) => f.name),
    },
    {
      label: 'このタグを対象にしている配信（下書き・予約）',
      items: usage.broadcastsAsTarget.map((b) => `${b.title}（${b.status === 'scheduled' ? '予約済み' : '下書き'}）`),
      danger: true,
    },
    {
      label: 'クリック時にこのタグを付与するトラッキングリンク',
      items: usage.trackedLinks.map((l) => l.name),
    },
    {
      label: '流入経路（このタグを自動付与）',
      items: usage.entryRoutes.map((r) => r.name),
    },
    {
      label: '予約メニュー（このタグを自動付与）',
      items: usage.menusAutoTag.map((m) => m.name),
    },
  ]
  const nonEmpty = sections.filter((s) => s.items.length > 0)

  if (nonEmpty.length === 0) {
    return (
      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
        このタグはどこからも使用されていません。{mode === 'delete' ? '安全に削除できます。' : ''}
      </p>
    )
  }

  return (
    <div className={`rounded-lg p-3 text-xs space-y-2 ${mode === 'delete' ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'}`}>
      <p className={`font-semibold ${mode === 'delete' ? 'text-red-700' : 'text-yellow-800'}`}>
        {mode === 'delete'
          ? 'このタグは以下で使用されています。削除すると、これらの参照は解除・無効化されます。'
          : 'このタグは以下で使用されています。名前を変えても動作は維持されますが、これらの画面での表示名が変わります。'}
      </p>
      {nonEmpty.map((s) => (
        <div key={s.label}>
          <p className="font-medium text-gray-700">{s.label}</p>
          <ul className="mt-0.5 list-disc list-inside text-gray-600 space-y-0.5">
            {s.items.map((item, i) => (
              <li key={i} className="break-all">{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function useTagUsage(tagId: string) {
  const [usage, setUsage] = useState<TagUsage | null>(null)
  const [usageError, setUsageError] = useState(false)
  useEffect(() => {
    let cancelled = false
    api.tags.usage(tagId).then((res) => {
      if (cancelled) return
      if (res.success) setUsage(res.data)
      else setUsageError(true)
    }).catch(() => {
      if (!cancelled) setUsageError(true)
    })
    return () => { cancelled = true }
  }, [tagId])
  return { usage, usageError }
}

function ModalFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
          <button type="button" onClick={onClose} aria-label="閉じる" className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function TagEditModal({
  tag,
  existingNames,
  onClose,
  onSaved,
}: {
  tag: TagWithCount
  existingNames: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState(tag.color)
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState('')
  const { usage, usageError } = useTagUsage(tag.id)

  const trimmed = name.trim()
  const changed = trimmed !== tag.name || color !== tag.color
  const duplicate = trimmed !== tag.name && existingNames.includes(trimmed)

  const handleSave = async () => {
    if (!trimmed || !changed || duplicate) return
    setBusy(true)
    setSaveError('')
    try {
      const data: { name?: string; color?: string } = {}
      if (trimmed !== tag.name) data.name = trimmed
      if (color !== tag.color) data.color = color
      const res = await api.tags.update(tag.id, data)
      if (res.success) {
        onSaved()
      } else {
        setSaveError(res.error || '保存に失敗しました')
      }
    } catch (err) {
      setSaveError(err instanceof Error && err.message.includes('409')
        ? '同じ名前のタグが既にあります'
        : '保存に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalFrame title="タグを編集" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">タグ名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          {duplicate && (
            <p className="mt-1 text-xs text-red-600">同じ名前のタグが既にあります</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">色</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-9 h-9 p-0.5 border border-gray-300 rounded cursor-pointer"
            />
            <span className="text-xs text-gray-500">{color}</span>
          </div>
        </div>

        {trimmed !== tag.name && (
          usageError ? (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3">
              使用箇所を取得できませんでした。この変更がどこに影響するか確認できないため、時間をおいて再度お試しください。
            </p>
          ) : usage ? (
            <UsageSummary usage={usage} mode="edit" />
          ) : (
            <p className="text-xs text-gray-400">使用箇所を確認中...</p>
          )
        )}

        {saveError && <p className="text-xs text-red-600">{saveError}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!trimmed || !changed || duplicate || busy || (trimmed !== tag.name && !usage && !usageError)}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white disabled:opacity-50"
            style={{ backgroundColor: '#06C755' }}
          >
            {busy ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </ModalFrame>
  )
}

function TagDeleteModal({
  tag,
  onClose,
  onDeleted,
}: {
  tag: TagWithCount
  onClose: () => void
  onDeleted: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const { usage, usageError } = useTagUsage(tag.id)

  const handleDelete = async () => {
    if (confirmText !== tag.name) return
    setBusy(true)
    setDeleteError('')
    try {
      const res = await api.tags.delete(tag.id)
      if (res.success) {
        onDeleted()
      } else {
        setDeleteError(res.error || '削除に失敗しました')
      }
    } catch {
      setDeleteError('削除に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ModalFrame title="タグを削除" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          タグ「
          <span className="font-semibold" style={{ color: tag.color }}>{tag.name}</span>
          」を削除します。<span className="font-semibold text-red-600">この操作は取り消せません。</span>
        </p>

        {usageError ? (
          <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3">
            使用箇所を取得できませんでした。影響が確認できないため削除は実行できません。時間をおいて再度お試しください。
          </p>
        ) : usage ? (
          <UsageSummary usage={usage} mode="delete" />
        ) : (
          <p className="text-xs text-gray-400">使用箇所を確認中...</p>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            確認のため、タグ名「{tag.name}」を入力してください
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={tag.name}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg bg-white hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={confirmText !== tag.name || busy || !usage}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? '削除中...' : '削除する'}
          </button>
        </div>
      </div>
    </ModalFrame>
  )
}
