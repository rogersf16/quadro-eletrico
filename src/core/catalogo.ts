import type { Condutor, Curva, Fornecimento, Sintoma, TipoCarga } from './types';

// Correntes nominais comerciais de minidisjuntores DIN.
export const CORRENTES = [2, 4, 6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 70, 80, 100, 125];

// Correntes nominais comerciais de DR (interruptor diferencial).
export const CORRENTES_DR = [25, 40, 63, 80, 100];

// Limites de medição direta comuns de multimedidores DIN.
export const CORRENTES_MEDIDOR = [40, 63, 80, 100];

export const CURVAS: { valor: Curva; desc: string }[] = [
  { valor: 'B', desc: 'B: cargas resistivas (iluminação, chuveiro)' },
  { valor: 'C', desc: 'C: uso geral, motores pequenos, ar-condicionado' },
  { valor: 'D', desc: 'D: motores com partida pesada' },
];

// Seções de fio de cobre (mm²).
export const BITOLAS = [1.5, 2.5, 4, 6, 10, 16, 25, 35];

// Capacidade de condução (A). Cobre, PVC 70 °C, método B1 (eletroduto embutido),
// NBR 5410 tabela 36. Simplificado: sem fatores de agrupamento nem temperatura.
const IZ_2_CARREGADOS: Record<number, number> = {
  1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 101, 35: 125,
};
const IZ_3_CARREGADOS: Record<number, number> = {
  1.5: 15.5, 2.5: 21, 4: 28, 6: 36, 10: 50, 16: 68, 25: 89, 35: 110,
};

export function capacidadeFio(bitola: number, condutoresCarregados: 2 | 3 = 2): number {
  const tabela = condutoresCarregados === 3 ? IZ_3_CARREGADOS : IZ_2_CARREGADOS;
  return tabela[bitola] ?? 0;
}

export const FORNECIMENTOS: {
  valor: Fornecimento;
  desc: string;
  curto: string;
  tensaoTxt: string;
  tensoes: (127 | 220)[];
  fases: number;
  faseNeutro: 127 | 220;
}[] = [
  { valor: 'mono127', desc: 'Monofásico 127 V (fase + neutro)', curto: '1 fase · 127V', tensaoTxt: '127 V fase-neutro', tensoes: [127], fases: 1, faseNeutro: 127 },
  { valor: 'mono220', desc: 'Monofásico 220 V (fase + neutro)', curto: '1 fase · 220V', tensaoTxt: '220 V fase-neutro', tensoes: [220], fases: 1, faseNeutro: 220 },
  { valor: 'bi', desc: 'Bifásico 127/220 V (2 fases + neutro)', curto: '2 fases', tensaoTxt: '127 V F-N · 220 V F-F', tensoes: [127, 220], fases: 2, faseNeutro: 127 },
  { valor: 'tri', desc: 'Trifásico 127/220 V (3 fases + neutro)', curto: '3 fases', tensaoTxt: '127 V F-N · 220 V F-F', tensoes: [127, 220], fases: 3, faseNeutro: 127 },
];

export const TIPOS_CARGA: { valor: TipoCarga; desc: string; icone: string; potenciaPadrao: number; curva: Curva; molhado: boolean }[] = [
  { valor: 'iluminacao', desc: 'Iluminação', icone: '💡', potenciaPadrao: 600, curva: 'B', molhado: false },
  { valor: 'tomada', desc: 'Tomadas de uso geral', icone: '🔌', potenciaPadrao: 1500, curva: 'C', molhado: false },
  { valor: 'chuveiro', desc: 'Chuveiro', icone: '🚿', potenciaPadrao: 6800, curva: 'B', molhado: true },
  { valor: 'torneira', desc: 'Torneira elétrica', icone: '🚰', potenciaPadrao: 5500, curva: 'B', molhado: true },
  { valor: 'ar', desc: 'Ar-condicionado', icone: '❄️', potenciaPadrao: 1400, curva: 'C', molhado: false },
  { valor: 'forno', desc: 'Forno / cooktop', icone: '🍳', potenciaPadrao: 4000, curva: 'C', molhado: false },
  { valor: 'motor', desc: 'Motor / bomba', icone: '⚙️', potenciaPadrao: 750, curva: 'C', molhado: false },
  { valor: 'outro', desc: 'Outro', icone: '🔧', potenciaPadrao: 1000, curva: 'C', molhado: false },
];

export const SINTOMAS: { valor: Sintoma; desc: string }[] = [
  { valor: 'nenhum', desc: 'Sem problema' },
  { valor: 'desarma', desc: 'Disjuntor desarma com o uso' },
  { valor: 'desarma_ao_ligar', desc: 'Desarma na hora que liga o aparelho' },
  { valor: 'dr_desarma', desc: 'O DR desarma' },
  { valor: 'esquenta', desc: 'Disjuntor ou fio esquentando' },
  { valor: 'cheiro', desc: 'Cheiro de queimado / marca preta' },
  { valor: 'sem_energia', desc: 'Circuito sem energia' },
  { valor: 'oscila', desc: 'Luz piscando / tensão oscilando' },
];

export const CONDUTORES: { valor: Condutor; desc: string; corPadrao: string }[] = [
  { valor: 'fase', desc: 'Fase', corPadrao: '#d0302a' },
  { valor: 'neutro', desc: 'Neutro', corPadrao: '#4fa3e0' },
  { valor: 'terra', desc: 'Terra (proteção)', corPadrao: '#2e9e4f' },
  { valor: 'retorno', desc: 'Retorno (interruptor)', corPadrao: '#e8e8e8' },
];

// Cores comuns de isolação no Brasil. Fase pode ser qualquer cor exceto azul-claro e verde.
export const CORES_CABO: { valor: string; nome: string }[] = [
  { valor: '#d0302a', nome: 'Vermelho' },
  { valor: '#2b2b2b', nome: 'Preto' },
  { valor: '#e8e8e8', nome: 'Branco' },
  { valor: '#9aa0a8', nome: 'Cinza' },
  { valor: '#7a4a24', nome: 'Marrom' },
  { valor: '#e2c300', nome: 'Amarelo' },
  { valor: '#4fa3e0', nome: 'Azul-claro' },
  { valor: '#2e9e4f', nome: 'Verde' },
  { valor: '#8ccf3a', nome: 'Verde-amarelo' },
];

// Cores usadas pra identificar as fases da rua no mapa.
export const CORES_CONDUTOR: Record<'A' | 'B' | 'C' | 'N' | 'T', string> = {
  A: '#d0302a',
  B: '#2b2b2b',
  C: '#9aa0a8',
  N: '#4fa3e0',
  T: '#2e9e4f',
};

export const tipoCargaInfo = (t: TipoCarga) => TIPOS_CARGA.find((x) => x.valor === t)!;
export const fornecimentoInfo = (f: Fornecimento) => FORNECIMENTOS.find((x) => x.valor === f)!;
export const condutorInfo = (c: Condutor) => CONDUTORES.find((x) => x.valor === c)!;
export const fasesDoFornecimento = (f: Fornecimento) => (['A', 'B', 'C'] as const).slice(0, fornecimentoInfo(f).fases);
