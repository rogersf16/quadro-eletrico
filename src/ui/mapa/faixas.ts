// Faixas dos cabos com traçado automático: quando dois cabos de pontos elétricos DIFERENTES fariam o
// trecho horizontal na mesma altura e se sobrepondo, um deles passa pra outra faixa (mais acima/abaixo).
// Sem isso, ex.: as fases A e B saindo da entrada pra baixo de um disjuntor viram um traço só,
// e um curto entre elas fica invisível.
import { Position } from '@xyflow/react';

export const AFASTAMENTO = 24; // quanto o cabo sai reto do borne antes de virar (offset do smoothstep)
const PASSO = 12; // distância entre faixas
const MAX_FAIXAS = 8;

// Altura padrão do trecho horizontal num cabo "em Z" (sai por baixo, chega por cima).
// Cada polo vira numa altura diferente; o polo do lado pra onde o cabo vai vira primeiro (não cruza).
export function alturaBase(sx: number, sy: number, tx: number, ty: number, fracaoDe: number) {
  const faixa = (fracaoDe - 0.5) * 36 * (tx >= sx ? -1 : 1);
  return (ty - sy) * 0.5 + sy + faixa;
}

export interface TrechoCabo {
  id: string;
  grupo: string; // ponto elétrico (cobre contínuo). Mesmo grupo pode se sobrepor: é o mesmo condutor.
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sp: Position;
  tp: Position;
  fracaoDe: number;
}

type Forma = { tipo: 'U'; sinal: 1 | -1; y: number } | { tipo: 'Z'; y: number; min: number; max: number };

// Formato do cabo e altura do trecho horizontal principal. null = formato que não tratamos (lateral, volta).
export function forma(t: TrechoCabo): Forma | null {
  const { sp, tp, sx, sy, tx, ty } = t;
  if (sp === Position.Bottom && tp === Position.Bottom) return { tipo: 'U', sinal: 1, y: Math.max(sy, ty) + AFASTAMENTO };
  if (sp === Position.Top && tp === Position.Top) return { tipo: 'U', sinal: -1, y: Math.min(sy, ty) - AFASTAMENTO };
  const desce = sp === Position.Bottom && tp === Position.Top && ty > sy + 2 * AFASTAMENTO;
  const sobe = sp === Position.Top && tp === Position.Bottom && sy > ty + 2 * AFASTAMENTO;
  if (desce || sobe) {
    const [min, max] = [Math.min(sy, ty) + PASSO, Math.max(sy, ty) - PASSO];
    return { tipo: 'Z', y: alturaBase(sx, sy, tx, ty, t.fracaoDe), min, max };
  }
  return null;
}

// Deslocamento da faixa k: U se afasta mais dos bornes; Z alterna abaixo/acima (0, +12, -12, +24…).
export function deslocamento(f: Forma, k: number): number {
  if (f.tipo === 'U') return f.sinal * PASSO * k;
  return k === 0 ? 0 : (k % 2 ? 1 : -1) * PASSO * Math.ceil(k / 2);
}

// Altura final do trecho horizontal com a faixa k (no Z, sem sair do espaço entre os bornes).
export function alturaComFaixa(f: Forma, k: number): number {
  const y = f.y + deslocamento(f, k);
  return f.tipo === 'Z' ? Math.min(f.max, Math.max(f.min, y)) : y;
}

// Escolhe a faixa de cada cabo: a menor que não encosta em outro cabo de grupo diferente.
export function calcularFaixas(trechos: TrechoCabo[]): Record<string, number> {
  const itens = trechos
    .map((t) => ({ t, f: forma(t), x0: Math.min(t.sx, t.tx), x1: Math.max(t.sx, t.tx) }))
    .filter((i): i is typeof i & { f: Forma } => i.f !== null)
    .sort((a, b) => a.f.y - b.f.y || a.x0 - b.x0 || a.t.id.localeCompare(b.t.id));

  const postos: { grupo: string; y: number; x0: number; x1: number }[] = [];
  const r: Record<string, number> = {};
  for (const i of itens) {
    let k = 0;
    for (; k < MAX_FAIXAS; k++) {
      const y = alturaComFaixa(i.f, k);
      const bate = postos.some(
        (o) => o.grupo !== i.t.grupo && Math.abs(o.y - y) < PASSO * 0.6 && i.x0 < o.x1 + 2 && o.x0 < i.x1 + 2,
      );
      if (!bate) break;
    }
    if (k === MAX_FAIXAS) k = 0;
    r[i.t.id] = k;
    postos.push({ grupo: i.t.grupo, y: alturaComFaixa(i.f, k), x0: i.x0, x1: i.x1 });
  }
  return r;
}
