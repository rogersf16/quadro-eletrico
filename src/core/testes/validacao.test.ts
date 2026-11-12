import { describe, expect, it } from 'vitest';
import { simularPiorCaso } from '../simulacao';
import type { PecaCarga, PecaDisjuntor } from '../types';
import { piorNivel, sugerir, validarCarga, validarDisjuntor, validarProjeto, infoCircuito } from '../validacao';
import { acha, base, comCircuito, comDR } from './montar';

const msgs = (a: { msg: string }[]) => a.map((x) => x.msg).join('\n');

describe('validarProjeto', () => {
  it('projeto vazio com DPS não tem erros', () => {
    expect(piorNivel(validarProjeto(base()))).not.toBe('erro');
  });

  it('sem DPS dá aviso', () => {
    expect(msgs(validarProjeto(base({ dps: false })))).toMatch(/Sem DPS/);
  });

  it('cabo fino demais vira erro com a bitola sugerida', () => {
    const p0 = comCircuito(base(), { disj: { corrente: 50 }, carga: { potencia: 47 * 127 }, bitola: 10 });
    const p = { ...p0, cabos: p0.cabos.map((c) => (c.de.borne === 'A' ? { ...c, bitola: 6 } : c)) };
    const a = validarProjeto(p);
    expect(piorNivel(a)).toBe('erro');
    expect(msgs(a)).toMatch(/pelo menos 10 mm²/);
  });

  it('fases desbalanceadas dá aviso', () => {
    const p = comCircuito(base(), { carga: { potencia: 2000 } });
    expect(msgs(validarProjeto(p))).toMatch(/desbalanceadas/);
  });
});

describe('validarDisjuntor', () => {
  it('disjuntor maior que o cabo aguenta é erro', () => {
    const p = comCircuito(base(), { disj: { corrente: 32 }, bitola: 2.5 });
    const a = validarDisjuntor(p, acha<PecaDisjuntor>(p, 'c1'));
    expect(msgs(a)).toMatch(/aguenta ~24 A/);
  });

  it('circuito bem dimensionado passa', () => {
    const p = comCircuito(base());
    expect(validarDisjuntor(p, acha<PecaDisjuntor>(p, 'c1'))).toEqual([{ nivel: 'ok', msg: 'Tudo certo nesse disjuntor.' }]);
  });

  it('transferência sem a entrada II ligada avisa', () => {
    const p = comCircuito(base(), { disj: { transferencia: true, II: { ligado: false, desarmado: false } } });
    expect(msgs(validarDisjuntor(p, acha<PecaDisjuntor>(p, 'c1')))).toMatch(/ligue as duas entradas/);
  });

  it('geral com menos polos que fases é erro', () => {
    const p0 = base({ fornecimento: 'tri' });
    const geral = acha<PecaDisjuntor>(p0, 'geral');
    expect(msgs(validarDisjuntor(p0, geral))).toMatch(/3 polo/);
  });
});

describe('validarCarga', () => {
  it('chuveiro sem DR é erro (área molhada)', () => {
    const p = comCircuito(base(), { carga: { tipoCarga: 'chuveiro' } });
    const a = validarCarga(p, acha<PecaCarga>(p, 'carga1'));
    expect(a).toContainEqual(expect.objectContaining({ nivel: 'erro', msg: expect.stringMatching(/sem DR/) }));
  });

  it('chuveiro com DR não reclama de DR', () => {
    const p = comDR(base());
    expect(msgs(validarCarga(p, acha<PecaCarga>(p, 'carga1')))).not.toMatch(/sem DR/);
  });
});

describe('sugerir', () => {
  it('sugere o menor disjuntor comercial acima da carga e um cabo que ele protege', () => {
    const p = comCircuito(base(), { carga: { potencia: 2540 } }); // 20 A
    const info = infoCircuito(p, acha<PecaDisjuntor>(p, 'c1'), simularPiorCaso(p));
    expect(sugerir(info, 1)).toEqual({ corrente: 25, bitola: 4 });
  });
});
