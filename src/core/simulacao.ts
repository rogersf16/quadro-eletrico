// Simulação: quem tem energia, quanto cada carga e cada disjuntor puxa, curtos e atuação das proteções.
import { fornecimentoInfo } from './catalogo';
import { bornesDaPeca, cargaFaseFase, chave, estaFechado, montarRede, rotuloPotencial, type Rede } from './rede';
import type { Cabo, Fase, Peca, PecaCarga, PecaDisjuntor, PecaDR, PecaMedidor, Projeto } from './types';

export interface EstadoCarga {
  funciona: boolean;
  motivo: string; // explicação curta (ex.: "sem neutro")
  fases: Fase[];
  tensao: number;
  corrente: number; // A (0 se não funciona)
}

export interface Curto {
  grupo: string;
  desc: string;
}

export interface Simulacao {
  rede: Rede;
  cargas: Record<string, EstadoCarga>;
  curtos: Curto[];
  neutroNoTerra: boolean; // neutro e terra unidos em algum ponto além da entrada
  correntePorFase: Record<Fase, number>;
  // Disjuntores e DRs: corrente que passa (pior polo) e o que tem energia.
  dispositivos: Record<string, { corrente: number; entrada: boolean; saida: boolean }>;
  cabos: Record<string, 'fase' | 'neutro' | 'terra' | null>; // potencial em cada cabo
  medidores: Record<string, LeituraMedidor>;
}

// O que o display de um medidor mostra.
export interface LeituraMedidor {
  fases: { polo: string; fase: Fase | null; tensao: number; corrente: number }[];
  potencia: number; // W, soma das cargas funcionando depois dele
}

const fasesOf = (rede: Rede, peca: string, borne: string) => [...rede.potencial(peca, borne).fases];

function estadoCarga(c: PecaCarga, p: Projeto, rede: Rede): EstadoCarga {
  const nada = (motivo: string, fases: Fase[] = []): EstadoCarga => ({ funciona: false, motivo, fases, tensao: 0, corrente: 0 });
  const f1 = fasesOf(rede, c.id, 'L1');
  if (f1.length > 1) return nada('curto entre fases');
  if (cargaFaseFase(c, p)) {
    const f2 = fasesOf(rede, c.id, 'L2');
    if (!f1.length && !f2.length) return nada('sem energia');
    if (!f1.length || !f2.length) return nada('só uma fase chegando', [...f1, ...f2]);
    if (f1[0] === f2[0]) return nada('as duas pontas na mesma fase', f1);
    return { funciona: true, motivo: '220 V', fases: [f1[0], f2[0]], tensao: 220, corrente: c.potencia / 220 };
  }
  const n = rede.potencial(c.id, 'N');
  if (!f1.length) return nada(n.neutro ? 'sem fase' : 'sem energia');
  if (n.fases.size) return nada('neutro com fase (curto?)', f1);
  if (!n.neutro) return nada('sem neutro', f1);
  const v = fornecimentoInfo(p.fornecimento).faseNeutro;
  return { funciona: true, motivo: `${v} V`, fases: f1, tensao: v, corrente: c.potencia / c.tensao };
}

// Grupos de saída de um disjuntor/DR quando ele está ABERTO = tudo que depende dele.
export function gruposJusante(p: Projeto, d: PecaDisjuntor | PecaDR | PecaMedidor, base: Omit<Parameters<typeof montarRede>[1], 'abrir'>) {
  const rede = montarRede(p, { ...base, abrir: d.id });
  const saidas = bornesDaPeca(d, p).filter((b) => b.lado === 'base');
  const porPolo = saidas.map((b) => ({ borne: b.id, grupo: rede.grupo(d.id, b.id) }));
  // Se o lado de saída tiver potencial próprio (alimentação por outro caminho), não é jusante dele.
  const proprios = porPolo.filter((x) => {
    const pt = rede.potencialDoGrupo(x.grupo);
    return pt.fases.size === 0 && !pt.neutro;
  });
  return { rede, porPolo: proprios };
}

const polosFase = (m: PecaMedidor) => (m.polos === 2 ? ['1'] : ['1', '2', '3']);

export function simular(p: Projeto, faltando?: Fase[], fechado: (x: Peca) => boolean = estaFechado): Simulacao {
  const entrada = p.pecas.find((x) => x.tipo === 'entrada');
  const falt = faltando ?? (entrada?.tipo === 'entrada' ? entrada.faltando : []);
  const base = { fechado, faltando: falt };
  const rede = montarRede(p, base);

  const cargas: Record<string, EstadoCarga> = {};
  const correntePorFase: Record<Fase, number> = { A: 0, B: 0, C: 0 };
  for (const x of p.pecas) {
    if (x.tipo !== 'carga') continue;
    const e = estadoCarga(x, p, rede);
    cargas[x.id] = e;
    if (e.funciona) for (const f of e.fases) correntePorFase[f] += e.corrente;
  }

  const curtos: Curto[] = [];
  let neutroNoTerra = false;
  for (const g of rede.grupos()) {
    const pt = rede.potencialDoGrupo(g);
    if (pt.fases.size > 1 || (pt.fases.size === 1 && (pt.neutro || pt.terra))) {
      curtos.push({ grupo: g, desc: rotuloPotencial(pt) });
    } else if (pt.neutro && pt.terra) neutroNoTerra = true;
  }

  const dispositivos: Simulacao['dispositivos'] = {};
  for (const x of p.pecas) {
    if (x.tipo !== 'disjuntor' && x.tipo !== 'dr') continue;
    const bornes = bornesDaPeca(x, p);
    const entradaViva = bornes.some((b) => b.lado === 'topo' && rede.potencial(x.id, b.id).fases.size > 0);
    const saidaViva = bornes.some((b) => b.lado === 'base' && rede.potencial(x.id, b.id).fases.size > 0) && fechado(x);
    let corrente = 0;
    if (fechado(x)) {
      const { rede: r2, porPolo } = gruposJusante(p, x, base);
      for (const polo of porPolo) {
        if (polo.borne.endsWith(':N')) continue;
        let soma = 0;
        for (const c of p.pecas) {
          if (c.tipo !== 'carga' || !cargas[c.id]?.funciona) continue;
          const pontas = cargaFaseFase(c, p) ? ['L1', 'L2'] : ['L1'];
          if (pontas.some((b) => r2.grupo(c.id, b) === polo.grupo)) soma += cargas[c.id].corrente;
        }
        corrente = Math.max(corrente, soma);
      }
    }
    dispositivos[x.id] = { corrente, entrada: entradaViva, saida: saidaViva };
  }

  const medidores: Simulacao['medidores'] = {};
  const vFN = fornecimentoInfo(p.fornecimento).faseNeutro;
  for (const x of p.pecas) {
    if (x.tipo !== 'medidor') continue;
    const { rede: r2, porPolo } = gruposJusante(p, x, base);
    const jusante = new Set(porPolo.map((k) => k.grupo));
    const temNeutro = rede.potencial(x.id, 'in:N').neutro;
    const fases = polosFase(x).map((polo) => {
      const fs = fasesOf(rede, x.id, `in:${polo}`);
      const fase = fs.length === 1 ? fs[0] : null;
      const g = porPolo.find((k) => k.borne === `out:${polo}`)?.grupo;
      let corrente = 0;
      for (const c of p.pecas) {
        if (c.tipo !== 'carga' || !cargas[c.id]?.funciona || g === undefined) continue;
        const pontas = cargaFaseFase(c, p) ? ['L1', 'L2'] : ['L1'];
        if (pontas.some((b) => r2.grupo(c.id, b) === g)) corrente += cargas[c.id].corrente;
      }
      return { polo, fase, tensao: fase && temNeutro ? vFN : 0, corrente };
    });
    let potencia = 0;
    for (const c of p.pecas) {
      if (c.tipo !== 'carga' || !cargas[c.id]?.funciona) continue;
      if (['L1', 'L2'].some((b) => jusante.has(r2.grupo(c.id, b)))) potencia += c.potencia;
    }
    medidores[x.id] = { fases, potencia };
  }

  const cabos: Simulacao['cabos'] = {};
  for (const c of p.cabos) {
    const pt = rede.potencial(c.de.peca, c.de.borne);
    cabos[c.id] = pt.fases.size ? 'fase' : pt.neutro ? 'neutro' : pt.terra ? 'terra' : null;
  }

  return { rede, cargas, curtos, neutroNoTerra, correntePorFase, dispositivos, cabos, medidores };
}

// Pior caso: tudo ligado, nenhuma fase faltando.
export const simularPiorCaso = (p: Projeto) => simular(p, [], (x) => x.tipo === 'disjuntor' || x.tipo === 'dr');

export interface ResultadoProtecoes {
  projeto: Projeto;
  eventos: string[];
}

const desarmar = (p: Projeto, id: string): Projeto => ({
  ...p,
  pecas: p.pecas.map((x) => (x.id === id && (x.tipo === 'disjuntor' || x.tipo === 'dr') ? { ...x, ligado: false, desarmado: true } : x)),
});

// Verifica a corrente diferencial de um DR: fase e neutro de cada carga precisam passar os dois por ele.
function drDesequilibrado(p: Projeto, d: PecaDR, sim: Simulacao): string | null {
  const ent = p.pecas.find((x) => x.tipo === 'entrada');
  const base = { fechado: estaFechado, faltando: ent?.tipo === 'entrada' ? ent.faltando : [] };
  const { rede: r2, porPolo } = gruposJusante(p, d, base);
  const fasesSaida = new Set(porPolo.filter((x) => !x.borne.endsWith(':N')).map((x) => x.grupo));
  const neutroSaida = porPolo.find((x) => x.borne.endsWith(':N'))?.grupo;
  for (const c of p.pecas) {
    if (c.tipo !== 'carga' || !sim.cargas[c.id]?.funciona || cargaFaseFase(c, p)) continue;
    const faseViaDR = fasesSaida.has(r2.grupo(c.id, 'L1'));
    const neutroViaDR = neutroSaida !== undefined && r2.grupo(c.id, 'N') === neutroSaida;
    if (faseViaDR !== neutroViaDR) {
      return faseViaDR
        ? `o neutro de "${c.nome}" não volta pelo DR (fase passa pelo DR, neutro sai por fora)`
        : `"${c.nome}" usa o neutro do DR mas a fase vem de fora dele`;
    }
  }
  // Sintoma relatado em algum disjuntor energizado abaixo do DR.
  for (const x of p.pecas) {
    if (x.tipo !== 'disjuntor' || x.sintoma !== 'dr_desarma' || !sim.dispositivos[x.id]?.saida) continue;
    const entradas = bornesDaPeca(x, p).filter((b) => b.lado === 'topo');
    if (entradas.some((b) => fasesSaida.has(r2.grupo(x.id, b.id)))) return `fuga relatada no circuito "${x.nome}"`;
  }
  return null;
}

// Aplica as proteções depois de uma manobra, repetindo até estabilizar.
export function aplicarProtecoes(entrada: Projeto): ResultadoProtecoes {
  let p = entrada;
  const eventos: string[] = [];
  for (let volta = 0; volta < 20; volta++) {
    const sim = simular(p);
    const disj = p.pecas.filter((x): x is PecaDisjuntor => x.tipo === 'disjuntor' && x.ligado);
    const ordem = [...disj.filter((x) => !x.geral), ...disj.filter((x) => x.geral)];

    // 1) Curto-circuito: cai o primeiro disjuntor (circuito antes do geral) encostado no ponto em curto.
    if (sim.curtos.length) {
      const curto = sim.curtos[0];
      const alvo = ordem.find((x) => bornesDaPeca(x, p).some((b) => sim.rede.grupo(x.id, b.id) === curto.grupo));
      if (alvo) {
        eventos.push(`Curto (${curto.desc}): "${alvo.nome}" desarmou.`);
        p = desarmar(p, alvo.id);
        continue;
      }
      eventos.push(`Curto (${curto.desc}) sem disjuntor no caminho! Na vida real isso queima cabos ou o padrão.`);
      break;
    }

    // 2) Sobrecarga: circuitos primeiro, geral por último.
    const sobrecarga = ordem.find((x) => (sim.dispositivos[x.id]?.corrente ?? 0) > x.corrente);
    if (sobrecarga) {
      const i = sim.dispositivos[sobrecarga.id].corrente;
      eventos.push(`"${sobrecarga.nome}" desarmou: ${i.toFixed(1)} A passando num disjuntor de ${sobrecarga.corrente} A.`);
      p = desarmar(p, sobrecarga.id);
      continue;
    }

    // 3) DRs: corrente diferencial (neutro misturado ou fuga relatada).
    const drs = p.pecas.filter((x): x is PecaDR => x.tipo === 'dr' && x.ligado);
    let caiu = false;
    for (const d of drs) {
      const motivo = drDesequilibrado(p, d, sim);
      if (motivo) {
        eventos.push(`"${d.nome}" desarmou: ${motivo}.`);
        p = desarmar(p, d.id);
        caiu = true;
        break;
      }
    }
    if (!caiu) break;
  }
  return { projeto: p, eventos };
}

// Cabos que pertencem ao circuito de um disjuntor: os do lado de saída (fase) e os neutros das cargas dele.
export function cabosDoCircuito(p: Projeto, d: PecaDisjuntor): { fase: Cabo[]; neutro: Cabo[]; cargas: PecaCarga[] } {
  const base = { fechado: (x: Peca) => x.tipo === 'disjuntor' || x.tipo === 'dr', faltando: [] as Fase[] };
  const { rede, porPolo } = gruposJusante(p, d, base);
  const grupos = new Set(porPolo.map((x) => x.grupo));
  const cargas = p.pecas.filter(
    (c): c is PecaCarga => c.tipo === 'carga' && ['L1', 'L2'].some((b) => grupos.has(rede.grupo(c.id, b))),
  );
  const fase = p.cabos.filter((c) => grupos.has(rede.grupo(c.de.peca, c.de.borne)));
  const neutro = p.cabos.filter((c) =>
    cargas.some(
      (k) => (c.de.peca === k.id && c.de.borne === 'N') || (c.para.peca === k.id && c.para.borne === 'N'),
    ),
  );
  return { fase, neutro, cargas };
}

export const chaveBorne = chave;
