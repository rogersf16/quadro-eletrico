// Organização automática com o ELK (Eclipse Layout Kernel), algoritmo "layered" (Sugiyama):
// 1) distribui as peças em camadas de cima pra baixo (entrada → geral → DRs → circuitos → cargas);
// 2) reordena as peças de cada camada pra cruzar o mínimo de cabos;
// 3) traça os cabos ortogonais (só retas e 90°), com faixas separadas pra cabos paralelos.
// Este módulo não conhece React: recebe medidas (peças e bornes) e devolve posições e dobras.
import type { ElkNode, ElkExtendedEdge, LayoutOptions } from 'elkjs/lib/elk-api';
import type { Posicao, Projeto } from './types';

export type LadoPorta = 'topo' | 'base' | 'esq' | 'dir';

// Medidas reais de uma peça desenhada na tela (vêm do React Flow).
export interface MedidaPeca {
  id: string;
  w: number;
  h: number;
  // Centro de cada borne, relativo ao canto superior esquerdo da peça.
  bornes: { id: string; x: number; y: number; lado: LadoPorta }[];
}

export interface ResultadoLayout {
  posicoes: Record<string, Posicao>;
  rotas: Record<string, Posicao[]>; // dobras de cada cabo, na ordem de -> para
}

const LADO_ELK: Record<LadoPorta, string> = { topo: 'NORTH', base: 'SOUTH', esq: 'WEST', dir: 'EAST' };

// Espaçamentos generosos: menos coisa amontoada, mais fácil de seguir com o olho.
const OPCOES: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.edgeRouting': 'ORTHOGONAL',
  'elk.layered.spacing.nodeNodeBetweenLayers': '110', // distância vertical entre camadas
  'elk.spacing.nodeNode': '70', // distância entre peças da mesma camada
  'elk.spacing.edgeEdge': '16', // distância entre cabos paralelos
  'elk.layered.spacing.edgeEdgeBetweenLayers': '16',
  'elk.spacing.edgeNode': '28', // folga entre cabo e peça
  'elk.layered.spacing.edgeNodeBetweenLayers': '28',
  'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX', // tende a deixar cabos mais retos
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
  'elk.layered.thoroughness': '20', // mais tentativas = menos cruzamentos
  'elk.layered.unnecessaryBendpoints': 'false',
  'elk.padding': '[top=24,left=24,bottom=24,right=24]',
};

// Nível de cada peça pelo caminho da FASE a partir da entrada (entrada → geral → DR → disjuntor → carga).
// Neutro e terra não contam: senão uma carga com terra direto no barramento pareceria "perto da entrada".
// Peças fora do caminho da fase (barramentos, emendas de neutro) ficam com nível 0,5: logo abaixo da entrada.
function niveisDaFase(p: Projeto): Map<string, number> {
  const viz = new Map<string, string[]>();
  for (const x of p.pecas) viz.set(x.id, []);
  for (const c of p.cabos) {
    if (c.condutor !== 'fase' && c.condutor !== 'retorno') continue;
    viz.get(c.de.peca)?.push(c.para.peca);
    viz.get(c.para.peca)?.push(c.de.peca);
  }
  const nivel = new Map<string, number>();
  const entrada = p.pecas.find((x) => x.tipo === 'entrada');
  if (entrada) {
    nivel.set(entrada.id, 0);
    const fila = [entrada.id];
    while (fila.length) {
      const id = fila.shift()!;
      for (const v of viz.get(id) ?? []) {
        if (!nivel.has(v)) {
          nivel.set(v, nivel.get(id)! + 1);
          fila.push(v);
        }
      }
    }
  }
  return nivel;
}

export async function layoutAutomatico(p: Projeto, medidas: MedidaPeca[]): Promise<ResultadoLayout> {
  // Carregado só quando o botão é usado: o ELK é grande e não precisa pesar na abertura do app.
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();
  const porId = new Map(medidas.map((m) => [m.id, m]));
  const nivel = niveisDaFase(p);
  const ladoDo = (k: { peca: string; borne: string }) => porId.get(k.peca)?.bornes.find((b) => b.id === k.borne)?.lado;
  const portaId = (peca: string, borne: string) => `${peca}|${borne}`;

  const filhos: ElkNode[] = p.pecas
    .filter((x) => porId.has(x.id))
    .map((x) => {
      const m = porId.get(x.id)!;
      return {
        id: x.id,
        width: m.w,
        height: m.h,
        // FIXED_POS: os bornes ficam exatamente onde estão desenhados.
        layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
        ports: m.bornes.map((b) => ({
          id: portaId(x.id, b.id),
          width: 2,
          height: 2,
          // Porta encostada na borda do lado dela, centralizada no borne.
          x: b.lado === 'esq' ? -2 : b.lado === 'dir' ? m.w : b.x - 1,
          y: b.lado === 'topo' ? -2 : b.lado === 'base' ? m.h : b.y - 1,
          layoutOptions: { 'elk.port.side': LADO_ELK[b.lado] },
        })),
      };
    });

  // Cabo com as duas pontas em peças medidas e que não liga a peça nela mesma.
  const validos = p.cabos.filter((c) => porId.has(c.de.peca) && porId.has(c.para.peca) && c.de.peca !== c.para.peca);
  const invertido = new Set<string>();
  const arestas: ElkExtendedEdge[] = validos.map((c) => {
    // Sentido do cabo pro layout (eletricamente ele não tem sentido): de cima pra baixo.
    // 1º pelo lado dos bornes: sai da BASE de uma peça (saída) e entra no TOPO de outra (entrada).
    // 2º, se os lados não decidem (topo-topo, base-base, laterais da emenda), pelo nível da fase.
    const [la, lb] = [ladoDo(c.de), ladoDo(c.para)];
    const inverter =
      la === 'base' && lb === 'topo' ? false
      : la === 'topo' && lb === 'base' ? true
      : (nivel.get(c.de.peca) ?? 0.5) > (nivel.get(c.para.peca) ?? 0.5);
    if (inverter) invertido.add(c.id);
    const [a, b] = inverter ? [c.para, c.de] : [c.de, c.para];
    return { id: c.id, sources: [portaId(a.peca, a.borne)], targets: [portaId(b.peca, b.borne)] };
  });

  const r = await elk.layout({ id: 'raiz', layoutOptions: OPCOES, children: filhos, edges: arestas });

  const posicoes: Record<string, Posicao> = {};
  for (const n of r.children ?? []) posicoes[n.id] = { x: Math.round(n.x ?? 0), y: Math.round(n.y ?? 0) };

  const rotas: Record<string, Posicao[]> = {};
  for (const e of r.edges ?? []) {
    const s = e.sections?.[0];
    if (!s) continue;
    const dobras = (s.bendPoints ?? []).map((q) => ({ x: Math.round(q.x), y: Math.round(q.y) }));
    rotas[e.id] = invertido.has(e.id) ? dobras.reverse() : dobras;
  }
  return { posicoes, rotas };
}
