"use client"

import { Map, Navigation } from "lucide-react"

interface MapHeaderProps {
  coordinates: {
    lng: number
    lat: number
    zoom: number
  }
}

export function MapHeader({ coordinates }: MapHeaderProps) {
  return (
  <header className="absolute top-0 left-0 right-0 z-[9999] pointer-events-auto border-b border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[oklch(0.6_0.2_250)]/10 border border-[oklch(0.6_0.2_250)]/20">
            <Map className="w-5 h-5 text-[oklch(0.6_0.2_250)]" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[oklch(0.85_0_0)] leading-tight">Environmental GIS Explorer</h1>
            <p className="text-sm text-[oklch(0.55_0_0)] leading-tight">Interactive mapping & data visualization</p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[oklch(0.12_0_0)] border border-[oklch(0.25_0_0)]">
            <Navigation className="w-4 h-4 text-[oklch(0.6_0.2_250)]" />
            <div className="flex items-center gap-3 font-mono text-xs text-[oklch(0.55_0_0)]">
              <span>
                Lng: <span className="text-[oklch(0.85_0_0)]">{coordinates.lng}</span>
              </span>
              <span className="text-[oklch(0.25_0_0)]">|</span>
              <span>
                Lat: <span className="text-[oklch(0.85_0_0)]">{coordinates.lat}</span>
              </span>
              <span className="text-[oklch(0.25_0_0)]">|</span>
              <span>
                Zoom: <span className="text-[oklch(0.85_0_0)]">{coordinates.zoom}</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
