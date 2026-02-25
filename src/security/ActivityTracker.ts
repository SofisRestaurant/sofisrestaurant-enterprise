export class ActivityTracker {
  private timer: ReturnType<typeof setTimeout> | null = null
  private timeoutMs: number
  private onIdle: () => void
  private resetHandler: (() => void) | null = null

  constructor(timeoutMinutes: number, onIdle: () => void) {
    this.timeoutMs = timeoutMinutes * 60 * 1000
    this.onIdle = onIdle
  }

  start() {
    const reset = () => {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(this.onIdle, this.timeoutMs)
    }

    this.resetHandler = reset

    window.addEventListener('mousemove', reset)
    window.addEventListener('keydown', reset)
    window.addEventListener('click', reset)
    window.addEventListener('scroll', reset)
    window.addEventListener('touchstart', reset)

    reset()
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    if (this.resetHandler) {
      window.removeEventListener('mousemove', this.resetHandler)
      window.removeEventListener('keydown', this.resetHandler)
      window.removeEventListener('click', this.resetHandler)
      window.removeEventListener('scroll', this.resetHandler)
      window.removeEventListener('touchstart', this.resetHandler)
      this.resetHandler = null
    }
  }
}