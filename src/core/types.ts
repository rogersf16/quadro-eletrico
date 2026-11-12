// Tipos de dados do projeto (formato do arquivo .quadro, versão 3).
// A instalação é um GRAFO: peças com bornes, ligadas por cabos de borne a borne.

export type Fornecimento = 'mono127' | 'mono220' | 'bi' | 'tri';
export type Fase = 'A' | 'B' | 'C';
export type Curva = 'B' | 'C' | 'D';
export type Polos = 1 | 2 | 3;
export type Condutor = 'fase' | 'neutro' | 'terra' | 'retorno';

export type TipoCarga =
  | 'iluminacao'
  | 'tomada'
  | 'chuveiro'
  | 'torneira'
  | 'ar'
  | 'forno'
  | 'motor'
  | 'outro';

export type Sintoma =
  | 'nenhum'
  | 'desarma'
  | 'desarma_ao_ligar'
  | 'dr_desarma'
  | 'esquenta'
  | 'cheiro'
  | 'sem_energia'
  | 'oscila';

export interface Posicao {
  x: number;
  y: number;
}

// Estado mecânico de dispositivos de manobra.
export interface Manobra {
  ligado: boolean;
  desarmado: boolean; // true = caiu sozinho (proteção atuou)
}

interface PecaBase {
  id: string;
  nome: string;
  pos: Posicao;
  notas: string;
}

// Padrão de entrada / medidor: fonte das fases, neutro e terra.
export interface PecaEntrada extends PecaBase {
  tipo: 'entrada';
  faltando: Fase[]; // fases cortadas (simulação de falta de fase)
}

// Disjuntor termomagnético. "geral" é só um papel (aparece destacado).
export interface PecaDisjuntor extends PecaBase, Manobra {
  tipo: 'disjuntor';
  geral: boolean;
  corrente: number;
  polos: Polos;
  curva: Curva;
  sintoma: Sintoma;
}

export interface PecaDR extends PecaBase, Manobra {
  tipo: 'dr';
  corrente: number;
  sensibilidade: 30 | 300;
  polos: 2 | 4; // 2 = 1 fase + N; 4 = até 3 fases + N
}

// Emenda cobre com cobre: todos os cabos ligados nela viram um ponto só.
export interface PecaEmenda extends PecaBase {
  tipo: 'emenda';
}

// Barramento (neutro ou terra): todos os bornes são o mesmo ponto elétrico.
export interface PecaBarramento extends PecaBase {
  tipo: 'barramento';
  condutor: 'neutro' | 'terra';
  bornes: number;
}

// Ponto de consumo: o aparelho ou conjunto de aparelhos de um circuito.
export interface PecaCarga extends PecaBase {
  tipo: 'carga';
  tipoCarga: TipoCarga;
  potencia: number; // W
  tensao: 127 | 220;
}

export type Peca = PecaEntrada | PecaDisjuntor | PecaDR | PecaEmenda | PecaBarramento | PecaCarga;
export type TipoPeca = Peca['tipo'];

// Uma ponta de cabo: peça + borne (ex.: { peca: 'geral', borne: 'out:1' }).
export interface Ponta {
  peca: string;
  borne: string;
}

export interface Cabo {
  id: string;
  de: Ponta;
  para: Ponta;
  condutor: Condutor;
  cor: string; // cor da isolação (hex)
  bitola: number; // mm²
  pontos: Posicao[]; // dobras do caminho desenhado
  rotaAuto?: boolean; // true = dobras calculadas pelo "Organizar" (somem se a peça for movida)
  foraDoPadrao: boolean; // anotação: ligação improvisada/irregular
  notas: string;
}

export interface Projeto {
  app: 'quadro-eletrico';
  versao: 3;
  nome: string;
  endereco: string;
  fornecimento: Fornecimento;
  dps: boolean;
  pecas: Peca[];
  cabos: Cabo[];
  atualizadoEm: string;
}

export const ID_ENTRADA = 'entrada';
