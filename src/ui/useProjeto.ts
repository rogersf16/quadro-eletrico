import { useCallback, useEffect, useRef, useState } from 'react';
import { CORES_CONDUTOR, fasesDoFornecimento, fornecimentoInfo } from '../core/catalogo';
import { organizar, tamanhoPeca, encaixar } from '../core/layout';
import {
  novaCarga, novaEmenda, novoBarramento, novoCabo, novoDR, novoDisjuntor, novoMedidor, novoQuadro, projetoVazio,
} from '../core/projeto';
import { borneInfo, limparCabos } from '../core/rede';
import { aplicarProtecoes, cabosDoCircuito, correntesDosCabos, msgSobrecargaCabo, simular } from '../core/simulacao';
import type { Cabo, Fase, LadoTransferencia, Peca, Ponta, Posicao, Projeto } from '../core/types';
import { repositorio } from '../storage';
import { chaveEletrica } from './chave';

// Avisa só os cabos que PASSARAM a ficar sobrecarregados com a mudança (sem repetir a cada clique).
function avisosDeCabo(antes: Projeto, depois: Projeto): NovoEvento[] {
  const agora = correntesDosCabos(depois, simular(depois));
  const sobre = depois.cabos.filter((c) => agora[c.id]?.sobrecarga);
  if (!sobre.length) return [];
  const velho = correntesDosCabos(antes, simular(antes));
  return sobre
    .filter((c) => {
      const v = velho[c.id];
      const anterior = antes.cabos.find((k) => k.id === c.id);
      return !v?.sobrecarga || anterior?.bitola !== c.bitola;
    })
    .map((c) => ({ msg: msgSobrecargaCabo(depois, c, agora[c.id]), ref: { tipo: 'cabo' as const, id: c.id } }));
}

// A que problema o aviso se refere. Quando o problema some, o aviso sai sozinho.
// Sem ref = aviso informativo, que some depois de alguns segundos.
export type RefEvento =
  | { tipo: 'cabo'; id: string } // cabo sobrecarregado
  | { tipo: 'desarme'; id: string } // disjuntor/DR que caiu
  | { tipo: 'curto' } // curto sem disjuntor no caminho
  | { tipo: 'fase'; fase: Fase }; // falta de fase simulada

export interface NovoEvento {
  msg: string;
  ref?: RefEvento;
}

// `soAvancar`: só procura pra direita/baixo (usado quando a peça cresce, pra ela não fugir da tela).
function lugarLivre(pecas: Peca[], nova: Peca, pos: Posicao, soAvancar = false): Posicao {
  const t = tamanhoPeca(nova);
  const folga = 16;
  const ocupados = pecas.filter((x) => x.tipo !== 'quadro').map((x) => ({ ...x.pos, ...tamanhoPeca(x) }));
  const livre = (x: number, y: number) =>
    ocupados.every((o) => x + t.w + folga <= o.x || o.x + o.w + folga <= x || y + t.h + folga <= o.y || o.y + o.h + folga <= y);
  const passo = 32;
  for (let anel = 0; anel < 40; anel++) {
    for (let i = -anel; i <= anel; i++) {
      for (const [dx, dy] of [[i, -anel], [i, anel], [-anel, i], [anel, i]]) {
        if (soAvancar && (dx < 0 || dy < 0)) continue;
        const x = encaixar(pos.x + dx * passo);
        const y = encaixar(pos.y + dy * passo);
        if (livre(x, y)) return { x, y };
      }
    }
  }
  return pos;
}

export interface Evento extends NovoEvento {
  id: number;
}

const mesmaRef = (a?: RefEvento, b?: RefEvento) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

// O problema do aviso ainda existe nesse projeto?
function aindaVale(ref: RefEvento, p: Projeto, sim: () => ReturnType<typeof simular>, cabos: () => ReturnType<typeof correntesDosCabos>): boolean {
  switch (ref.tipo) {
    case 'desarme': {
      const x = p.pecas.find((k) => k.id === ref.id);
      // Transferência: resolvido quando algum lado voltou a ligar ou quando nenhum lado está mais desarmado.
      if (x?.tipo === 'disjuntor' && x.transferencia) return (x.desarmado || !!x.II?.desarmado) && !x.ligado && !x.II?.ligado;
      return !!x && (x.tipo === 'disjuntor' || x.tipo === 'dr') && x.desarmado;
    }
    case 'cabo':
      return !!cabos()[ref.id]?.sobrecarga;
    case 'curto':
      return sim().curtos.length > 0;
    case 'fase': {
      const e = p.pecas.find((k) => k.tipo === 'entrada');
      return e?.tipo === 'entrada' && e.faltando.includes(ref.fase);
    }
  }
}

const TEMPO_INFORMATIVO = 6000;

export type TipoNovaPeca = 'quadro' | 'disjuntor' | 'dr' | 'medidor' | 'carga' | 'emenda' | 'barramento-neutro' | 'barramento-terra';

let contadorEventos = 0;

// Todo o estado do projeto e as ações sobre ele. Os componentes só chamam essas funções.
export function useProjeto() {
  const [projeto, setProjeto] = useState<Projeto>(projetoVazio);
  const [carregado, setCarregado] = useState(false);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  // Cópia sempre atual, pra ações calcularem fora do setState (sem efeitos duplicados no StrictMode).
  const atual = useRef(projeto);
  atual.current = projeto;

  useEffect(() => {
    repositorio
      .carregar()
      .then((p) => {
        if (p) {
          atual.current = p;
          setProjeto(p);
        }
      })
      .catch((e) => console.error(e))
      .finally(() => setCarregado(true));
  }, []);

  // Rascunho automático com atraso (não salva a cada pixel arrastado).
  useEffect(() => {
    if (!carregado) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      repositorio.salvar(projeto).catch((e) => console.error(e));
    }, 400);
  }, [projeto, carregado]);

  const registrar = useCallback((novos: NovoEvento[]) => {
    if (novos.length === 0) return;
    const comId = novos.map((n) => ({ ...n, id: ++contadorEventos }));
    // Um aviso novo sobre o mesmo problema substitui o antigo.
    setEventos((ev) => [...comId, ...ev.filter((e) => !comId.some((n) => mesmaRef(n.ref, e.ref)))].slice(0, 6));
    for (const n of comId) {
      if (!n.ref) setTimeout(() => setEventos((ev) => ev.filter((e) => e.id !== n.id)), TEMPO_INFORMATIVO);
    }
  }, []);

  // A cada mudança elétrica, tira os avisos cujo problema já foi resolvido.
  const chave = chaveEletrica(projeto);
  useEffect(() => {
    setEventos((ev) => {
      if (!ev.some((e) => e.ref)) return ev;
      let s: ReturnType<typeof simular> | undefined;
      let k: ReturnType<typeof correntesDosCabos> | undefined;
      const sim = () => (s ??= simular(projeto));
      const cabos = () => (k ??= correntesDosCabos(projeto, sim()));
      const ficam = ev.filter((e) => !e.ref || aindaVale(e.ref, projeto, sim, cabos));
      return ficam.length === ev.length ? ev : ficam;
    });
  }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mudança estrutural: aplica, limpa cabos órfãos e roda as proteções.
  const mudar = useCallback(
    (fn: (p: Projeto) => Projeto, protecoes = true) => {
      const antes = atual.current;
      const limpo = limparCabos(fn(antes));
      const r = protecoes ? aplicarProtecoes(limpo) : { projeto: limpo, eventos: [] };
      atual.current = r.projeto;
      setProjeto(r.projeto);
      registrar([
        ...r.eventos.map((e) => ({ msg: e.msg, ref: e.peca ? { tipo: 'desarme' as const, id: e.peca } : e.curto ? { tipo: 'curto' as const } : undefined })),
        ...avisosDeCabo(antes, r.projeto),
      ]);
    },
    [registrar],
  );

  const atualizarProjeto = useCallback(
    (m: Partial<Projeto>) =>
      mudar((p) => {
        const novo = { ...p, ...m };
        if (m.fornecimento && m.fornecimento !== p.fornecimento) {
          const disp = fasesDoFornecimento(novo.fornecimento) as readonly Fase[];
          const info = fornecimentoInfo(novo.fornecimento);
          novo.pecas = novo.pecas.map((x) => {
            if (x.tipo === 'entrada') return { ...x, faltando: x.faltando.filter((f) => disp.includes(f)) };
            if (x.tipo === 'carga' && info.fases === 1) return { ...x, tensao: info.faseNeutro };
            return x;
          });
        }
        return novo;
      }),
    [mudar],
  );

  const adicionarPeca = useCallback(
    (tipo: TipoNovaPeca, pos: Posicao): string => {
      const p = atual.current;
      const n = (t: Peca['tipo']) => p.pecas.filter((x) => x.tipo === t).length + 1;
      const info = fornecimentoInfo(p.fornecimento);
      const peca: Peca =
        tipo === 'quadro' ? novoQuadro(pos, { nome: `Quadro ${n('quadro')}` })
        : tipo === 'disjuntor' ? novoDisjuntor(pos, { nome: `Circuito ${n('disjuntor')}` })
        : tipo === 'dr' ? novoDR(pos, { nome: `DR ${n('dr')}`, polos: info.fases > 1 ? 4 : 2 })
        : tipo === 'medidor' ? novoMedidor(pos, { nome: `Medidor ${n('medidor')}`, polos: info.fases > 1 ? 4 : 2 })
        : tipo === 'carga' ? novaCarga(pos, 'tomada', { tensao: info.faseNeutro })
        : tipo === 'emenda' ? novaEmenda(pos, { nome: `Emenda ${n('emenda')}` })
        : novoBarramento(pos, tipo === 'barramento-terra' ? { nome: 'Barramento terra', condutor: 'terra' } : {});
      // Procura um lugar livre perto do ponto pedido, em anéis, pra peça nova não nascer em cima de outra
      // (peça escondida embaixo "rouba" o clique da de cima). Caixas (quadro) podem ficar por cima de peças.
      if (peca.tipo !== 'quadro') peca.pos = lugarLivre(p.pecas, peca, pos);
      mudar((q) => ({ ...q, pecas: [...q.pecas, peca] }), false);
      return peca.id;
    },
    [mudar],
  );

  const atualizarPeca = useCallback(
    (id: string, m: Partial<Peca>) =>
      mudar((p) => {
        const antes = p.pecas.find((x) => x.id === id);
        if (!antes) return p;
        const nova = { ...antes, ...m } as Peca;
        // Se a peça cresceu (mais polos, transferência...) e passou a cobrir outra, procura um lugar livre ali perto.
        const [ta, tn] = [tamanhoPeca(antes), tamanhoPeca(nova)];
        if (nova.tipo !== 'quadro' && (tn.w > ta.w || tn.h > ta.h)) {
          nova.pos = lugarLivre(p.pecas.filter((x) => x.id !== id), nova, nova.pos, true);
        }
        return { ...p, pecas: p.pecas.map((x) => (x.id === id ? nova : x)) };
      }),
    [mudar],
  );

  const removerPecas = useCallback(
    (ids: string[]) =>
      mudar((p) => ({
        ...p,
        pecas: p.pecas.filter((x) => !ids.includes(x.id) || x.tipo === 'entrada'),
        cabos: p.cabos.filter((c) => !ids.includes(c.de.peca) && !ids.includes(c.para.peca)),
      })),
    [mudar],
  );

  // Mover não roda proteções: é só desenho. Cabos dessa peça com rota automática perdem as dobras
  // (ficariam tortos) e voltam ao traçado padrão; o "Organizar" recalcula tudo de novo.
  // `junto`: peças que acompanham (as que estavam dentro de uma caixa quando ela começou a ser arrastada).
  const moverPeca = useCallback((id: string, pos: Posicao, junto: string[] = []) => {
    setProjeto((p) => {
      const antes = p.pecas.find((x) => x.id === id)?.pos;
      const dx = antes ? pos.x - antes.x : 0;
      const dy = antes ? pos.y - antes.y : 0;
      const ids = new Set([id, ...junto]);
      const r = {
      ...p,
      pecas: p.pecas.map((x) => (x.id === id ? { ...x, pos } : junto.includes(x.id) ? { ...x, pos: { x: x.pos.x + dx, y: x.pos.y + dy } } : x)),
      cabos: p.cabos.map((c) => {
        const de = ids.has(c.de.peca);
        const para = ids.has(c.para.peca);
        if (!de && !para) return c;
        // Cabo com as duas pontas no grupo anda junto, com as dobras; senão perde a rota automática.
        if (de && para && junto.length) return { ...c, pontos: c.pontos.map((q) => ({ x: q.x + dx, y: q.y + dy })) };
        return c.rotaAuto ? { ...c, pontos: [], rotaAuto: false } : c;
      }),
      };
      atual.current = r;
      return r;
    });
  }, []);

  // Redimensionar caixa: só desenho, sem proteções nem simulação.
  const redimensionarQuadro = useCallback((id: string, pos: Posicao, w: number, h: number) => {
    setProjeto((p) => {
      const r = { ...p, pecas: p.pecas.map((x) => (x.id === id && x.tipo === 'quadro' ? { ...x, pos, w, h } : x)) };
      atual.current = r;
      return r;
    });
  }, []);

  // Aplica o resultado do layout automático (posições das peças + dobras dos cabos).
  const aplicarLayout = useCallback(
    (posicoes: Record<string, Posicao>, rotas: Record<string, Posicao[]>) =>
      mudar(
        (p) => ({
          ...p,
          pecas: p.pecas.map((x) => (posicoes[x.id] ? { ...x, pos: posicoes[x.id] } : x)),
          cabos: p.cabos.map((c) => (rotas[c.id] ? { ...c, pontos: rotas[c.id], rotaAuto: true } : { ...c, pontos: [], rotaAuto: false })),
        }),
        false,
      ),
    [mudar],
  );

  // Cria um cabo. Condutor, cor e bitola são deduzidos dos bornes e de cabos vizinhos.
  const conectar = useCallback(
    (de: Ponta, para: Ponta): string | null => {
      const p = atual.current;
      if (de.peca === para.peca && de.borne === para.borne) return null;
      const igual = (a: Ponta, b: Ponta) => a.peca === b.peca && a.borne === b.borne;
      if (p.cabos.some((c) => (igual(c.de, de) && igual(c.para, para)) || (igual(c.de, para) && igual(c.para, de)))) return null;
      const bDe = borneInfo(p, de.peca, de.borne);
      const bPara = borneInfo(p, para.peca, para.borne);
      const condutor = bDe?.sugestao ?? bPara?.sugestao ?? 'fase';
      const vizinho = p.cabos.find((c) => [c.de, c.para].some((x) => igual(x, de) || igual(x, para)));
      const entrada = p.pecas.find((x) => x.tipo === 'entrada');
      const faseEntrada = [de, para].find((x) => x.peca === entrada?.id && ['A', 'B', 'C'].includes(x.borne))?.borne as Fase | undefined;
      const extra: Partial<Cabo> = {};
      if (vizinho && vizinho.condutor === condutor) {
        extra.cor = vizinho.cor;
        extra.bitola = vizinho.bitola;
      }
      if (faseEntrada) extra.cor = CORES_CONDUTOR[faseEntrada];
      const cabo = novoCabo(de, para, condutor, extra);
      mudar((q) => ({ ...q, cabos: [...q.cabos, cabo] }));
      return cabo.id;
    },
    [mudar],
  );

  const atualizarCabo = useCallback(
    (id: string, m: Partial<Cabo>) => mudar((p) => ({ ...p, cabos: p.cabos.map((c) => (c.id === id ? { ...c, ...m } : c)) }), false),
    [mudar],
  );

  // Dobras: só desenho, atualiza direto.
  const definirPontos = useCallback((id: string, pontos: Posicao[]) => {
    // Dobra mexida à mão: a rota deixa de ser automática e não some mais ao mover peças.
    setProjeto((p) => ({ ...p, cabos: p.cabos.map((c) => (c.id === id ? { ...c, pontos, rotaAuto: false } : c)) }));
  }, []);

  const removerCabos = useCallback(
    (ids: string[]) => mudar((p) => ({ ...p, cabos: p.cabos.filter((c) => !ids.includes(c.id)) })),
    [mudar],
  );

  // Liga/desliga. Religar um desarmado "rearma" e testa de novo as proteções.
  const alternar = useCallback(
    (id: string) =>
      mudar((p) => ({
        ...p,
        pecas: p.pecas.map((x) =>
          x.id === id && (x.tipo === 'disjuntor' || x.tipo === 'dr') ? { ...x, ligado: !x.ligado, desarmado: false } : x,
        ),
      })),
    [mudar],
  );

  // Liga/desliga (ou rearma) um lado do disjuntor de transferência. Se os dois ficarem ligados, as proteções desarmam ambos.
  const alternarLado = useCallback(
    (id: string, lado: LadoTransferencia) =>
      mudar((p) => ({
        ...p,
        pecas: p.pecas.map((x) => {
          if (x.id !== id || x.tipo !== 'disjuntor') return x;
          if (lado === 'I') return { ...x, ligado: !x.ligado, desarmado: false };
          return { ...x, II: { ligado: !x.II?.ligado, desarmado: false } };
        }),
      })),
    [mudar],
  );

  const alternarFase = useCallback(
    (f: Fase) => {
      const ent = atual.current.pecas.find((x) => x.tipo === 'entrada');
      const faltava = ent?.tipo === 'entrada' && ent.faltando.includes(f);
      mudar((p) => ({
        ...p,
        pecas: p.pecas.map((x) =>
          x.tipo === 'entrada' ? { ...x, faltando: faltava ? x.faltando.filter((k) => k !== f) : [...x.faltando, f] } : x,
        ),
      }));
      registrar([faltava ? { msg: `Fase ${f} voltou.` } : { msg: `Simulando falta da fase ${f} vinda da rua.`, ref: { tipo: 'fase', fase: f } }]);
    },
    [mudar, registrar],
  );

  const testarDR = useCallback(
    (id: string) => {
      const d = atual.current.pecas.find((x) => x.id === id);
      if (d?.tipo !== 'dr' || !d.ligado) return;
      mudar((p) => ({ ...p, pecas: p.pecas.map((x) => (x.id === id && x.tipo === 'dr' ? { ...x, ligado: false, desarmado: true } : x)) }));
      registrar([{ msg: `Teste do "${d.nome}": desarmou corretamente.`, ref: { tipo: 'desarme', id } }]);
    },
    [mudar, registrar],
  );

  const ligarTudo = useCallback(
    (ligado: boolean) =>
      mudar((p) => ({
        ...p,
        pecas: p.pecas.map((x) =>
          // Transferência: "ligar tudo" liga só o lado I (os dois juntos desarmariam).
          x.tipo === 'disjuntor' && x.transferencia ? { ...x, ligado, desarmado: false, II: { ligado: false, desarmado: false } }
          : x.tipo === 'disjuntor' || x.tipo === 'dr' ? { ...x, ligado, desarmado: false }
          : x,
        ),
      })),
    [mudar],
  );

  // Aplica a sugestão: corrente do disjuntor + bitola dos cabos de fase e neutro do circuito.
  const aplicarSugestao = useCallback(
    (id: string, corrente: number, bitola: number) =>
      mudar((p) => {
        const d = p.pecas.find((x) => x.id === id);
        if (d?.tipo !== 'disjuntor') return p;
        const { fase, neutro } = cabosDoCircuito(p, d);
        const ids = new Set([...fase, ...neutro].map((c) => c.id));
        return {
          ...p,
          pecas: p.pecas.map((x) => (x.id === id ? { ...x, corrente } : x)),
          cabos: p.cabos.map((c) => (ids.has(c.id) ? { ...c, bitola } : c)),
        };
      }),
    [mudar],
  );

  return {
    projeto,
    eventos,
    limparEventos: () => setEventos([]),
    substituir: (p: Projeto) => {
      atual.current = p;
      setProjeto(p);
    },
    novo: () => mudar(() => projetoVazio(), false),
    organizar: () => mudar((p) => organizar(p), false),
    aplicarLayout,
    atualizarProjeto,
    adicionarPeca,
    atualizarPeca,
    removerPecas,
    moverPeca,
    redimensionarQuadro,
    conectar,
    atualizarCabo,
    definirPontos,
    removerCabos,
    alternar,
    alternarFase,
    alternarLado,
    testarDR,
    ligarTudo,
    aplicarSugestao,
  };
}

export type Acoes = ReturnType<typeof useProjeto>;
