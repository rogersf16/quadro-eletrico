import type { ReactNode } from 'react';

// Rótulo + controle, usado em todos os formulários.
export function Campo({ rotulo, children, dica }: { rotulo: string; children: ReactNode; dica?: string }) {
  return (
    <label className="campo">
      <span className="campo-rotulo">{rotulo}</span>
      {children}
      {dica && <span className="campo-dica">{dica}</span>}
    </label>
  );
}

export function Selo({ nivel }: { nivel: 'erro' | 'aviso' | 'ok' }) {
  const txt = { erro: 'Problema', aviso: 'Atenção', ok: 'OK' }[nivel];
  return <span className={`selo selo-${nivel}`}>{txt}</span>;
}
