import { useCallback, useEffect, useRef, useState } from 'react';
import { CORES_CONDUTOR, fasesDoFornecimento, fornecimentoInfo } from '../core/catalogo';
import { organizar } from '../core/layout';
import {
  novaCarga, novaEmenda, novoBarramento, novoCabo, novoDR, novoDisjuntor, novoMedidor, projetoVazio,
} from '../core/projeto';
import { borneInfo, limparCabos } from '../core/rede';
import { aplicarProtecoes, cabosDoCircuito } from '../core/simulacao';
import type { Cabo, Fase, Peca, Ponta, Posicao, Projeto } from '../core/types';
import { repositorio } from '../storage';

export interface Evento {
  id: number;
  msg: string;
}

export type TipoNovaPeca = 'disjuntor' | 'dr' | 'medidor' | 'carga' | 'emenda' | 'barramento-neutro' | 'barramento-terra';

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

  const registrar = useCallback((msgs: string[]) => {
    if (msgs.length === 0) return;
    setEventos((ev) => [...msgs.map((msg) => ({ id: ++contadorEventos, msg })), ...ev].slice(0, 6));
  }, []);

  // Mudança estrutural: aplica, limpa cabos órfãos e roda as proteções.
  const mudar = useCallback(
    (fn: (p: Projeto) => Projeto, protecoes = true) => {
      const limpo = limparCabos(fn(atual.current));
      const r = protecoes ? aplicarProtecoes(limpo) : { projeto: limpo, eventos: [] };
      atual.current = r.projeto;
      setProjeto(r.projeto);
      registrar(r.eventos);
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
        tipo === 'disjuntor' ? novoDisjuntor(pos, { nome: `Circuito ${n('disjuntor')}` })
        : tipo === 'dr' ? novoDR(pos, { nome: `DR ${n('dr')}`, polos: info.fases > 1 ? 4 : 2 })
        : tipo === 'medidor' ? novoMedidor(pos, { nome: `Medidor ${n('medidor')}`, polos: info.fases > 1 ? 4 : 2 })
        : tipo === 'carga' ? novaCarga(pos, 'tomada', { tensao: info.faseNeutro })
        : tipo === 'emenda' ? novaEmenda(pos, { nome: `Emenda ${n('emenda')}` })
        : novoBarramento(pos, tipo === 'barramento-terra' ? { nome: 'Barramento terra', condutor: 'terra' } : {});
      mudar((q) => ({ ...q, pecas: [...q.pecas, peca] }), false);
      return peca.id;
    },
    [mudar],
  );

  const atualizarPeca = useCallback(
    (id: string, m: Partial<Peca>) => mudar((p) => ({ ...p, pecas: p.pecas.map((x) => (x.id === id ? ({ ...x, ...m } as Peca) : x)) })),
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
  const moverPeca = useCallback((id: string, pos: Posicao) => {
    setProjeto((p) => ({
      ...p,
      pecas: p.pecas.map((x) => (x.id === id ? { ...x, pos } : x)),
      cabos: p.cabos.some((c) => c.rotaAuto && (c.de.peca === id || c.para.peca === id))
        ? p.cabos.map((c) => (c.rotaAuto && (c.de.peca === id || c.para.peca === id) ? { ...c, pontos: [], rotaAuto: false } : c))
        : p.cabos,
    }));
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
      registrar([faltava ? `Fase ${f} voltou.` : `Simulando falta da fase ${f} vinda da rua.`]);
    },
    [mudar, registrar],
  );

  const testarDR = useCallback(
    (id: string) => {
      const d = atual.current.pecas.find((x) => x.id === id);
      if (d?.tipo !== 'dr' || !d.ligado) return;
      mudar((p) => ({ ...p, pecas: p.pecas.map((x) => (x.id === id && x.tipo === 'dr' ? { ...x, ligado: false, desarmado: true } : x)) }));
      registrar([`Teste do "${d.nome}": desarmou corretamente.`]);
    },
    [mudar, registrar],
  );

  const ligarTudo = useCallback(
    (ligado: boolean) =>
      mudar((p) => ({
        ...p,
        pecas: p.pecas.map((x) => (x.tipo === 'disjuntor' || x.tipo === 'dr' ? { ...x, ligado, desarmado: false } : x)),
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
    conectar,
    atualizarCabo,
    definirPontos,
    removerCabos,
    alternar,
    alternarFase,
    testarDR,
    ligarTudo,
    aplicarSugestao,
  };
}

export type Acoes = ReturnType<typeof useProjeto>;
