// Cabo desenhado entre dois bornes. Selecionado, mostra pontos de dobra arrastáveis:
// "+" no meio de cada trecho cria uma dobra, arrastar move, duplo clique remove.
// Traçado ortogonal (retas e 90°, como em esquema elétrico) com cantos arredondados.
import { EdgeLabelRenderer, getSmoothStepPath, Position, useReactFlow, type EdgeProps } from '@xyflow/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { encaixar } from '../../core/layout';
import { bornesDaPeca } from '../../core/rede';
import type { Posicao } from '../../core/types';
import { useMapa } from './contexto';

const espessura = (bitola: number) => Math.min(12, Math.max(3, 2 + bitola * 0.55));

// Cor de cada polo quando a peça está em foco (1º, 2º, 3º, 4º borne do lado). Escolhidas pra não
// confundir com as cores de isolação (vermelho, preto, cinza, azul, verde).
const CORES_POLO = ['#7c3aed', '#f59e0b', '#06b6d4', '#db2777'];

// Pra onde o cabo sai de cada lado do borne (usado pra pôr a plaquinha logo depois do borne).
const DIRECAO: Record<Position, [number, number]> = {
  [Position.Top]: [0, -1],
  [Position.Bottom]: [0, 1],
  [Position.Left]: [-1, 0],
  [Position.Right]: [1, 0],
};

// Linha passando pelos pontos, com cada canto arredondado (raio limitado à metade dos trechos vizinhos).
function caminhoArredondado(pts: Posicao[], raio = 10): string {
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const d1 = Math.hypot(b.x - a.x, b.y - a.y);
    const d2 = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(raio, d1 / 2, d2 / 2);
    if (r < 1) {
      d += ` L ${b.x} ${b.y}`;
      continue;
    }
    // Para um pouco antes do canto, faz a curva usando o canto como controle e segue.
    const p1 = { x: b.x + ((a.x - b.x) / d1) * r, y: b.y + ((a.y - b.y) / d1) * r };
    const p2 = { x: b.x + ((c.x - b.x) / d2) * r, y: b.y + ((c.y - b.y) / d2) * r };
    d += ` L ${p1.x} ${p1.y} Q ${b.x} ${b.y} ${p2.x} ${p2.y}`;
  }
  const z = pts[pts.length - 1];
  return `${d} L ${z.x} ${z.y}`;
}

export function CaboEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props;
  const { projeto, sim, acoes, selecionar, foco, focoPeca, visiveis, bitolas } = useMapa();
  const { screenToFlowPosition } = useReactFlow();
  const cabo = projeto.cabos.find((c) => c.id === id);
  if (!cabo) return null;

  const pecaDe = projeto.pecas.find((x) => x.id === cabo.de.peca);
  const fracaoDe = (pecaDe && bornesDaPeca(pecaDe, projeto).find((b) => b.id === cabo.de.borne)?.fracao) ?? 0.5;
  const pts: Posicao[] = [{ x: sourceX, y: sourceY }, ...cabo.pontos, { x: targetX, y: targetY }];
  let d: string;
  let lx: number;
  let ly: number;
  if (cabo.pontos.length === 0) {
    // Sem dobras: degraus automáticos (sai reto do borne, vira 90°, chega reto no outro).
    // Cada polo vira numa altura diferente (faixa), senão os cabos de um bipolar ficam um em cima do outro.
    // O polo do lado pra onde o cabo vai vira primeiro, assim os cabos não se cruzam.
    const faixa = (fracaoDe - 0.5) * 36 * (targetX >= sourceX ? -1 : 1);
    const faixaY = (targetY - sourceY) * 0.5 + sourceY + faixa;
    [d, lx, ly] = getSmoothStepPath({
      sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10, offset: 24, centerY: faixaY,
    });
  } else {
    d = caminhoArredondado(pts);
    const meio = Math.floor((pts.length - 1) / 2);
    lx = (pts[meio].x + pts[meio + 1].x) / 2;
    ly = (pts[meio].y + pts[meio + 1].y) / 2;
  }

  const w = espessura(cabo.bitola);
  const vivo = sim.cabos[id] === 'fase';

  // Estado visual: filtrado (some), fora do foco (apagado) ou em foco (realçado).
  const filtrado = !visiveis.has(cabo.condutor);
  const emFoco = !!foco?.has(id);
  const classe = filtrado ? 'cabo-filtrado' : foco ? (emFoco ? 'cabo-foco' : 'cabo-fora-foco') : '';
  // Etiqueta completa só quando ajuda; cabo irregular sempre mostra pelo menos o ⚠.
  const etiqueta = !filtrado && (selected || emFoco || bitolas);
  const soAlerta = !etiqueta && !filtrado && cabo.foraDoPadrao && !(foco && !emFoco);

  // Polo: se a peça em foco é uma das pontas deste cabo, descobre qual borne dela é (1, 2, N…),
  // qual fase está chegando nele e qual cor de polo usar.
  const ponta = !filtrado && focoPeca ? (cabo.de.peca === focoPeca ? cabo.de : cabo.para.peca === focoPeca ? cabo.para : null) : null;
  let polo: { texto: string; cor: string } | null = null;
  if (ponta) {
    const peca = projeto.pecas.find((x) => x.id === ponta.peca);
    const bornes = peca ? bornesDaPeca(peca, projeto) : [];
    const b = bornes.find((x) => x.id === ponta.borne);
    if (b) {
      const doLado = bornes.filter((x) => x.lado === b.lado);
      const fases = [...sim.rede.potencial(ponta.peca, ponta.borne).fases].sort();
      polo = {
        texto: `${b.rotulo || '•'}${fases.length && fases.join('+') !== b.rotulo ? ` · ${fases.join('+')}` : ''}`,
        cor: CORES_POLO[Math.max(0, doLado.indexOf(b)) % CORES_POLO.length],
      };
    }
  }
  // Plaquinhas ~24px depois de cada borne, no sentido em que o cabo sai.
  const [dsx, dsy] = DIRECAO[sourcePosition];
  const [dtx, dty] = DIRECAO[targetPosition];
  const plaquinhas = polo
    ? [
        { x: sourceX + dsx * 24, y: sourceY + dsy * 24 },
        { x: targetX + dtx * 24, y: targetY + dty * 24 },
      ]
    : [];

  // Arrasta a dobra idx (índice em cabo.pontos), partindo da lista "inicial".
  const arrastar = (idx: number, inicial: Posicao[]) => (e: ReactPointerEvent<SVGElement>) => {
    e.stopPropagation();
    const alvo = e.currentTarget;
    alvo.setPointerCapture(e.pointerId);
    let pontos = inicial;
    const mover = (ev: PointerEvent) => {
      const q = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      pontos = pontos.map((p, i) => (i === idx ? { x: encaixar(q.x), y: encaixar(q.y) } : p));
      acoes.definirPontos(id, pontos);
    };
    const soltar = () => {
      alvo.removeEventListener('pointermove', mover);
      alvo.removeEventListener('pointerup', soltar);
      alvo.removeEventListener('pointercancel', soltar);
    };
    alvo.addEventListener('pointermove', mover);
    alvo.addEventListener('pointerup', soltar);
    alvo.addEventListener('pointercancel', soltar);
  };

  return (
    <g className={classe}>
      {!filtrado && <path d={d} className="cabo-toque react-flow__edge-interaction" />}
      {selected && <path d={d} className="cabo-selecao" strokeWidth={w + 8} />}
      {polo && <path d={d} className="cabo-polo" stroke={polo.cor} strokeWidth={w + 7} />}
      <path d={d} className={`cabo-capa ${cabo.foraDoPadrao ? 'irregular' : ''}`} strokeWidth={w + 2.5} />
      <path d={d} className="cabo-cor" stroke={cabo.cor} strokeWidth={w} />
      {vivo && <path d={d} className="cabo-fluxo" strokeWidth={Math.max(1.5, w - 2.5)} />}

      {selected && (
        <g className="nodrag nopan">
          {pts.slice(0, -1).map((a, i) => {
            const b = pts[i + 1];
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            return (
              <g
                key={`m${i}`}
                className="dobra-nova"
                transform={`translate(${mx} ${my})`}
                onPointerDown={(e) => {
                  const novos = [...cabo.pontos];
                  novos.splice(i, 0, { x: encaixar(mx), y: encaixar(my) });
                  acoes.definirPontos(id, novos);
                  arrastar(i, novos)(e);
                }}
              >
                <circle r={7} />
                <path d="M -3.5 0 H 3.5 M 0 -3.5 V 3.5" />
                <title>Arraste pra criar uma dobra</title>
              </g>
            );
          })}
          {cabo.pontos.map((q, i) => (
            <circle
              key={`p${i}`}
              className="dobra"
              cx={q.x}
              cy={q.y}
              r={7}
              onPointerDown={arrastar(i, cabo.pontos)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                acoes.definirPontos(id, cabo.pontos.filter((_, k) => k !== i));
              }}
            >
              <title>Arraste pra mover · duplo clique remove</title>
            </circle>
          ))}
        </g>
      )}

      {polo && (
        <EdgeLabelRenderer>
          {plaquinhas.map((q, i) => (
            <div
              key={i}
              className="cabo-plaquinha"
              style={{ background: polo.cor, transform: `translate(-50%, -50%) translate(${q.x}px, ${q.y}px)` }}
            >
              {polo.texto}
            </div>
          ))}
        </EdgeLabelRenderer>
      )}
      {(etiqueta || soAlerta) && (
        <EdgeLabelRenderer>
          <div
            className={`cabo-rotulo nodrag nopan ${cabo.foraDoPadrao ? 'irregular' : ''} ${selected ? 'sel' : ''} ${soAlerta ? 'so-alerta' : ''} ${foco && !emFoco ? 'fora-foco' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
            onClick={() => selecionar({ tipo: 'cabo', id })}
            title={cabo.notas || (cabo.foraDoPadrao ? 'Ligação fora do padrão. Clique pra editar' : 'Clique pra editar o cabo')}
          >
            {soAlerta ? (
              '⚠'
            ) : (
              <>
                <span className="cabo-rotulo-cor" style={{ background: cabo.cor }} />
                {String(cabo.bitola).replace('.', ',')}mm²{cabo.foraDoPadrao && ' ⚠'}
              </>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

export const tiposDeCabo = { cabo: CaboEdge };
