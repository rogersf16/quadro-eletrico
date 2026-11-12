import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONDUTORES_ROTULO, focoDe } from './foco';
import { layoutAutomatico, type LadoPorta, type MedidaPeca } from '../../core/layoutAuto';
import { montarRede } from '../../core/rede';
import { simular, simularPiorCaso } from '../../core/simulacao';
import type { Condutor } from '../../core/types';
import { chaveEletrica } from '../chave';
import { validarCarga, validarDisjuntor, piorNivel, type Nivel } from '../../core/validacao';
import type { Acoes, TipoNovaPeca } from '../useProjeto';
import { tiposDeCabo } from './CaboEdge';
import { MapaCtx, type Selecao } from './contexto';
import { tiposDeNo } from './nos';

interface Props {
  acoes: Acoes;
  selecao: Selecao | null;
  onSelecionar: (s: Selecao | null) => void;
  expandido: boolean;
  onExpandir: () => void;
}


export function Mapa(props: Props) {
  return (
    <ReactFlowProvider>
      <MapaInterno {...props} />
    </ReactFlowProvider>
  );
}

function MapaInterno({ acoes, selecao, onSelecionar, expandido, onExpandir }: Props) {
  const { projeto } = acoes;
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const chave = chaveEletrica(projeto);

  // Simulação e validações só recalculam quando a parte elétrica muda.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sim = useMemo(() => simular(projeto), [chave]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const niveis = useMemo(() => {
    const pior = simularPiorCaso(projeto);
    const r: Record<string, Nivel> = {};
    for (const x of projeto.pecas) {
      if (x.tipo === 'disjuntor') r[x.id] = piorNivel(validarDisjuntor(projeto, x, pior));
      if (x.tipo === 'carga') r[x.id] = piorNivel(validarCarga(projeto, x, pior));
    }
    return r;
  }, [chave]);

  // Rede "só cobre": todos os disjuntores abertos. Dois cabos no mesmo grupo são o mesmo condutor
  // contínuo (ligados direto, por emenda ou barramento). É o que o "seguir o fio" realça.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cobre = useMemo(() => montarRede(projeto, { fechado: () => false, faltando: [] }), [chave]);

  // Foco: o que está sob o mouse tem prioridade; senão, o que está selecionado.
  const [hover, setHover] = useState<Selecao | null>(null);
  const alvo = hover ?? selecao;
  const foco = useMemo(() => focoDe(projeto, cobre, alvo), [projeto.cabos, cobre, alvo?.tipo, alvo?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filtro por condutor e etiquetas de bitola (preferências só desta tela).
  const [visiveis, setVisiveis] = useState<Set<Condutor>>(() => new Set(['fase', 'neutro', 'terra', 'retorno']));
  const [bitolas, setBitolas] = useState(false);
  const alternarVisivel = (c: Condutor) =>
    setVisiveis((v) => {
      const n = new Set(v);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  // Nós do React Flow: guardados em estado pra manter as medidas internas (measured) entre renders.
  const [nodes, setNodes] = useState<Node[]>([]);
  useEffect(() => {
    setNodes((prev) => {
      const antigos = new Map(prev.map((n) => [n.id, n]));
      return projeto.pecas.map((x) => ({
        ...antigos.get(x.id),
        id: x.id,
        type: x.tipo,
        position: x.pos,
        data: {},
        selected: selecao?.tipo === 'peca' && selecao.id === x.id,
        deletable: x.tipo !== 'entrada',
        zIndex: x.tipo === 'emenda' ? 2 : 1,
        className: foco && !foco.pecas.has(x.id) ? 'peca-fora-foco' : '',
      }));
    });
  }, [projeto.pecas, selecao, foco]);

  const edges: Edge[] = useMemo(
    () =>
      projeto.cabos.map((c) => ({
        id: c.id,
        type: 'cabo',
        source: c.de.peca,
        sourceHandle: c.de.borne,
        target: c.para.peca,
        targetHandle: c.para.borne,
        selected: selecao?.tipo === 'cabo' && selecao.id === c.id,
      })),
    [projeto.cabos, selecao],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      setNodes((n) => applyNodeChanges(changes, n));
      const remover: string[] = [];
      for (const c of changes) {
        if (c.type === 'position' && c.position) acoes.moverPeca(c.id, c.position);
        if (c.type === 'select' && c.selected) onSelecionar({ tipo: 'peca', id: c.id });
        if (c.type === 'remove') remover.push(c.id);
      }
      if (remover.length) {
        acoes.removerPecas(remover);
        onSelecionar(null);
      }
    },
    [acoes, onSelecionar],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const remover: string[] = [];
      for (const c of changes) {
        if (c.type === 'select' && c.selected) onSelecionar({ tipo: 'cabo', id: c.id });
        if (c.type === 'remove') remover.push(c.id);
      }
      if (remover.length) {
        acoes.removerCabos(remover);
        onSelecionar(null);
      }
    },
    [acoes, onSelecionar],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.sourceHandle || !c.targetHandle) return;
      const id = acoes.conectar({ peca: c.source, borne: c.sourceHandle }, { peca: c.target, borne: c.targetHandle });
      if (id) onSelecionar({ tipo: 'cabo', id });
    },
    [acoes, onSelecionar],
  );

  const adicionar = (tipo: TipoNovaPeca) => {
    const r = wrapper.current?.getBoundingClientRect();
    const centro = r ? rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : { x: 0, y: 0 };
    const id = acoes.adicionarPeca(tipo, { x: Math.round(centro.x / 8) * 8 - 40, y: Math.round(centro.y / 8) * 8 - 40 });
    onSelecionar({ tipo: 'peca', id });
  };

  // Organizar: mede as peças e bornes como estão desenhados e pede o layout ao ELK.
  const [organizando, setOrganizando] = useState(false);
  const organizar = async () => {
    if (!confirm('Reorganizar todas as peças e refazer o traçado dos cabos? As dobras feitas à mão serão substituídas.')) return;
    const lado: Record<string, LadoPorta> = { top: 'topo', bottom: 'base', left: 'esq', right: 'dir' };
    const medidas: MedidaPeca[] = [];
    for (const x of projeto.pecas) {
      const n = rf.getInternalNode(x.id);
      const w = n?.measured.width;
      const h = n?.measured.height;
      if (!n || !w || !h) continue;
      const handles = [...(n.internals.handleBounds?.source ?? []), ...(n.internals.handleBounds?.target ?? [])];
      medidas.push({
        id: x.id,
        w,
        h,
        bornes: handles.filter((b) => b.id).map((b) => ({ id: b.id!, x: b.x + b.width / 2, y: b.y + b.height / 2, lado: lado[b.position] })),
      });
    }
    setOrganizando(true);
    try {
      const r = await layoutAutomatico(projeto, medidas);
      acoes.aplicarLayout(r.posicoes, r.rotas);
    } catch (e) {
      // Se o ELK falhar por algum motivo, cai no organizador simples (só camadas).
      console.error('Layout automático falhou, usando o simples:', e);
      acoes.organizar();
    } finally {
      setOrganizando(false);
      setTimeout(() => rf.fitView({ padding: 0.12, duration: 300 }), 60);
    }
  };

  const ctx = useMemo(
    () => ({
      projeto,
      sim,
      niveis,
      acoes,
      selecionar: onSelecionar,
      foco: foco?.cabos ?? null,
      focoPeca: alvo?.tipo === 'peca' ? alvo.id : null,
      visiveis,
      bitolas,
    }),
    [projeto, sim, niveis, acoes, onSelecionar, foco, alvo?.tipo, alvo?.id, visiveis, bitolas], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <MapaCtx.Provider value={ctx}>
      <section className={`mapa-wrap ${expandido ? 'expandido' : ''}`}>
        <div className="barra-ferramentas">
          <span className="grupo-rotulo">Adicionar:</span>
          <button onClick={() => adicionar('disjuntor')}>Disjuntor</button>
          <button onClick={() => adicionar('dr')}>DR</button>
          <button onClick={() => adicionar('medidor')} title="Medidor de energia DIN: mostra tensão e corrente, não protege">Medidor</button>
          <button onClick={() => adicionar('carga')}>Carga</button>
          <button onClick={() => adicionar('emenda')}>Emenda</button>
          <button onClick={() => adicionar('barramento-neutro')}>Barra N</button>
          <button onClick={() => adicionar('barramento-terra')}>Barra T</button>
          <span className="separador" />
          <button onClick={() => acoes.ligarTudo(true)}>Ligar tudo</button>
          <button onClick={() => acoes.ligarTudo(false)}>Desligar tudo</button>
          <button onClick={organizar} disabled={organizando} title="Reposiciona as peças e traça os cabos com o mínimo de cruzamentos">
            {organizando ? 'Organizando…' : '✨ Organizar'}
          </button>
          <button onClick={onExpandir}>{expandido ? '⤡ Recolher' : '⤢ Expandir'}</button>
        </div>
        <div className="barra-ferramentas barra-ver">
          <span className="grupo-rotulo">Mostrar:</span>
          {(Object.keys(CONDUTORES_ROTULO) as Condutor[]).map((c) => (
            <button
              key={c}
              className={`filtro filtro-${c} ${visiveis.has(c) ? 'ativo' : ''}`}
              aria-pressed={visiveis.has(c)}
              onClick={() => alternarVisivel(c)}
              title={`Mostrar/esconder cabos de ${CONDUTORES_ROTULO[c].toLowerCase()}`}
            >
              {CONDUTORES_ROTULO[c]}
            </button>
          ))}
          <span className="separador" />
          <button className={`filtro ${bitolas ? 'ativo' : ''}`} aria-pressed={bitolas} onClick={() => setBitolas((b) => !b)}>
            Bitolas
          </button>
        </div>
        <p className="dica-mapa">
          <b>Seguir o fio:</b> passe o mouse num cabo ou peça · <b>Ligar cabo:</b> arraste de um borne até outro ·{' '}
          <b>Editar:</b> clique · <b>Caminho:</b> com o cabo selecionado, arraste o <b>+</b> · <b>Apagar:</b> Delete
        </p>

        {acoes.eventos.length > 0 && (
          <div className="eventos" role="status">
            {acoes.eventos.map((ev) => (
              <div key={ev.id} className="evento">⚠ {ev.msg}</div>
            ))}
            <button className="fechar-eventos" onClick={acoes.limparEventos}>Limpar</button>
          </div>
        )}

        <div className="mapa-flow" ref={wrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={tiposDeNo}
            edgeTypes={tiposDeCabo}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onPaneClick={() => onSelecionar(null)}
            onEdgeMouseEnter={(_, e) => setHover({ tipo: 'cabo', id: e.id })}
            onEdgeMouseLeave={() => setHover(null)}
            onNodeMouseEnter={(_, n) => setHover({ tipo: 'peca', id: n.id })}
            onNodeMouseLeave={() => setHover(null)}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={22}
            snapToGrid
            snapGrid={[8, 8]}
            minZoom={0.15}
            maxZoom={2.5}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            deleteKeyCode={['Delete', 'Backspace']}
            colorMode="system"
          >
            <Background variant={BackgroundVariant.Dots} gap={16} size={1.2} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable nodeStrokeWidth={2} />
          </ReactFlow>
        </div>
      </section>
    </MapaCtx.Provider>
  );
}
