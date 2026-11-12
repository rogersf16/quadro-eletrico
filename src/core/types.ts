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
  // Transferência manual: dois disjuntores lado a lado com intertravamento.
  // Lado I = ligado/desarmado acima (bornes in:k/out:k); lado II = campo II (bornes inII:k/outII:k).
  // Só um lado pode ficar ligado: se os dois ligarem, os dois desarmam.
  transferencia?: boolean;
  II?: Manobra;
}

export type LadoTransferencia = 'I' | 'II';

export interface PecaDR extends PecaBase, Manobra {
  tipo: 'dr';
  corrente: number;
  sensibilidade: 30 | 300;
  polos: 2 | 4; // 2 = 1 fase + N; 4 = até 3 fases + N
}

// Medidor de energia em trilho DIN (multimedidor): tem a cara de um disjuntor, mas não protege nem manobra.
// Fica sempre fechado e só mede a tensão e a corrente de cada fase que passa por ele.
export interface PecaMedidor extends PecaBase {
  tipo: 'medidor';
  polos: 2 | 4; // 2 = 1 fase + N; 4 = até 3 fases + N
  correnteMax: number; // A: limite de medição direta
}

// Caixa de agrupamento (ex.: "Quadro quarto"): só visual, não tem bornes nem entra na simulação.
// Fica atrás das outras peças; arrastar pelo título leva junto o que está dentro.
export interface PecaQuadro extends PecaBase {
  tipo: 'quadro';
  w: number;
  h: number;
  cor: string; // hex
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
  // Ausente = horizontal (furos embaixo). Vertical: furos do lado direito ou esquerdo.
  orientacao?: OrientacaoBarramento;
}

export type OrientacaoBarramento = 'horizontal' | 'vertical-dir' | 'vertical-esq';

// Ponto de consumo: o aparelho ou conjunto de aparelhos de um circuito.
export interface PecaCarga extends PecaBase {
  tipo: 'carga';
  tipoCarga: TipoCarga;
  potencia: number; // W
  tensao: 127 | 220;
}

export type Peca = PecaQuadro | PecaEntrada | PecaDisjuntor | PecaDR | PecaMedidor | PecaEmenda | PecaBarramento | PecaCarga;
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
