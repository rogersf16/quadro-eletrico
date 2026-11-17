// Cabo desenhado entre dois bornes. Selecionado, mostra pontos de dobra arrastáveis:
// "+" no meio de cada trecho cria uma dobra, arrastar move, duplo clique remove.
// Traçado ortogonal (retas e 90°, como em esquema elétrico) com cantos arredondados.
import { EdgeLabelRenderer, getSmoothStepPath, Position, useReactFlow, type EdgeProps } from '@xyflow/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { encaixar } from '../../core/layout';
import { bornesDaPeca, rotuloFase } from '../../core/rede';
import type { Posicao } from '../../core/types';
import { useMapa } from './contexto';
import { AFASTAMENTO, alturaBase, alturaComFaixa, forma } from './faixas';

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

// Cantos do traçado automático (o path do getSmoothStepPath): início, cada canto (ponto de controle
// das curvas "Q") e fim. Assim os "+" ficam em cima do cabo que aparece, e não na reta entre os bornes.
function cantos(d: string): Posicao[] {
  const pts: Posicao[] = [];
  for (const [, cmd, resto] of d.matchAll(/([MLQ])([^MLQ]*)/g)) {
    const n = resto.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? [];
    if (n.length < 2) continue;
    if (cmd === 'M' || cmd === 'Q') pts.push({ x: n[0], y: n[1] });
  }
  const n = d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? [];
  if (n.length >= 2) pts.push({ x: n[n.length - 2], y: n[n.length - 1] });
  return pts;
}

export function CaboEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected } = props;
  const { projeto, sim, cargaCabos, acoes, selecionar, foco, focoPeca, visiveis, bitolas, faixas, curto } = useMapa();
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
    // Se outro cabo (de outro ponto elétrico) cairia na mesma altura, este vai pra outra faixa (ver faixas.ts).
    const k = faixas[id] ?? 0;
    const f = forma({ id, grupo: '', sx: sourceX, sy: sourceY, tx: targetX, ty: targetY, sp: sourcePosition, tp: targetPosition, fracaoDe });
    const centerY = f?.tipo === 'Z' ? alturaComFaixa(f, k) : f ? undefined : alturaBase(sourceX, sourceY, targetX, targetY, fracaoDe);
    const offset = f?.tipo === 'U' ? AFASTAMENTO + Math.abs(alturaComFaixa(f, k) - f.y) : AFASTAMENTO;
    [d, lx, ly] = getSmoothStepPath({
      sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 10, offset, centerY,
    });
  } else {
    d = caminhoArredondado(pts);
    const meio = Math.floor((pts.length - 1) / 2);
    lx = (pts[meio].x + pts[meio + 1].x) / 2;
    ly = (pts[meio].y + pts[meio + 1].y) / 2;
  }

  // Trechos onde dá pra criar dobra: sem dobras, segue o traçado automático; com dobras, a linha pelos pontos.
  const vertices = cabo.pontos.length === 0 ? cantos(d) : pts;

  // Selecionado, a etiqueta sai de cima do cabo (pro lado, se o trecho é vertical; pra cima, se horizontal).
  // Ela é HTML e fica por cima do SVG: no meio do cabo, esconderia o "+" daquele trecho e roubaria o toque.
  let posEtiqueta = 'translate(-50%, -50%)';
  if (selected) {
    // Põe a etiqueta ao lado do trecho mais comprido (o "+" dele fica no meio, livre).
    let maior = -1;
    for (let i = 0; i < vertices.length - 1; i++) {
      const [a, b] = [vertices[i], vertices[i + 1]];
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      if (L <= maior) continue;
      maior = L;
      lx = (a.x + b.x) / 2;
      ly = (a.y + b.y) / 2;
      const vertical = Math.abs(b.x - a.x) < Math.abs(b.y - a.y);
      posEtiqueta = vertical ? 'translate(16px, -50%)' : 'translate(-50%, calc(-100% - 12px))';
    }
  }

  const w = espessura(cabo.bitola);
  // Faz parte de um ponto em curto (com tudo ligado): contorno vermelho piscando, por cima de tudo.
  const emCurto = curto.cabos.has(id);
  const vivo = sim.cabos[id] === 'fase';
  // Bitola não aguenta a corrente: o fluxo fica "desgovernado" e o rótulo mostra a corrente.
  const carga = cargaCabos[id];
  const sobrecarga = !!carga?.sobrecarga;

  // Estado visual: filtrado (some), fora do foco (apagado) ou em foco (realçado).
  const filtrado = !visiveis.has(cabo.condutor);
  const emFoco = !!foco?.has(id);
  const classe = filtrado ? 'cabo-filtrado' : foco ? (emFoco ? 'cabo-foco' : emCurto ? '' : 'cabo-fora-foco') : '';
  // Etiqueta completa só quando ajuda; cabo irregular sempre mostra pelo menos o ⚠.
  const etiqueta = !filtrado && (selected || emFoco || bitolas);
  const soAlerta = !etiqueta && !filtrado && (cabo.foraDoPadrao || sobrecarga) && !(foco && !emFoco);

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
      const fases = [...sim.rede.potencial(ponta.peca, ponta.borne).fases].sort().map(rotuloFase);
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
      {emCurto && (
        <path d={d} className="cabo-curto" strokeWidth={w + 9}>
          <title>Este cabo faz parte de um curto-circuito (com tudo ligado)</title>
        </path>
      )}
      {vivo && !sobrecarga && <path d={d} className="cabo-fluxo" strokeWidth={Math.max(1.5, w - 2.5)} />}
      {sobrecarga && (
        <>
          <path d={d} className="cabo-quente" strokeWidth={w + 6} />
          <path d={d} className="cabo-fluxo cabo-fluxo-louco a" strokeWidth={Math.max(1.5, w - 2.5)} />
          <path d={d} className="cabo-fluxo cabo-fluxo-louco b" strokeWidth={Math.max(1.2, w - 3.5)} />
          <title>{`Sobrecarga: ${carga.corrente.toFixed(1).replace('.', ',')} A num cabo que aguenta ~${carga.capacidade} A`}</title>
        </>
      )}

      {selected && (
        <g className="nodrag nopan">
          {vertices.slice(0, -1).map((a, i) => {
            const b = vertices[i + 1];
            if (Math.hypot(b.x - a.x, b.y - a.y) < 16) return null;
            const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            return (
              <g
                key={`m${i}`}
                className="dobra-nova"
                transform={`translate(${m.x} ${m.y})`}
                onPointerDown={(e) => {
                  // Cabo automático: congela o traçado atual em dobras (sem os bornes) e acrescenta a nova.
                  const novos = cabo.pontos.length === 0 ? vertices.slice(1, -1) : [...cabo.pontos];
                  novos.splice(i, 0, { x: encaixar(m.x), y: encaixar(m.y) });
                  acoes.definirPontos(id, novos);
                  arrastar(i, novos)(e);
                }}
              >
                <circle className="dobra-alvo" r={14} />
                <circle r={7} />
                <path d="M -3.5 0 H 3.5 M 0 -3.5 V 3.5" />
                <title>Arraste pra criar uma dobra</title>
              </g>
            );
          })}
          {cabo.pontos.map((q, i) => (
            <g
              key={`p${i}`}
              className="dobra"
              transform={`translate(${q.x} ${q.y})`}
              onPointerDown={arrastar(i, cabo.pontos)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                acoes.definirPontos(id, cabo.pontos.filter((_, k) => k !== i));
              }}
            >
              <circle className="dobra-alvo" r={14} />
              <circle r={7} />
              <title>Arraste pra mover · duplo clique remove</title>
            </g>
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
            className={`cabo-rotulo nodrag nopan ${cabo.foraDoPadrao ? 'irregular' : ''} ${sobrecarga ? 'sobrecarga' : ''} ${selected ? 'sel' : ''} ${soAlerta ? 'so-alerta' : ''} ${foco && !emFoco ? 'fora-foco' : ''}`}
            style={{ transform: `translate(${lx}px, ${ly}px) ${posEtiqueta}` }}
            onClick={() => selecionar({ tipo: 'cabo', id })}
            title={cabo.notas || (cabo.foraDoPadrao ? 'Ligação fora do padrão. Clique pra editar' : 'Clique pra editar o cabo')}
          >
            {soAlerta ? (
              sobrecarga ? `⚠ ${Math.round(carga.corrente)} A / ${carga.capacidade} A` : '⚠'
            ) : (
              <>
                <span className="cabo-rotulo-cor" style={{ background: cabo.cor }} />
                {String(cabo.bitola).replace('.', ',')}mm²{cabo.foraDoPadrao && ' ⚠'}
                {sobrecarga && ` · ${Math.round(carga.corrente)} A / ${carga.capacidade} A`}
              </>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

export const tiposDeCabo = { cabo: CaboEdge };
