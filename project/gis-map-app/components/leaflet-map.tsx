"use client"

import { useEffect, useRef } from "react"

declare global {
  interface Window {
    L: any
  }
}

interface LeafletMapProps {
  onMapReady: (map: any) => void
  onMove: (coords: { lng: number; lat: number; zoom: number }) => void
  geoJson?: any
  fitToBounds?: boolean
}

export default function LeafletMap({ onMapReady, onMove, geoJson, fitToBounds = true }: LeafletMapProps) {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const geoJsonLayerRef = useRef<any>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return

    const initMap = () => {
      if (typeof window === "undefined" || !window.L) {
        setTimeout(initMap, 100)
        return
      }

      const L = window.L

      const map = L.map(mapRef.current, {
        center: [39.8283, -98.5795],
        zoom: 4,
        zoomControl: true,
        attributionControl: true,
      })

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map)

      map.on("move", () => {
        const center = map.getCenter()
        const zoom = map.getZoom()
        onMove({
          lng: Number(center.lng.toFixed(4)),
          lat: Number(center.lat.toFixed(4)),
          zoom: Number(zoom.toFixed(2)),
        })
      })

      mapInstanceRef.current = map
      onMapReady(map)
    }

    initMap()

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [onMapReady, onMove])

  // Watch for geoJson prop changes and add/remove layer accordingly
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    // remove existing geojson layer
    if (geoJsonLayerRef.current) {
      try {
        map.removeLayer(geoJsonLayerRef.current)
      } catch (e) {
        /* ignore */
      }
      geoJsonLayerRef.current = null
    }

    if (!geoJson) return
    if (typeof window === "undefined" || !window.L) return
    const L = window.L

    try {
      const layer = L.geoJSON(geoJson, {
        onEachFeature: (feature: any, layerInner: any) => {
          if (feature?.properties) {
            const popupContent = feature.properties.popup || feature.properties.name || null
            if (popupContent) layerInner.bindPopup(String(popupContent))
          }
        },
      }).addTo(map)

      geoJsonLayerRef.current = layer

      // Optionally fit map to the layer bounds
      try {
        if (fitToBounds !== false && layer.getBounds && typeof layer.getBounds === "function") {
          const bounds = layer.getBounds()
          if (bounds && typeof bounds.isValid === "function" ? bounds.isValid() : true) {
            map.fitBounds(bounds)
          }
        }
      } catch (e) {
        // ignore fit errors
      }
    } catch (e) {
      console.error("Failed to add GeoJSON layer:", e)
    }
  }, [geoJson, fitToBounds])

  return <div ref={mapRef} className="h-full w-full" />
}
