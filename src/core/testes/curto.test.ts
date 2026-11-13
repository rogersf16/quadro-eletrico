import { describe, expect, it } from 'vitest';
import { detalheCurto, simularPiorCaso } from '../simulacao';
import { validarProjeto } from '../validacao';
import { acha, base, fio, GERAL, ponta } from './montar';
import type { PecaDisjuntor } from '../types';

// Caso real: geral DESLIGADO e um cabo escondido unindo os dois polos de saída.
// Agora não tem curto (o disjuntor está aberto), mas com tudo ligado fase A encontra fase B.
function comCaboEscondido() {
  const p0 = base();
  const p = { ...p0, pecas: p0.pecas.map((x) => (x.id === GERAL ? { ...x, ligado: false } : x)) };
  return { ...p, cabos: [...p.cabos, fio(ponta(GERAL, 'out:1'), ponta(GERAL, 'out:2'), 'fase', { id: 'escondido' })] };
}

describe('onde está o curto', () => {
  it('acha o cabo, os bornes e as peças do ponto em curto (com tudo ligado)', () => {
    const p = comCaboEscondido();
    expect(acha<PecaDisjuntor>(p, GERAL).ligado).toBe(false);
    const pior = simularPiorCaso(p);
    expect(pior.curtos).toHaveLength(1);
    const d = detalheCurto(p, pior.rede, pior.curtos[0].grupo);
    expect(d.cabos).toContain('escondido');
    expect(d.pecas).toContain(GERAL);
    expect(d.bornes).toEqual(expect.arrayContaining([`${GERAL}|out:1`, `${GERAL}|out:2`]));
    // Barramentos de neutro/terra não fazem parte desse curto.
    expect(d.pecas.some((id) => acha(p, id).tipo === 'barramento')).toBe(false);
  });

  it('o aviso de curto leva as peças envolvidas, pra interface mostrar no mapa', () => {
    const alerta = validarProjeto(comCaboEscondido()).find((a) => a.msg.startsWith('Curto-circuito'));
    expect(alerta?.pecas).toContain(GERAL);
  });

  it('sem curto, nada a destacar', () => {
    expect(simularPiorCaso(base()).curtos).toHaveLength(0);
  });
});
