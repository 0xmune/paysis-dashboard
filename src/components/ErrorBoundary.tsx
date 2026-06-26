'use client'

import { Component, ReactNode } from 'react'

export default class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-white border border-red-100 rounded-2xl p-5 flex flex-col items-center justify-center min-h-[120px] gap-2">
          <span className="text-2xl">⚠️</span>
          <p className="text-xs text-red-400 font-medium">{this.props.label ?? '위젯'} 오류</p>
          <button onClick={() => this.setState({ error: null })} className="text-xs text-gray-400 hover:text-gray-600 underline">다시 시도</button>
        </div>
      )
    }
    return this.props.children
  }
}
