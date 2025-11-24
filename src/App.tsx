import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup } from 'react-leaflet';
import Papa from 'papaparse';
import 'leaflet/dist/leaflet.css';
import TSPWorker from './tsp.worker?worker';
import { CITY_COORDS } from './coords';

// --- Configuración de Iconos de Leaflet ---
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export interface Edge {
  u: number;
  v: number;
  w: number;
}

interface PathStep {
    from: string;
    to: string;
    dist: number;
}

const App: React.FC = () => {
  const [edges, setEdges] = useState<Edge[]>([]);
  const [cityMapping, setCityMapping] = useState<string[]>([]); 
  
  // Estado para controlar que ruta se ve EN EL MAPA (MIN o MAX)
  const [viewMode, setViewMode] = useState<'MIN' | 'MAX'>('MIN');

  // Estados visuales (Coordenadas para el mapa)
  const [minPathCoords, setMinPathCoords] = useState<[number, number][]>([]);
  const [maxPathCoords, setMaxPathCoords] = useState<[number, number][]>([]);
  
  // Estados de datos (Detalle texto para el panel)
  const [minPathDetails, setMinPathDetails] = useState<PathStep[]>([]);
  const [maxPathDetails, setMaxPathDetails] = useState<PathStep[]>([]);

  const [minCost, setMinCost] = useState(0);
  const [maxCost, setMaxCost] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const workerMinRef = useRef<Worker | null>(null);
  const workerMaxRef = useRef<Worker | null>(null);

  // --- Lógica de Parseo ---
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    // Reiniciar estados
    setMinPathCoords([]); setMaxPathCoords([]); 
    setMinPathDetails([]); setMaxPathDetails([]);
    setMinCost(0); setMaxCost(0);

    Papa.parse(file, {
      header: false, 
      skipEmptyLines: true,
      complete: (results) => {
        const rawData = results.data as string[][];
        if (rawData.length < 2) return;

        const headerCities = rawData[0].slice(1).map(c => c.trim());
        const uniqueCities = new Set<string>();
        
        headerCities.forEach(c => uniqueCities.add(c));
        for (let i = 1; i < rawData.length; i++) {
            const rowCity = rawData[i][0]?.trim();
            if (rowCity) uniqueCities.add(rowCity);
        }

        const validCities = Array.from(uniqueCities).filter(city => CITY_COORDS[city]).sort();
        const cityToIndex: Record<string, number> = {};
        validCities.forEach((city, index) => {
            cityToIndex[city] = index;
        });

        setCityMapping(validCities);

        const newEdges: Edge[] = [];
        for (let i = 1; i < rawData.length; i++) {
            const originName = rawData[i][0]?.trim();
            if (!cityToIndex.hasOwnProperty(originName)) continue;
            const u = cityToIndex[originName];

            for (let j = 0; j < headerCities.length; j++) {
                const destName = headerCities[j];
                if (!cityToIndex.hasOwnProperty(destName)) continue;
                const v = cityToIndex[destName];
                
                if (u < v) {
                    const cellValue = rawData[i][j + 1];
                    const dist = parseFloat(cellValue); 
                    if (!isNaN(dist) && dist > 0) {
                        newEdges.push({ u, v, w: dist });
                    }
                }
            }
        }
        setEdges(newEdges);
      }
    });
  };

  // --- Comunicación con Workers ---
  useEffect(() => {
    if (edges.length === 0 || cityMapping.length === 0) {
        setIsProcessing(false);
        return;
    }

    if (workerMinRef.current) workerMinRef.current.terminate();
    if (workerMaxRef.current) workerMaxRef.current.terminate();

    const numCities = cityMapping.length;

    const handleWorkerResponse = (data: any, type: 'MIN' | 'MAX') => {
        const { path, details, cost } = data;
        const coordsPath = path.map((idx: number) => CITY_COORDS[cityMapping[idx]]);
        
        const textDetails: PathStep[] = details.map((step: any) => ({
            from: cityMapping[step.from],
            to: cityMapping[step.to],
            dist: step.dist
        }));

        if (type === 'MIN') {
            setMinPathCoords(coordsPath);
            setMinPathDetails(textDetails);
            setMinCost(cost);
        } else {
            setMaxPathCoords(coordsPath);
            setMaxPathDetails(textDetails);
            setMaxCost(cost);
            setIsProcessing(false);
        }
    };

    workerMinRef.current = new TSPWorker();
    workerMinRef.current.postMessage({ edges, numCities, mode: 'MIN' });
    workerMinRef.current.onmessage = (e) => handleWorkerResponse(e.data, 'MIN');

    workerMaxRef.current = new TSPWorker();
    workerMaxRef.current.postMessage({ edges, numCities, mode: 'MAX' });
    workerMaxRef.current.onmessage = (e) => handleWorkerResponse(e.data, 'MAX');

  }, [edges, cityMapping]);

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "Segoe UI, sans-serif" }}>
      
      {/* 1. Header de Control */}
      <div style={{ padding: "15px 20px", background: "#f8f9fa", borderBottom: "1px solid #ddd", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
            <h2 style={{ margin: 0, fontSize: "1.2rem", color: "#333" }}>Heuristica Voraz 2</h2>
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} style={{ padding: "5px" }} />
            {isProcessing && <span style={{ color: "orange", fontWeight: "bold" }}>Calculando...</span>}
        </div>
        
        {/* Controles de visualización (Solo Mapa) */}
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span style={{fontSize: "0.9rem", color: "#555", marginRight: "5px"}}>Ver en Mapa:</span>
            <button 
                onClick={() => setViewMode('MIN')}
                style={{
                    padding: "8px 16px",
                    cursor: "pointer",
                    border: "1px solid #007bff",
                    background: viewMode === 'MIN' ? "#007bff" : "white",
                    color: viewMode === 'MIN' ? "white" : "#007bff",
                    borderRadius: "4px",
                    fontWeight: "bold"
                }}
            >
                Ruta Corta
            </button>
            <button 
                onClick={() => setViewMode('MAX')}
                style={{
                    padding: "8px 16px",
                    cursor: "pointer",
                    border: "1px solid #dc3545",
                    background: viewMode === 'MAX' ? "#dc3545" : "white",
                    color: viewMode === 'MAX' ? "white" : "#dc3545",
                    borderRadius: "4px",
                    fontWeight: "bold"
                }}
            >
                Ruta Larga
            </button>
        </div>
      </div>
      
      {/* 2. Área Principal: Mapa y Panel Lateral */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        
        {/* Lado Izquierdo: Mapa */}
        <div style={{ flex: 2, position: "relative" }}>
            <MapContainer center={[23.6345, -102.5528]} zoom={5} style={{ height: "100%", width: "100%" }}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />

                {cityMapping.map((name, idx) => (
                    <Marker key={idx} position={CITY_COORDS[name]}>
                        <Popup><b>{name}</b></Popup>
                    </Marker>
                ))}

                {/* Renderizado Condicional en Mapa (Depende del switch) */}
                {viewMode === 'MIN' && minPathCoords.length > 0 && (
                    <Polyline positions={minPathCoords} color="#007bff" weight={5} opacity={0.8} />
                )}
                
                {viewMode === 'MAX' && maxPathCoords.length > 0 && (
                    <Polyline positions={maxPathCoords} color="#dc3545" weight={5} opacity={0.8} dashArray="10, 10" />
                )}
            </MapContainer>
        </div>

        {/* Lado Derecho: Panel de Detalles (Doble Columna) */}
        <div style={{ flex: 1, minWidth: "500px", overflow: "hidden", background: "white", borderLeft: "2px solid #ddd", display: "flex", flexDirection: "row" }}>
            
            {/* Columna Izquierda: Ruta Corta */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid #eee", overflowY: "auto" }}>
                <div style={{ padding: "15px", background: "#f0f8ff", borderBottom: "1px solid #cce5ff", position: "sticky", top: 0 }}>
                    <h3 style={{ color: "#007bff", margin: "0", fontSize: "1rem" }}>Ruta Corta</h3>
                    <div style={{ color: "#333", fontSize: "1.2rem", fontWeight: "bold" }}>{minCost.toLocaleString()} km</div>
                </div>
                
                {minPathDetails.length === 0 ? <p style={{color: "#999", padding: "15px"}}>Carga un archivo...</p> : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.85rem" }}>
                        {minPathDetails.map((step, i) => (
                            <li key={i} style={{ padding: "10px 15px", borderBottom: "1px solid #f0f0f0" }}>
                                <div style={{ fontWeight: "bold", color: "#555" }}>Paso {i+1}</div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span>{step.from} &rarr; {step.to}</span>
                                    <b>{step.dist} km</b>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Columna Derecha: Ruta Larga */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "auto" }}>
                <div style={{ padding: "15px", background: "#fff5f5", borderBottom: "1px solid #fadbd8", position: "sticky", top: 0 }}>
                    <h3 style={{ color: "#dc3545", margin: "0", fontSize: "1rem" }}>Ruta Larga</h3>
                    <div style={{ color: "#333", fontSize: "1.2rem", fontWeight: "bold" }}>{maxCost.toLocaleString()} km</div>
                </div>

                {maxPathDetails.length === 0 ? <p style={{color: "#999", padding: "15px"}}>Carga un archivo...</p> : (
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "0.85rem" }}>
                        {maxPathDetails.map((step, i) => (
                            <li key={i} style={{ padding: "10px 15px", borderBottom: "1px solid #f0f0f0" }}>
                                <div style={{ fontWeight: "bold", color: "#555" }}>Paso {i+1}</div>
                                <div style={{ display: "flex", justifyContent: "space-between" }}>
                                    <span>{step.from} &rarr; {step.to}</span>
                                    <b>{step.dist} km</b>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            
        </div>
      </div>
    </div>
  );
};

export default App;