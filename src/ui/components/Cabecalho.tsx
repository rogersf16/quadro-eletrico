import { useRef } from 'react';

interface Props {
  nome: string;
  onNovo: () => void;
  onAbrir: (arquivo: File) => void;
  onSalvar: () => void;
}

export function Cabecalho({ nome, onNovo, onAbrir, onSalvar }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <header className="cabecalho">
      <div className="marca">
        <span className="marca-icone" aria-hidden>⚡</span>
        <div>
          <h1>Quadro Elétrico</h1>
          <p className="sub">{nome}</p>
        </div>
      </div>
      <div className="acoes">
        <button onClick={onNovo}>Novo</button>
        <button onClick={() => input.current?.click()}>Abrir .quadro</button>
        <button className="primario" onClick={onSalvar}>Salvar arquivo</button>
        <input
          ref={input}
          type="file"
          accept=".quadro,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onAbrir(f);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
