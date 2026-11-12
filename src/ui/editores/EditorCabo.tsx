import { BITOLAS, CONDUTORES, CORES_CABO, capacidadeFio, condutorInfo } from '../../core/catalogo';
import { borneInfo, montarRede, estaFechado, rotuloPotencial } from '../../core/rede';
import { correntesDosCabos, simular } from '../../core/simulacao';
import type { Cabo, Condutor, Projeto } from '../../core/types';
import { Campo, Selo } from '../components/Campo';
import type { Acoes } from '../useProjeto';

interface Props {
  cabo: Cabo;
  projeto: Projeto;
  acoes: Acoes;
  onFechar: () => void;
}

const nomePonta = (p: Projeto, peca: string, borne: string) => {
  const x = p.pecas.find((k) => k.id === peca);
  const b = borneInfo(p, peca, borne);
  if (!x) return '?';
  if (x.tipo === 'emenda') return x.nome;
  const lado = borne.startsWith('in:') ? 'entrada ' : borne.startsWith('out:') ? 'saída ' : borne.startsWith('inII:') ? 'entrada II ' : borne.startsWith('outII:') ? 'saída II ' : '';
  return `${x.nome} · ${lado}${b?.rotulo ?? borne}`;
};

export function EditorCabo({ cabo, projeto: p, acoes, onFechar }: Props) {
  const mudar = (m: Partial<Cabo>) => acoes.atualizarCabo(cabo.id, m);
  const ent = p.pecas.find((x) => x.tipo === 'entrada');
  const rede = montarRede(p, { fechado: estaFechado, faltando: ent?.tipo === 'entrada' ? ent.faltando : [] });
  const pot = rotuloPotencial(rede.potencial(cabo.de.peca, cabo.de.borne));
  const carga = correntesDosCabos(p, simular(p))[cabo.id];
  const fmtA = (n: number) => `${n.toFixed(1).replace('.', ',')} A`;

  return (
    <section className="painel editor">
      <div className="editor-topo">
        <h2>
          <span className="amostra-cabo" style={{ background: cabo.cor }} /> Cabo {condutorInfo(cabo.condutor).desc.toLowerCase()}
        </h2>
        <button onClick={onFechar} aria-label="Fechar">✕</button>
      </div>
      <p className="ligacao">
        {nomePonta(p, cabo.de.peca, cabo.de.borne)} <span aria-hidden>⟷</span> {nomePonta(p, cabo.para.peca, cabo.para.borne)}
      </p>
      <p className="campo-dica">Agora: {pot || 'sem potencial'}</p>
      {carga && carga.corrente > 0 && (
        <p className="campo-dica">
          {carga.sobrecarga && <Selo nivel="erro" />} Passando {fmtA(carga.corrente)} de ~{carga.capacidade} A que esse cabo aguenta
          {carga.sobrecarga &&
            (carga.bitolaMinima
              ? `. Troque por ${String(carga.bitolaMinima).replace('.', ',')} mm² ou mais.`
              : '. Nem 35 mm² aguenta: divida a carga.')}
        </p>
      )}

      <Campo rotulo="Bitola (seção do cobre)" dica={`Aguenta ~${capacidadeFio(cabo.bitola)} A embutido em eletroduto. Vem impressa na capa do fio.`}>
        <div className="opcoes-bitola">
          {BITOLAS.map((b) => (
            <button key={b} className={cabo.bitola === b ? 'ativo' : ''} onClick={() => mudar({ bitola: b })}>
              {String(b).replace('.', ',')}
            </button>
          ))}
        </div>
      </Campo>

      <Campo rotulo="Função do condutor">
        <select
          value={cabo.condutor}
          onChange={(e) => {
            const condutor = e.target.value as Condutor;
            // Se a cor ainda era a padrão do condutor antigo, troca junto.
            const corPadraoAntiga = condutorInfo(cabo.condutor).corPadrao;
            mudar({ condutor, ...(cabo.cor === corPadraoAntiga ? { cor: condutorInfo(condutor).corPadrao } : {}) });
          }}
        >
          {CONDUTORES.map((c) => (
            <option key={c.valor} value={c.valor}>{c.desc}</option>
          ))}
        </select>
      </Campo>

      <Campo rotulo="Cor da capa">
        <div className="cores">
          {CORES_CABO.map((c) => (
            <button
              key={c.valor}
              className={`cor ${cabo.cor === c.valor ? 'ativo' : ''}`}
              style={{ background: c.valor }}
              onClick={() => mudar({ cor: c.valor })}
              title={c.nome}
              aria-label={c.nome}
            />
          ))}
        </div>
      </Campo>

      <label className="check irregular-check">
        <input type="checkbox" checked={cabo.foraDoPadrao} onChange={(e) => mudar({ foraDoPadrao: e.target.checked })} />
        Ligação fora do padrão (gambiarra) · só anotação
      </label>

      <Campo rotulo="Notas" dica="Ex.: emenda com fita isolante dentro da caixa da cozinha.">
        <textarea rows={3} value={cabo.notas} onChange={(e) => mudar({ notas: e.target.value })} />
      </Campo>

      <p className="campo-dica">
        <b>Caminho do cabo:</b> com ele selecionado, arraste os <b>+</b> no meio de cada trecho pra criar dobras. Arraste
        as bolinhas pra mover e dê duplo clique pra remover.
      </p>
      <div className="acoes">
        <button onClick={() => acoes.definirPontos(cabo.id, [])} disabled={!cabo.pontos.length}>Endireitar</button>
        <button
          onClick={() => {
            const { de, para } = cabo;
            mudar({ de: para, para: de, pontos: [...cabo.pontos].reverse() });
          }}
          title="Só muda o sentido do desenho"
        >
          Inverter
        </button>
        <button className="perigo" onClick={() => { acoes.removerCabos([cabo.id]); onFechar(); }}>Remover cabo</button>
      </div>
    </section>
  );
}
