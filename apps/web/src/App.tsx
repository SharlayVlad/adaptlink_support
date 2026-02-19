import './App.css'
import { useCallback, useEffect, useMemo, useState } from 'react'

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

type SupportRequest = {
  id: number
  userTelegramId: number
  text: string
  status: RequestStatus
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
  createdAt: string
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
  }
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
  const [chatStatus, setChatStatus] = useState<RequestStatus>('IN_PROGRESS')
  const [chatMessages, setChatMessages] = useState<RequestMessage[]>([])
  const [chatText, setChatText] = useState('')
  const [regName, setRegName] = useState('')
  const [regOrg, setRegOrg] = useState('')
  const [requestTopic, setRequestTopic] = useState('')
  const [requestDescription, setRequestDescription] = useState('')
  const [requestPriority, setRequestPriority] = useState<'Низкий' | 'Средний' | 'Высокий'>('Средний')
  const [suggestionText, setSuggestionText] = useState('')
  const [bootstrapLoaded, setBootstrapLoaded] = useState(false)
  const tgUser = tg?.initDataUnsafe?.user || null
  const telegramId = tgUser?.id || Number(params.get('telegramId')) || null

  const role = bootstrap?.role
  const isAdmin = role === 'ADMIN'
  const isRegistered = Boolean(bootstrap?.registered)

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
    setBootstrapLoaded(true)
  }, [telegramId])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadBootstrap().catch((error: Error) => setStatus(error.message))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [loadBootstrap])

  const refreshChat = useCallback(async (scroll = false) => {
    if (!chatRequestId) return
    const data = await api<{ request: SupportRequest; messages: RequestMessage[] }>(
      `/api/requests/${chatRequestId}/messages`,
      telegramId
    )
    setChatStatus(data.request.status)
    setChatMessages(data.messages)
    if (scroll) {
      requestAnimationFrame(() => {
        const el = document.getElementById('chat-messages')
        if (el) el.scrollTop = el.scrollHeight
      })
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
    await api(`/api/requests/${chatRequestId}/messages`, telegramId, { method: 'POST', body: { text: chatText.trim() } })
    setChatText('')
    await refreshChat(true)
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
            <p className="muted">Проверяю авторизацию...</p>
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
                    <div>{request.text}</div>
                    <div className="muted">{formatDate(request.createdAt)}</div>
                    {request.status === 'IN_PROGRESS' && (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          setChatRequestId(request.id)
                          void refreshChat(true)
                        }}
                      >
                        Открыть диалог
                      </button>
                    )}
                  </div>
                ))}
                {!userRequests.length && <p className="muted">Пока нет заявок.</p>}
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
                    <div>{request.text}</div>
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
                              setChatRequestId(request.id)
                              void refreshChat(true)
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
                {!activeAdminList.length && <p className="muted">Пусто.</p>}
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="stack">
                <div className="item">
                  <h3 className="section-title">{isAdmin ? 'Профиль администратора' : 'Профиль'}</h3>
                  <div className="muted">Роль: {isAdmin ? 'Администратор' : 'Пользователь'}</div>
                  <div className="muted">ID: {bootstrap?.user?.telegramId || '-'}</div>
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
                          </div>
                        )
                      })}
                      {!bootstrap?.users?.length && <p className="muted">Пользователи пока не зарегистрированы.</p>}
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
                        <div>{item.text}</div>
                        <div className="muted">
                          {(item.fullName || 'не указано') + ' | ' + (item.organization || 'не указана')}
                        </div>
                      </div>
                    ))}
                  {isAdmin && !bootstrap?.suggestions?.length && <p className="muted">Пока нет предложений.</p>}
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
          <p id="status" className="muted">
            {status}
          </p>
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

      {chatRequestId && (
        <section className="chat-overlay">
          <div className="chat-header">
            <div className="chat-head-left">
              <button className="icon-btn" onClick={() => setChatRequestId(null)} dangerouslySetInnerHTML={{ __html: icon('back') }} />
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
                    <div className="muted">{formatDate(message.createdAt)}</div>
                  </div>
                </div>
              )
            })}
            {!chatMessages.length && <p className="muted">Сообщений пока нет.</p>}
          </div>
          <div className="chat-footer">
            <div className="chat-input-row">
              <button className="icon-btn" dangerouslySetInnerHTML={{ __html: icon('attach') }} />
              <input
                className="field"
                placeholder="Введите сообщение..."
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
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
          </div>
        </section>
      )}
    </>
  )
}

export default App
