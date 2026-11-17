import { describe, expect, it } from 'vitest';
import { novaCarga, novoDisjuntor, novoGerador } from '../projeto';
import { aplicarProtecoes, perigosDasCargas, riscosRuaGerador, simular } from '../simulacao';
import type { PecaDisjuntor, PecaGerador, Projeto } from '../types';
import { validarCarga, validarGeradores } from '../validacao';
import { acha, barN, barT, base, fio, GERAL, ponta } from './montar';

// Rua → geral → lado I da transferência; gerador → lado II; saídas I e II juntas → circuito → carga 127 V.
function comTransferencia(o: { gerador?: Partial<PecaGerador>; ladoII?: boolean; carga?: number } = {}): Projeto {
  const p = base();
  const g = novoGerador({ x: 0, y: 0 }, { id: 'ger', ligacao: 'bi', potencia: 5000, ...o.gerador });
  const t = novoDisjuntor({ x: 0, y: 0 }, {
    id: 'tr', polos: 2, corrente: 50, transferencia: true,
    ligado: !o.ladoII, II: { ligado: !!o.ladoII, desarmado: false },
  });
  const d = novoDisjuntor({ x: 0, y: 0 }, { id: 'c1', corrente: 40, ligado: true });
  const c = novaCarga({ x: 0, y: 0 }, 'tomada', { id: 'carga1', potencia: o.carga ?? 1270, tensao: 127 });
  const cabos = [
    fio(ponta(GERAL, 'out:1'), ponta('tr', 'in:1')),
    fio(ponta(GERAL, 'out:2'), ponta('tr', 'in:2')),
    fio(ponta('ger', 'L1'), ponta('tr', 'inII:1')),
    fio(ponta('ger', 'L2'), ponta('tr', 'inII:2')),
    fio(ponta('ger', 'N'), ponta(barN(p), 'b:3'), 'neutro'),
    fio(ponta('ger', 'T'), ponta(barT(p), 'b:3'), 'terra'),
    fio(ponta('tr', 'out:1'), ponta('tr', 'outII:1')),
    fio(ponta('tr', 'out:2'), ponta('tr', 'outII:2')),
    fio(ponta('tr', 'out:1'), ponta('c1', 'in:1')),
    fio(ponta('c1', 'out:1'), ponta('carga1', 'L1'), 'fase', { bitola: 10 }),
    fio(ponta(barN(p), 'b:2'), ponta('carga1', 'N'), 'neutro', { bitola: 10 }),
  ];
  return { ...p, pecas: [...p.pecas, g, t, d, c], cabos: [...p.cabos, ...cabos] };
}

// Gerador ligado direto no barramento de saída do geral, sem transferência (o erro clássico).
function semTransferencia(ligado = true): Projeto {
  const p = comTransferencia();
  return {
    ...p,
    pecas: p.pecas.map((x) => (x.id === 'ger' ? { ...x, ligado } : x)),
    cabos: [...p.cabos, fio(ponta('ger', 'L1'), ponta(GERAL, 'out:1'))],
  };
}

describe('gerador', () => {
  it('tem bornes conforme a ligação', () => {
    const p = comTransferencia({ gerador: { ligacao: 'tri' } });
    expect(simular(p).rede.potencial('ger', 'T').terra).toBe(true);
  });

  it('desligado não energiza nada', () => {
    const p = comTransferencia({ ladoII: true });
    expect(simular(p).cargas.carga1.funciona).toBe(false);
  });

  it('na transferência lado II alimenta a carga com fase própria (G1)', () => {
    const p = comTransferencia({ ladoII: true, gerador: { ligado: true } });
    const sim = simular(p);
    expect(sim.cargas.carga1).toMatchObject({ funciona: true, tensao: 127, fases: ['g:ger:1'] });
    expect(sim.correntePorFase.A).toBe(0); // não conta como corrente da rua
    expect(sim.geradores.ger.potencia).toBe(1270);
    expect(sim.geradores.ger.correntes[0]).toBeCloseTo(10);
    expect(sim.curtos).toHaveLength(0);
    expect(sim.retorno).toHaveLength(0);
  });

  it('com transferência no lado I a rua alimenta e o gerador fica isolado', () => {
    const p = comTransferencia({ gerador: { ligado: true } });
    const sim = simular(p);
    expect(sim.cargas.carga1.fases).toEqual(['A']);
    expect(sim.curtos).toHaveLength(0);
    expect(validarGeradores(p).filter((a) => a.nivel === 'erro')).toHaveLength(0);
  });

  it('paralelo rua × gerador é curto e derruba alguém', () => {
    const p = semTransferencia();
    const sim = simular(p);
    expect(sim.curtos.some((c) => c.paralelo)).toBe(true);
    const r = aplicarProtecoes(p);
    expect(r.eventos[0].msg).toMatch(/paralelo/);
  });

  it('sem disjuntor no caminho, o paralelo derruba o próprio gerador', () => {
    const p0 = base();
    const g = novoGerador({ x: 0, y: 0 }, { id: 'ger', ligado: true });
    const p = { ...p0, pecas: [...p0.pecas, g], cabos: [...p0.cabos, fio(ponta('ger', 'L1'), ponta('entrada', 'A'))] };
    const r = aplicarProtecoes(p);
    expect(acha<PecaGerador>(r.projeto, 'ger')).toMatchObject({ ligado: false, desarmado: true });
  });

  it('validação acusa paralelo e retorno de energia pra rua', () => {
    const msgs = validarGeradores(semTransferencia(false)).map((a) => a.msg).join('\n');
    expect(msgs).toMatch(/paralelo com a rua/);
    expect(msgs).toMatch(/volta pra rua/);
  });

  it('apagão sem transferência: energia do gerador chega na entrada', () => {
    const p = semTransferencia();
    expect(simular(p, ['A', 'B']).retorno).toEqual(['ger']);
  });

  it('sobrecarga desarma o gerador', () => {
    const p = comTransferencia({ ladoII: true, gerador: { ligado: true, potencia: 1000 }, carga: 1270 });
    const r = aplicarProtecoes(p);
    expect(acha<PecaGerador>(r.projeto, 'ger')).toMatchObject({ ligado: false, desarmado: true });
    expect(r.eventos.some((e) => /sobrecarga/.test(e.msg))).toBe(true);
  });

  it('gerador 220 V num aparelho 127 V queima', () => {
    const p = comTransferencia({ ladoII: true, gerador: { ligado: true, ligacao: 'mono220' } });
    expect(simular(p).cargas.carga1).toMatchObject({ funciona: false });
    expect(simular(p).cargas.carga1.motivo).toMatch(/queima/);
  });

  it('carga 220 V com uma ponta na rua e outra no gerador não funciona', () => {
    const p0 = comTransferencia({ gerador: { ligado: true } });
    const ch = novaCarga({ x: 0, y: 0 }, 'chuveiro', { id: 'ch', tensao: 220 });
    const p = {
      ...p0,
      pecas: [...p0.pecas, ch],
      cabos: [...p0.cabos, fio(ponta(GERAL, 'out:2'), ponta('ch', 'L1')), fio(ponta('ger', 'L1'), ponta('ch', 'L2'))],
    };
    expect(simular(p).cargas.ch.motivo).toMatch(/rua e outra do gerador/);
  });
});

describe('rua e gerador no mesmo disjuntor', () => {
  // Disjuntor bipolar comum: rua no polo 1, gerador no polo 2 (ou no mesmo borne).
  function misturado(borneGerador: string, gerLigado = true): Projeto {
    const p0 = base();
    const g = novoGerador({ x: 0, y: 0 }, { id: 'ger', ligado: gerLigado });
    const d = novoDisjuntor({ x: 0, y: 0 }, { id: 'c1', nome: 'Circuito', polos: 2, ligado: true });
    return {
      ...p0,
      pecas: [...p0.pecas, g, d],
      cabos: [...p0.cabos, fio(ponta(GERAL, 'out:1'), ponta('c1', 'in:1')), fio(ponta('ger', 'L1'), ponta('c1', borneGerador))],
    };
  }

  it('um polo de cada fonte: o disjuntor desarma e avisa dos riscos', () => {
    const r = aplicarProtecoes(misturado('in:2'));
    expect(acha<PecaDisjuntor>(r.projeto, 'c1')).toMatchObject({ ligado: false, desarmado: true });
    expect(r.eventos[0].msg).toMatch(/derrete/);
    expect(r.eventos[0].msg).toMatch(/explodir/);
    expect(r.eventos[0].msg).toMatch(/choque/);
  });

  it('não deixa religar enquanto a ligação continuar', () => {
    const p = aplicarProtecoes(misturado('in:2')).projeto;
    const religado = { ...p, pecas: p.pecas.map((x) => (x.id === 'c1' ? { ...x, ligado: true, desarmado: false } : x)) };
    expect(acha<PecaDisjuntor>(aplicarProtecoes(religado).projeto, 'c1').desarmado).toBe(true);
  });

  it('no mesmo borne: cai quem está no caminho entre as fontes (o geral), não o circuito', () => {
    const r = aplicarProtecoes(misturado('in:1'));
    expect(acha<PecaDisjuntor>(r.projeto, GERAL).desarmado).toBe(true);
    expect(acha<PecaDisjuntor>(r.projeto, 'c1').desarmado).toBe(false);
    expect(r.eventos[0].msg).toMatch(/derrete/);
  });

  it('com o gerador parado não desarma, mas a ligação já aparece como risco', () => {
    const p = misturado('in:2', false);
    expect(aplicarProtecoes(p).eventos).toHaveLength(0);
    expect(riscosRuaGerador(p)).toHaveLength(1);
    expect(validarGeradores(p).some((a) => a.nivel === 'erro' && /mesmo tempo/.test(a.msg))).toBe(true);
  });

  it('transferência com rua no I e gerador no II não é risco', () => {
    expect(riscosRuaGerador(comTransferencia({ gerador: { ligado: true } }))).toHaveLength(0);
  });
});

describe('perigos na tomada', () => {
  // Tomada com fase da rua direto da entrada (sem disjuntor) e, opcionalmente, o gerador no mesmo borne ou no outro.
  function tomada(gerador: 'nenhum' | 'L1' | 'N', gerLigado = false): Projeto {
    const p0 = base();
    const g = novoGerador({ x: 0, y: 0 }, { id: 'ger', nome: 'Gerador', ligado: gerLigado });
    const c = novaCarga({ x: 0, y: 0 }, 'tomada', { id: 'tom', nome: 'Tomada' });
    const cabos = [fio(ponta('entrada', 'A'), ponta('tom', 'L1')), fio(ponta(barN(p0), 'b:2'), ponta('tom', 'N'), 'neutro')];
    if (gerador !== 'nenhum') cabos.push(fio(ponta('ger', 'L1'), ponta('tom', gerador)));
    return { ...p0, pecas: [...p0.pecas, g, c], cabos: [...p0.cabos, ...cabos] };
  }

  it('fase da rua direto na tomada: sem disjuntor', () => {
    const k = perigosDasCargas(tomada('nenhum')).tom;
    expect(k.semDisjuntor).toEqual(['rua']);
    expect(k.mistura).toBeNull();
    expect(validarCarga(tomada('nenhum'), acha(tomada('nenhum'), 'tom')).some((a) => a.nivel === 'erro' && /sem disjuntor/.test(a.msg))).toBe(true);
  });

  it('rua e gerador na mesma tomada (mesmo com o gerador parado)', () => {
    for (const b of ['L1', 'N'] as const) {
      const k = perigosDasCargas(tomada(b)).tom;
      expect(k.mistura).not.toBeNull();
      expect(k.semDisjuntor).toContain('rua');
    }
    expect(perigosDasCargas(tomada('L1')).tom.semDisjuntor).toContain('gerador "Gerador"');
    expect(riscosRuaGerador(tomada('N')).some((r) => /mesma carga/.test(r))).toBe(true);
  });

  it('com gerador ligado no mesmo borne, o gerador desarma (não há disjuntor)', () => {
    const r = aplicarProtecoes(tomada('L1', true));
    expect(acha<PecaGerador>(r.projeto, 'ger').desarmado).toBe(true);
  });

  it('circuito normal com disjuntor e transferência certa não tem perigo', () => {
    const k = perigosDasCargas(comTransferencia({ gerador: { ligado: true } })).carga1;
    expect(k).toEqual({ semDisjuntor: [], mistura: null });
  });
});
