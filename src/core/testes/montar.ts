// Ajudantes dos testes: montam projetos pequenos em cima do projeto vazio
// (entrada bifásica → geral bipolar 50 A ligado, barramentos de neutro e terra).
import { novaCarga, novoCabo, novoDisjuntor, novoDR, novoMedidor, projetoVazio } from '../projeto';
import type { Cabo, Peca, PecaCarga, PecaDisjuntor, Ponta, Projeto } from '../types';

export const ponta = (peca: string, borne: string): Ponta => ({ peca, borne });

export const fio = (de: Ponta, para: Ponta, condutor: Cabo['condutor'] = 'fase', m: Partial<Cabo> = {}): Cabo =>
  novoCabo(de, para, condutor, m);

export const acha = <T extends Peca = Peca>(p: Projeto, id: string) => p.pecas.find((x) => x.id === id) as T;

export function base(m: Partial<Projeto> = {}): Projeto {
  return { ...projetoVazio(), dps: true, ...m };
}

// Ids fixos do projeto vazio.
export const GERAL = 'geral';
export const barN = (p: Projeto) => p.pecas.find((x) => x.tipo === 'barramento' && x.condutor === 'neutro')!.id;
export const barT = (p: Projeto) => p.pecas.find((x) => x.tipo === 'barramento' && x.condutor === 'terra')!.id;

// Circuito 127 V simples: geral out:polo → disjuntor → carga, neutro do barramento.
export function comCircuito(
  p: Projeto,
  o: { disj?: Partial<PecaDisjuntor>; carga?: Partial<PecaCarga>; polo?: 1 | 2; bitola?: number } = {},
) {
  const d = novoDisjuntor({ x: 0, y: 0 }, { id: 'c1', nome: 'Tomadas', corrente: 20, ligado: true, ...o.disj });
  const c = novaCarga({ x: 0, y: 300 }, 'tomada', { id: 'carga1', nome: 'Sala', potencia: 1270, ...o.carga });
  const b = o.bitola ?? 2.5;
  const cabos = [
    fio(ponta(GERAL, `out:${o.polo ?? 1}`), ponta(d.id, 'in:1'), 'fase', { id: 'f1', bitola: b }),
    fio(ponta(d.id, 'out:1'), ponta(c.id, 'L1'), 'fase', { id: 'f2', bitola: b }),
    fio(ponta(barN(p), 'b:2'), ponta(c.id, 'N'), 'neutro', { id: 'n1', bitola: b }),
    fio(ponta(barT(p), 'b:2'), ponta(c.id, 'T'), 'terra', { id: 't1', bitola: b }),
  ];
  return { ...p, pecas: [...p.pecas, d, c], cabos: [...p.cabos, ...cabos] };
}

// Mesmo circuito, mas passando por um DR bipolar (fase e neutro) antes do disjuntor.
export function comDR(p: Projeto, neutroPeloDR = true) {
  const dr = novoDR({ x: 0, y: 0 }, { id: 'dr1', nome: 'DR banheiro', ligado: true });
  const d = novoDisjuntor({ x: 0, y: 0 }, { id: 'c1', nome: 'Chuveiro', corrente: 40, curva: 'B', ligado: true });
  const c = novaCarga({ x: 0, y: 300 }, 'chuveiro', { id: 'carga1', nome: 'Chuveiro', potencia: 4400, tensao: 127 });
  const cabos = [
    fio(ponta(GERAL, 'out:1'), ponta(dr.id, 'in:1'), 'fase', { bitola: 10 }),
    fio(ponta(barN(p), 'b:2'), ponta(dr.id, 'in:N'), 'neutro', { bitola: 10 }),
    fio(ponta(dr.id, 'out:1'), ponta(d.id, 'in:1'), 'fase', { bitola: 10 }),
    fio(ponta(d.id, 'out:1'), ponta(c.id, 'L1'), 'fase', { bitola: 10 }),
    neutroPeloDR
      ? fio(ponta(dr.id, 'out:N'), ponta(c.id, 'N'), 'neutro', { bitola: 10 })
      : fio(ponta(barN(p), 'b:3'), ponta(c.id, 'N'), 'neutro', { bitola: 10 }),
    fio(ponta(barT(p), 'b:2'), ponta(c.id, 'T'), 'terra', { bitola: 10 }),
  ];
  return { ...p, pecas: [...p.pecas, dr, d, c], cabos: [...p.cabos, ...cabos] };
}

// Medidor bipolar entre o geral (polo 1) e o disjuntor do circuito.
export function comMedidor(p: Projeto) {
  const m = novoMedidor({ x: 0, y: 0 }, { id: 'med1' });
  const d = novoDisjuntor({ x: 0, y: 0 }, { id: 'c1', corrente: 20, ligado: true });
  const c = novaCarga({ x: 0, y: 300 }, 'tomada', { id: 'carga1', potencia: 1270 });
  const cabos = [
    fio(ponta(GERAL, 'out:1'), ponta(m.id, 'in:1')),
    fio(ponta(barN(p), 'b:2'), ponta(m.id, 'in:N'), 'neutro'),
    fio(ponta(m.id, 'out:1'), ponta(d.id, 'in:1')),
    fio(ponta(d.id, 'out:1'), ponta(c.id, 'L1')),
    fio(ponta(m.id, 'out:N'), ponta(c.id, 'N'), 'neutro'),
  ];
  return { ...p, pecas: [...p.pecas, m, d, c], cabos: [...p.cabos, ...cabos] };
}
