'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()
  const [mode, setMode] = useState<'create' | 'join'>('join')
  const [name, setName] = useState('')
  const [projectId, setProjectId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    setLoading(true)
    setError('')
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(false); return }
    sessionStorage.setItem('projectId', data.id)
    sessionStorage.setItem('projectName', data.name)
    router.push(`/dashboard/${data.id}`)
  }

  async function handleJoin() {
    setLoading(true)
    setError('')
    const res = await fetch(`/api/projects/${projectId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setLoading(false); return }
    sessionStorage.setItem('projectId', data.id)
    sessionStorage.setItem('projectName', data.name)
    router.push(`/dashboard/${data.id}`)
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Paysis Dashboard</h1>
        <p className="text-slate-500 text-sm mb-6">데이터를 업로드하고 분석하세요</p>

        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setMode('join')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'join' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            기존 프로젝트
          </button>
          <button
            onClick={() => setMode('create')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${mode === 'create' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            새 프로젝트
          </button>
        </div>

        <div className="space-y-4">
          {mode === 'create' && (
            <input
              type="text"
              placeholder="프로젝트 이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          )}
          {mode === 'join' && (
            <input
              type="text"
              placeholder="프로젝트 ID"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          )}
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
            onKeyDown={(e) => e.key === 'Enter' && (mode === 'create' ? handleCreate() : handleJoin())}
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            onClick={mode === 'create' ? handleCreate : handleJoin}
            disabled={loading}
            className="w-full bg-slate-800 text-white py-3 rounded-lg font-medium hover:bg-slate-700 transition disabled:opacity-50"
          >
            {loading ? '처리 중...' : mode === 'create' ? '프로젝트 만들기' : '입장하기'}
          </button>
        </div>

        {mode === 'create' && (
          <p className="text-xs text-slate-400 mt-4 text-center">
            프로젝트 생성 후 ID를 저장해두세요. 나중에 접속 시 필요합니다.
          </p>
        )}
      </div>
    </main>
  )
}
