'use client'

import { useState, useRef, useEffect } from 'react'
import { DashboardConfig } from '@/lib/types'

type Message = {
  role: 'user' | 'ai'
  text: string
  error?: boolean
}

type Props = {
  config: DashboardConfig
  columns: string[]
  onConfigChange: (config: DashboardConfig) => void
}

const SUGGESTIONS = [
  'KPI에 송금횟수 추가해줘',
  '거래금액 라인 차트 추가해줘',
  '제휴사별 파이 차트 만들어줘',
  'VIP 세그먼트 만들어줘 (거래금액 >= 1000000)',
  '모든 KPI를 중간 크기로 바꿔줘',
]

export default function AiChat({ config, columns, onConfigChange }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'ai', text: '안녕하세요! 대시보드를 자연어로 설정해드릴게요.\n\n예시: "KPI에 송금횟수 추가해줘", "거래금액 라인 차트 추가해줘"' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const msg = text ?? input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setLoading(true)

    try {
      const res = await fetch('/api/ai-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, config, columns }),
      })
      const data = await res.json()

      if (data.error) {
        setMessages(prev => [...prev, { role: 'ai', text: `오류: ${data.error}`, error: true }])
      } else {
        onConfigChange(data.config)
        const added = data.config.widgets.length - config.widgets.length
        const segAdded = data.config.segments.length - config.segments.length
        let reply = '✓ 대시보드가 업데이트됐어요!'
        if (added > 0) reply += ` (위젯 ${added}개 추가)`
        if (segAdded > 0) reply += ` (세그먼트 ${segAdded}개 추가)`
        setMessages(prev => [...prev, { role: 'ai', text: reply }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: '네트워크 오류가 발생했어요.', error: true }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs whitespace-pre-line ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : msg.error
                ? 'bg-red-900/30 border border-red-800 text-red-400'
                : 'bg-slate-800 text-slate-300'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-800 rounded-xl px-3 py-2 text-xs text-slate-500">
              생각 중...
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      <div className="px-3 pb-2 flex flex-wrap gap-1">
        {SUGGESTIONS.slice(0, 3).map((s, i) => (
          <button
            key={i}
            onClick={() => send(s)}
            disabled={loading}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 px-2 py-1 rounded-lg transition disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="예: KPI에 송금횟수 추가해줘"
          disabled={loading}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-medium transition disabled:opacity-40"
        >
          전송
        </button>
      </div>
    </div>
  )
}
