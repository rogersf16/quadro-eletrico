// Tamanho das peças no mapa e organização automática em camadas.
import type { Peca, PecaBarramento, Posicao, Projeto } from './types';

export const barramentoVertical = (b: PecaBarramento) => b.orientacao === 'vertical-dir' || b.orientacao === 'vertical-esq';

export const MODULO = 56; // largura de 1 polo (px)
export const GRADE = 8;
export const ETIQUETA = 122; // espaço da etiqueta lateral dos disjuntores/DRs (6 de vão + 116)

export function tamanhoPeca(p: Peca): { w: number; h: number } {
  switch (p.tipo) {
    case 'quadro':
      return { w: p.w, h: p.h };
    case 'entrada':
      return { w: 232, h: 136 };
    // Corpo (polos × módulo) + etiqueta na lateral (6 de vão + 96 de largura).
    case 'disjuntor':
      // Transferência = dois disjuntores lado a lado.
      return { w: (p.transferencia ? 2 : 1) * p.polos * MODULO + ETIQUETA, h: 150 };
    case 'dr':
    case 'medidor':
      return { w: p.polos * MODULO + ETIQUETA, h: 150 };
    case 'emenda':
      return { w: 104, h: 40 };
    case 'barramento':
      return barramentoVertical(p)
        ? { w: 92, h: Math.max(120, p.bornes * 26 + 24) }
        : { w: Math.max(120, p.bornes * 26 + 24), h: 58 };
    case 'carga':
      return { w: 156, h: 104 };
  }
}

export const encaixar = (v: number) => Math.round(v / GRADE) * GRADE;

// Camadas pela distância (em peças) até a entrada, seguindo os cabos.
export function organizar(p: Projeto): Projeto {
  const vizinhos = new Map<string, Set<string>>();
  for (const x of p.pecas) vizinhos.set(x.id, new Set());
  for (const c of p.cabos) {
    vizinhos.get(c.de.peca)?.add(c.para.peca);
    vizinhos.get(c.para.peca)?.add(c.de.peca);
  }
  const entrada = p.pecas.find((x) => x.tipo === 'entrada');
  const nivel = new Map<string, number>();
  const ordem: string[] = [];
  if (entrada) {
    nivel.set(entrada.id, 0);
    const fila = [entrada.id];
    while (fila.length) {
      const id = fila.shift()!;
      ordem.push(id);
      for (const v of vizinhos.get(id) ?? []) {
        if (!nivel.has(v)) {
          nivel.set(v, nivel.get(id)! + 1);
          fila.push(v);
        }
      }
    }
  }
  // Peças soltas vão pra última camada.
  const max = Math.max(0, ...nivel.values());
  for (const x of p.pecas) if (!nivel.has(x.id)) { nivel.set(x.id, max + 1); ordem.push(x.id); }

  const camadas = new Map<number, Peca[]>();
  for (const id of ordem) {
    const peca = p.pecas.find((x) => x.id === id)!;
    if (peca.tipo === 'quadro') continue; // caixas ficam onde estão
    const n = nivel.get(id)!;
    if (!camadas.has(n)) camadas.set(n, []);
    camadas.get(n)!.push(peca);
  }

  const pos = new Map<string, Posicao>();
  let y = 24;
  for (const n of [...camadas.keys()].sort((a, b) => a - b)) {
    const pecas = camadas.get(n)!;
    let x = 24;
    let alturaCamada = 0;
    for (const peca of pecas) {
      const t = tamanhoPeca(peca);
      pos.set(peca.id, { x: encaixar(x), y: encaixar(y) });
      x += t.w + 32;
      alturaCamada = Math.max(alturaCamada, t.h);
    }
    y += alturaCamada + 110;
  }
  return {
    ...p,
    pecas: p.pecas.map((x) => ({ ...x, pos: pos.get(x.id) ?? x.pos })),
    cabos: p.cabos.map((c) => ({ ...c, pontos: [] })),
  };
}
