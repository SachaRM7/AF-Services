import "leaflet/dist/leaflet.css";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import { sortBands, type TravelBand } from "../lib/travel";
import { formatEuros } from "../lib/money";

const RING_STYLES = [
  { color: "#292C2B", fill: 0.16 },
  { color: "#3A3E3C", fill: 0.1 },
  { color: "#5E6361", fill: 0.06 },
];

function FitTo({ lat, lng, point }: { lat: number; lng: number; point?: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.fitBounds([[lat, lng], [point.lat, point.lng]], { padding: [48, 48], maxZoom: 12 });
  }, [map, lat, lng, point]);
  return null;
}

export default function ZoneMap({
  base,
  bands,
  point,
  className = "h-[420px]",
}: {
  base: { lat: number; lng: number; label: string };
  bands: TravelBand[];
  point?: { lat: number; lng: number; label?: string } | null;
  className?: string;
}) {
  const rings = sortBands(bands).filter((b) => b.max_km != null);
  return (
    <div className={`overflow-hidden rounded-2xl border border-stone/40 ${className}`}>
      <MapContainer
        center={[base.lat, base.lng]}
        zoom={10}
        scrollWheelZoom={false}
        className="h-full w-full"
        attributionControl
      >
        <TileLayer
          url="https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}"
          attribution='&copy; <a href="https://www.ign.fr/">IGN</a> – Géoplateforme'
          maxZoom={18}
          className="af-tiles"
        />
        {[...rings].reverse().map((b, i) => {
          const style = RING_STYLES[Math.min(rings.length - 1 - i, RING_STYLES.length - 1)];
          return (
            <Circle
              key={b.max_km}
              center={[base.lat, base.lng]}
              radius={(b.max_km as number) * 1000}
              pathOptions={{ color: style.color, weight: 1.25, fillColor: "#292C2B", fillOpacity: style.fill, dashArray: "4 4" }}
            >
              <Tooltip sticky>
                {b.label} · {formatEuros(b.fee_cents)} HT
              </Tooltip>
            </Circle>
          );
        })}
        <CircleMarker center={[base.lat, base.lng]} radius={6} pathOptions={{ color: "#F5F4F1", weight: 2, fillColor: "#292C2B", fillOpacity: 1 }}>
          <Tooltip permanent direction="right" offset={[8, 0]}>
            {base.label}
          </Tooltip>
        </CircleMarker>
        {point && (
          <CircleMarker center={[point.lat, point.lng]} radius={8} pathOptions={{ color: "#292C2B", weight: 3, fillColor: "#FFFFFF", fillOpacity: 1 }}>
            <Tooltip permanent direction="top" offset={[0, -8]}>
              {point.label ?? "Votre adresse"}
            </Tooltip>
          </CircleMarker>
        )}
        <FitTo lat={base.lat} lng={base.lng} point={point} />
      </MapContainer>
    </div>
  );
}
