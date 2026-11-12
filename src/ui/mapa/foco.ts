// "Seguir o fio": decide quais cabos e peças ficam em destaque.
// - Cabo em foco: realça todo o cobre contínuo dele (passando por emendas e barramentos,
//   mas parando nos disjuntores/DRs). Ótimo pra achar onde um neutro foi emendado.
// - Peça em foco: realça os cabos ligados direto nela.
import type { Rede } from '../../core/rede';
import type { Condutor, Projeto } from '../../core/types';
import type { Selecao } from './contexto';

export const CONDUTORES_ROTULO: Record<Condutor, string> = {
  fase: 'Fase',
  neutro: 'Neutro',
  terra: 'Terra',
  retorno: 'Retorno',
};

export interface Foco {
  cabos: Set<string>;
  pecas: Set<string>;
}

export function focoDe(p: Projeto, cobre: Rede, alvo: Selecao | null): Foco | null {
  if (!alvo) return null;
  const cabos = new Set<string>();
  const pecas = new Set<string>();

  if (alvo.tipo === 'cabo') {
    const c = p.cabos.find((x) => x.id === alvo.id);
    if (!c) return null;
    const g = cobre.grupo(c.de.peca, c.de.borne);
    for (const x of p.cabos) if (cobre.grupo(x.de.peca, x.de.borne) === g) cabos.add(x.id);
  } else {
    pecas.add(alvo.id);
    for (const x of p.cabos) if (x.de.peca === alvo.id || x.para.peca === alvo.id) cabos.add(x.id);
  }

  // Peças nas pontas dos cabos realçados também ficam em destaque.
  for (const x of p.cabos) {
    if (cabos.has(x.id)) {
      pecas.add(x.de.peca);
      pecas.add(x.para.peca);
    }
  }
  return { cabos, pecas };
}
