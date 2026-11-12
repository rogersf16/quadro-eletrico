import { describe, expect, it } from 'vitest';
import { novaCarga, novoDisjuntor } from '../projeto';
import { aplicarProtecoes, correntesDosCabos, simular } from '../simulacao';
import type { PecaDisjuntor, PecaDR, Projeto } from '../types';
import { acha, barN, base, comCircuito, comDR, comMedidor, fio, GERAL, ponta } from './montar';

const liga = (p: Projeto, id: string, m: Partial<PecaDisjuntor> = {}): Projeto => ({
  ...p,
  pecas: p.pecas.map((x) => (x.id === id ? ({ ...x, ligado: true, desarmado: false, ...m } as typeof x) : x)),
});

describe('cargas', () => {
  it('carga 127 V ligada funciona e puxa P/V', () => {
    const sim = simular(comCircuito(base()));
    expect(sim.cargas.carga1).toMatchObject({ funciona: true, tensao: 127, fases: ['A'] });
    expect(sim.cargas.carga1.corrente).toBeCloseTo(10);
    expect(sim.correntePorFase.A).toBeCloseTo(10);
    expect(sim.dispositivos.c1.corrente).toBeCloseTo(10);
  });

  it('disjuntor do circuito desligado → carga "sem fase" (neutro continua chegando)', () => {
    const p = comCircuito(base(), { disj: { ligado: false } });
    expect(simular(p).cargas.carga1).toMatchObject({ funciona: false, motivo: 'sem fase' });
  });

  it('sem cabo de neutro → "sem neutro"', () => {
    const p = comCircuito(base());
    const semN = { ...p, cabos: p.cabos.filter((c) => c.id !== 'n1') };
    expect(simular(semN).cargas.carga1).toMatchObject({ funciona: false, motivo: 'sem neutro' });
  });

  it('falta da fase A derruba a carga ligada nela', () => {
    expect(simular(comCircuito(base()), ['A']).cargas.carga1.funciona).toBe(false);
    expect(simular(comCircuito(base(), { polo: 2 }), ['A']).cargas.carga1.funciona).toBe(true);
  });

  it('carga 220 V entre duas fases (bipolar)', () => {
    const p0 = base();
    const d = novoDisjuntor({ x: 0, y: 0 }, { id: 'c2', polos: 2, corrente: 32, ligado: true });
    const c = novaCarga({ x: 0, y: 0 }, 'chuveiro', { id: 'ch', potencia: 4400, tensao: 220 });
    const p = {
      ...p0,
      pecas: [...p0.pecas, d, c],
      cabos: [
        ...p0.cabos,
        fio(ponta(GERAL, 'out:1'), ponta('c2', 'in:1')),
        fio(ponta(GERAL, 'out:2'), ponta('c2', 'in:2')),
        fio(ponta('c2', 'out:1'), ponta('ch', 'L1')),
        fio(ponta('c2', 'out:2'), ponta('ch', 'L2')),
      ],
    };
    const sim = simular(p);
    expect(sim.cargas.ch).toMatchObject({ funciona: true, tensao: 220 });
    expect(sim.cargas.ch.corrente).toBeCloseTo(20);
    expect(sim.correntePorFase.A).toBeCloseTo(20);
    expect(sim.correntePorFase.B).toBeCloseTo(20);
  });
});

describe('proteções', () => {
  it('sobrecarga: carga de 23,6 A num disjuntor de 10 A desarma ele, não o geral', () => {
    const p = comCircuito(base(), { disj: { corrente: 10 }, carga: { potencia: 3000 } });
    const r = aplicarProtecoes(p);
    expect(acha<PecaDisjuntor>(r.projeto, 'c1')).toMatchObject({ ligado: false, desarmado: true });
    expect(acha<PecaDisjuntor>(r.projeto, GERAL).ligado).toBe(true);
    expect(r.eventos).toHaveLength(1);
    expect(r.eventos[0].peca).toBe('c1');
  });

  it('carga dentro do limite não desarma nada', () => {
    const r = aplicarProtecoes(comCircuito(base()));
    expect(r.eventos).toEqual([]);
  });

  it('curto fase-neutro depois do disjuntor derruba o disjuntor do circuito', () => {
    const p0 = comCircuito(base());
    const p = { ...p0, cabos: [...p0.cabos, fio(ponta('c1', 'out:1'), ponta(barN(p0), 'b:4'), 'fase')] };
    expect(simular(p).curtos).toHaveLength(1);
    const r = aplicarProtecoes(p);
    expect(acha<PecaDisjuntor>(r.projeto, 'c1').desarmado).toBe(true);
    expect(r.eventos[0].msg).toMatch(/Curto/);
  });

  it('curto antes de qualquer disjuntor avisa que não tem proteção', () => {
    const p0 = base();
    const p = { ...p0, cabos: [...p0.cabos, fio(ponta('entrada', 'A'), ponta(barN(p0), 'b:5'))] };
    const r = aplicarProtecoes(p);
    // O geral encosta no ponto em curto e cai primeiro, mas o curto continua (está antes dele).
    expect(r.eventos[r.eventos.length - 1]).toMatchObject({ curto: true });
    expect(acha<PecaDisjuntor>(r.projeto, GERAL).desarmado).toBe(true);
  });

  it('DR com neutro por fora desarma', () => {
    const r = aplicarProtecoes(comDR(base(), false));
    expect(acha<PecaDR>(r.projeto, 'dr1')).toMatchObject({ ligado: false, desarmado: true });
    expect(r.eventos[0].msg).toMatch(/neutro/);
  });

  it('DR ligado certo (fase e neutro por dentro) fica ligado', () => {
    const r = aplicarProtecoes(comDR(base(), true));
    expect(acha<PecaDR>(r.projeto, 'dr1').ligado).toBe(true);
    expect(r.eventos).toEqual([]);
  });

  it('transferência: ligar os lados I e II juntos desarma os dois', () => {
    const p0 = comCircuito(base(), { disj: { transferencia: true, ligado: true, II: { ligado: false, desarmado: false } } });
    const p = liga(p0, 'c1', { II: { ligado: true, desarmado: false } });
    const r = aplicarProtecoes(p);
    const d = acha<PecaDisjuntor>(r.projeto, 'c1');
    expect(d).toMatchObject({ ligado: false, desarmado: true, II: { ligado: false, desarmado: true } });
    expect(r.eventos[0].msg).toMatch(/intertravamento/);
  });

  it('transferência: só o lado II ligado alimenta a carga pelo lado II', () => {
    const p0 = comCircuito(base(), { disj: { transferencia: true, ligado: false, II: { ligado: true, desarmado: false } } });
    // Liga a carga também pela saída II, vinda do polo 2 do geral.
    const p = {
      ...p0,
      cabos: [
        ...p0.cabos,
        fio(ponta(GERAL, 'out:2'), ponta('c1', 'inII:1')),
        fio(ponta('c1', 'outII:1'), ponta('carga1', 'L1')),
      ],
    };
    const sim = simular(p);
    expect(sim.cargas.carga1).toMatchObject({ funciona: true, fases: ['B'] });
  });
});

describe('medidor', () => {
  it('mostra tensão, corrente e potência do que passa por ele', () => {
    const sim = simular(comMedidor(base()));
    const m = sim.medidores.med1;
    expect(m.fases[0]).toMatchObject({ polo: '1', fase: 'A', tensao: 127 });
    expect(m.fases[0].corrente).toBeCloseTo(10);
    expect(m.potencia).toBe(1270);
  });
});

describe('corrente nos cabos', () => {
  it('cabo do circuito leva a corrente da carga; terra leva zero', () => {
    const p = comCircuito(base());
    const k = correntesDosCabos(p, simular(p));
    expect(k.f1.corrente).toBeCloseTo(10);
    expect(k.f2.corrente).toBeCloseTo(10);
    expect(k.n1.corrente).toBeCloseTo(10);
    expect(k.t1.corrente).toBe(0);
    expect(k.f2.sobrecarga).toBe(false);
  });

  it('cabo de 6 mm² com 47 A acusa sobrecarga e pede 10 mm²', () => {
    // Cenário real: entrada → geral em 6 mm² (aguenta ~41 A), carga de ~47 A.
    const p0 = comCircuito(base(), { disj: { corrente: 50 }, carga: { potencia: 47 * 127 }, bitola: 10 });
    const p = { ...p0, cabos: p0.cabos.map((c) => (c.de.borne === 'A' ? { ...c, id: 'entradaA', bitola: 6 } : c)) };
    const k = correntesDosCabos(p, simular(p)).entradaA;
    expect(k.corrente).toBeCloseTo(47);
    expect(k.capacidade).toBe(41);
    expect(k).toMatchObject({ sobrecarga: true, bitolaMinima: 10 });
  });

  it('neutro de cargas em fases diferentes: correntes iguais se cancelam', () => {
    // Duas cargas iguais, uma na fase A e outra na B, dividindo o mesmo cabo de neutro do barramento.
    const p0 = comCircuito(base());
    const d2 = novoDisjuntor({ x: 0, y: 0 }, { id: 'c2', ligado: true });
    const c2 = novaCarga({ x: 0, y: 0 }, 'tomada', { id: 'carga2', potencia: 1270 });
    const p = {
      ...p0,
      pecas: [...p0.pecas, d2, c2],
      cabos: [
        ...p0.cabos,
        fio(ponta(GERAL, 'out:2'), ponta('c2', 'in:1')),
        fio(ponta('c2', 'out:1'), ponta('carga2', 'L1')),
        fio(ponta('carga1', 'N'), ponta('carga2', 'N'), 'neutro', { id: 'n2' }),
      ],
    };
    const k = correntesDosCabos(p, simular(p));
    // n1 (barramento → carga1) leva o neutro das duas: A e B defasadas 120° → |10∠0 + 10∠120| = 10 A.
    expect(k.n1.corrente).toBeCloseTo(10);
    // n2 só leva o neutro da carga2.
    expect(k.n2.corrente).toBeCloseTo(10);
  });
});
