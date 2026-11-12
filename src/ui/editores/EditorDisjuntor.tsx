import { CORRENTES, CURVAS, SINTOMAS, tipoCargaInfo } from '../../core/catalogo';
import { simularPiorCaso } from '../../core/simulacao';
import type { Curva, PecaDisjuntor, Polos, Projeto, Sintoma } from '../../core/types';
import { diagnostico, infoCircuito, piorNivel, sugerir, validarDisjuntor } from '../../core/validacao';
import { Campo, Selo } from '../components/Campo';
import type { Selecao } from '../mapa/contexto';
import type { Acoes } from '../useProjeto';

interface Props {
  peca: PecaDisjuntor;
  projeto: Projeto;
  acoes: Acoes;
  onSelecionar: (s: Selecao | null) => void;
}

const mm = (b: number) => `${String(b).replace('.', ',')} mm²`;

export function EditorDisjuntor({ peca: d, projeto: p, acoes, onSelecionar }: Props) {
  const mudar = (m: Partial<PecaDisjuntor>) => acoes.atualizarPeca(d.id, m);
  const pior = simularPiorCaso(p);
  const info = infoCircuito(p, d, pior);
  const alertas = validarDisjuntor(p, d, pior);
  const sug = sugerir(info, d.polos);
  const dicas = diagnostico(d, info);

  return (
    <section className="painel editor">
      <div className="editor-topo">
        <h2>{d.nome} <Selo nivel={piorNivel(alertas)} /></h2>
        <button onClick={() => onSelecionar(null)} aria-label="Fechar">✕</button>
      </div>

      <Campo rotulo="Nome">
        <input value={d.nome} onChange={(e) => mudar({ nome: e.target.value })} />
      </Campo>
      <div className="grade">
        <Campo rotulo="Corrente">
          <select value={d.corrente} onChange={(e) => mudar({ corrente: Number(e.target.value) })}>
            {CORRENTES.map((x) => (
              <option key={x} value={x}>{x} A</option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Polos">
          <select value={d.polos} onChange={(e) => mudar({ polos: Number(e.target.value) as Polos })}>
            <option value={1}>1P · mono</option>
            <option value={2}>2P · bi</option>
            <option value={3}>3P · tri</option>
          </select>
        </Campo>
        <Campo rotulo="Curva">
          <select value={d.curva} onChange={(e) => mudar({ curva: e.target.value as Curva })}>
            {CURVAS.map((x) => (
              <option key={x.valor} value={x.valor}>Curva {x.valor}</option>
            ))}
          </select>
        </Campo>
      </div>
      <p className="campo-dica">{CURVAS.find((x) => x.valor === d.curva)?.desc}. Diminuir polos remove os cabos do polo tirado.</p>
      <label className="check">
        <input type="checkbox" checked={d.geral} onChange={(e) => mudar({ geral: e.target.checked })} />
        É o disjuntor geral
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={!!d.transferencia}
          onChange={(e) =>
            mudar(e.target.checked ? { transferencia: true, II: { ligado: false, desarmado: false } } : { transferencia: false, II: undefined })
          }
        />
        Transferência manual
      </label>
      {d.transferencia && (
        <>
          <p className="campo-dica">
            Dois disjuntores com intertravamento: <b>I</b> (ex.: rua) à esquerda e <b>II</b> (ex.: gerador) à direita, cada um
            com entrada em cima e saída embaixo. Só um lado liga por vez; <b>ligando os dois, os dois desarmam</b>.
          </p>
          <div className="acoes">
            {(['I', 'II'] as const).map((l) => {
              const lado = l === 'I' ? { ligado: d.ligado, desarmado: d.desarmado } : (d.II ?? { ligado: false, desarmado: false });
              return (
                <button key={l} onClick={() => acoes.alternarLado(d.id, l)} title={lado.desarmado ? 'Rearmar' : lado.ligado ? 'Desligar' : 'Ligar'}>
                  {lado.desarmado ? `Rearmar ${l}` : lado.ligado ? `Desligar ${l}` : `Ligar ${l}`}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="numeros">
        <div><span className="num grande">{info.ib.toFixed(1).replace('.', ',')} A</span><span>carga (Ib)</span></div>
        <div><span className="num grande">{d.corrente} A</span><span>disjuntor (In)</span></div>
        <div>
          <span className="num grande">{info.iz !== null ? `${info.iz} A` : '—'}</span>
          <span>{info.bitolaFase !== null ? `cabo ${mm(info.bitolaFase)} (Iz)` : 'sem cabo na saída'}</span>
        </div>
      </div>
      <p className="campo-dica">Regra de ouro: carga ≤ disjuntor ≤ cabo. Ib considera tudo que ele alimenta ligado junto.</p>

      {sug && !d.geral && (sug.corrente !== d.corrente || (info.bitolaFase !== null && sug.bitola !== info.bitolaFase)) && (
        <div className="sugestao">
          <span>Sugestão: disjuntor <b>{sug.corrente} A</b> com cabos de <b>{mm(sug.bitola)}</b> (fase e neutro do circuito).</span>
          <button onClick={() => acoes.aplicarSugestao(d.id, sug.corrente, sug.bitola)}>Aplicar</button>
        </div>
      )}

      <ul className="alertas">
        {alertas.map((a, i) => (
          <li key={i} className={`alerta alerta-${a.nivel}`}>{a.msg}</li>
        ))}
      </ul>

      {info.cargas.length > 0 && (
        <>
          <h3>Alimenta</h3>
          <div className="chips">
            {info.cargas.map((c) => (
              <button key={c.id} className="chip" onClick={() => onSelecionar({ tipo: 'peca', id: c.id })}>
                {tipoCargaInfo(c.tipoCarga).icone} {c.nome} · {c.potencia} W
              </button>
            ))}
          </div>
        </>
      )}

      <h3>Diagnóstico</h3>
      <Campo rotulo="O que está acontecendo nesse circuito?">
        <select value={d.sintoma} onChange={(e) => mudar({ sintoma: e.target.value as Sintoma })}>
          {SINTOMAS.map((s) => (
            <option key={s.valor} value={s.valor}>{s.desc}</option>
          ))}
        </select>
      </Campo>
      {dicas.length > 0 && (
        <ul className="dicas">
          {dicas.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      )}
      <Campo rotulo="Notas">
        <textarea rows={3} value={d.notas} onChange={(e) => mudar({ notas: e.target.value })} />
      </Campo>
      <div className="acoes">
        <button className="perigo" onClick={() => { acoes.removerPecas([d.id]); onSelecionar(null); }}>Remover disjuntor</button>
      </div>
    </section>
  );
}
