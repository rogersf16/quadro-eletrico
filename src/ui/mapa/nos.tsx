// Componentes de cada tipo de peça no mapa. Os bornes são os Handles do React Flow:
// arrastar de um borne até outro cria um cabo.
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { CORES_CONDUTOR, fornecimentoInfo, tipoCargaInfo } from '../../core/catalogo';
import { MODULO, barramentoVertical, tamanhoPeca } from '../../core/layout';
import { bornesDaPeca, rotuloPotencial, type Borne, type Lado } from '../../core/rede';
import type { Fase, Peca, PecaBarramento, PecaCarga, PecaDR, PecaDisjuntor, PecaEmenda, PecaEntrada, PecaMedidor, PecaQuadro } from '../../core/types';
import { SeletorFornecimento } from '../components/SeletorFornecimento';
import { useMapa } from './contexto';

const POSICAO: Record<Lado, Position> = {
  topo: Position.Top,
  base: Position.Bottom,
  'centro-topo': Position.Top,
  'centro-base': Position.Bottom,
  esq: Position.Left,
  dir: Position.Right,
};

const fmtA = (a: number) => `${a.toFixed(1).replace('.', ',')} A`;

function usePeca<T extends Peca>(id: string): T | undefined {
  const { projeto } = useMapa();
  return projeto.pecas.find((x) => x.id === id) as T | undefined;
}

// Um borne: ponto de conexão que acende conforme o potencial que chega nele.
function BorneHandle({ peca, b, mostrarRotulo = true }: { peca: string; b: Borne; mostrarRotulo?: boolean }) {
  const { sim } = useMapa();
  const pt = sim.rede.potencial(peca, b.id);
  const cls = pt.fases.size ? 'pot-fase' : pt.neutro ? 'pot-neutro' : pt.terra ? 'pot-terra' : '';
  const horizontal = b.lado === 'esq' || b.lado === 'dir';
  const style = horizontal ? { top: `${b.fracao * 100}%` } : { left: `${b.fracao * 100}%` };
  return (
    <Handle
      id={b.id}
      type="source"
      position={POSICAO[b.lado]}
      className={`borne ${cls}`}
      style={style}
      title={`${b.rotulo ? `Borne ${b.rotulo}` : 'Ponto de emenda'}: ${rotuloPotencial(pt) || 'sem potencial'}. Arraste até outro borne pra ligar um cabo.`}
    >
      {mostrarRotulo && b.rotulo && <span className={`borne-rotulo rotulo-${b.lado}`}>{b.rotulo}</span>}
    </Handle>
  );
}

function Bornes({ peca, lados, rotulos = true }: { peca: Peca; lados: Lado[]; rotulos?: boolean }) {
  const { projeto } = useMapa();
  return (
    <>
      {bornesDaPeca(peca, projeto)
        .filter((b) => lados.includes(b.lado))
        .map((b) => (
          <BorneHandle key={b.id} peca={peca.id} b={b} mostrarRotulo={rotulos} />
        ))}
    </>
  );
}

// ---------- Disjuntor e DR (mesmo corpo DIN) ----------
function Chave({ peca }: { peca: PecaDisjuntor | PecaDR }) {
  const { sim, niveis, acoes } = useMapa();
  const estado = peca.desarmado ? 'trip' : peca.ligado ? 'on' : 'off';
  const info = sim.dispositivos[peca.id];
  const eDR = peca.tipo === 'dr';
  const geral = peca.tipo === 'disjuntor' && peca.geral;
  const polosFase = eDR ? (peca.polos === 2 ? 1 : 3) : peca.polos;
  const marca = eDR ? `DR ${peca.sensibilidade}mA` : geral ? 'GERAL' : `CURVA ${peca.curva}`;
  const rotulo = eDR ? `${peca.corrente}A` : `${peca.curva}${peca.corrente}`;
  const nivel = niveis[peca.id];
  const sintoma = peca.tipo === 'disjuntor' && peca.sintoma !== 'nenhum';

  return (
    <div
      className={`disp ${eDR ? 'disp-dr' : geral ? 'disp-geral' : 'disp-circuito'} est-${estado} ${info?.saida ? 'energizado' : ''}`}
>
      <div className="disp-corpo" style={{ width: peca.polos * MODULO }}>
        <Bornes peca={peca} lados={['topo']} />
        <div className="disp-face">
          <div className="disp-marca">{marca}</div>
          <div className="disp-rotulo">{rotulo}</div>
          <button
            className="alavancas nodrag"
            onClick={() => acoes.alternar(peca.id)}
            title={estado === 'trip' ? 'Desarmado: clique pra rearmar' : estado === 'on' ? 'Clique pra desligar' : 'Clique pra ligar'}
          >
            {Array.from({ length: polosFase }, (_, i) => (
              <span key={i} className="fenda">
                <span className="alavanca" />
              </span>
            ))}
            {polosFase > 1 && <span className="ponte" />}
          </button>
          <div className="disp-linha">
            <span className={`janela janela-${estado}`}>{{ on: 'I  ON', off: 'O  OFF', trip: 'TRIP' }[estado]}</span>
            {eDR && (
              <button className="btn-teste nodrag" onClick={() => acoes.testarDR(peca.id)} title="Botão de teste do DR">
                T
              </button>
            )}
          </div>
        </div>
        <Bornes peca={peca} lados={['base']} />
        {nivel && <span className={`led nivel-${nivel}`} title="Status do dimensionamento" />}
        {sintoma && <span className="sintoma-flag" title="Sintoma relatado">!</span>}
      </div>
      <div className="disp-etiqueta">
        <span className="disp-nome">{peca.nome}</span>
        <span className={`disp-info ${info?.saida ? 'vivo' : ''}`}>{info?.saida ? `⚡ ${fmtA(info.corrente)}` : 'sem energia'}</span>
      </div>
    </div>
  );
}

export function NoDisjuntor({ id }: NodeProps) {
  const p = usePeca<PecaDisjuntor>(id);
  if (!p) return null;
  return p.transferencia ? <ChaveTransferencia peca={p} /> : <Chave peca={p} />;
}

export function NoDR({ id }: NodeProps) {
  const p = usePeca<PecaDR>(id);
  return p ? <Chave peca={p} /> : null;
}

// ---------- Disjuntor de transferência manual (dois lados com intertravamento) ----------
function ChaveTransferencia({ peca: p }: { peca: PecaDisjuntor }) {
  const { sim, niveis, acoes } = useMapa();
  const info = sim.dispositivos[p.id];
  const II = p.II ?? { ligado: false, desarmado: false };
  const lados = { I: { ligado: p.ligado, desarmado: p.desarmado }, II };
  const ativo = p.ligado ? 'I' : II.ligado ? 'II' : null;
  const prefixo = { I: 'in', II: 'inII' } as const;
  const viva = (l: 'I' | 'II') => Array.from({ length: p.polos }, (_, k) => k + 1).some((k) => sim.rede.potencial(p.id, `${prefixo[l]}:${k}`).fases.size > 0);
  const estado = (l: 'I' | 'II') => (lados[l].desarmado ? 'trip' : lados[l].ligado ? 'on' : 'off');
  const nivel = niveis[p.id];
  return (
    <div className={`disp disp-circuito disp-transf ${info?.saida ? 'energizado' : ''}`}>
      <div className="disp-corpo" style={{ width: 2 * p.polos * MODULO }}>
        <Bornes peca={p} lados={['topo']} />
        <div className="transf-face">
          {(['I', 'II'] as const).map((l) => {
            const est = estado(l);
            return (
              <div key={l} className={`transf-lado est-${est}`}>
                <div className={`transf-nome ${viva(l) ? 'viva' : ''}`}>{l}</div>
                <button
                  className="alavancas nodrag"
                  onClick={() => acoes.alternarLado(p.id, l)}
                  title={est === 'trip' ? `Lado ${l} desarmado: clique pra rearmar` : est === 'on' ? `Desligar lado ${l}` : `Ligar lado ${l} (o outro precisa estar desligado)`}
                >
                  {Array.from({ length: p.polos }, (_, i) => (
                    <span key={i} className="fenda">
                      <span className="alavanca" />
                    </span>
                  ))}
                  {p.polos > 1 && <span className="ponte" />}
                </button>
                <span className={`janela janela-${est}`}>{{ on: 'ON', off: 'OFF', trip: 'TRIP' }[est]}</span>
              </div>
            );
          })}
          <span className="transf-trava" title="Intertravamento: só um lado pode ficar ligado" aria-hidden />
        </div>
        <div className="disp-marca transf-marca">{p.curva}{p.corrente} · I ⇄ II</div>
        <Bornes peca={p} lados={['base']} />
        {nivel && <span className={`led nivel-${nivel}`} title="Status do dimensionamento" />}
        {p.sintoma !== 'nenhum' && <span className="sintoma-flag" title="Sintoma relatado">!</span>}
      </div>
      <div className="disp-etiqueta">
        <span className="disp-nome">{p.nome}</span>
        <span className={`disp-info ${info?.saida ? 'vivo' : ''}`}>
          {info?.saida ? `⚡ ${fmtA(info.corrente)} · lado ${ativo}` : ativo ? `lado ${ativo} · sem energia` : 'os dois lados desligados'}
        </span>
      </div>
    </div>
  );
}

// ---------- Caixa / quadro (agrupamento visual) ----------
export function NoQuadro({ id, selected }: NodeProps) {
  const { acoes } = useMapa();
  const p = usePeca<PecaQuadro>(id);
  if (!p) return null;
  return (
    <div className="quadro-caixa" style={{ ['--cor' as string]: p.cor }}>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={100}
        color={p.cor}
        onResize={(_, r) => acoes.redimensionarQuadro(id, { x: Math.round(r.x), y: Math.round(r.y) }, Math.round(r.width), Math.round(r.height))}
      />
      <div className="quadro-titulo" title="Arraste pelo título pra mover a caixa com o que está dentro">{p.nome}</div>
    </div>
  );
}

// ---------- Medidor de energia (formato DIN, sem chave) ----------
const fmtV = (v: number) => `${v} V`;
const fmtKW = (w: number) => (w >= 1000 ? `${(w / 1000).toFixed(2).replace('.', ',')} kW` : `${Math.round(w)} W`);

export function NoMedidor({ id }: NodeProps) {
  const { sim } = useMapa();
  const p = usePeca<PecaMedidor>(id);
  if (!p) return null;
  const leitura = sim.medidores[id];
  const vivo = !!leitura?.fases.some((f) => f.fase);
  const acima = !!leitura?.fases.some((f) => f.corrente > p.correnteMax);
  return (
    <div className={`disp disp-medidor ${vivo ? 'energizado' : ''}`}>
      <div className="disp-corpo" style={{ width: p.polos * MODULO }}>
        <Bornes peca={p} lados={['topo']} />
        <div className="disp-face">
          <div className="disp-marca">MEDIDOR</div>
          <div className={`lcd ${vivo ? 'lcd-on' : ''}`} title="Leitura instantânea de tensão e corrente">
            {vivo ? (
              <>
                {leitura!.fases.map((f) => (
                  <div key={f.polo} className={`lcd-linha ${f.corrente > p.correnteMax ? 'lcd-alerta' : ''}`}>
                    <span>{f.fase ?? '-'}</span>
                    <span>{f.fase ? fmtV(f.tensao) : '---'}</span>
                    <span>{f.fase ? fmtA(f.corrente) : '---'}</span>
                  </div>
                ))}
                <div className="lcd-linha lcd-total">
                  <span>P</span>
                  <span>{fmtKW(leitura!.potencia)}</span>
                </div>
              </>
            ) : (
              <div className="lcd-linha lcd-apagado">sem energia</div>
            )}
          </div>
          <div className="disp-linha">
            <span className="janela janela-medidor">{p.correnteMax}A máx</span>
          </div>
        </div>
        <Bornes peca={p} lados={['base']} />
        {acima && <span className="sintoma-flag" title="Corrente acima do limite de medição">!</span>}
      </div>
      <div className="disp-etiqueta">
        <span className="disp-nome">{p.nome}</span>
        <span className={`disp-info ${vivo ? 'vivo' : ''}`}>{vivo ? `⚡ ${fmtKW(leitura!.potencia)}` : 'sem energia'}</span>
      </div>
    </div>
  );
}

// ---------- Entrada da rua ----------
export function NoEntrada({ id }: NodeProps) {
  const { projeto, acoes } = useMapa();
  const p = usePeca<PecaEntrada>(id);
  if (!p) return null;
  const info = fornecimentoInfo(projeto.fornecimento);
  const bornes = bornesDaPeca(p, projeto);
  return (
    <div className="entrada">
      <div className="entrada-topo">
        <span className="entrada-icone" aria-hidden>⌁</span>
        <div>
          <b>{p.nome}</b>
          <span className="entrada-sub">{info.tensaoTxt}</span>
        </div>
      </div>
      <div className="nodrag">
        <SeletorFornecimento valor={projeto.fornecimento} onChange={(f) => acoes.atualizarProjeto({ fornecimento: f })} compacto />
      </div>
      <div className="entrada-fases">
        {bornes.map((b) => {
          const fase = ['A', 'B', 'C'].includes(b.id) ? (b.id as Fase) : null;
          const falta = fase && p.faltando.includes(fase);
          return (
            <button
              key={b.id}
              className={`fase-toggle nodrag ${falta ? 'falta' : ''}`}
              style={{ left: `${b.fracao * 100}%`, ['--cor' as string]: CORES_CONDUTOR[b.id as keyof typeof CORES_CONDUTOR] }}
              disabled={!fase}
              onClick={() => fase && acoes.alternarFase(fase)}
              title={fase ? (falta ? `Fase ${fase} cortada: clique pra religar` : `Fase ${fase}: clique pra simular falta`) : b.id === 'N' ? 'Neutro' : 'Terra'}
            >
              {b.id}
            </button>
          );
        })}
      </div>
      <Bornes peca={p} lados={['base']} rotulos={false} />
    </div>
  );
}

// ---------- Emenda ----------
export function NoEmenda({ id }: NodeProps) {
  const { projeto } = useMapa();
  const p = usePeca<PecaEmenda>(id);
  if (!p) return null;
  const n = projeto.cabos.filter((c) => c.de.peca === id || c.para.peca === id).length;
  return (
    <div className="emenda" title="Emenda cobre com cobre: todos os cabos ligados aqui viram um ponto só">
      <span className="emenda-icone" aria-hidden>⨯</span>
      <span className="emenda-nome">{p.nome}</span>
      <span className="emenda-n">{n}</span>
      <Bornes peca={p} lados={['centro-topo', 'centro-base', 'esq', 'dir']} rotulos={false} />
    </div>
  );
}

// ---------- Barramento ----------
export function NoBarramento({ id }: NodeProps) {
  const p = usePeca<PecaBarramento>(id);
  if (!p) return null;
  if (barramentoVertical(p)) {
    return (
      <div className={`barramento-v barramento-${p.condutor} ${p.orientacao}`} style={{ height: tamanhoPeca(p).h }}>
        <span className="barramento-nome">{p.nome}</span>
        <div className="barramento-barra barramento-barra-v">
          <Bornes peca={p} lados={['esq', 'dir']} rotulos={false} />
        </div>
      </div>
    );
  }
  return (
    <div className={`barramento barramento-${p.condutor}`} style={{ width: tamanhoPeca(p).w }}>
      <span className="barramento-nome">{p.nome}</span>
      <div className="barramento-barra" />
      <Bornes peca={p} lados={['base']} rotulos={false} />
    </div>
  );
}

// ---------- Carga ----------
export function NoCarga({ id }: NodeProps) {
  const { sim, niveis } = useMapa();
  const p = usePeca<PecaCarga>(id);
  if (!p) return null;
  const e = sim.cargas[id];
  const info = tipoCargaInfo(p.tipoCarga);
  return (
    <div className={`carga ${e?.funciona ? 'funciona' : ''}`}>
      <Bornes peca={p} lados={['topo']} />
      <div className="carga-topo">
        <span className="carga-icone" aria-hidden>{info.icone}</span>
        <span className="carga-nome">{p.nome}</span>
      </div>
      <span className="carga-dados">
        {p.potencia} W · {p.tensao} V
      </span>
      <span className={`carga-estado ${e?.funciona ? 'vivo' : e && e.motivo !== 'sem energia' ? 'alerta' : ''}`}>
        {e?.funciona ? `⚡ ${fmtA(e.corrente)} · fase ${e.fases.join('+')}` : (e?.motivo ?? 'sem energia')}
      </span>
      {niveis[id] && <span className={`led nivel-${niveis[id]}`} />}
    </div>
  );
}

export const tiposDeNo = {
  quadro: NoQuadro,
  entrada: NoEntrada,
  disjuntor: NoDisjuntor,
  dr: NoDR,
  medidor: NoMedidor,
  emenda: NoEmenda,
  barramento: NoBarramento,
  carga: NoCarga,
};
