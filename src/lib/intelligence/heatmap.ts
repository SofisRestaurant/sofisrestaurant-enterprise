export interface HeatmapData {
  x: number
  y: number
  clicks: number
  timestamp: number
}

class HeatmapTracker {
  private data: HeatmapData[] = []

  trackClick(x: number, y: number): void {
    const existing = this.data.find(
      (d) => Math.abs(d.x - x) < 10 && Math.abs(d.y - y) < 10
    )

    if (existing) {
      existing.clicks++
    } else {
      this.data.push({ x, y, clicks: 1, timestamp: Date.now() })
    }
  }

  getData(): HeatmapData[] {
    return [...this.data]
  }

  getHotspots(minClicks: number = 5): HeatmapData[] {
    return this.data.filter((d) => d.clicks >= minClicks)
  }

  reset(): void {
    this.data = []
  }
}

export const heatmapTracker = new HeatmapTracker()
