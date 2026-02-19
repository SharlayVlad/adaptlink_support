import './App.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Role = 'USER' | 'ADMIN'
type RequestStatus = 'NEW' | 'IN_PROGRESS' | 'COMPLETED'

type UserProfile = {
  telegramId: number
  username: string | null
  firstName: string | null
  lastName: string | null
  fullName: string | null
  organization: string | null
  role: Role
  registeredAt: string
}

type DeleteUserResponse = {
  ok: true
  removedUser: {
    telegramId: number
    role: Role
  }
  reopenedRequests: number
}

type SupportRequest = {
  id: number
  userTelegramId: number
  text: string
  status: RequestStatus
  priority?: 'LOW' | 'MEDIUM' | 'HIGH'
  slaDueAt?: string | null
  isOverdue?: boolean
  createdAt: string
  inProgressAt: string | null
  completedAt: string | null
  assignedAdminTelegramId: number | null
}

type Suggestion = {
  id: number
  userTelegramId: number
  fullName: string | null
  organization: string | null
  text: string
  createdAt: string
}

type Instruction = {
  key: string
  title: string
  url: string
}

type RequestMessage = {
  id: number
  requestId: number
  senderRole: Role
  senderTelegramId: number
  text: string
  attachmentPath?: string | null
  attachmentName?: string | null
  attachmentMime?: string | null
  createdAt: string
}

type TypingState = {
  isTyping: boolean
  role: Role | null
}

type ChatPayload = {
  request: SupportRequest
  messages: RequestMessage[]
  typing?: TypingState
}

type BootstrapPayload = {
  registered: boolean
  user: UserProfile | null
  role: Role | null
  instructions: Instruction[]
  requests?:
    | SupportRequest[]
    | {
        new: SupportRequest[]
        inProgress: SupportRequest[]
        completed: SupportRequest[]
      }
  suggestions?: Suggestion[]
  users?: UserProfile[]
  stats?: {
    open: number
    inProgress: number
    overdue?: number
  }
  notificationSettings?: NotificationSettings | null
}

type NotificationSettings = {
  telegramId: number
  adminNewRequest: boolean
  adminSuggestion: boolean
  userRequestTaken: boolean
  userRequestCompleted: boolean
  userChatMessage: boolean
  adminChatMessage: boolean
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        colorScheme?: 'light' | 'dark'
        initDataUnsafe?: { user?: { id?: number; username?: string; first_name?: string; last_name?: string } }
        setHeaderColor?: (color: string) => void
      }
    }
  }
}

const tg = window.Telegram?.WebApp
const params = new URLSearchParams(window.location.search)
const API_BASE = (params.get('api') || import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '')
const THEME_KEY = 'adaptlink-react-theme'

function icon(id: string): string {
  const map: Record<string, string> = {
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M2 12h3M19 12h3M4.9 19.1l2.2-2.2M16.9 7.1l2.2-2.2"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7.2 7.2 0 0 0 9.8 9.8z"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M3 11.5L12 4l9 7.5"/><path d="M6.5 10.5V20h11V10.5"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.8-3 4-4.5 7-4.5s5.2 1.5 7 4.5"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M3 7h6l2 2h10v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    bolt: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M13 2 5 13h6l-1 9 9-12h-6z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    attach:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M21.4 11.1 13 19.5a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 0 1 5 5l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><circle cx="12" cy="7" r="1"/></svg>',
    trash:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M7 7l1 12h8l1-12"/><path d="M10 11v5M14 11v5"/></svg>',
    inbox:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M3 13.5V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7.5"/><path d="M3 13.5h5l2 3h4l2-3h5"/><path d="M3 13.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4.5"/></svg>',
    users:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M16 19a4 4 0 0 0-8 0"/><circle cx="12" cy="9" r="3"/><path d="M20 18a3.5 3.5 0 0 0-2.8-3.4"/><path d="M4 18a3.5 3.5 0 0 1 2.8-3.4"/></svg>',
    spark:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3z"/><path d="M19 2v3M20.5 3.5h-3"/><path d="M4 17v2.5M5.2 18.2H2.8"/></svg>',
    pencil:
      '<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/></svg>',
  }
  return map[id] || ''
}

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function statusLabel(status: RequestStatus): string {
  if (status === 'IN_PROGRESS') return 'В РАБОТЕ'
  if (status === 'COMPLETED') return 'ЗАВЕРШЕНО'
  return 'НОВАЯ'
}

function statusClass(status: RequestStatus): string {
  if (status === 'IN_PROGRESS') return 'in-progress'
  if (status === 'COMPLETED') return 'completed'
  return 'new'
}

function EmptyState(props: { iconSvg: string; title: string; description: string }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" dangerouslySetInnerHTML={{ __html: props.iconSvg }} />
      <strong>{props.title}</strong>
      <p className="muted">{props.description}</p>
    </div>
  )
}

async function api<T>(
  path: string,
  telegramId: number | null,
  options?: { method?: string; body?: unknown }
): Promise<T> {
  if (!API_BASE) {
    throw new Error('API URL не задан. Откройте Mini App через кнопку бота.')
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: options?.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-id': String(telegramId || ''),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return (await res.json()) as T
}

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem(THEME_KEY)
    return (saved as 'dark' | 'light' | null) || (tg?.colorScheme === 'light' ? 'light' : 'dark')
  })
  const [bootstrap, setBootstrap] = useState<BootstrapPayload | null>(null)
  const [status, setStatus] = useState('Готово.')
  const [activeTab, setActiveTab] = useState<'home' | 'requests' | 'profile'>('home')
  const [adminFilter, setAdminFilter] = useState<'new' | 'inprogress' | 'completed'>('new')
  const [chatRequestId, setChatRequestId] = useState<number | null>(null)
  const [chatLoading, setChatLoading] = useState(false)
  const [chatTypingRole, setChatTypingRole] = useState<Role | null>(null)
  const [chatStatus, setChatStatus] = useState<RequestStatus>('IN_PROGRESS')
  const [chatMessages, setChatMessages] = useState<RequestMessage[]>([])
  const [chatText, setChatText] = useState('')
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings | null>(null)
  const [toasts, setToasts] = useState<Array<{ id: number; text: string; tone: 'success' | 'error' | 'neutral' }>>([])
  const [regName, setRegName] = useState('')
  const [regOrg, setRegOrg] = useState('')
  const [requestTopic, setRequestTopic] = useState('')
  const [requestDescription, setRequestDescription] = useState('')
  const [requestPriority, setRequestPriority] = useState<'Низкий' | 'Средний' | 'Высокий'>('Средний')
  const [suggestionText, setSuggestionText] = useState('')
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null)
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null)
  const [bootstrapLoaded, setBootstrapLoaded] = useState(false)
  const typingPingAtRef = useRef(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const tgUser = tg?.initDataUnsafe?.user || null
  const telegramId = tgUser?.id || Number(params.get('telegramId')) || null

  const role = bootstrap?.role
  const isAdmin = role === 'ADMIN'
  const isRegistered = Boolean(bootstrap?.registered)
  const missingTelegramContext = bootstrapLoaded && !telegramId
  const statusTone = /ошиб|error|не удалось/i.test(status)
    ? 'error'
    : /готово|успеш|отправ|выполн|принят|заверш/i.test(status)
      ? 'success'
      : 'neutral'

  useEffect(() => {
    tg?.ready()
    tg?.expand()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
    tg?.setHeaderColor?.(theme === 'dark' ? '#141f35' : '#ffffff')
  }, [theme])

  const loadBootstrap = useCallback(async () => {
    if (!telegramId) {
      setStatus('Ошибка авторизации Mini App.')
      setBootstrapLoaded(true)
      return
    }
    const data = await api<BootstrapPayload>(`/api/bootstrap?telegramId=${telegramId}`, telegramId)
    setBootstrap(data)
    setNotificationSettings(data.notificationSettings || null)
    setBootstrapLoaded(true)
  }, [telegramId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBootstrap().catch((error: Error) => setStatus(error.message))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadBootstrap])

  useEffect(() => {
    if (!status || status === 'Готово.') return
    const tone: 'success' | 'error' | 'neutral' = /ошиб|error|не удалось/i.test(status)
      ? 'error'
      : /успеш|отправ|выполн|принят|заверш|удален|сохран/i.test(status)
        ? 'success'
        : 'neutral'
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((prev) => [...prev.slice(-2), { id, text: status, tone }])
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id))
    }, 2800)
    return () => window.clearTimeout(timer)
  }, [status])

  const refreshChat = useCallback(async (scroll = false, showLoader = false, forcedRequestId?: number) => {
    const requestId = forcedRequestId || chatRequestId
    if (!requestId) return
    if (showLoader) setChatLoading(true)
    try {
      const data = await api<ChatPayload>(
        `/api/requests/${requestId}/messages`,
        telegramId
      )
      setChatStatus(data.request.status)
      setChatMessages(data.messages)
      setChatTypingRole(data.typing?.isTyping ? data.typing.role || null : null)
      if (scroll) {
        requestAnimationFrame(() => {
          const el = document.getElementById('chat-messages')
          if (el) el.scrollTop = el.scrollHeight
        })
      }
    } finally {
      if (showLoader) setChatLoading(false)
    }
  }, [chatRequestId, telegramId])

  useEffect(() => {
    if (!chatRequestId) return
    const timer = setInterval(() => {
      refreshChat(false).catch(() => undefined)
    }, 2500)
    return () => clearInterval(timer)
  }, [chatRequestId, refreshChat])

  async function submitRegistration() {
    if (!regName.trim() || !regOrg.trim()) {
      setStatus('Заполните ФИО и организацию.')
      return
    }
    await api('/api/register', telegramId, {
      method: 'POST',
      body: {
        telegramId,
        fullName: regName.trim(),
        organization: regOrg.trim(),
        username: tgUser?.username || null,
        firstName: tgUser?.first_name || null,
        lastName: tgUser?.last_name || null,
      },
    })
    setStatus('Регистрация выполнена.')
    setRegName('')
    setRegOrg('')
    await loadBootstrap()
  }

  async function submitRequest() {
    if (!requestTopic.trim() || !requestDescription.trim()) {
      setStatus('Заполните тему и описание заявки.')
      return
    }
    const text = [`Тема: ${requestTopic}`, `Приоритет: ${requestPriority}`, '', requestDescription].join('\n')
    await api('/api/requests', telegramId, { method: 'POST', body: { text } })
    setStatus('Заявка отправлена.')
    setRequestTopic('')
    setRequestDescription('')
    setRequestPriority('Средний')
    await loadBootstrap()
  }

  async function submitSuggestion() {
    if (!suggestionText.trim()) {
      setStatus('Заполните текст предложения.')
      return
    }
    await api('/api/suggestions', telegramId, { method: 'POST', body: { text: suggestionText.trim() } })
    setSuggestionText('')
    setStatus('Предложение отправлено.')
  }

  async function takeRequest(id: number) {
    await api(`/api/requests/${id}/take`, telegramId, { method: 'POST' })
    setStatus(`Заявка #${id} взята в работу.`)
    await loadBootstrap()
  }

  async function finishRequest(id: number) {
    await api(`/api/requests/${id}/finish`, telegramId, { method: 'POST' })
    setStatus(`Заявка #${id} завершена.`)
    await loadBootstrap()
  }

  async function sendChatMessage() {
    if (!chatRequestId || !chatText.trim()) return
    const optimistic: RequestMessage = {
      id: -Date.now(),
      requestId: chatRequestId,
      senderRole: isAdmin ? 'ADMIN' : 'USER',
      senderTelegramId: telegramId || 0,
      text: chatText.trim(),
      createdAt: new Date().toISOString(),
    }
    setChatMessages((prev) => [...prev, optimistic])
    await api(`/api/requests/${chatRequestId}/messages`, telegramId, { method: 'POST', body: { text: chatText.trim() } })
    setChatText('')
    await refreshChat(true)
  }

  async function notifyTyping() {
    if (!chatRequestId || !telegramId) return
    const now = Date.now()
    if (now - typingPingAtRef.current < 1200) return
    typingPingAtRef.current = now
    await api(`/api/requests/${chatRequestId}/typing`, telegramId, { method: 'POST' })
  }

  async function uploadAttachment(file: File) {
    if (!chatRequestId || !telegramId) return
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${API_BASE}/api/requests/${chatRequestId}/messages/upload`, {
      method: 'POST',
      headers: {
        'x-telegram-id': String(telegramId),
      },
      body: formData,
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error || `HTTP ${res.status}`)
    }
    await refreshChat(true)
  }

  async function saveNotificationSettings(patch: Partial<NotificationSettings>) {
    const data = await api<{ settings: NotificationSettings }>(
      '/api/me/notification-settings',
      telegramId,
      { method: 'PUT', body: patch }
    )
    setNotificationSettings(data.settings)
    setStatus('Настройки уведомлений сохранены.')
  }

  function openChat(requestId: number) {
    setChatRequestId(requestId)
    setChatMessages([])
    setChatTypingRole(null)
    void refreshChat(true, true, requestId).catch((error: Error) => {
      setStatus(error.message)
    })
  }

  async function deleteRegisteredUser(targetUserId: number, displayName: string) {
    if (!window.confirm(`Удалить пользователя "${displayName}"?`)) return
    setDeletingUserId(targetUserId)
    try {
      const data = await api<DeleteUserResponse>(`/api/users/${targetUserId}`, telegramId, { method: 'DELETE' })
      const extra =
        data.reopenedRequests > 0
          ? ` Переведено в новые заявок: ${data.reopenedRequests}.`
          : ''
      setStatus(`Пользователь удален.${extra}`)
      if (expandedUserId === targetUserId) {
        setExpandedUserId(null)
      }
      await loadBootstrap()
    } finally {
      setDeletingUserId(null)
    }
  }

  const userRequests = (Array.isArray(bootstrap?.requests) ? bootstrap?.requests : []) as SupportRequest[]
  const adminRequests = (!Array.isArray(bootstrap?.requests) ? bootstrap?.requests : undefined) as
    | BootstrapPayload['requests']
    | undefined
  const adminCollections = useMemo(
    () =>
      adminRequests && !Array.isArray(adminRequests)
        ? {
            new: adminRequests.new || [],
            inprogress: adminRequests.inProgress || [],
            completed: adminRequests.completed || [],
          }
        : { new: [], inprogress: [], completed: [] },
    [adminRequests]
  )

  const activeAdminList = adminCollections[adminFilter]
  const profileName =
    bootstrap?.user?.fullName ||
    [bootstrap?.user?.firstName, bootstrap?.user?.lastName].filter(Boolean).join(' ').trim() ||
    bootstrap?.user?.username ||
    'Профиль'

  return (
    <>
      <main className="app">
        <section className="card">
          <div className="header">
            <div className="brand">
              <h1 className="brand-title">AdaptLink Support</h1>
              <p className="brand-sub">{isRegistered ? profileName : 'Пользователь не зарегистрирован'}</p>
            </div>
            <div className="header-controls">
              <button
                id="theme-toggle"
                className="icon-btn"
                type="button"
                aria-label="Сменить тему"
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                dangerouslySetInnerHTML={{ __html: theme === 'dark' ? icon('moon') : icon('sun') }}
              />
              <span className="pill">{role || 'guest'}</span>
              <span className="avatar">{(profileName || 'A').charAt(0).toUpperCase()}</span>
            </div>
          </div>
        </section>

        {!bootstrapLoaded && (
          <section className="card">
            <div className="stack">
              <div className="skeleton-line skeleton-lg" />
              <div className="skeleton-line skeleton-md" />
              <div className="skeleton-grid">
                <div className="skeleton-tile" />
                <div className="skeleton-tile" />
              </div>
            </div>
          </section>
        )}

        {missingTelegramContext && (
          <section className="card">
            <div className="hint-card">
              <strong>Не удалось получить Telegram-профиль</strong>
              <p className="muted">
                Откройте приложение через кнопку <b>Открыть приложение</b> в боте и перезапустите Mini App.
              </p>
            </div>
          </section>
        )}

        {bootstrapLoaded && !isRegistered && telegramId && (
          <section className="card">
            <h2 className="section-title">Регистрация</h2>
            <div className="stack">
              <input className="field" placeholder="ФИО" value={regName} onChange={(e) => setRegName(e.target.value)} />
              <input
                className="field"
                placeholder="Организация"
                value={regOrg}
                onChange={(e) => setRegOrg(e.target.value)}
              />
              <button className="btn btn-primary" onClick={() => submitRegistration().catch((e: Error) => setStatus(e.message))}>
                Зарегистрироваться
              </button>
            </div>
          </section>
        )}

        {bootstrapLoaded && isRegistered && (
          <section className="card">
            {activeTab === 'home' && !isAdmin && (
              <div className="stack">
                <button className="btn btn-primary" onClick={() => document.getElementById('request-form')?.scrollIntoView({ behavior: 'smooth' })}>
                  Новая заявка
                </button>
                <div className="kpis">
                  <div className="kpi">
                    <div className="kpi-head">
                      <span className="kpi-dot" dangerouslySetInnerHTML={{ __html: icon('folder') }} />
                      Открытые заявки
                    </div>
                    <div className="kpi-value">{bootstrap?.stats?.open || 0}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-head">
                      <span className="kpi-dot" dangerouslySetInnerHTML={{ __html: icon('bolt') }} />
                      В работе
                    </div>
                    <div className="kpi-value">{bootstrap?.stats?.inProgress || 0}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-head">
                      <span className="kpi-dot" dangerouslySetInnerHTML={{ __html: icon('spark') }} />
                      Просрочено (SLA)
                    </div>
                    <div className="kpi-value">{bootstrap?.stats?.overdue || 0}</div>
                  </div>
                </div>
                <div className="item" id="request-form">
                  <h3 className="section-title">Новая заявка</h3>
                  <input className="field" placeholder="Тема" value={requestTopic} onChange={(e) => setRequestTopic(e.target.value)} />
                  <textarea
                    className="field"
                    placeholder="Описание"
                    value={requestDescription}
                    onChange={(e) => setRequestDescription(e.target.value)}
                  />
                  <select
                    className="field"
                    value={requestPriority}
                    onChange={(e) => setRequestPriority(e.target.value as 'Низкий' | 'Средний' | 'Высокий')}
                  >
                    <option value="Низкий">Низкий</option>
                    <option value="Средний">Средний</option>
                    <option value="Высокий">Высокий</option>
                  </select>
                  <button className="btn btn-primary" onClick={() => submitRequest().catch((e: Error) => setStatus(e.message))}>
                    Отправить заявку
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'home' && isAdmin && (
              <div className="stack">
                <div className="kpis">
                  <div className="kpi">
                    <div className="kpi-head">
                      <span className="kpi-dot" dangerouslySetInnerHTML={{ __html: icon('folder') }} />
                      Новые
                    </div>
                    <div className="kpi-value">{adminCollections.new.length}</div>
                  </div>
                  <div className="kpi">
                    <div className="kpi-head">
                      <span className="kpi-dot" dangerouslySetInnerHTML={{ __html: icon('bolt') }} />
                      В работе
                    </div>
                    <div className="kpi-value">{adminCollections.inprogress.length}</div>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={() => setActiveTab('requests')}>
                  Перейти к заявкам
                </button>
              </div>
            )}

            {activeTab === 'requests' && !isAdmin && (
              <div className="stack">
                {(userRequests || []).map((request) => (
                  <div key={request.id} className="item">
                    <div className="row spaced">
                      <strong>#{request.id}</strong>
                      <span className={`status-chip ${statusClass(request.status)}`}>{statusLabel(request.status)}</span>
                    </div>
                    <div className="content-text">{request.text}</div>
                    <div className="muted">{formatDate(request.createdAt)}</div>
                    {request.status === 'IN_PROGRESS' && (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          openChat(request.id)
                        }}
                      >
                        Открыть диалог
                      </button>
                    )}
                  </div>
                ))}
                {!userRequests.length && (
                  <EmptyState
                    iconSvg={icon('inbox')}
                    title="Заявок пока нет"
                    description="Создайте первую заявку через кнопку «Новая заявка»."
                  />
                )}
              </div>
            )}

            {activeTab === 'requests' && isAdmin && (
              <div className="stack">
                <div className="segmented">
                  <button className={`seg-btn ${adminFilter === 'new' ? 'active' : ''}`} onClick={() => setAdminFilter('new')}>
                    Новые
                  </button>
                  <button
                    className={`seg-btn ${adminFilter === 'inprogress' ? 'active' : ''}`}
                    onClick={() => setAdminFilter('inprogress')}
                  >
                    В работе
                  </button>
                  <button
                    className={`seg-btn ${adminFilter === 'completed' ? 'active' : ''}`}
                    onClick={() => setAdminFilter('completed')}
                  >
                    Завершенные
                  </button>
                </div>
                {activeAdminList.map((request) => (
                  <div key={request.id} className="item">
                    <div className="row spaced">
                      <strong>#{request.id}</strong>
                      <span className={`status-chip ${statusClass(request.status)}`}>{statusLabel(request.status)}</span>
                    </div>
                    <div className="content-text">{request.text}</div>
                    <div className="muted">Пользователь: {request.userTelegramId}</div>
                    <div className="row">
                      {request.status === 'NEW' && (
                        <button className="btn btn-success" onClick={() => takeRequest(request.id).catch((e: Error) => setStatus(e.message))}>
                          Принять
                        </button>
                      )}
                      {request.status === 'IN_PROGRESS' && (
                        <>
                          <button
                            className="btn btn-primary"
                            onClick={() => {
                              openChat(request.id)
                            }}
                          >
                            Диалог
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => finishRequest(request.id).catch((e: Error) => setStatus(e.message))}
                          >
                            Завершить
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
                {!activeAdminList.length && (
                  <EmptyState
                    iconSvg={icon('inbox')}
                    title="Список пуст"
                    description="В этом разделе пока нет заявок."
                  />
                )}
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="stack">
                <div className="item">
                  <h3 className="section-title">{isAdmin ? 'Профиль администратора' : 'Профиль'}</h3>
                  <div className="muted">Роль: {isAdmin ? 'Администратор' : 'Пользователь'}</div>
                  <div className="muted">ID: {bootstrap?.user?.telegramId || '-'}</div>
                </div>

                <div className="item">
                  <h3 className="section-title">Telegram-уведомления</h3>
                  {notificationSettings ? (
                    <div className="settings-list">
                      {isAdmin && (
                        <>
                          <label className="setting-row">
                            <input
                              type="checkbox"
                              checked={notificationSettings.adminNewRequest}
                              onChange={(e) =>
                                saveNotificationSettings({ adminNewRequest: e.target.checked }).catch((err: Error) =>
                                  setStatus(err.message)
                                )
                              }
                            />
                            Новые заявки
                          </label>
                          <label className="setting-row">
                            <input
                              type="checkbox"
                              checked={notificationSettings.adminSuggestion}
                              onChange={(e) =>
                                saveNotificationSettings({ adminSuggestion: e.target.checked }).catch((err: Error) =>
                                  setStatus(err.message)
                                )
                              }
                            />
                            Новые предложения
                          </label>
                          <label className="setting-row">
                            <input
                              type="checkbox"
                              checked={notificationSettings.adminChatMessage}
                              onChange={(e) =>
                                saveNotificationSettings({ adminChatMessage: e.target.checked }).catch((err: Error) =>
                                  setStatus(err.message)
                                )
                              }
                            />
                            Сообщения пользователей в чате
                          </label>
                        </>
                      )}
                      {!isAdmin && (
                        <>
                          <label className="setting-row">
                            <input
                              type="checkbox"
                              checked={notificationSettings.userRequestTaken}
                              onChange={(e) =>
                                saveNotificationSettings({ userRequestTaken: e.target.checked }).catch((err: Error) =>
                                  setStatus(err.message)
                                )
                              }
                            />
                            Заявка принята в работу
                          </label>
                          <label className="setting-row">
                            <input
                              type="checkbox"
                              checked={notificationSettings.userRequestCompleted}
                              onChange={(e) =>
                                saveNotificationSettings({ userRequestCompleted: e.target.checked }).catch((err: Error) =>
                                  setStatus(err.message)
                                )
                              }
                            />
                            Заявка завершена
                          </label>
                          <label className="setting-row">
                            <input
                              type="checkbox"
                              checked={notificationSettings.userChatMessage}
                              onChange={(e) =>
                                saveNotificationSettings({ userChatMessage: e.target.checked }).catch((err: Error) =>
                                  setStatus(err.message)
                                )
                              }
                            />
                            Сообщения администратора в чате
                          </label>
                        </>
                      )}
                    </div>
                  ) : (
                    <p className="muted">Настройки будут доступны после загрузки профиля.</p>
                  )}
                </div>

                {isAdmin && (
                  <div className="item">
                    <h3 className="section-title">Зарегистрированные пользователи</h3>
                    <div className="users-list">
                      {(bootstrap?.users || []).map((item) => {
                        const displayName =
                          item.fullName ||
                          [item.firstName, item.lastName].filter(Boolean).join(' ').trim() ||
                          item.username ||
                          `ID ${item.telegramId}`
                        return (
                          <div className="user-row" key={item.telegramId}>
                            <div className="row spaced">
                              <strong>{displayName}</strong>
                              <span className={`status-chip ${item.role === 'ADMIN' ? 'in-progress' : 'new'}`}>{item.role}</span>
                            </div>
                            <div className="user-meta">ID: {item.telegramId} | {item.username ? `@${item.username}` : 'нет username'}</div>
                            <div className="user-meta">{item.organization || 'организация не указана'}</div>
                            <div className="user-actions">
                              <button
                                className="user-action-btn"
                                type="button"
                                title="Подробнее"
                                onClick={() =>
                                  setExpandedUserId((prev) => (prev === item.telegramId ? null : item.telegramId))
                                }
                                dangerouslySetInnerHTML={{ __html: icon('info') }}
                              />
                              <button
                                className="user-action-btn user-action-btn-danger"
                                type="button"
                                title="Удалить пользователя"
                                disabled={item.telegramId === bootstrap?.user?.telegramId || deletingUserId === item.telegramId}
                                onClick={() => deleteRegisteredUser(item.telegramId, displayName).catch((e: Error) => setStatus(e.message))}
                                dangerouslySetInnerHTML={{ __html: icon('trash') }}
                              />
                            </div>
                            {expandedUserId === item.telegramId && (
                              <div className="user-details">
                                <div className="user-meta"><strong>Роль:</strong> {item.role}</div>
                                <div className="user-meta"><strong>ФИО:</strong> {item.fullName || 'не указано'}</div>
                                <div className="user-meta"><strong>Имя:</strong> {item.firstName || 'не указано'}</div>
                                <div className="user-meta"><strong>Фамилия:</strong> {item.lastName || 'не указано'}</div>
                                <div className="user-meta"><strong>Username:</strong> {item.username ? `@${item.username}` : 'нет username'}</div>
                                <div className="user-meta"><strong>Организация:</strong> {item.organization || 'не указана'}</div>
                                <div className="user-meta"><strong>Регистрация:</strong> {formatDate(item.registeredAt)}</div>
                                {item.telegramId === bootstrap?.user?.telegramId && (
                                  <div className="user-meta">Текущего администратора удалить нельзя.</div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {!bootstrap?.users?.length && (
                        <EmptyState
                          iconSvg={icon('users')}
                          title="Нет зарегистрированных пользователей"
                          description="Пользователи появятся здесь после регистрации в Mini App."
                        />
                      )}
                    </div>
                  </div>
                )}

                <div className="item">
                  <h3 className="section-title">Предложения</h3>
                  {!isAdmin && (
                    <>
                      <textarea
                        className="field"
                        placeholder="Опишите вашу идею"
                        value={suggestionText}
                        onChange={(e) => setSuggestionText(e.target.value)}
                      />
                      <button className="btn btn-primary" onClick={() => submitSuggestion().catch((e: Error) => setStatus(e.message))}>
                        Отправить предложение
                      </button>
                    </>
                  )}
                  {isAdmin &&
                    (bootstrap?.suggestions || []).map((item) => (
                      <div key={item.id} className="item">
                        <strong>#{item.id}</strong>
                        <div className="content-text">{item.text}</div>
                        <div className="muted">
                          {(item.fullName || 'не указано') + ' | ' + (item.organization || 'не указана')}
                        </div>
                      </div>
                    ))}
                  {isAdmin && !bootstrap?.suggestions?.length && (
                    <EmptyState
                      iconSvg={icon('spark')}
                      title="Предложений пока нет"
                      description="Новые предложения пользователей будут показаны здесь."
                    />
                  )}
                </div>

                <div className="item">
                  <h3 className="section-title">Инструкции</h3>
                  {(bootstrap?.instructions || []).map((item) => (
                    <button
                      className="btn"
                      style={{ textAlign: 'left' }}
                      key={item.key}
                      onClick={() => window.open(`${API_BASE}${item.url}`, '_blank')}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="card">
          <div className={`status-panel status-${statusTone}`}>
            <span className="status-dot" />
            <p id="status" className="muted">
              {status}
            </p>
          </div>
        </section>
      </main>

      {isRegistered && (
        <nav className="bottom-nav">
          <button className={`bottom-tab ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
            <span className="bottom-tab-icon" dangerouslySetInnerHTML={{ __html: icon('home') }} />
            <span className="bottom-tab-label">Главная</span>
          </button>
          <button className={`bottom-tab ${activeTab === 'requests' ? 'active' : ''}`} onClick={() => setActiveTab('requests')}>
            <span className="bottom-tab-icon" dangerouslySetInnerHTML={{ __html: icon('list') }} />
            <span className="bottom-tab-label">Заявки</span>
          </button>
          <button className={`bottom-tab ${activeTab === 'profile' ? 'active' : ''}`} onClick={() => setActiveTab('profile')}>
            <span className="bottom-tab-icon" dangerouslySetInnerHTML={{ __html: icon('user') }} />
            <span className="bottom-tab-label">Профиль</span>
          </button>
        </nav>
      )}

      <section className="toast-wrap" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.text}
          </div>
        ))}
      </section>

      {chatRequestId && (
        <section className="chat-overlay">
          <div className="chat-header">
            <div className="chat-head-left">
              <button
                className="icon-btn"
                onClick={() => {
                  setChatRequestId(null)
                  setChatLoading(false)
                  setChatTypingRole(null)
                }}
                dangerouslySetInnerHTML={{ __html: icon('back') }}
              />
              <strong>Заявка #{chatRequestId}</strong>
            </div>
            <span className={`status-chip ${statusClass(chatStatus)}`}>{statusLabel(chatStatus)}</span>
          </div>
          <div id="chat-messages" className="chat-body">
            {chatMessages.map((message) => {
              const outgoing =
                (isAdmin && message.senderRole === 'ADMIN') ||
                (!isAdmin && message.senderRole === 'USER')
              return (
                <div key={message.id} className={`chat-msg-row ${outgoing ? 'outgoing' : 'incoming'}`}>
                  {!outgoing && <span className="chat-avatar">AS</span>}
                  <div className={`chat-msg ${outgoing ? 'outgoing' : ''}`}>
                    <div>{message.text}</div>
                    {message.attachmentPath && (
                      <a
                        className={`chat-attachment ${outgoing ? 'outgoing' : ''}`}
                        href={`${API_BASE}${message.attachmentPath}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {message.attachmentName || 'Вложение'}
                      </a>
                    )}
                    <div className="muted">{formatDate(message.createdAt)}</div>
                  </div>
                </div>
              )
            })}
            {chatLoading && (
              <div className="chat-loading">
                <div className="skeleton-line skeleton-lg" />
                <div className="skeleton-line skeleton-md" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-md" />
              </div>
            )}
            {!chatLoading && chatTypingRole && (
              <div className="typing-indicator">
                <span className="typing-pencil" dangerouslySetInnerHTML={{ __html: icon('pencil') }} />
                <span className="typing-text">Собеседник пишет...</span>
              </div>
            )}
            {!chatLoading && !chatMessages.length && (
              <EmptyState
                iconSvg={icon('inbox')}
                title="Сообщений пока нет"
                description="Напишите первое сообщение, чтобы начать диалог."
              />
            )}
          </div>
          <div className="chat-footer">
            <div className="chat-input-row">
              <button
                className="icon-btn"
                onClick={() => fileInputRef.current?.click()}
                dangerouslySetInnerHTML={{ __html: icon('attach') }}
              />
              <input
                className="field"
                placeholder="Введите сообщение..."
                value={chatText}
                onChange={(e) => {
                  const value = e.target.value
                  setChatText(value)
                  if (value.trim()) {
                    void notifyTyping().catch(() => undefined)
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void sendChatMessage().catch((err: Error) => setStatus(err.message))
                  }
                }}
              />
              <button
                className="chat-send"
                onClick={() => sendChatMessage().catch((err: Error) => setStatus(err.message))}
                dangerouslySetInnerHTML={{ __html: icon('send') }}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden-file-input"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (!file) return
                void uploadAttachment(file)
                  .then(() => setStatus('Вложение отправлено.'))
                  .catch((err: Error) => setStatus(err.message))
                  .finally(() => {
                    e.currentTarget.value = ''
                  })
              }}
            />
          </div>
        </section>
      )}
    </>
  )
}

export default App
