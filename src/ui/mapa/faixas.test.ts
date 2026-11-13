import { Position } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { alturaComFaixa, calcularFaixas, forma, type TrechoCabo } from './faixas';

const B = Position.Bottom;
const T = Position.Top;
const cabo = (id: string, grupo: string, m: Partial<TrechoCabo>): TrechoCabo => ({
  id, grupo, sx: 0, sy: 0, tx: 100, ty: 200, sp: B, tp: T, fracaoDe: 0.5, ...m,
});

describe('faixas dos cabos', () => {
  it('fases A e B em "U" (saem por baixo e chegam por baixo) não ficam na mesma altura', () => {
    // O caso do print: entrada (y=0) → bornes de baixo do disjuntor (y=0), cruzando o mesmo trecho.
    const a = cabo('A', 'gA', { sx: 0, sy: 0, tx: 400, ty: 0, sp: B, tp: B });
    const b = cabo('B', 'gB', { sx: 50, sy: 0, tx: 450, ty: 0, sp: B, tp: B });
    const f = calcularFaixas([a, b]);
    expect(alturaComFaixa(forma(a)!, f.A)).not.toBe(alturaComFaixa(forma(b)!, f.B));
  });

  it('cabos do mesmo ponto elétrico podem se sobrepor (é o mesmo condutor)', () => {
    const f = calcularFaixas([cabo('x', 'g', {}), cabo('y', 'g', { tx: 120 })]);
    expect(f).toEqual({ x: 0, y: 0 });
  });

  it('cabos que não se cruzam na horizontal ficam na faixa padrão', () => {
    const f = calcularFaixas([cabo('x', 'g1', { sx: 0, tx: 100 }), cabo('y', 'g2', { sx: 300, tx: 400 })]);
    expect(f).toEqual({ x: 0, y: 0 });
  });

  it('em "Z" a faixa nova não sai do espaço entre os bornes', () => {
    const t = cabo('x', 'g', { sy: 0, ty: 60 });
    const f = forma(t)!;
    for (let k = 0; k < 8; k++) {
      const y = alturaComFaixa(f, k);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(60);
    }
  });
});
