// Configuração lida das variáveis de ambiente (arquivo .env). Só variáveis com prefixo VITE_ chegam no navegador.
export const config = {
  // 'local' = salva no navegador; 'api' = salva num servidor próprio (VITE_API_URL)
  armazenamento: (import.meta.env.VITE_ARMAZENAMENTO ?? 'local') as 'local' | 'api',
  apiUrl: (import.meta.env.VITE_API_URL ?? '/api') as string,
};
