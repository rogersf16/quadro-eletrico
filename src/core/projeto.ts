// Criação, (des)serialização e fábrica de peças/cabos. Puro: roda no navegador ou num servidor Node.
import { BITOLAS, CORES_CONDUTOR, capacidadeFio, condutorInfo, tipoCargaInfo } from './catalogo';
import { migrarParaV3 } from './migracao';
import type { Cabo, Condutor, Peca, PecaBarramento, PecaCarga, PecaDisjuntor, PecaDR, PecaEmenda, Ponta, Posicao, Projeto, TipoCarga } from './types';
import { ID_ENTRADA } from './types';

export const VERSAO_FORMATO = 3;

export function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------- fábricas ----------
export const novoDisjuntor = (pos: Posicao, m: Partial<PecaDisjuntor> = {}): PecaDisjuntor => ({
  id: novoId(), tipo: 'disjuntor', nome: 'Disjuntor', notas: '', pos, geral: false,
  corrente: 20, polos: 1, curva: 'C', sintoma: 'nenhum', ligado: false, desarmado: false, ...m,
});

export const novoDR = (pos: Posicao, m: Partial<PecaDR> = {}): PecaDR => ({
  id: novoId(), tipo: 'dr', nome: 'DR', notas: '', pos, corrente: 40, sensibilidade: 30, polos: 2,
  ligado: false, desarmado: false, ...m,
});

export const novaEmenda = (pos: Posicao, m: Partial<PecaEmenda> = {}): PecaEmenda => ({
  id: novoId(), tipo: 'emenda', nome: 'Emenda', notas: '', pos, ...m,
});

export const novoBarramento = (pos: Posicao, m: Partial<PecaBarramento> = {}): PecaBarramento => ({
  id: novoId(), tipo: 'barramento', nome: 'Barramento neutro', notas: '', pos, condutor: 'neutro', bornes: 6, ...m,
});

export const novaCarga = (pos: Posicao, tipoCarga: TipoCarga = 'tomada', m: Partial<PecaCarga> = {}): PecaCarga => ({
  id: novoId(), tipo: 'carga', nome: tipoCargaInfo(tipoCarga).desc, notas: '', pos, tipoCarga,
  potencia: tipoCargaInfo(tipoCarga).potenciaPadrao, tensao: 127, ...m,
});

export const novoCabo = (de: Ponta, para: Ponta, condutor: Condutor, m: Partial<Cabo> = {}): Cabo => ({
  id: novoId(), de, para, condutor, cor: condutorInfo(condutor).corPadrao, bitola: 2.5, pontos: [],
  foraDoPadrao: false, notas: '', ...m,
});

// Menor bitola que aguenta a corrente de um disjuntor.
export const bitolaPara = (corrente: number) => BITOLAS.find((b) => capacidadeFio(b) >= corrente) ?? 35;

export function projetoVazio(): Projeto {
  const geral = novoDisjuntor({ x: 88, y: 232 }, { id: 'geral', nome: 'Disjuntor geral', geral: true, corrente: 50, polos: 2, ligado: true });
  const barN = novoBarramento({ x: 296, y: 296 }, { nome: 'Barramento neutro' });
  const barT = novoBarramento({ x: 296, y: 400 }, { nome: 'Barramento terra', condutor: 'terra' });
  const pecas: Peca[] = [
    { id: ID_ENTRADA, tipo: 'entrada', nome: 'Entrada da rua', notas: '', pos: { x: 40, y: 24 }, faltando: [] },
    geral,
    barN,
    barT,
  ];
  const b = bitolaPara(geral.corrente);
  const cabos: Cabo[] = [
    novoCabo({ peca: ID_ENTRADA, borne: 'A' }, { peca: geral.id, borne: 'in:1' }, 'fase', { cor: CORES_CONDUTOR.A, bitola: b }),
    novoCabo({ peca: ID_ENTRADA, borne: 'B' }, { peca: geral.id, borne: 'in:2' }, 'fase', { cor: CORES_CONDUTOR.B, bitola: b }),
    novoCabo({ peca: ID_ENTRADA, borne: 'N' }, { peca: barN.id, borne: 'b:1' }, 'neutro', { bitola: b }),
    novoCabo({ peca: ID_ENTRADA, borne: 'T' }, { peca: barT.id, borne: 'b:1' }, 'terra', { bitola: 6 }),
  ];
  return {
    app: 'quadro-eletrico',
    versao: VERSAO_FORMATO,
    nome: 'Minha casa',
    endereco: '',
    fornecimento: 'bi',
    dps: false,
    pecas,
    cabos,
    atualizadoEm: new Date().toISOString(),
  };
}

export function serializar(p: Projeto): string {
  return JSON.stringify({ ...p, atualizadoEm: new Date().toISOString() }, null, 2);
}

// Converte texto em Projeto, conferindo e migrando o formato. Lança Error com mensagem amigável.
export function desserializar(texto: string): Projeto {
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(texto);
  } catch {
    throw new Error('O arquivo não é um .quadro válido (JSON corrompido).');
  }
  if (dados?.app !== 'quadro-eletrico') throw new Error('Esse arquivo não foi gerado pelo Quadro Elétrico.');
  if (dados.versao === 1 || dados.versao === 2) return migrarParaV3(dados);
  if (dados.versao !== VERSAO_FORMATO || !Array.isArray(dados.pecas) || !Array.isArray(dados.cabos)) {
    throw new Error(`Versão de arquivo não suportada: ${String(dados.versao)}`);
  }
  return dados as unknown as Projeto;
}

export function nomeArquivo(p: Projeto): string {
  const base = (p.nome || 'quadro')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${base || 'quadro'}.quadro`;
}
