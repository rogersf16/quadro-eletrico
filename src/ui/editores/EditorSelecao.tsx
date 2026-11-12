import type { Projeto } from '../../core/types';
import type { Selecao } from '../mapa/contexto';
import type { Acoes } from '../useProjeto';
import { EditorCabo } from './EditorCabo';
import { EditorDisjuntor } from './EditorDisjuntor';
import { EditorBarramento, EditorCarga, EditorDR, EditorEmenda, EditorEntrada, EditorMedidor, EditorQuadro } from './EditorPeca';

interface Props {
  selecao: Selecao | null;
  projeto: Projeto;
  acoes: Acoes;
  onSelecionar: (s: Selecao | null) => void;
}

// Escolhe o editor certo pro que está selecionado no mapa.
export function EditorSelecao({ selecao, projeto, acoes, onSelecionar }: Props) {
  if (!selecao) return null;
  if (selecao.tipo === 'cabo') {
    const cabo = projeto.cabos.find((c) => c.id === selecao.id);
    return cabo ? <EditorCabo key={cabo.id} cabo={cabo} projeto={projeto} acoes={acoes} onFechar={() => onSelecionar(null)} /> : null;
  }
  const peca = projeto.pecas.find((x) => x.id === selecao.id);
  if (!peca) return null;
  const comum = { projeto, acoes, onSelecionar };
  switch (peca.tipo) {
    case 'disjuntor':
      return <EditorDisjuntor key={peca.id} peca={peca} {...comum} />;
    case 'dr':
      return <EditorDR key={peca.id} peca={peca} {...comum} />;
    case 'quadro':
      return <EditorQuadro key={peca.id} peca={peca} {...comum} />;
    case 'medidor':
      return <EditorMedidor key={peca.id} peca={peca} {...comum} />;
    case 'carga':
      return <EditorCarga key={peca.id} peca={peca} {...comum} />;
    case 'emenda':
      return <EditorEmenda key={peca.id} peca={peca} {...comum} />;
    case 'barramento':
      return <EditorBarramento key={peca.id} peca={peca} {...comum} />;
    case 'entrada':
      return <EditorEntrada key={peca.id} peca={peca} {...comum} />;
  }
}
