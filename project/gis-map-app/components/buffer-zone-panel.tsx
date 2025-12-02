"use client"

import { useState } from "react"
import { X, ChevronDown, ChevronRight, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface BufferPoint {
  id: number | string
  name: string
  distance_m?: number
  [key: string]: any
}

interface BufferZonePanelProps {
  points: BufferPoint[]
  radius: number
  centerName?: string
  onClose: () => void
  onFlyTo?: (lat: number, lng: number) => void
}

export function BufferZonePanel({
  points,
  radius,
  centerName,
  onClose,
  onFlyTo,
}: BufferZonePanelProps) {
  const [expandedPoints, setExpandedPoints] = useState<Set<number | string>>(new Set())

  const togglePoint = (id: number | string) => {
    setExpandedPoints((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Sort points by distance (closest first)
  const sortedPoints = [...points].sort((a, b) => {
    const distA = a.distance_m ?? Infinity
    const distB = b.distance_m ?? Infinity
    return distA - distB
  })

  return (
    <div className="absolute top-20 right-6 z-[9999] pointer-events-auto w-96 max-h-[calc(100vh-8rem)] rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 backdrop-blur-sm shadow-2xl flex flex-col">
      <div className="flex items-center justify-between border-b border-[oklch(0.25_0_0)] px-4 py-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[oklch(0.6_0.2_250)]" />
          <h2 className="text-sm font-semibold text-[oklch(0.85_0_0)]">Buffer Zone Results</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-7 w-7 p-0 hover:bg-[oklch(0.18_0_0)]"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="px-4 py-2 border-b border-[oklch(0.25_0_0)]">
        <p className="text-xs text-[oklch(0.55_0_0)]">
          Found <span className="text-[oklch(0.85_0_0)] font-semibold">{points.length}</span> point
          {points.length === 1 ? "" : "s"} within{" "}
          <span className="text-[oklch(0.85_0_0)] font-semibold">{radius}m</span> radius
          {centerName && ` of ${centerName}`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sortedPoints.length === 0 ? (
          <div className="text-center py-8 text-[oklch(0.55_0_0)] text-sm">
            No points found in buffer zone
          </div>
        ) : (
          sortedPoints.map((point) => {
            const isExpanded = expandedPoints.has(point.id)
            const distance = point.distance_m
            const pointName = point.name || `Point ${point.id}`

            // Get all properties except internal ones
            const properties = Object.entries(point)
              .filter(([key]) => !key.startsWith("_") && key !== "id" && key !== "name" && key !== "distance_m")
              .filter(([, value]) => value !== null && value !== undefined && value !== "")

            return (
              <div
                key={point.id}
                className="rounded-md border border-[oklch(0.25_0_0)] bg-[oklch(0.12_0_0)]/60 overflow-hidden"
              >
                <button
                  onClick={() => togglePoint(point.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[oklch(0.18_0_0)] transition-colors"
                >
                  <div className="flex items-center justify-center w-5 h-5">
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-[oklch(0.6_0.2_250)]" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-[oklch(0.6_0.2_250)]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[oklch(0.85_0_0)] truncate">
                      {pointName}
                    </div>
                    {distance !== undefined && (
                      <div className="text-xs text-[oklch(0.55_0_0)]">
                        {distance.toFixed(0)}m away
                      </div>
                    )}
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[oklch(0.25_0_0)]">
                    {distance !== undefined && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[oklch(0.55_0_0)]">Distance:</span>
                        <span className="text-[oklch(0.85_0_0)] font-medium">
                          {distance.toFixed(2)}m
                        </span>
                      </div>
                    )}
                    {properties.length > 0 ? (
                      <div className="space-y-1.5">
                        {properties.map(([key, value]) => {
                          const label = key.replace(/[_-]/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
                          return (
                            <div key={key} className="flex justify-between items-start text-xs gap-2">
                              <span className="text-[oklch(0.55_0_0)] flex-shrink-0">{label}:</span>
                              <span className="text-[oklch(0.85_0_0)] text-right break-words">
                                {String(value)}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-xs text-[oklch(0.55_0_0)] italic">No additional properties</div>
                    )}
                    {point.geometry && onFlyTo && point.geometry.type === "Point" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const coords = point.geometry?.coordinates
                          if (coords && coords.length >= 2) {
                            // GeoJSON format: [lon, lat]
                            onFlyTo(coords[1], coords[0]) // lat, lng
                          }
                        }}
                        className="w-full mt-2 h-7 text-xs border-[oklch(0.25_0_0)] bg-[oklch(0.12_0_0)] hover:bg-[oklch(0.18_0_0)]"
                      >
                        <MapPin className="w-3 h-3 mr-1" />
                        Fly to location
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

