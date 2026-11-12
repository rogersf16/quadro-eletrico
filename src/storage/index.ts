import { config } from '../config';
import { criarRepositorioApi } from './api';
import { repositorioLocal } from './local';
import type { Repositorio } from './repositorio';

export type { Repositorio } from './repositorio';
export { exportarArquivo, importarArquivo } from './arquivo';

// Ponto único que escolhe o backend conforme a config.
export const repositorio: Repositorio =
  config.armazenamento === 'api' ? criarRepositorioApi(config.apiUrl) : repositorioLocal;
