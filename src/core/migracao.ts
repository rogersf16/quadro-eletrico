// Converte arquivos antigos (v1 e v2, modelo em árvore) para o modelo em grafo (v3).
import { CORES_CONDUTOR } from './catalogo';
import { organizar } from './layout';
import { bitolaPara, novaCarga, novoBarramento, novoCabo, novoDR, novoDisjuntor, novoId, VERSAO_FORMATO } from './projeto';
import type { Cabo, Fase, Fornecimento, Peca, Posicao, Projeto, Sintoma, TipoCarga } from './types';
import { ID_ENTRADA } from './types';

// Formatos antigos, só com o que a migração usa.
interface CircuitoAntigo {
  id: string;
  nome: string;
  tipo: TipoCarga;
  potencia: number;
  tensao: 127 | 220;
  disjuntor: { corrente: number; polos: 1 | 2 | 3; curva: 'B' | 'C' | 'D' };
  bitola: number;
  fases: Fase[];
  origem?: string;
  dr?: boolean;
  sintoma: Sintoma;
  notas: string;
  ligado?: boolean;
  desarmado?: boolean;
  pos?: Posicao;
}
interface DRAntigo {
  id: string;
  nome: string;
  corrente: number;
  sensibilidade: 30 | 300;
  polos: 2 | 4;
  ligado: boolean;
  desarmado: boolean;
  pos: Posicao;
}

const indiceFase = (f: Fase) => ({ A: 1, B: 2, C: 3 })[f];

export function migrarParaV3(d: Record<string, unknown>): Projeto {
  const fornecimento = (d.fornecimento as Fornecimento) ?? 'bi';
  const geralAntigo = (d.geral as { corrente?: number; polos?: 1 | 2 | 3; ligado?: boolean; pos?: Posicao }) ?? {};
  const entradaAntiga = (d.entrada as { pos?: Posicao; faltando?: Fase[] }) ?? {};
  let drsAntigos = (d.drs as DRAntigo[]) ?? [];
  const circuitos = (d.circuitos as CircuitoAntigo[]) ?? [];

  // v1: DR era checkbox no circuito. Cria um DR único pra esses circuitos.
  if (d.versao === 1 && circuitos.some((c) => c.dr)) {
    const id = novoId();
    drsAntigos = [{ id, nome: 'DR', corrente: 40, sensibilidade: 30, polos: 4, ligado: true, desarmado: false, pos: { x: 0, y: 0 } }];
    for (const c of circuitos) if (c.dr) c.origem = id;
  }

  const semPos = !circuitos.every((c) => c.pos);
  const posGeral = geralAntigo.pos ?? { x: 88, y: 232 };
  const geral = novoDisjuntor(posGeral, {
    id: 'geral', nome: 'Disjuntor geral', geral: true, corrente: geralAntigo.corrente ?? 50,
    polos: geralAntigo.polos ?? 2, ligado: geralAntigo.ligado ?? true,
  });
  const barN = novoBarramento({ x: posGeral.x + geral.polos * 56 + 48, y: posGeral.y + 60 }, { bornes: Math.max(6, circuitos.length + 3) });
  const pecas: Peca[] = [
    { id: ID_ENTRADA, tipo: 'entrada', nome: 'Entrada da rua', notas: '', pos: entradaAntiga.pos ?? { x: 40, y: 24 }, faltando: entradaAntiga.faltando ?? [] },
    geral,
    barN,
  ];
  const cabos: Cabo[] = [];
  const bGeral = bitolaPara(geral.corrente);
  const fasesForn = (['A', 'B', 'C'] as Fase[]).slice(0, fornecimento === 'tri' ? 3 : fornecimento === 'bi' ? 2 : 1);
  fasesForn.slice(0, geral.polos).forEach((f, i) =>
    cabos.push(novoCabo({ peca: ID_ENTRADA, borne: f }, { peca: geral.id, borne: `in:${i + 1}` }, 'fase', { cor: CORES_CONDUTOR[f], bitola: bGeral })),
  );
  cabos.push(novoCabo({ peca: ID_ENTRADA, borne: 'N' }, { peca: barN.id, borne: 'b:1' }, 'neutro', { bitola: bGeral }));
  let borneN = 2;
  const proxBorneN = () => `b:${Math.min(barN.bornes, borneN++)}`;

  // Polo do geral/DR que entrega cada fase.
  const poloSaida = (origem: string, f: Fase) => {
    const dr = drsAntigos.find((x) => x.id === origem);
    if (dr && dr.polos === 2) return 'out:1';
    return `out:${indiceFase(f)}`;
  };

  for (const a of drsAntigos) {
    const dr = novoDR(a.pos, { id: a.id, nome: a.nome, corrente: a.corrente, sensibilidade: a.sensibilidade, polos: a.polos, ligado: a.ligado, desarmado: a.desarmado });
    pecas.push(dr);
    const polosFase = dr.polos === 2 ? 1 : Math.min(3, fasesForn.length);
    for (let i = 1; i <= Math.min(polosFase, geral.polos); i++) {
      cabos.push(novoCabo({ peca: geral.id, borne: `out:${i}` }, { peca: dr.id, borne: `in:${i}` }, 'fase', { cor: CORES_CONDUTOR[fasesForn[i - 1]], bitola: bitolaPara(dr.corrente) }));
    }
    cabos.push(novoCabo({ peca: barN.id, borne: proxBorneN() }, { peca: dr.id, borne: 'in:N' }, 'neutro', { bitola: bitolaPara(dr.corrente) }));
  }

  for (const c of circuitos) {
    const origem = c.origem && drsAntigos.some((x) => x.id === c.origem) ? c.origem : geral.id;
    const pos = c.pos ?? { x: 0, y: 0 };
    const disj = novoDisjuntor(pos, {
      id: c.id, nome: c.nome, corrente: c.disjuntor.corrente, polos: c.disjuntor.polos, curva: c.disjuntor.curva,
      sintoma: c.sintoma, notas: c.notas, ligado: c.ligado ?? true, desarmado: c.desarmado ?? false,
    });
    const carga = novaCarga({ x: pos.x, y: pos.y + 280 }, c.tipo, { nome: c.nome, potencia: c.potencia, tensao: c.tensao });
    pecas.push(disj, carga);
    c.fases.forEach((f, i) => {
      cabos.push(novoCabo({ peca: origem, borne: poloSaida(origem, f) }, { peca: disj.id, borne: `in:${i + 1}` }, 'fase', { cor: CORES_CONDUTOR[f], bitola: c.bitola }));
      if (i < 2) cabos.push(novoCabo({ peca: disj.id, borne: `out:${i + 1}` }, { peca: carga.id, borne: `L${i + 1}` }, 'fase', { cor: CORES_CONDUTOR[f], bitola: c.bitola }));
    });
    if (c.fases.length === 1) {
      const deN = origem !== geral.id ? { peca: origem, borne: 'out:N' } : { peca: barN.id, borne: proxBorneN() };
      cabos.push(novoCabo(deN, { peca: carga.id, borne: 'N' }, 'neutro', { bitola: c.bitola }));
    }
  }

  const p: Projeto = {
    app: 'quadro-eletrico',
    versao: VERSAO_FORMATO,
    nome: (d.nome as string) ?? 'Minha casa',
    endereco: (d.endereco as string) ?? '',
    fornecimento,
    dps: !!d.dps,
    pecas,
    cabos,
    atualizadoEm: new Date().toISOString(),
  };
  return semPos ? organizar(p) : p;
}
