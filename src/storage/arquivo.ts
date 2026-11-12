import { desserializar, nomeArquivo, serializar } from '../core/projeto';
import type { Projeto } from '../core/types';

// Gera o arquivo .quadro e dispara o download no navegador.
export function exportarArquivo(p: Projeto) {
  const blob = new Blob([serializar(p)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo(p);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importarArquivo(arquivo: File): Promise<Projeto> {
  return desserializar(await arquivo.text());
}
