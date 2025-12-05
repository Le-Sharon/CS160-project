"use client"

import { useState } from "react"
import { X, ChevronDown, ChevronRight, MapPin, GitCompare } from "lucide-react"
import { Button } from "@/components/ui/button"

interface ComparisonPair {
  idA: number
  idB: number
  distance_m: number
  pointA?: any
  pointB?: any
}

interface ComparisonPanelProps {
  pairs: ComparisonPair[]
  layerAName: string
  layerBName: string
  onClose: () => void
  onFlyTo?: (lat: number, lng: number) => void
}

export function ComparisonPanel({
  pairs,
  layerAName,
  layerBName,
  onClose,
  onFlyTo,
}: ComparisonPanelProps) {
  const [expandedPair, setExpandedPair] = useState<number | null>(null)

  const togglePair = (index: number) => {
    setExpandedPair((prev) => (prev === index ? null : index))
  }

  // Sort pairs by distance (closest first)
  const sortedPairs = [...pairs].sort((a, b) => a.distance_m - b.distance_m)

  return (
    <div className="absolute top-20 right-6 z-[9999] pointer-events-auto w-96 max-h-[calc(100vh-8rem)] rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 backdrop-blur-sm shadow-2xl flex flex-col">
      <div className="flex items-center justify-between border-b border-[oklch(0.25_0_0)] px-4 py-3">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-[oklch(0.6_0.2_250)]" />
          <h2 className="text-sm font-semibold text-[oklch(0.85_0_0)]">Layer Comparison</h2>
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
          Found <span className="text-[oklch(0.85_0_0)] font-semibold">{pairs.length}</span> point
          {pairs.length === 1 ? "" : "s"} within{" "}
          <span className="text-[oklch(0.85_0_0)] font-semibold">200m</span> of each other
        </p>
        <p className="text-xs text-[oklch(0.55_0_0)] mt-1">
          <span className="text-[oklch(0.6_0.2_250)]">{layerAName}</span> ↔{" "}
          <span className="text-[oklch(0.6_0.2_250)]">{layerBName}</span>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sortedPairs.length === 0 ? (
          <div className="text-center py-8 text-[oklch(0.55_0_0)] text-sm">
            No matching points found
          </div>
        ) : (
          sortedPairs.map((pair, index) => {
            const isExpanded = expandedPair === index
            const pointA = pair.pointA
            const pointB = pair.pointB

            return (
              <div
                key={`${pair.idA}-${pair.idB}`}
                className="rounded-md border border-[oklch(0.25_0_0)] bg-[oklch(0.12_0_0)]/60 overflow-hidden"
              >
                <button
                  onClick={() => togglePair(index)}
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
                    <div className="text-sm font-medium text-[oklch(0.85_0_0)]">
                      Pair {index + 1}
                    </div>
                    <div className="text-xs text-[oklch(0.55_0_0)]">
                      {pair.distance_m.toFixed(1)}m apart
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 space-y-3 border-t border-[oklch(0.25_0_0)]">
                    {/* Point A Details */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[oklch(0.6_0.2_250)] uppercase tracking-wide">
                        {layerAName} (ID: {pair.idA})
                      </div>
                      {pointA ? (
                        <div className="space-y-1.5 pl-2 border-l-2 border-[oklch(0.6_0.2_250)]/30">
                          {Object.entries(pointA.properties || {})
                            .filter(([key]) => !key.startsWith("_"))
                            .filter(([, value]) => value !== null && value !== undefined && value !== "")
                            .slice(0, 5)
                            .map(([key, value]) => {
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
                          {pointA.geometry && pointA.geometry.type === "Point" && onFlyTo && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const coords = pointA.geometry?.coordinates
                                if (coords && coords.length >= 2) {
                                  onFlyTo(coords[1], coords[0])
                                }
                              }}
                              className="w-full mt-1 h-7 text-xs border-[oklch(0.25_0_0)] bg-[oklch(0.12_0_0)] hover:bg-[oklch(0.18_0_0)]"
                            >
                              <MapPin className="w-3 h-3 mr-1" />
                              Fly to Point A
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-[oklch(0.55_0_0)] italic pl-2">
                          Point data not available
                        </div>
                      )}
                    </div>

                    {/* Distance */}
                    <div className="flex justify-between items-center text-xs py-1 border-y border-[oklch(0.25_0_0)]">
                      <span className="text-[oklch(0.55_0_0)]">Distance:</span>
                      <span className="text-[oklch(0.85_0_0)] font-semibold">
                        {pair.distance_m.toFixed(2)}m
                      </span>
                    </div>

                    {/* Point B Details */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-[oklch(0.6_0.2_250)] uppercase tracking-wide">
                        {layerBName} (ID: {pair.idB})
                      </div>
                      {pointB ? (
                        <div className="space-y-1.5 pl-2 border-l-2 border-[oklch(0.6_0.2_250)]/30">
                          {Object.entries(pointB.properties || {})
                            .filter(([key]) => !key.startsWith("_"))
                            .filter(([, value]) => value !== null && value !== undefined && value !== "")
                            .slice(0, 5)
                            .map(([key, value]) => {
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
                          {pointB.geometry && pointB.geometry.type === "Point" && onFlyTo && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const coords = pointB.geometry?.coordinates
                                if (coords && coords.length >= 2) {
                                  onFlyTo(coords[1], coords[0])
                                }
                              }}
                              className="w-full mt-1 h-7 text-xs border-[oklch(0.25_0_0)] bg-[oklch(0.12_0_0)] hover:bg-[oklch(0.18_0_0)]"
                            >
                              <MapPin className="w-3 h-3 mr-1" />
                              Fly to Point B
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-[oklch(0.55_0_0)] italic pl-2">
                          Point data not available
                        </div>
                      )}
                    </div>
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

