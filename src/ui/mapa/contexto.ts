import { createContext, useContext } from 'react';
import type { CargaCabo, PerigoCarga, Simulacao } from '../../core/simulacao';
import type { Condutor, Projeto } from '../../core/types';
import type { Nivel } from '../../core/validacao';
import type { Acoes } from '../useProjeto';

export interface Selecao {
  tipo: 'peca' | 'cabo';
  id: string;
}

// Dados que os nós e cabos do mapa precisam, sem passar por props do React Flow.
export interface MapaCtxValor {
  projeto: Projeto;
  sim: Simulacao;
  cargaCabos: Record<string, CargaCabo>; // corrente x capacidade de cada cabo, agora
  niveis: Record<string, Nivel>;
  // Cargas ligadas sem disjuntor ou com rua e gerador juntos: faixa vermelha em cima delas.
  perigos: Record<string, PerigoCarga>;
  acoes: Acoes;
  selecionar: (s: Selecao | null) => void;
  // "Seguir o fio": cabos em destaque (o resto fica apagado). null = nenhum foco, tudo normal.
  foco: Set<string> | null;
  // Peça em foco (tocada/sob o mouse): os cabos dela ganham cor e plaquinha por polo.
  focoPeca: string | null;
  // Filtro: condutores mostrados. Os demais ficam quase invisíveis e não pegam clique.
  visiveis: Set<Condutor>;
  // true = etiqueta de bitola em todos os cabos; false = só no cabo em foco/selecionado.
  bitolas: boolean;
  // Faixa de cada cabo com traçado automático (0 = padrão), pra cabos diferentes não se sobreporem.
  faixas: Record<string, number>;
  // Pontos em curto com tudo ligado: cabos e bornes ("peca|borne") a destacar em vermelho.
  curto: { cabos: Set<string>; bornes: Set<string> };
}

export const MapaCtx = createContext<MapaCtxValor | null>(null);

export function useMapa(): MapaCtxValor {
  const v = useContext(MapaCtx);
  if (!v) throw new Error('useMapa fora do MapaCtx');
  return v;
}
