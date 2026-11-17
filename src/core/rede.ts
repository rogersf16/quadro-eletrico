// Topologia elétrica: bornes de cada peça e quais bornes estão no mesmo ponto elétrico.
import { fasesDoFornecimento, fornecimentoInfo } from './catalogo';
import type { Fase, FaseRede, Peca, PecaCarga, PecaGerador, Projeto } from './types';

export type Lado = 'topo' | 'base' | 'centro-topo' | 'centro-base' | 'esq' | 'dir';

export interface Borne {
  id: string;
  rotulo: string;
  lado: Lado;
  fracao: number; // posição ao longo do lado (0..1)
  sugestao?: 'fase' | 'neutro' | 'terra'; // condutor esperado, usado como padrão ao criar cabo
}

// Cargas 220 V em bi/trifásico ligam entre duas fases (sem neutro).
export const cargaFaseFase = (c: PecaCarga, p: Projeto) =>
  c.tensao === 220 && fornecimentoInfo(p.fornecimento).fases >= 2;

// ---------- Fases da rua × fases do gerador ----------
// As fases do gerador têm identidade própria: mesmo "L1" do gerador não é a "A" da rua (não estão sincronizadas).
export const faseGerador = (id: string, k: number): FaseRede => `g:${id}:${k}`;
export const ehFaseGerador = (f: FaseRede): f is `g:${string}:${number}` => f.startsWith('g:');
// De onde vem a fase: 'rua' ou o id do gerador.
export const fonteDaFase = (f: FaseRede): string => (ehFaseGerador(f) ? f.slice(2, f.lastIndexOf(':')) : 'rua');
// Posição da fase no sistema (0, 1, 2 = defasagem de 0°, 120°, 240°).
export const indiceFase = (f: FaseRede): number => (ehFaseGerador(f) ? Number(f.slice(f.lastIndexOf(':') + 1)) - 1 : 'ABC'.indexOf(f));
// Rótulo curto: "A", "B" pra rua; "G1", "G2" pro gerador.
export const rotuloFase = (f: FaseRede): string => (ehFaseGerador(f) ? `G${indiceFase(f) + 1}` : f);
export const fasesDoGerador = (g: PecaGerador) => Array.from({ length: fornecimentoInfo(g.ligacao).fases }, (_, i) => i + 1);

// Tensão fase-neutro de uma fase, conforme a fonte.
export function tensaoFaseNeutro(p: Projeto, f: FaseRede): 127 | 220 {
  if (!ehFaseGerador(f)) return fornecimentoInfo(p.fornecimento).faseNeutro;
  const g = p.pecas.find((x): x is PecaGerador => x.tipo === 'gerador' && x.id === fonteDaFase(f));
  return fornecimentoInfo(g?.ligacao ?? p.fornecimento).faseNeutro;
}

const distribuir = (ids: { id: string; rotulo: string; sugestao?: Borne['sugestao'] }[], lado: Lado): Borne[] =>
  ids.map((b, i) => ({ ...b, lado, fracao: (i + 0.5) / ids.length }));

const polosDR = (polos: 2 | 4) => (polos === 2 ? ['1', 'N'] : ['1', '2', '3', 'N']);

export function bornesDaPeca(peca: Peca, p: Projeto): Borne[] {
  switch (peca.tipo) {
    case 'entrada':
      return distribuir(
        [
          ...fasesDoFornecimento(p.fornecimento).map((f) => ({ id: f, rotulo: f, sugestao: 'fase' as const })),
          { id: 'N', rotulo: 'N', sugestao: 'neutro' as const },
          { id: 'T', rotulo: 'T', sugestao: 'terra' as const },
        ],
        'base',
      );
    case 'gerador':
      return distribuir(
        [
          ...fasesDoGerador(peca).map((k) => ({ id: `L${k}`, rotulo: `L${k}`, sugestao: 'fase' as const })),
          { id: 'N', rotulo: 'N', sugestao: 'neutro' as const },
          { id: 'T', rotulo: 'T', sugestao: 'terra' as const },
        ],
        'base',
      );
    case 'disjuntor': {
      const n = Array.from({ length: peca.polos }, (_, i) => String(i + 1));
      // Transferência: dois disjuntores lado a lado, cada um com entrada (em cima) e saída (embaixo) próprias.
      // Lado I à esquerda (in:k / out:k), lado II à direita (inII:k / outII:k). Ex.: bipolar = 8 bornes.
      const ladoII = (pre: string) => (peca.transferencia ? n.map((k) => ({ id: `${pre}II:${k}`, rotulo: k, sugestao: 'fase' as const })) : []);
      return [
        ...distribuir([...n.map((k) => ({ id: `in:${k}`, rotulo: k, sugestao: 'fase' as const })), ...ladoII('in')], 'topo'),
        ...distribuir([...n.map((k) => ({ id: `out:${k}`, rotulo: k, sugestao: 'fase' as const })), ...ladoII('out')], 'base'),
      ];
    }
    case 'dr':
    case 'medidor': {
      const n = polosDR(peca.polos);
      const sug = (k: string) => (k === 'N' ? ('neutro' as const) : ('fase' as const));
      return [
        ...distribuir(n.map((k) => ({ id: `in:${k}`, rotulo: k, sugestao: sug(k) })), 'topo'),
        ...distribuir(n.map((k) => ({ id: `out:${k}`, rotulo: k, sugestao: sug(k) })), 'base'),
      ];
    }
    case 'quadro':
      return [];
    case 'emenda':
      return [
        { id: 'e:t', rotulo: '', lado: 'centro-topo', fracao: 0.5 },
        { id: 'e:b', rotulo: '', lado: 'centro-base', fracao: 0.5 },
        { id: 'e:l', rotulo: '', lado: 'esq', fracao: 0.5 },
        { id: 'e:r', rotulo: '', lado: 'dir', fracao: 0.5 },
      ];
    case 'barramento':
      return distribuir(
        Array.from({ length: peca.bornes }, (_, i) => ({ id: `b:${i + 1}`, rotulo: String(i + 1), sugestao: peca.condutor })),
        // Horizontal: furos embaixo, distribui neutro/terra pra baixo como as fases. Vertical: furos na lateral.
        peca.orientacao === 'vertical-dir' ? 'dir' : peca.orientacao === 'vertical-esq' ? 'esq' : 'base',
      );
    case 'carga': {
      const ids = cargaFaseFase(peca, p)
        ? [{ id: 'L1', rotulo: 'F', sugestao: 'fase' as const }, { id: 'L2', rotulo: 'F', sugestao: 'fase' as const }]
        : [{ id: 'L1', rotulo: 'F', sugestao: 'fase' as const }, { id: 'N', rotulo: 'N', sugestao: 'neutro' as const }];
      return distribuir([...ids, { id: 'T', rotulo: 'T', sugestao: 'terra' as const }], 'topo');
    }
  }
}

// Pares de bornes que viram o mesmo ponto quando o dispositivo está FECHADO (ligado).
// `forcado`: o chamador quer a peça fechada mesmo desligada (ex.: pior caso); na transferência vale o lado I.
function contatos(peca: Peca, forcado = false): [string, string][] {
  if (peca.tipo === 'disjuntor') {
    const polos = Array.from({ length: peca.polos }, (_, i) => String(i + 1));
    if (!peca.transferencia) return polos.map((k) => [`in:${k}`, `out:${k}`]);
    const I = peca.ligado || (forcado && !peca.II?.ligado);
    return [
      ...(I ? polos.map((k): [string, string] => [`in:${k}`, `out:${k}`]) : []),
      ...(peca.II?.ligado ? polos.map((k): [string, string] => [`inII:${k}`, `outII:${k}`]) : []),
    ];
  }
  if (peca.tipo === 'dr' || peca.tipo === 'medidor') return polosDR(peca.polos).map((k) => [`in:${k}`, `out:${k}`]);
  return [];
}

// Bornes sempre unidos (emenda e barramento são cobre contínuo).
function unidosSempre(peca: Peca, p: Projeto): string[] {
  if (peca.tipo === 'emenda' || peca.tipo === 'barramento') return bornesDaPeca(peca, p).map((b) => b.id);
  return [];
}

export const chave = (peca: string, borne: string) => `${peca}|${borne}`;

export interface Potencial {
  fases: Set<FaseRede>;
  neutro: boolean;
  terra: boolean;
}

export interface Rede {
  grupo: (peca: string, borne: string) => string;
  potencial: (peca: string, borne: string) => Potencial;
  potencialDoGrupo: (g: string) => Potencial;
  grupos: () => string[];
}

export interface OpcoesRede {
  fechado: (peca: Peca) => boolean; // disjuntor/DR está passando corrente? gerador está funcionando?
  faltando: Fase[];
  abrir?: string; // força uma peça aberta (usado pra descobrir o que está "a jusante" dela)
}

// Monta a rede: une bornes por cabos, emendas, barramentos e contatos fechados.
export function montarRede(p: Projeto, op: OpcoesRede): Rede {
  const pai = new Map<string, string>();
  const achar = (x: string): string => {
    if (!pai.has(x)) pai.set(x, x);
    let r = x;
    while (pai.get(r) !== r) r = pai.get(r)!;
    let y = x;
    while (pai.get(y) !== r) {
      const prox = pai.get(y)!;
      pai.set(y, r);
      y = prox;
    }
    return r;
  };
  const unir = (a: string, b: string) => {
    const ra = achar(a);
    const rb = achar(b);
    if (ra !== rb) pai.set(ra, rb);
  };

  for (const peca of p.pecas) {
    for (const b of bornesDaPeca(peca, p)) achar(chave(peca.id, b.id));
    const sempre = unidosSempre(peca, p);
    for (let i = 1; i < sempre.length; i++) unir(chave(peca.id, sempre[0]), chave(peca.id, sempre[i]));
    // Medidor não tem chave: está sempre fechado.
    if (peca.id !== op.abrir && (peca.tipo === 'medidor' || op.fechado(peca))) {
      for (const [a, b] of contatos(peca, !estaFechado(peca))) unir(chave(peca.id, a), chave(peca.id, b));
    }
  }
  for (const c of p.cabos) unir(chave(c.de.peca, c.de.borne), chave(c.para.peca, c.para.borne));

  // Potenciais vindos da entrada.
  const pot = new Map<string, Potencial>();
  const potDe = (g: string) => {
    if (!pot.has(g)) pot.set(g, { fases: new Set(), neutro: false, terra: false });
    return pot.get(g)!;
  };
  const entrada = p.pecas.find((x) => x.tipo === 'entrada');
  if (entrada) {
    for (const f of fasesDoFornecimento(p.fornecimento)) {
      if (!op.faltando.includes(f)) potDe(achar(chave(entrada.id, f))).fases.add(f);
    }
    potDe(achar(chave(entrada.id, 'N'))).neutro = true;
    potDe(achar(chave(entrada.id, 'T'))).terra = true;
  }
  // Geradores funcionando: fases próprias e neutro. A carcaça (T) é sempre terra.
  for (const g of p.pecas) {
    if (g.tipo !== 'gerador') continue;
    potDe(achar(chave(g.id, 'T'))).terra = true;
    if (!op.fechado(g)) continue;
    for (const k of fasesDoGerador(g)) potDe(achar(chave(g.id, `L${k}`))).fases.add(faseGerador(g.id, k));
    potDe(achar(chave(g.id, 'N'))).neutro = true;
  }

  const vazio: Potencial = { fases: new Set(), neutro: false, terra: false };
  return {
    grupo: (peca, borne) => achar(chave(peca, borne)),
    potencial: (peca, borne) => pot.get(achar(chave(peca, borne))) ?? vazio,
    potencialDoGrupo: (g) => pot.get(g) ?? vazio,
    grupos: () => [...new Set([...pai.keys()].map(achar))],
  };
}

export function estaFechado(peca: Peca): boolean {
  if (peca.tipo === 'disjuntor') return peca.ligado || (!!peca.transferencia && !!peca.II?.ligado);
  if (peca.tipo === 'gerador') return peca.ligado;
  return peca.tipo === 'dr' && peca.ligado;
}

export function rotuloPotencial(pt: Potencial): string {
  const partes = [...pt.fases].sort().map((f) => (ehFaseGerador(f) ? `fase ${rotuloFase(f)} do gerador` : `fase ${f}`));
  if (pt.neutro) partes.push('neutro');
  if (pt.terra) partes.push('terra');
  return partes.join(' + ');
}

// Remove cabos cujas pontas apontam pra peças ou bornes que não existem mais
// (ex.: mudou o fornecimento e a fase C sumiu, ou o disjuntor passou de 2 pra 1 polo).
export function limparCabos(p: Projeto): Projeto {
  const validos = new Set<string>();
  for (const peca of p.pecas) for (const b of bornesDaPeca(peca, p)) validos.add(chave(peca.id, b.id));
  const cabos = p.cabos.filter((c) => validos.has(chave(c.de.peca, c.de.borne)) && validos.has(chave(c.para.peca, c.para.borne)));
  return cabos.length === p.cabos.length ? p : { ...p, cabos };
}

export function borneInfo(p: Projeto, peca: string, borne: string): Borne | undefined {
  const x = p.pecas.find((k) => k.id === peca);
  return x ? bornesDaPeca(x, p).find((b) => b.id === borne) : undefined;
}
