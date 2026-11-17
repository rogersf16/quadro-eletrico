// Validações de dimensionamento/ligação e dicas de diagnóstico por sintoma.
import { BITOLAS, CORRENTES, capacidadeFio, fasesDoFornecimento, tipoCargaInfo } from './catalogo';
import { bornesDaPeca, cargaFaseFase, estaFechado, rotuloFase } from './rede';
import {
  RISCOS_PARALELO, cabosDoCircuito, perigosDasCargas, correntesDosCabos, detalheCurto, gruposJusante, misturaDeFontes, msgSobrecargaCabo, simular, simularPiorCaso,
  type Simulacao,
} from './simulacao';
import type { Peca, PecaCarga, PecaDisjuntor, PecaDR, PecaGerador, Projeto } from './types';

export type Nivel = 'erro' | 'aviso' | 'ok';
export interface Alerta {
  nivel: Nivel;
  msg: string;
  pecas?: string[]; // peças envolvidas, pra interface poder levar o mapa até elas
}

export const piorNivel = (alertas: Alerta[]): Nivel =>
  alertas.some((x) => x.nivel === 'erro') ? 'erro' : alertas.some((x) => x.nivel === 'aviso') ? 'aviso' : 'ok';

export const bitolaMinima = (cargas: PecaCarga[]) =>
  cargas.length && cargas.every((c) => c.tipoCarga === 'iluminacao') ? 1.5 : 2.5;

const fmt = (n: number) => n.toFixed(1).replace('.', ',');
const mm = (b: number) => `${String(b).replace('.', ',')} mm²`;

// Resumo do circuito de um disjuntor no pior caso (tudo ligado).
export interface InfoCircuito {
  ib: number;
  iz: number | null; // menor capacidade entre os cabos de fase do circuito
  bitolaFase: number | null;
  bitolaNeutro: number | null;
  cargas: PecaCarga[];
  protegidoPorDR: boolean;
}

export function infoCircuito(p: Projeto, d: PecaDisjuntor, pior: Simulacao = simularPiorCaso(p)): InfoCircuito {
  const { fase, neutro, cargas } = cabosDoCircuito(p, d);
  const bitolaFase = fase.length ? Math.min(...fase.map((c) => c.bitola)) : null;
  const bitolaNeutro = neutro.length ? Math.min(...neutro.map((c) => c.bitola)) : null;
  const condutores = d.polos === 3 ? 3 : 2;
  return {
    ib: pior.dispositivos[d.id]?.corrente ?? 0,
    iz: bitolaFase !== null ? capacidadeFio(bitolaFase, condutores) : null,
    bitolaFase,
    bitolaNeutro,
    cargas,
    protegidoPorDR: cargas.length > 0 && cargas.every((c) => drsQueProtegem(p, c).length > 0),
  };
}

// DRs por onde passa a fase de uma carga.
export function drsQueProtegem(p: Projeto, c: PecaCarga): PecaDR[] {
  const base = { fechado: (x: Peca) => x.tipo === 'disjuntor' || x.tipo === 'dr', faltando: [] };
  return p.pecas.filter((d): d is PecaDR => {
    if (d.tipo !== 'dr') return false;
    const { rede, porPolo } = gruposJusante(p, d, base);
    return porPolo.some((x) => !x.borne.endsWith(':N') && x.grupo === rede.grupo(c.id, 'L1'));
  });
}

// Disjuntores (não gerais) por onde passa cada ponta de fase de uma carga.
function disjuntoresDaCarga(p: Projeto, c: PecaCarga): Record<string, string[]> {
  const base = { fechado: (x: Peca) => x.tipo === 'disjuntor' || x.tipo === 'dr', faltando: [] };
  const r: Record<string, string[]> = { L1: [], L2: [] };
  for (const d of p.pecas) {
    if (d.tipo !== 'disjuntor' || d.geral) continue;
    const { rede, porPolo } = gruposJusante(p, d, base);
    for (const ponta of ['L1', 'L2']) if (porPolo.some((x) => x.grupo === rede.grupo(c.id, ponta))) r[ponta].push(d.id);
  }
  return r;
}

export function validarDisjuntor(p: Projeto, d: PecaDisjuntor, pior?: Simulacao): Alerta[] {
  const a: Alerta[] = [];
  const info = infoCircuito(p, d, pior);
  if (!d.geral && info.cargas.length === 0) a.push({ nivel: 'aviso', msg: 'Não alimenta nenhuma carga. Ligue a saída dele até uma carga.' });
  if (info.ib > d.corrente) a.push({ nivel: 'erro', msg: `Carga de ${fmt(info.ib)} A é maior que o disjuntor de ${d.corrente} A: vai desarmar.` });
  else if (info.ib > d.corrente * 0.9) a.push({ nivel: 'aviso', msg: `Carga de ${fmt(info.ib)} A está no limite do disjuntor de ${d.corrente} A.` });
  if (info.iz !== null && d.corrente > info.iz) {
    a.push({
      nivel: 'erro',
      msg: `O cabo mais fino depois dele (${mm(info.bitolaFase!)}) aguenta ~${info.iz} A, mas o disjuntor é de ${d.corrente} A. Risco de superaquecer sem desarmar.`,
    });
  }
  if (!d.geral && info.bitolaFase !== null && info.bitolaFase < bitolaMinima(info.cargas)) {
    a.push({ nivel: 'erro', msg: `Bitola mínima pra esse circuito é ${mm(bitolaMinima(info.cargas))}.` });
  }
  if (info.bitolaNeutro !== null && info.bitolaFase !== null && info.bitolaNeutro < info.bitolaFase) {
    a.push({ nivel: 'aviso', msg: `Neutro (${mm(info.bitolaNeutro)}) mais fino que a fase (${mm(info.bitolaFase)}). Em circuito monofásico o neutro leva a mesma corrente.` });
  }
  if (d.transferencia) {
    const ligado = (prefixo: string) => p.cabos.some((c) => [c.de, c.para].some((k) => k.peca === d.id && k.borne.startsWith(prefixo)));
    if (!ligado('in:') || !ligado('inII:')) a.push({ nivel: 'aviso', msg: 'Transferência: ligue as duas entradas (I em cima à esquerda, II à direita).' });
    if (!ligado('out:') || !ligado('outII:')) a.push({ nivel: 'aviso', msg: 'Transferência: ligue as duas saídas (I e II) na mesma carga, senão um dos lados não alimenta nada.' });
  }
  if (d.curva === 'B' && info.cargas.some((c) => c.tipoCarga === 'motor' || c.tipoCarga === 'ar')) {
    a.push({ nivel: 'aviso', msg: 'Motor/compressor com curva B pode desarmar na partida. Use curva C.' });
  }
  if (d.geral) {
    const nFases = fasesDoFornecimento(p.fornecimento).length;
    if (d.polos < nFases) a.push({ nivel: 'erro', msg: `O geral precisa ter ${nFases} polo(s) pra cortar todas as fases.` });
  }
  if (a.length === 0) a.push({ nivel: 'ok', msg: 'Tudo certo nesse disjuntor.' });
  return a;
}

export function validarCarga(p: Projeto, c: PecaCarga, pior: Simulacao = simularPiorCaso(p), perigos = perigosDasCargas(p)): Alerta[] {
  const a: Alerta[] = [];
  const perigo = perigos[c.id];
  if (perigo?.mistura) {
    a.push({
      nivel: 'erro',
      msg: `Rua e gerador chegam nessa mesma carga. ${RISCOS_PARALELO} Cada carga tem que receber energia de uma fonte só, por um disjuntor de transferência.`,
      pecas: [c.id],
    });
  }
  if (perigo?.semDisjuntor.length) {
    a.push({
      nivel: 'erro',
      msg: `Ligada direto na ${perigo.semDisjuntor.join(' e no ')}, sem disjuntor no caminho. Um curto ou sobrecarga aqui não derruba nada: o fio esquenta até derreter e pode pegar fogo. Passe a fase por um disjuntor.`,
      pecas: [c.id],
    });
  }
  const e = pior.cargas[c.id];
  if (e && !e.funciona) a.push({ nivel: 'erro', msg: `Mesmo com tudo ligado essa carga não funciona: ${e.motivo}.` });
  const info = tipoCargaInfo(c.tipoCarga);
  const protegida = drsQueProtegem(p, c).length > 0;
  if (info.molhado && !protegida) a.push({ nivel: 'erro', msg: 'Área molhada sem DR. A NBR 5410 exige DR (proteção contra choque).' });
  else if (c.tipoCarga === 'tomada' && !protegida) a.push({ nivel: 'aviso', msg: 'Tomadas de cozinha, lavanderia, banheiro e área externa precisam de DR.' });
  if (cargaFaseFase(c, p)) {
    const dj = disjuntoresDaCarga(p, c);
    if (dj.L1.length && dj.L2.length && dj.L1[0] !== dj.L2[0]) {
      a.push({ nivel: 'aviso', msg: 'As duas fases vêm de disjuntores diferentes. Use um bipolar pra desligar as duas juntas.' });
    }
  }
  const temTerra = p.cabos.some((k) => (k.de.peca === c.id && k.de.borne === 'T') || (k.para.peca === c.id && k.para.borne === 'T'));
  if (!temTerra && (info.molhado || c.tipoCarga === 'tomada' || c.tipoCarga === 'ar' || c.tipoCarga === 'forno')) {
    a.push({ nivel: 'aviso', msg: 'Sem fio terra ligado.' });
  }
  if (a.length === 0) a.push({ nivel: 'ok', msg: 'Ligação ok.' });
  return a;
}

export function validarProjeto(p: Projeto): Alerta[] {
  const a: Alerta[] = [];
  const pior = simularPiorCaso(p);
  for (const curto of pior.curtos) {
    a.push({
      nivel: 'erro',
      msg: `Curto-circuito com tudo ligado: ${curto.desc} no mesmo ponto.`,
      pecas: detalheCurto(p, pior.rede, curto.grupo).pecas,
    });
  }
  if (pior.neutroNoTerra) a.push({ nivel: 'aviso', msg: 'Neutro e terra estão unidos em algum ponto. Confira se isso é intencional (só deve ocorrer no padrão).' });

  const geral = p.pecas.find((x): x is PecaDisjuntor => x.tipo === 'disjuntor' && x.geral);
  if (!geral) a.push({ nivel: 'aviso', msg: 'Nenhum disjuntor marcado como geral.' });
  const fases = fasesDoFornecimento(p.fornecimento);
  if (geral) {
    for (const f of fases) {
      if (pior.correntePorFase[f] > geral.corrente) {
        a.push({ nivel: 'erro', msg: `Fase ${f} soma ${fmt(pior.correntePorFase[f])} A, acima do geral (${geral.corrente} A), se tudo ligar junto.` });
      }
    }
  }
  if (fases.length > 1) {
    const v = fases.map((f) => pior.correntePorFase[f]);
    const max = Math.max(...v);
    if (max > 0 && (max - Math.min(...v)) / max > 0.3) {
      a.push({ nivel: 'aviso', msg: 'Fases desbalanceadas (diferença acima de 30%). Redistribua circuitos 127 V entre as fases.' });
    }
  }
  for (const d of p.pecas) {
    if (d.tipo !== 'dr') continue;
    const corrente = pior.dispositivos[d.id]?.corrente ?? 0;
    if (corrente === 0) a.push({ nivel: 'aviso', msg: `"${d.nome}" não alimenta nenhuma carga.` });
    if (corrente > d.corrente) a.push({ nivel: 'aviso', msg: `"${d.nome}" (${d.corrente} A) passa ${fmt(corrente)} A no pior caso. Use um DR maior.` });
  }
  for (const e of p.pecas) {
    if (e.tipo !== 'emenda') continue;
    const n = p.cabos.filter((c) => c.de.peca === e.id || c.para.peca === e.id).length;
    if (n >= 2) a.push({ nivel: 'aviso', msg: `"${e.nome}": emenda direta com ${n} cabos. Garanta isolamento e acesso (não pode ficar dentro do eletroduto).` });
  }
  // Bitola de cada cabo contra a corrente real que passa nele com tudo ligado (inclusive antes do geral).
  const cargaCabos = correntesDosCabos(p, pior, (x) => x.tipo === 'disjuntor' || x.tipo === 'dr', []);
  for (const c of p.cabos) {
    const k = cargaCabos[c.id];
    if (k?.sobrecarga) a.push({ nivel: 'erro', msg: msgSobrecargaCabo(p, c, k, ' com tudo ligado') });
  }
  for (const c of p.cabos) {
    if (c.foraDoPadrao) a.push({ nivel: 'aviso', msg: `Fora do padrão: cabo ${c.condutor} ${mm(c.bitola)}${c.notas ? ` (${c.notas})` : ''}.` });
  }
  a.push(...validarGeradores(p));
  if (!p.dps) a.push({ nivel: 'aviso', msg: 'Sem DPS: a instalação fica sem proteção contra surtos (raios).' });
  return a;
}

// Pior caso com os geradores funcionando: tudo ligado (na transferência vale o lado I, como no resto).
const fechadoComGerador = (x: Peca) => x.tipo === 'disjuntor' || x.tipo === 'dr' || x.tipo === 'gerador';

// Ligação do gerador: paralelo com a rua, energia voltando pra rua, capacidade e tensão.
export function validarGeradores(p: Projeto): Alerta[] {
  const geradores = p.pecas.filter((x): x is PecaGerador => x.tipo === 'gerador');
  if (!geradores.length) return [];
  const a: Alerta[] = [];
  const comRua = simular(p, [], fechadoComGerador);
  for (const curto of comRua.curtos.filter((c) => c.paralelo)) {
    a.push({
      nivel: 'erro',
      msg: `Gerador em paralelo com a rua (${curto.desc} no mesmo ponto). As fases não são sincronizadas: é curto na hora que os dois ligam. Passe as fases por um disjuntor de transferência (rua no lado I, gerador no II).`,
      pecas: detalheCurto(p, comRua.rede, curto.grupo).pecas,
    });
  }
  for (const x of p.pecas) {
    if (!misturaDeFontes(p, x, comRua.rede)) continue;
    a.push({
      nivel: 'erro',
      msg: `"${x.nome}" recebe fase da rua e fase do gerador ao mesmo tempo. Vai desarmar quando o gerador funcionar. ${RISCOS_PARALELO}`,
      pecas: [x.id, ...geradores.map((g) => g.id)],
    });
  }
  // Sem a rua (apagão), com o gerador funcionando: a energia dele chega na entrada?
  const semRua = simular(p, ['A', 'B', 'C'], fechadoComGerador);
  for (const g of geradores) {
    if (semRua.retorno.includes(g.id)) {
      a.push({
        nivel: 'erro',
        msg: `"${g.nome}": num apagão a energia dele volta pra rua pelo padrão. Isso mata o eletricista da concessionária que está consertando a rede. Use transferência que corte rua e gerador.`,
        pecas: [g.id],
      });
    }
    const e = semRua.geradores[g.id];
    if (e && e.carga > 1) {
      const kw = (w: number) => (w / 1000).toFixed(1).replace('.', ',');
      a.push({
        nivel: 'aviso',
        msg: `"${g.nome}" (${kw(g.potencia)} kVA) alimenta ${kw(e.potencia)} kW se tudo ligar junto${e.potencia <= g.potencia ? ` (fase mais carregada: ${e.correntes.map((i, k) => `${rotuloFase(`g:${g.id}:${k + 1}`)} ${fmt(i)} A`).join(', ')}; limite ${fmt(e.correnteNominal)} A por fase)` : ''}. Num apagão, ligue só o essencial.`,
        pecas: [g.id],
      });
    }
    const usado = p.cabos.some((c) => [c.de, c.para].some((k) => k.peca === g.id && k.borne.startsWith('L')));
    if (!usado) a.push({ nivel: 'aviso', msg: `"${g.nome}" não está ligado em nada. Ligue as fases (L1…) no lado II de um disjuntor de transferência.`, pecas: [g.id] });
  }
  return a;
}

// Sugere o menor disjuntor que aguenta a carga e o menor cabo que esse disjuntor protege.
export function sugerir(info: InfoCircuito, polos: number): { corrente: number; bitola: number } | null {
  if (info.ib <= 0) return null;
  const corrente = CORRENTES.find((x) => x >= info.ib * 1.05) ?? CORRENTES[CORRENTES.length - 1];
  const bitola =
    BITOLAS.find((b) => b >= bitolaMinima(info.cargas) && capacidadeFio(b, polos === 3 ? 3 : 2) >= corrente) ??
    BITOLAS[BITOLAS.length - 1];
  return { corrente, bitola };
}

// Dicas de diagnóstico pelo sintoma relatado, usando os dados do circuito.
export function diagnostico(d: PecaDisjuntor, info: InfoCircuito): string[] {
  const { ib, iz } = info;
  const inom = d.corrente;
  switch (d.sintoma) {
    case 'nenhum':
      return [];
    case 'desarma':
      return ib > inom
        ? [
            `Sobrecarga: as cargas ligadas nele somam ${fmt(ib)} A, acima dos ${inom} A.`,
            'Divida o circuito em dois ou redimensione disjuntor e cabos juntos. Nunca troque só o disjuntor por um maior.',
          ]
        : [
            'A carga cadastrada cabe no disjuntor. Confira se tem aparelho no circuito que não entrou na soma (ferro, micro-ondas, aquecedor).',
            'Disjuntor velho ou de baixa qualidade pode desarmar abaixo da corrente nominal. Vale testar outro igual.',
            'Se desarma com tudo desligado, suspeite de curto intermitente (fio descascado, emenda, tomada derretida).',
          ];
    case 'desarma_ao_ligar':
      return [
        'Se desarma no instante em que liga: pode ser curto no aparelho. Teste o aparelho em outro circuito.',
        d.curva === 'B'
          ? 'Motores e compressores puxam muita corrente na partida; curva B costuma desarmar. Troque por curva C, mesma amperagem.'
          : 'Curva já é C. Se for motor grande, pode precisar de curva D. Confirme com eletricista.',
      ];
    case 'dr_desarma':
      return [
        info.protegidoPorDR
          ? 'No mapa, ligue esse disjuntor e veja se o DR cai: a simulação acusa neutro saindo por fora do DR.'
          : 'No mapa, esse circuito não passa por nenhum DR. Confira por onde ele passa de verdade.',
        'DR desarma por diferença entre a corrente que sai pela fase e a que volta pelo neutro.',
        'Causa nº 1 em casa: neutro do circuito ligado no barramento geral (ou em emenda com outro circuito) em vez de voltar pelo DR.',
        'Outras: umidade em caixas, resistência de chuveiro com fuga, isolamento danificado, neutro encostando no terra.',
        'Teste: desligue os disjuntores abaixo do DR, rearme e vá religando um por um.',
      ];
    case 'esquenta':
      return iz !== null && inom > iz
        ? [`O cabo (~${iz} A) é fino demais pro disjuntor (${inom} A). Esse é provavelmente o problema e é perigoso.`]
        : [
            'Aquecimento com dimensionamento ok quase sempre é mau contato: parafuso do borne frouxo ou fio oxidado.',
            'Emendas cobre com cobre sem conector também esquentam com o tempo.',
            'Com o disjuntor geral DESLIGADO, reaperte os bornes. Se tiver marca de queimado, troque.',
          ];
    case 'cheiro':
      return [
        'Pare de usar esse circuito agora e desligue o disjuntor.',
        'Cheiro de queimado indica isolamento derretendo ou arco elétrico. Chame um eletricista antes de religar.',
      ];
    case 'sem_energia':
      return [
        'Confira se o disjuntor está realmente ligado (às vezes fica no meio do curso).',
        'No mapa, veja o motivo escrito embaixo da carga ("sem neutro", "só uma fase chegando"...).',
        'Se a fase chega e não funciona, procure o neutro: emenda solta é causa comum.',
        'Se vários circuitos da mesma fase estão sem energia, o problema pode ser antes do quadro (padrão/concessionária).',
      ];
    case 'oscila':
      return [
        'Luz piscando em vários lugares costuma ser neutro frouxo: no padrão, no barramento ou numa emenda de neutro.',
        'Neutro solto em bifásico/trifásico pode jogar até 220 V em aparelhos 127 V e queimar tudo. Trate como urgente.',
        'Se só esse circuito oscila, procure mau contato nas emendas e no borne do disjuntor.',
      ];
  }
}

export const temEnergiaNaEntrada = (p: Projeto, d: PecaDisjuntor | PecaDR, sim: Simulacao) =>
  bornesDaPeca(d, p).some((b) => b.lado === 'topo' && sim.rede.potencial(d.id, b.id).fases.size > 0);

export { estaFechado };
