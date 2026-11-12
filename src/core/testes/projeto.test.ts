import { describe, expect, it } from 'vitest';
import { bitolaPara, desserializar, nomeArquivo, serializar } from '../projeto';
import { capacidadeFio } from '../catalogo';
import { simular } from '../simulacao';
import type { PecaDisjuntor } from '../types';
import { acha, base, comCircuito } from './montar';

describe('arquivo .quadro', () => {
  it('salvar e abrir devolve o mesmo projeto', () => {
    const p = comCircuito(base());
    const volta = desserializar(serializar(p));
    expect(volta.pecas).toEqual(p.pecas);
    expect(volta.cabos).toEqual(p.cabos);
  });

  it('JSON quebrado dá mensagem amigável', () => {
    expect(() => desserializar('{oi')).toThrow(/JSON corrompido/);
  });

  it('arquivo de outro programa é recusado', () => {
    expect(() => desserializar(JSON.stringify({ app: 'outro' }))).toThrow(/não foi gerado/);
  });

  it('versão desconhecida é recusada', () => {
    expect(() => desserializar(JSON.stringify({ app: 'quadro-eletrico', versao: 99, pecas: [], cabos: [] }))).toThrow(/não suportada/);
  });

  it('peça "transferencia" antiga vira disjuntor com transferência e os cabos são remapeados', () => {
    const p = base();
    const antigo = {
      ...p,
      pecas: [...p.pecas, { id: 't1', tipo: 'transferencia', nome: 'Gerador/Rua', notas: '', pos: { x: 0, y: 0 }, polos: 2, posicao: 'II' }],
      cabos: [...p.cabos, { ...p.cabos[0], id: 'k', para: { peca: 't1', borne: 'II:1' } }],
    };
    const novo = desserializar(JSON.stringify(antigo));
    expect(acha<PecaDisjuntor>(novo, 't1')).toMatchObject({ tipo: 'disjuntor', transferencia: true, ligado: false, II: { ligado: true } });
    expect(novo.cabos.find((c) => c.id === 'k')!.para.borne).toBe('inII:1');
  });
});

describe('migração v2 → v3', () => {
  it('circuito antigo vira disjuntor + carga ligados e funcionando', () => {
    const v2 = {
      app: 'quadro-eletrico', versao: 2, nome: 'Casa velha', fornecimento: 'bi',
      geral: { corrente: 50, polos: 2, ligado: true },
      circuitos: [{
        id: 'c1', nome: 'Tomadas', tipo: 'tomada', potencia: 1270, tensao: 127, bitola: 2.5, fases: ['A'],
        disjuntor: { corrente: 20, polos: 1, curva: 'C' }, sintoma: 'nenhum', notas: '', ligado: true, pos: { x: 0, y: 0 },
      }],
    };
    const p = desserializar(JSON.stringify(v2));
    expect(p.versao).toBe(3);
    expect(acha<PecaDisjuntor>(p, 'c1')).toMatchObject({ tipo: 'disjuntor', corrente: 20 });
    const carga = p.pecas.find((x) => x.tipo === 'carga')!;
    expect(simular(p).cargas[carga.id].funciona).toBe(true);
  });
});

describe('nomeArquivo', () => {
  it('tira acento e espaço', () => {
    expect(nomeArquivo({ ...base(), nome: 'Casa da Vó Zé' })).toBe('casa-da-vo-ze.quadro');
    expect(nomeArquivo({ ...base(), nome: '' })).toBe('quadro.quadro');
  });
});

describe('catálogo', () => {
  it('capacidade dos fios (NBR 5410, B1)', () => {
    expect(capacidadeFio(2.5)).toBe(24);
    expect(capacidadeFio(2.5, 3)).toBe(21);
    expect(capacidadeFio(7)).toBe(0);
  });

  it('bitolaPara escolhe o menor fio que aguenta o disjuntor', () => {
    expect(bitolaPara(20)).toBe(2.5);
    expect(bitolaPara(50)).toBe(10);
    expect(bitolaPara(999)).toBe(35);
  });
});
