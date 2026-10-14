import type { WsMessage, QuotaCell, TranscriptLine } from '../types'
import { MOCK_QUOTA_CELLS, MOCK_STATS, MOCK_ACTIVE_CALLS } from './data'

type Listener = (msg: WsMessage) => void

// Simulates WebSocket push events on a timer
export class MockWebSocket {
  private listeners: Listener[] = []
  private interval: ReturnType<typeof setInterval> | null = null
  private cells: QuotaCell[]
  private tick = 0

  constructor() {
    this.cells = MOCK_QUOTA_CELLS.map(c => ({ ...c }))
  }

  subscribe(fn: Listener) {
    this.listeners.push(fn)
  }

  unsubscribe(fn: Listener) {
    this.listeners = this.listeners.filter(l => l !== fn)
  }

  start() {
    this.interval = setInterval(() => {
      this.tick++

      // Every 3s: increment a random open cell
      if (this.tick % 3 === 0) {
        const open = this.cells.filter(c => c.status === 'open')
        if (open.length > 0) {
          const cell = open[Math.floor(Math.random() * open.length)]
          cell.completed = Math.min(cell.completed + 1, cell.target)
          if (cell.completed >= cell.target) cell.status = 'closed'
          this.emit({ type: 'quota_update', cell: { ...cell }, overallStats: { ...MOCK_STATS, totalSuccess: MOCK_STATS.totalSuccess + 1 } })
        }
      }

      // Every 5s: add a transcript line to active call 1
      if (this.tick % 5 === 0 && MOCK_ACTIVE_CALLS[0]) {
        const lines: TranscriptLine[] = [
          { speaker: 'agent', text: '"서구"라는 명칭을 들으면 어떤 이미지가 생각나십니까?', timestamp: new Date().toISOString() },
          { speaker: 'respondent', text: '그냥 방위 느낌이요. 특별한 특색은 없는 것 같아요.', timestamp: new Date().toISOString() },
          { speaker: 'agent', text: '서구 명칭 변경에 대해 어떻게 생각하십니까?', timestamp: new Date().toISOString() },
        ]
        const line = lines[this.tick % lines.length]
        this.emit({ type: 'transcript_update', callId: MOCK_ACTIVE_CALLS[0].callId, line })
      }

      // Every 15s: complete a call
      if (this.tick % 15 === 0) {
        this.emit({ type: 'call_completed', callId: MOCK_ACTIVE_CALLS[0]?.callId ?? 'call-live-1', resultCode: 0, responses: { Q1: 2, Q2: 3 } })
      }
    }, 1000)
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
  }

  private emit(msg: WsMessage) {
    this.listeners.forEach(fn => fn(msg))
  }
}

export const mockWs = new MockWebSocket()
