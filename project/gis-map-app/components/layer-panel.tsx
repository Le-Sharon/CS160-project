"use client"

import { useState } from "react"
import { Layers, Wind, Cloud, Bus, Droplets, ChevronRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface LayerPanelProps {
  activeLayers: string[]
  onLayerToggle: (layerId: string) => void
  mapLoaded: boolean
  onLayerFetch?: (layerId: string) => void
}

const layerCategories = [
  {
    id: "environmental",
    name: "Environmental",
    icon: Wind,
    layers: [
      { id: "air-quality", name: "Air Quality", icon: Wind, color: "oklch(0.6 0.2 250)" },
      { id: "weather", name: "Weather", icon: Cloud, color: "oklch(0.65 0.2 75)" },
      { id: "water-quality", name: "Water Quality", icon: Droplets, color: "oklch(0.55 0.15 160)" },
    ],
  },
  {
    id: "transportation",
    name: "Transportation",
    icon: Bus,
    layers: [{ id: "public-transit", name: "Public Transit", icon: Bus, color: "oklch(0.7 0.18 310)" }],
  },
]

export function LayerPanel({ activeLayers, onLayerToggle, mapLoaded, onLayerFetch }: LayerPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [expandedCategories, setExpandedCategories] = useState<string[]>(["environmental", "transportation"])

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId],
    )
  }

  return (
    <div
      className={cn(
        "absolute top-20 left-6 z-[9999] pointer-events-auto w-80 rounded-lg border border-[oklch(0.25_0_0)] bg-[oklch(0.15_0_0)]/95 backdrop-blur-sm shadow-2xl transition-transform duration-300",
        !isExpanded && "-translate-x-[calc(100%-3rem)]",
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[oklch(0.25_0_0)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[oklch(0.6_0.2_250)]" />
          <h2 className="text-sm font-semibold text-[oklch(0.85_0_0)]">Map Layers</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="h-7 w-7 p-0 hover:bg-[oklch(0.18_0_0)]"
        >
          <ChevronRight
            className={cn("w-4 h-4 text-[oklch(0.55_0_0)] transition-transform", isExpanded && "rotate-180")}
          />
        </Button>
      </div>

      {/* Content */}
      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-2">
        {!mapLoaded ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-[oklch(0.6_0.2_250)] animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {layerCategories.map((category) => {
              const CategoryIcon = category.icon
              const isCategoryExpanded = expandedCategories.includes(category.id)

              return (
                <div key={category.id} className="rounded-md border border-[oklch(0.25_0_0)] bg-[oklch(0.12_0_0)]/50">
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="flex w-full items-center justify-between px-3 py-2 hover:bg-[oklch(0.18_0_0)] rounded-t-md transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <CategoryIcon className="w-4 h-4 text-[oklch(0.55_0_0)]" />
                      <span className="text-sm font-medium text-[oklch(0.85_0_0)]">{category.name}</span>
                    </div>
                    <ChevronRight
                      className={cn(
                        "w-4 h-4 text-[oklch(0.55_0_0)] transition-transform",
                        isCategoryExpanded && "rotate-90",
                      )}
                    />
                  </button>

                  {/* Layers */}
                  {isCategoryExpanded && (
                    <div className="border-t border-[oklch(0.25_0_0)] p-1">
                      {category.layers.map((layer) => {
                        const LayerIcon = layer.icon
                        const isActive = activeLayers.includes(layer.id)

                        return (
                          <button
                            key={layer.id}
                            onClick={() => {
                              const willBeActive = !isActive
                              onLayerToggle(layer.id)
                              if (willBeActive && typeof onLayerFetch === "function") {
                                onLayerFetch(layer.id)
                              }
                            }}
                            className={cn(
                              "flex w-full items-center gap-3 rounded px-2 py-2 transition-colors",
                              isActive
                                ? "bg-[oklch(0.6_0.2_250)]/10 hover:bg-[oklch(0.6_0.2_250)]/15"
                                : "hover:bg-[oklch(0.18_0_0)]",
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded border transition-colors",
                                isActive
                                  ? "border-[oklch(0.6_0.2_250)] bg-[oklch(0.6_0.2_250)]/20"
                                  : "border-[oklch(0.25_0_0)] bg-transparent",
                              )}
                            >
                              <LayerIcon
                                className="w-3.5 h-3.5"
                                style={{ color: isActive ? layer.color : "oklch(0.55 0 0)" }}
                              />
                            </div>
                            <span
                              className={cn(
                                "text-sm",
                                isActive ? "text-[oklch(0.85_0_0)] font-medium" : "text-[oklch(0.55_0_0)]",
                              )}
                            >
                              {layer.name}
                            </span>
                            {isActive && (
                              <div className="ml-auto h-2 w-2 rounded-full" style={{ backgroundColor: layer.color }} />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[oklch(0.25_0_0)] px-4 py-2">
        <p className="text-xs text-[oklch(0.55_0_0)]">
          {activeLayers.length} {activeLayers.length === 1 ? "layer" : "layers"} active
        </p>
      </div>
    </div>
  )
}
