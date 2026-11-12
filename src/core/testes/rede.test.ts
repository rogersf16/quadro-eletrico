import { describe, expect, it } from 'vitest';
import { novoDisjuntor } from '../projeto';
import { bornesDaPeca, estaFechado, limparCabos, montarRede } from '../rede';
import type { PecaDisjuntor } from '../types';
import { acha, barN, base, comCircuito, GERAL, ponta } from './montar';

const fases = (s: Set<string>) => [...s].sort();

describe('bornes', () => {
  it('entrada bifásica tem A, B, N e T', () => {
    const p = base();
    expect(bornesDaPeca(acha(p, 'entrada'), p).map((b) => b.id)).toEqual(['A', 'B', 'N', 'T']);
  });

  it('entrada trifásica ganha a fase C', () => {
    const p = base({ fornecimento: 'tri' });
    expect(bornesDaPeca(acha(p, 'entrada'), p).map((b) => b.id)).toContain('C');
  });

  it('disjuntor bipolar com transferência tem 8 bornes (I e II, entrada e saída)', () => {
    const d = novoDisjuntor({ x: 0, y: 0 }, { polos: 2, transferencia: true });
    const ids = bornesDaPeca(d, base()).map((b) => b.id);
    expect(ids).toHaveLength(8);
    expect(ids).toEqual(expect.arrayContaining(['in:1', 'inII:2', 'out:2', 'outII:1']));
  });
});

describe('montarRede', () => {
  it('geral ligado leva as fases A e B pra saída', () => {
    const p = base();
    const r = montarRede(p, { fechado: estaFechado, faltando: [] });
    expect(fases(r.potencial(GERAL, 'out:1').fases)).toEqual(['A']);
    expect(fases(r.potencial(GERAL, 'out:2').fases)).toEqual(['B']);
  });

  it('geral desligado corta a saída', () => {
    const p = base();
    const r = montarRede(p, { fechado: () => false, faltando: [] });
    expect(r.potencial(GERAL, 'out:1').fases.size).toBe(0);
    expect(r.potencial(GERAL, 'in:1').fases.size).toBe(1);
  });

  it('fase faltando não chega', () => {
    const p = base();
    const r = montarRede(p, { fechado: estaFechado, faltando: ['A'] });
    expect(r.potencial(GERAL, 'out:1').fases.size).toBe(0);
    expect(fases(r.potencial(GERAL, 'out:2').fases)).toEqual(['B']);
  });

  it('todos os furos do barramento são o mesmo ponto', () => {
    const p = base();
    const r = montarRede(p, { fechado: estaFechado, faltando: [] });
    expect(r.potencial(barN(p), 'b:6').neutro).toBe(true);
  });
});

describe('estaFechado', () => {
  it('transferência conta como fechada se qualquer lado estiver ligado', () => {
    const d = novoDisjuntor({ x: 0, y: 0 }, { transferencia: true, ligado: false, II: { ligado: true, desarmado: false } });
    expect(estaFechado(d)).toBe(true);
    expect(estaFechado({ ...d, II: { ligado: false, desarmado: false } } as PecaDisjuntor)).toBe(false);
  });
});

describe('limparCabos', () => {
  it('tira cabos que apontam pra bornes que sumiram', () => {
    const p = comCircuito(base());
    // Passa o disjuntor do circuito pra 1 polo não muda nada; mas um cabo no out:2 dele deve sumir.
    const comExtra = { ...p, cabos: [...p.cabos, { ...p.cabos[0], id: 'x', de: ponta('c1', 'out:2') }] };
    const limpo = limparCabos(comExtra);
    expect(limpo.cabos.find((c) => c.id === 'x')).toBeUndefined();
    expect(limpo.cabos).toHaveLength(p.cabos.length);
  });

  it('devolve o mesmo objeto se não há nada pra limpar', () => {
    const p = base();
    expect(limparCabos(p)).toBe(p);
  });
});
