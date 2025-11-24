import type { Edge } from './App';

// Estructura para detectar ciclos
class UnionFind {
    parent: number[];
    size: number[];

    constructor(n: number) {
        this.parent = Array.from({ length: n }, (_, i) => i);
        this.size = new Array(n).fill(1);
    }

    find(i: number): number {
        if (this.parent[i] === i) return i;
        this.parent[i] = this.find(this.parent[i]);
        return this.parent[i];
    }

    union(i: number, j: number) {
        const rootI = this.find(i);
        const rootJ = this.find(j);
        if (rootI !== rootJ) {
            this.parent[rootI] = rootJ;
            this.size[rootJ] += this.size[rootI];
            return true;
        }
        return false;
    }
    
    componentSize(i: number): number {
        return this.size[this.find(i)];
    }
}

self.onmessage = (e: MessageEvent) => {
    const { edges, numCities, mode } = e.data as { edges: Edge[], numCities: number, mode: 'MIN' | 'MAX' };

    // 1. Clonar y Ordenar Aristas
    const sortedEdges = [...edges].sort((a, b) => mode === 'MIN' ? a.w - b.w : b.w - a.w);

    const uf = new UnionFind(numCities);
    const degrees = new Array(numCities).fill(0);
    const selectedEdges: Edge[] = [];
    
    // Ahora 'adj' guardará también el peso para poder reconstruir el detalle
    const adj: { to: number, w: number }[][] = Array.from({ length: numCities }, () => []);

    // 2. Ejecutar Heurística Voraz 2
    for (const edge of sortedEdges) {
        const { u, v, w } = edge;

        if (degrees[u] >= 2 || degrees[v] >= 2) continue;

        const rootU = uf.find(u);
        const rootV = uf.find(v);
        const formsCycle = (rootU === rootV);
        
        const addEdge = () => {
            uf.union(u, v);
            selectedEdges.push(edge);
            degrees[u]++;
            degrees[v]++;
            adj[u].push({ to: v, w });
            adj[v].push({ to: u, w });
        };

        if (!formsCycle) {
            addEdge();
        } else {
            // Cierre del ciclo final
            if (uf.componentSize(u) === numCities && selectedEdges.length === numCities - 1) {
                addEdge();
                break; 
            }
        }
    }

    // 3. Reconstruir la ruta ordenada (Indices)
    const pathIndices: number[] = [];
    const visited = new Set<number>();

    // Empezamos en 0 arbitrariamente
    function dfs(node: number) {
        visited.add(node);
        pathIndices.push(node);
        // Ordenamos vecinos para consistencia, aunque en TSP voraz solo hay max 2 caminos
        const neighbors = adj[node];
        for (const neighbor of neighbors) {
            if (!visited.has(neighbor.to)) {
                dfs(neighbor.to);
            }
        }
    }
    
    // Verificar que tenemos un grafo para recorrer
    if (numCities > 0 && adj[0].length > 0) {
        dfs(0);
        pathIndices.push(0); // Cerrar el ciclo visualmente
    }

    // 4. Construir el detalle paso a paso (Indices + Pesos)
    // Esto se enviará al UI para que le ponga los nombres de las ciudades
    const detailedPath = [];
    for (let i = 0; i < pathIndices.length - 1; i++) {
        const current = pathIndices[i];
        const next = pathIndices[i+1];
        
        // Buscar el peso de la arista entre current y next
        const edgeInfo = adj[current].find(n => n.to === next);
        const dist = edgeInfo ? edgeInfo.w : 0;
        
        detailedPath.push({
            from: current,
            to: next,
            dist: dist
        });
    }

    const totalCost = selectedEdges.reduce((acc, e) => acc + e.w, 0);

    // Enviar resultado
    self.postMessage({ 
        path: pathIndices, 
        details: detailedPath, 
        cost: totalCost 
    });
};
