// Editores das peças mais simples: DR, carga, emenda, barramento e entrada.
import type { ReactNode } from 'react';
import { CORRENTES_DR, CORRENTES_MEDIDOR, TIPOS_CARGA, fornecimentoInfo, tipoCargaInfo } from '../../core/catalogo';
import { simular, simularPiorCaso } from '../../core/simulacao';
import type { Peca, PecaBarramento, PecaCarga, PecaDR, PecaEmenda, PecaEntrada, PecaMedidor, OrientacaoBarramento, Projeto, TipoCarga } from '../../core/types';
import { drsQueProtegem, piorNivel, validarCarga } from '../../core/validacao';
import { Campo, Selo } from '../components/Campo';
import type { Selecao } from '../mapa/contexto';
import type { Acoes } from '../useProjeto';

interface Props<T extends Peca> {
  peca: T;
  projeto: Projeto;
  acoes: Acoes;
  onSelecionar: (s: Selecao | null) => void;
}

function Topo({ titulo, extra, onFechar }: { titulo: string; extra?: ReactNode; onFechar: () => void }) {
  return (
    <div className="editor-topo">
      <h2>{titulo} {extra}</h2>
      <button onClick={onFechar} aria-label="Fechar">✕</button>
    </div>
  );
}

function Rodape<T extends Peca>({ peca, acoes, onSelecionar, rotulo }: Props<T> & { rotulo: string }) {
  return (
    <>
      <Campo rotulo="Notas">
        <textarea rows={3} value={peca.notas} onChange={(e) => acoes.atualizarPeca(peca.id, { notas: e.target.value })} />
      </Campo>
      <div className="acoes">
        <button className="perigo" onClick={() => { acoes.removerPecas([peca.id]); onSelecionar(null); }}>{rotulo}</button>
      </div>
    </>
  );
}

export function EditorMedidor(props: Props<PecaMedidor>) {
  const { peca: m, projeto: p, acoes, onSelecionar } = props;
  const mudar = (x: Partial<PecaMedidor>) => acoes.atualizarPeca(m.id, x);
  const leitura = simular(p).medidores[m.id];
  const fmt = (n: number) => n.toFixed(1).replace('.', ',');
  return (
    <section className="painel editor">
      <Topo titulo={m.nome} extra={<span className="selo">Medidor</span>} onFechar={() => onSelecionar(null)} />
      <p className="campo-dica">
        Multimedidor em trilho DIN: tem o formato de um disjuntor, mas <b>não protege nem desliga nada</b>. Fica sempre
        passando energia e mostra a tensão e a corrente de cada fase do que está ligado depois dele (ex.: o CPD).
      </p>
      <Campo rotulo="Nome">
        <input value={m.nome} onChange={(e) => mudar({ nome: e.target.value })} />
      </Campo>
      <div className="grade">
        <Campo rotulo="Polos">
          <select value={m.polos} onChange={(e) => mudar({ polos: Number(e.target.value) as 2 | 4 })}>
            <option value={2}>Monofásico (fase + N)</option>
            <option value={4}>Trifásico (3 fases + N)</option>
          </select>
        </Campo>
        <Campo rotulo="Medição direta até">
          <select value={m.correnteMax} onChange={(e) => mudar({ correnteMax: Number(e.target.value) })}>
            {CORRENTES_MEDIDOR.map((x) => (
              <option key={x} value={x}>{x} A</option>
            ))}
          </select>
        </Campo>
      </div>
      {leitura && (
        <table className="tabela-medidor">
          <thead>
            <tr><th>Fase</th><th>Tensão</th><th>Corrente</th></tr>
          </thead>
          <tbody>
            {leitura.fases.map((f) => (
              <tr key={f.polo}>
                <td>{f.fase ?? '—'}</td>
                <td>{f.fase ? `${f.tensao} V` : '—'}</td>
                <td>{f.fase ? `${fmt(f.corrente)} A` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {leitura && <p className="campo-dica">Potência agora: {fmt(leitura.potencia / 1000)} kW.</p>}
      {leitura?.fases.some((f) => f.corrente > m.correnteMax) && (
        <p className="campo-dica"><Selo nivel="erro" /> A corrente passa do que esse medidor mede direto. Use um modelo maior ou com TC.</p>
      )}
      <p className="campo-dica">Lembre: ele não substitui o disjuntor. O circuito continua precisando de proteção.</p>
      <Rodape {...props} rotulo="Remover medidor" />
    </section>
  );
}

export function EditorDR(props: Props<PecaDR>) {
  const { peca: d, projeto: p, acoes, onSelecionar } = props;
  const mudar = (m: Partial<PecaDR>) => acoes.atualizarPeca(d.id, m);
  const corrente = simularPiorCaso(p).dispositivos[d.id]?.corrente ?? 0;
  return (
    <section className="painel editor">
      <Topo titulo={d.nome} extra={<span className="selo selo-ok">DR</span>} onFechar={() => onSelecionar(null)} />
      <p className="campo-dica">
        O DR compara a corrente que sai pelas fases com a que volta pelo neutro. Se a diferença passa da sensibilidade,
        ele desarma. Por isso <b>fase e neutro de cada circuito precisam passar os dois por ele</b>.
      </p>
      <Campo rotulo="Nome">
        <input value={d.nome} onChange={(e) => mudar({ nome: e.target.value })} />
      </Campo>
      <div className="grade">
        <Campo rotulo="Corrente nominal">
          <select value={d.corrente} onChange={(e) => mudar({ corrente: Number(e.target.value) })}>
            {CORRENTES_DR.map((x) => (
              <option key={x} value={x}>{x} A</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Sensibilidade">
          <select value={d.sensibilidade} onChange={(e) => mudar({ sensibilidade: Number(e.target.value) as 30 | 300 })}>
            <option value={30}>30 mA (pessoas)</option>
            <option value={300}>300 mA (incêndio)</option>
          </select>
        </Campo>
        <Campo rotulo="Polos">
          <select value={d.polos} onChange={(e) => mudar({ polos: Number(e.target.value) as 2 | 4 })}>
            <option value={2}>2P (fase + N)</option>
            <option value={4}>4P (3 fases + N)</option>
          </select>
        </Campo>
      </div>
      <p className="campo-dica">Passa {corrente.toFixed(1).replace('.', ',')} A no pior caso.</p>
      <Rodape {...props} rotulo="Remover DR" />
    </section>
  );
}

export function EditorCarga(props: Props<PecaCarga>) {
  const { peca: c, projeto: p, acoes, onSelecionar } = props;
  const mudar = (m: Partial<PecaCarga>) => acoes.atualizarPeca(c.id, m);
  const forn = fornecimentoInfo(p.fornecimento);
  const agora = simular(p).cargas[c.id];
  const alertas = validarCarga(p, c);
  const drs = drsQueProtegem(p, c);
  return (
    <section className="painel editor">
      <Topo titulo={`${tipoCargaInfo(c.tipoCarga).icone} ${c.nome}`} extra={<Selo nivel={piorNivel(alertas)} />} onFechar={() => onSelecionar(null)} />
      <p className={`estado-carga ${agora?.funciona ? 'vivo' : ''}`}>
        {agora?.funciona ? `⚡ Funcionando: ${agora.motivo}, ${agora.corrente.toFixed(1).replace('.', ',')} A` : `Parada: ${agora?.motivo ?? 'sem energia'}`}
      </p>
      <Campo rotulo="Nome">
        <input value={c.nome} onChange={(e) => mudar({ nome: e.target.value })} />
      </Campo>
      <div className="grade">
        <Campo rotulo="Tipo">
          <select
            value={c.tipoCarga}
            onChange={(e) => {
              const t = e.target.value as TipoCarga;
              mudar({ tipoCarga: t, potencia: tipoCargaInfo(t).potenciaPadrao });
            }}
          >
            {TIPOS_CARGA.map((t) => (
              <option key={t.valor} value={t.valor}>{t.icone} {t.desc}</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Potência total (W)" dica="Some os aparelhos ligados nesse ponto.">
          <input type="number" min={0} step={100} value={c.potencia} onChange={(e) => mudar({ potencia: Math.max(0, Number(e.target.value)) })} />
        </Campo>
        <Campo
          rotulo="Tensão"
          dica={forn.fases > 1 ? '127 V = fase + neutro · 220 V = duas fases (bornes F e F).' : undefined}
        >
          <select value={c.tensao} disabled={forn.tensoes.length === 1} onChange={(e) => mudar({ tensao: Number(e.target.value) as 127 | 220 })}>
            {forn.tensoes.map((t) => (
              <option key={t} value={t}>{t} V</option>
            ))}
          </select>
        </Campo>
      </div>
      <p className="campo-dica">{drs.length ? `Protegida por: ${drs.map((d) => d.nome).join(', ')}.` : 'Não passa por nenhum DR.'}</p>
      <ul className="alertas">
        {alertas.map((a, i) => (
          <li key={i} className={`alerta alerta-${a.nivel}`}>{a.msg}</li>
        ))}
      </ul>
      <Rodape {...props} rotulo="Remover carga" />
    </section>
  );
}

export function EditorEmenda(props: Props<PecaEmenda>) {
  const { peca: e, projeto: p, acoes, onSelecionar } = props;
  const cabos = p.cabos.filter((c) => c.de.peca === e.id || c.para.peca === e.id);
  return (
    <section className="painel editor">
      <Topo titulo={e.nome} extra={<span className="selo selo-aviso">emenda</span>} onFechar={() => onSelecionar(null)} />
      <p className="campo-dica">
        Ponto onde cabos são emendados direto, cobre com cobre, sem barramento. Pra simulação, todos os {cabos.length} cabos
        ligados aqui são o mesmo ponto elétrico. Use os 4 bornes (cima, baixo, lados) só pra organizar o desenho.
      </p>
      <Campo rotulo="Nome / onde fica">
        <input value={e.nome} onChange={(ev) => acoes.atualizarPeca(e.id, { nome: ev.target.value })} />
      </Campo>
      {cabos.length > 0 && (
        <div className="chips">
          {cabos.map((c) => (
            <button key={c.id} className="chip" onClick={() => onSelecionar({ tipo: 'cabo', id: c.id })}>
              <span className="amostra-cabo" style={{ background: c.cor }} /> {c.condutor} {String(c.bitola).replace('.', ',')}mm²
            </button>
          ))}
        </div>
      )}
      <Rodape {...props} rotulo="Remover emenda" />
    </section>
  );
}

export function EditorBarramento(props: Props<PecaBarramento>) {
  const { peca: b, acoes, onSelecionar } = props;
  const mudar = (m: Partial<PecaBarramento>) => acoes.atualizarPeca(b.id, m);
  return (
    <section className="painel editor">
      <Topo titulo={b.nome} onFechar={() => onSelecionar(null)} />
      <Campo rotulo="Nome">
        <input value={b.nome} onChange={(e) => mudar({ nome: e.target.value })} />
      </Campo>
      <div className="grade">
        <Campo rotulo="Tipo">
          <select value={b.condutor} onChange={(e) => mudar({ condutor: e.target.value as 'neutro' | 'terra' })}>
            <option value="neutro">Neutro</option>
            <option value="terra">Terra</option>
          </select>
        </Campo>
        <Campo rotulo="Posição">
          <select value={b.orientacao ?? 'horizontal'} onChange={(e) => mudar({ orientacao: e.target.value as OrientacaoBarramento })}>
            <option value="horizontal">Horizontal (furos embaixo)</option>
            <option value="vertical-dir">Vertical (furos à direita)</option>
            <option value="vertical-esq">Vertical (furos à esquerda)</option>
          </select>
        </Campo>
        <Campo rotulo="Bornes" dica="Reduzir remove os cabos dos bornes que sumirem.">
          <input type="number" min={2} max={24} value={b.bornes} onChange={(e) => mudar({ bornes: Math.min(24, Math.max(2, Number(e.target.value))) })} />
        </Campo>
      </div>
      <Rodape {...props} rotulo="Remover barramento" />
    </section>
  );
}

export function EditorEntrada(props: Props<PecaEntrada>) {
  const { peca: e, acoes, onSelecionar } = props;
  return (
    <section className="painel editor">
      <Topo titulo={e.nome} onFechar={() => onSelecionar(null)} />
      <p className="campo-dica">
        De onde vem a energia da rua. Escolha quantas fases chegam na própria peça. Clique em A, B ou C pra simular falta de
        fase. Os bornes de baixo (fases, N e T) são de onde saem os cabos.
      </p>
      <Campo rotulo="Nome">
        <input value={e.nome} onChange={(ev) => acoes.atualizarPeca(e.id, { nome: ev.target.value })} />
      </Campo>
      <Campo rotulo="Notas">
        <textarea rows={3} value={e.notas} onChange={(ev) => acoes.atualizarPeca(e.id, { notas: ev.target.value })} />
      </Campo>
    </section>
  );
}
