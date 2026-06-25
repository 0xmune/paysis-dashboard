'use client'

import { useState, useRef, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

type PreviewRow = Record<string, string | number | null>

type Step = 1 | 2 | 3 | 4

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadPyodide: (opts: { indexURL: string }) => Promise<any>
    pyodide: any
  }
}

export default function UploadPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [step, setStep] = useState<Step>(1)
  const [dataFiles, setDataFiles] = useState<File[]>([])
  const [pyFile, setPyFile] = useState<File | null>(null)
  const [pyCode, setPyCode] = useState('')

  const [pyodideReady, setPyodideReady] = useState(false)
  const [pyodideLoading, setPyodideLoading] = useState(false)

  const [running, setRunning] = useState(false)
  const [runLog, setRunLog] = useState<string[]>([])
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [error, setError] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ newRecords: number; skipped: number } | null>(null)

  const logRef = useRef<HTMLDivElement>(null)

  function addLog(msg: string) {
    setRunLog(prev => [...prev, msg])
    setTimeout(() => logRef.current?.scrollTo(0, logRef.current.scrollHeight), 50)
  }

  async function loadPyodide() {
    if (window.pyodide) { setPyodideReady(true); return }
    setPyodideLoading(true)
    addLog('Pyodide 로딩 중...')
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js'
    document.head.appendChild(script)
    await new Promise<void>((res) => { script.onload = () => res() })
    const py = await window.loadPyodide({ indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/' })
    addLog('pandas 설치 중...')
    await py.loadPackage(['pandas', 'openpyxl'])
    window.pyodide = py
    setPyodideReady(true)
    setPyodideLoading(false)
    addLog('준비 완료!')
  }

  function handleDataFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setDataFiles(prev => {
      const names = new Set(prev.map(f => f.name))
      return [...prev, ...files.filter(f => !names.has(f.name))]
    })
  }

  function removeDataFile(name: string) {
    setDataFiles(prev => prev.filter(f => f.name !== name))
  }

  async function handlePyFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPyFile(file)
    const text = await file.text()
    setPyCode(text)
  }

  async function runPython() {
    if (!pyodideReady) {
      await loadPyodide()
      return
    }
    setRunning(true)
    setError('')
    setPreview([])
    setRunLog([])

    try {
      const py = window.pyodide

      // 파일들을 가상 파일시스템에 올리기
      for (const file of dataFiles) {
        addLog(`파일 로딩: ${file.name}`)
        const buf = await file.arrayBuffer()
        py.FS.writeFile(file.name, new Uint8Array(buf))
      }

      addLog('Python 실행 중...')

      // stdout 캡처
      py.runPython(`
import sys
import io
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
      `)

      const code = pyCode || `
import pandas as pd
${dataFiles.map(f => {
  const ext = f.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') return `df = pd.read_csv('${f.name}')`
  return `df = pd.read_excel('${f.name}')`
}).join('\n')}
result = df
`
      py.runPython(code)

      const stdout = py.runPython('sys.stdout.getvalue()')
      if (stdout) stdout.split('\n').filter(Boolean).forEach((l: string) => addLog(l))

      // result 추출
      const hasResult = py.runPython(`'result' in dir()`)
      if (!hasResult) throw new Error("Python 코드에 'result' 변수가 없습니다.")

      const jsonStr = py.runPython(`
import json
result.to_json(orient='records', force_ascii=False)
      `)
      const data: PreviewRow[] = JSON.parse(jsonStr)
      setPreview(data)
      addLog(`완료! ${data.length}건 추출`)
      setStep(4)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      addLog(`오류: ${msg}`)
    } finally {
      setRunning(false)
    }
  }

  async function saveData() {
    setSaving(true)
    let totalNew = 0, totalSkipped = 0

    if (preview.length > 0) {
      // Python 처리된 결과 저장
      const res = await fetch('/api/upload-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, rows: preview }),
      })
      const result = await res.json()
      totalNew = result.newRecords
      totalSkipped = result.skipped
    } else {
      // Python 없이 원본 파일 저장
      for (const file of dataFiles) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('projectId', id)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const result = await res.json()
        totalNew += result.newRecords
        totalSkipped += result.skipped
      }
    }

    setSaveResult({ newRecords: totalNew, skipped: totalSkipped })
    setSaving(false)
  }

  useEffect(() => {
    if (step === 3 && !pyodideReady && !pyodideLoading && pyFile) {
      loadPyodide()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/dashboard/${id}`)} className="text-slate-400 hover:text-white text-sm transition">← 대시보드</button>
          <span className="text-slate-700">|</span>
          <h1 className="text-sm font-semibold">데이터 업로드</h1>
        </div>
      </header>

      {/* Step Indicator */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-0 max-w-2xl mx-auto">
          {[
            { n: 1, label: '데이터 파일' },
            { n: 2, label: 'Python 파일' },
            { n: 3, label: 'Python 실행' },
            { n: 4, label: '저장 완료' },
          ].map((s, i) => (
            <div key={s.n} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition ${step >= s.n ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-500'}`}>
                  {step > s.n ? '✓' : s.n}
                </div>
                <span className={`text-xs whitespace-nowrap ${step >= s.n ? 'text-slate-300' : 'text-slate-600'}`}>{s.label}</span>
              </div>
              {i < 3 && <div className={`flex-1 h-px mx-2 mb-4 ${step > s.n ? 'bg-blue-600' : 'bg-slate-800'}`} />}
            </div>
          ))}
        </div>
      </div>

      <main className="flex-1 flex items-start justify-center p-6">
        <div className="w-full max-w-2xl space-y-4">

          {/* Step 1 */}
          {step === 1 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-base font-bold mb-1">데이터 파일 업로드</h2>
              <p className="text-slate-500 text-xs mb-5">CSV, XLSX 파일을 여러 개 선택할 수 있어요.</p>

              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-10 cursor-pointer transition">
                <span className="text-3xl mb-2">📂</span>
                <span className="text-sm text-slate-400">클릭하여 파일 선택</span>
                <span className="text-xs text-slate-600 mt-1">.csv, .xlsx, .xls 지원</span>
                <input type="file" accept=".csv,.xlsx,.xls" multiple className="hidden" onChange={handleDataFiles} />
              </label>

              {dataFiles.length > 0 && (
                <div className="mt-4 space-y-2">
                  {dataFiles.map(f => (
                    <div key={f.name} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-400 text-sm">📄</span>
                        <span className="text-sm text-slate-300">{f.name}</span>
                        <span className="text-xs text-slate-500">{(f.size / 1024).toFixed(0)}KB</span>
                      </div>
                      <button onClick={() => removeDataFile(f.name)} className="text-slate-500 hover:text-red-400 text-xs transition">✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end mt-6">
                <button
                  onClick={() => setStep(2)}
                  disabled={dataFiles.length === 0}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-40"
                >
                  다음 →
                </button>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-base font-bold mb-1">Python 파일 업로드 (선택)</h2>
              <p className="text-slate-500 text-xs mb-1">
                데이터를 가공할 Python 파일을 올려주세요. 없으면 건너뛰세요.
              </p>
              <div className="bg-slate-800 rounded-lg px-3 py-2 mb-5">
                <p className="text-xs text-slate-400 mb-1">스크립트 규칙:</p>
                <ul className="text-xs text-slate-500 space-y-0.5 list-disc list-inside">
                  <li>업로드한 파일명 그대로 사용 가능</li>
                  <li>최종 결과를 <code className="text-blue-400">result</code> 변수에 담아주세요</li>
                </ul>
                <pre className="text-xs text-slate-400 mt-2 bg-slate-900 rounded p-2 overflow-x-auto">{`import pandas as pd

df = pd.read_csv('매출데이터.csv')
df['합계'] = df['거래금액'] + df['충전금액']
result = df[df['합계'] > 100000]`}</pre>
              </div>

              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-8 cursor-pointer transition">
                <span className="text-3xl mb-2">🐍</span>
                <span className="text-sm text-slate-400">{pyFile ? pyFile.name : '.py 파일 선택'}</span>
                {pyFile && <span className="text-xs text-green-400 mt-1">✓ 선택됨</span>}
                <input type="file" accept=".py" className="hidden" onChange={handlePyFile} />
              </label>

              {pyCode && (
                <pre className="mt-3 text-xs text-slate-400 bg-slate-800 rounded-lg p-3 max-h-40 overflow-y-auto">{pyCode}</pre>
              )}

              <div className="flex justify-between mt-6">
                <button onClick={() => setStep(1)} className="text-slate-400 hover:text-white text-sm transition">← 이전</button>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPyFile(null); setPyCode(''); setStep(4) }}
                    className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-4 py-2.5 rounded-lg text-sm transition"
                  >
                    건너뛰기
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!pyFile}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-40"
                  >
                    Python 실행 →
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-base font-bold mb-1">Python 실행</h2>
              <p className="text-slate-500 text-xs mb-4">브라우저에서 Python을 실행해 데이터를 가공해요.</p>

              <div ref={logRef} className="bg-slate-950 rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs space-y-0.5 mb-4">
                {runLog.length === 0 && <p className="text-slate-600">실행 버튼을 눌러주세요.</p>}
                {runLog.map((l, i) => (
                  <p key={i} className={l.startsWith('오류') ? 'text-red-400' : l.startsWith('완료') ? 'text-green-400' : 'text-slate-400'}>{l}</p>
                ))}
              </div>

              {error && (
                <div className="bg-red-900/20 border border-red-800 rounded-lg p-3 mb-4 text-xs text-red-400">{error}</div>
              )}

              {preview.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-slate-500 mb-2">미리보기 (상위 5건)</p>
                  <div className="overflow-x-auto rounded-lg border border-slate-800">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-800/50">
                          {Object.keys(preview[0]).slice(0, 8).map(k => (
                            <th key={k} className="text-left py-2 px-3 text-slate-400 font-medium whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-slate-800/50">
                            {Object.keys(preview[0]).slice(0, 8).map(k => (
                              <td key={k} className="py-2 px-3 text-slate-300 whitespace-nowrap">{String(row[k] ?? '')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">전체 {preview.length.toLocaleString()}건</p>
                </div>
              )}

              <div className="flex justify-between">
                <button onClick={() => setStep(2)} className="text-slate-400 hover:text-white text-sm transition">← 이전</button>
                <button
                  onClick={runPython}
                  disabled={running || pyodideLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {pyodideLoading ? 'Pyodide 로딩 중...' : running ? '실행 중...' : preview.length > 0 ? '다시 실행' : '실행'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4 - Save */}
          {step === 4 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-base font-bold mb-1">저장</h2>
              <p className="text-slate-500 text-xs mb-5">
                {preview.length > 0
                  ? `Python 처리 결과 ${preview.length.toLocaleString()}건을 저장합니다.`
                  : `원본 파일 ${dataFiles.length}개를 저장합니다.`}
              </p>

              <div className="space-y-2 mb-6">
                {dataFiles.map(f => (
                  <div key={f.name} className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-2">
                    <span className="text-blue-400 text-sm">📄</span>
                    <span className="text-sm text-slate-300">{f.name}</span>
                  </div>
                ))}
                {preview.length > 0 && (
                  <div className="flex items-center gap-2 bg-green-900/20 border border-green-800 rounded-lg px-3 py-2">
                    <span className="text-green-400 text-sm">🐍</span>
                    <span className="text-sm text-green-300">Python 가공 결과 {preview.length.toLocaleString()}건</span>
                  </div>
                )}
              </div>

              {saveResult ? (
                <div className="bg-green-900/20 border border-green-700 rounded-xl p-4 mb-4 text-center">
                  <p className="text-green-400 font-bold text-lg">{saveResult.newRecords.toLocaleString()}건 저장 완료</p>
                  <p className="text-slate-500 text-xs mt-1">{saveResult.skipped}건 중복 제거됨</p>
                  <button
                    onClick={() => router.push(`/dashboard/${id}`)}
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition"
                  >
                    대시보드 보기 →
                  </button>
                </div>
              ) : (
                <div className="flex justify-between">
                  <button onClick={() => setStep(pyFile ? 3 : 2)} className="text-slate-400 hover:text-white text-sm transition">← 이전</button>
                  <button
                    onClick={saveData}
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : '대시보드에 저장'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
