#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dobrar_toques.py — dobra os toques do Cronograma em estado.json.

O DESENHO, em uma frase: o aparelho escreve toques (arquivo novo, nunca
editado), e este script os dobra num estado só. É o Passo 5 da reforma.

POR QUE ASSIM. Dois aparelhos podem tocar o mesmo item no mesmo dia. Se os dois
editassem um arquivo comum, um sobrescreveria o outro em silêncio. Escrevendo
cada um o SEU arquivo, nada colide: a conciliação acontece aqui, uma vez, com
ordem explícita — vence o toque mais recente por relógio.

UM ESCRITOR SÓ. Só este script escreve estado.json. Ninguém edita à mão, e o
Cronograma nunca escreve nele: o Cronograma escreve toques.

NADA SE PERDE. Um toque dobrado sai da pasta, mas o seu conteúdo fica em
`historico` dentro do estado.json, e o id fica em `_ids_dobrados` para que rodar
duas vezes não conte duas vezes. Toque que este script não entende continua onde
está, e é relatado no fim.

USO:
    python3 scripts/dobrar_toques.py            # dobra e relata
    python3 scripts/dobrar_toques.py --seco     # só relata, não escreve nada
"""

import json
import os
import shutil
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_TOQUES = os.path.join(RAIZ, "Cronograma", "toques")
DIR_DOBRADOS = os.path.join(DIR_TOQUES, "_dobrados")
ARQ_ESTADO = os.path.join(RAIZ, "Cronograma", "estado.json")
ESTADO_VERSAO = 1


def estado_vazio():
    return {
        "_versao": ESTADO_VERSAO,
        "_o_que_e": ("Estado consolidado do Cronograma. Escrito SO por "
                     "scripts/dobrar_toques.py, a partir dos arquivos de "
                     "Cronograma/toques/. Nao editar a mao."),
        "_escritor": "scripts/dobrar_toques.py",
        "_dobrado_em": None,
        "itens": {},
        "historico": [],
        "_ids_dobrados": [],
    }


def carregar_estado():
    if not os.path.exists(ARQ_ESTADO):
        return estado_vazio()
    with open(ARQ_ESTADO, encoding="utf-8") as f:
        e = json.load(f)
    for k, v in estado_vazio().items():
        e.setdefault(k, v)
    return e


def ler_arquivo_de_toques(caminho):
    """Aceita as duas formas: o lote (varios toques num arquivo) e o toque
    solto. A pagina pode gravar de um jeito ou de outro conforme a constante
    TOQUES_POR_ARQUIVO, e este lado nao precisa saber qual esta em uso."""
    with open(caminho, encoding="utf-8") as f:
        dado = json.load(f)
    if isinstance(dado, dict) and isinstance(dado.get("toques"), list):
        return dado["toques"]
    if isinstance(dado, dict) and dado.get("id"):
        return [dado]
    if isinstance(dado, list):
        return dado
    raise ValueError("forma desconhecida")


def chave(t):
    """Um item e identificado por painel/projeto/subitem. O titulo NAO entra na
    chave: renomear um item nao pode criar um item novo — foi exatamente esse o
    defeito que o log por id consertou no Passo 4."""
    d = t.get("dados") or {}
    return "%s/%s/%s" % (d.get("pid"), d.get("projId"), d.get("subId"))


def dobrar(estado, toques):
    ja = set(estado["_ids_dobrados"])
    novos = [t for t in toques if t.get("id") and t["id"] not in ja]
    # Ordem por relogio, nao por ordem de leitura do diretorio: quem chega
    # depois no tempo e quem manda no estado final.
    novos.sort(key=lambda t: t.get("quando") or "")
    atrasados = 0
    for t in novos:
        d = t.get("dados") or {}
        if not d.get("subId"):
            continue
        # Toque atrasado NAO derruba estado mais novo. Acontece de verdade: voce
        # toca no Mac sem rede as 10h, toca no celular as 10h05 com rede, e o Mac
        # so consegue enviar depois. O toque das 10h e novo para esta funcao (id
        # nunca visto) mas velho para o item. Ele entra no historico do mesmo
        # jeito — nada se perde —, so nao manda no estado.
        atual = estado["itens"].get(chave(t))
        if atual and (atual.get("quando") or "") > (t.get("quando") or ""):
            estado["historico"].append(t)
            estado["_ids_dobrados"].append(t["id"])
            atrasados += 1
            continue
        estado["itens"][chave(t)] = {
            "st": d.get("para"),
            "vida": d.get("vida", "ativo"),
            "temMotivo": bool(d.get("temMotivo")),
            "projT": d.get("projT"),
            "subT": d.get("subT"),
            "quando": t.get("quando"),
            "aparelho": t.get("aparelho"),
        }
        estado["historico"].append(t)
        estado["_ids_dobrados"].append(t["id"])
    if atrasados:
        print("Toques atrasados (guardados no historico, sem mandar no estado): %d" % atrasados)
    return novos


def guardar_dobrado(caminho):
    """O Cowork nao apaga: tenta apagar e, se o sistema recusar (a pasta montada
    bloqueia remocao ate voce autorizar), move para _dobrados/ e avisa. O que
    nao se faz e deixar o arquivo em toques/, porque a proxima rodada o leria de
    novo — sem erro, gracas ao _ids_dobrados, mas sem fim."""
    try:
        os.remove(caminho)
        return "apagado"
    except OSError:
        os.makedirs(DIR_DOBRADOS, exist_ok=True)
        destino = os.path.join(DIR_DOBRADOS, os.path.basename(caminho))
        n = 1
        while os.path.exists(destino):
            base, ext = os.path.splitext(os.path.basename(caminho))
            destino = os.path.join(DIR_DOBRADOS, "%s_%d%s" % (base, n, ext))
            n += 1
        shutil.move(caminho, destino)
        return "movido"


def main():
    seco = "--seco" in sys.argv

    if not os.path.isdir(DIR_TOQUES):
        print("Nao existe %s. Rode um `git pull` primeiro: os toques sobem do" % DIR_TOQUES)
        print("aparelho direto para o GitHub, e a copia local so os ve depois do pull.")
        return 0

    arquivos = sorted(a for a in os.listdir(DIR_TOQUES)
                      if a.endswith(".json") and not a.startswith("."))
    if not arquivos:
        print("Nenhum toque esperando em Cronograma/toques/.")
        return 0

    estado = carregar_estado()
    antes = len(estado["_ids_dobrados"])
    lidos, ilegiveis, dobrados_agora = [], [], []

    for a in arquivos:
        caminho = os.path.join(DIR_TOQUES, a)
        try:
            ts = ler_arquivo_de_toques(caminho)
        except Exception as e:
            ilegiveis.append((a, str(e)))
            continue
        lidos.append((caminho, ts))
        dobrados_agora.extend(ts)

    novos = dobrar(estado, dobrados_agora)

    print("Arquivos lidos:      %d" % len(lidos))
    print("Toques dentro deles: %d" % len(dobrados_agora))
    print("Novos (nao dobrados antes): %d" % len(novos))
    print("Itens no estado:     %d" % len(estado["itens"]))

    if seco:
        print("\n--seco: nada foi escrito nem movido.")
        for t in novos:
            d = t.get("dados") or {}
            print("  %s  %s / %s  ->  st=%s vida=%s" % (
                (t.get("quando") or "")[:16], d.get("projT"), d.get("subT"),
                d.get("para"), d.get("vida")))
        return 0

    # So anda para a frente. Um arquivo antigo que reaparece (um pull que traz de
    # volta o que ja foi dobrado) nao pode fazer a marca do estado recuar.
    marca = max([(t.get("quando") or "") for t in dobrados_agora] + [estado.get("_dobrado_em") or ""])
    estado["_dobrado_em"] = marca or None
    with open(ARQ_ESTADO, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
        f.write("\n")
    if novos:
        print("estado.json gravado (%d -> %d toques dobrados no total)." % (antes, len(estado["_ids_dobrados"])))
    else:
        print("Nada novo para dobrar: estes toques ja tinham sido dobrados antes.")

    apagados = movidos = 0
    for caminho, _ in lidos:
        if guardar_dobrado(caminho) == "apagado":
            apagados += 1
        else:
            movidos += 1
    if apagados:
        print("Arquivos de toque apagados: %d" % apagados)
    if movidos:
        print("Arquivos movidos para toques/_dobrados/: %d" % movidos)
        print("  (a remocao foi recusada pelo sistema; apague a pasta quando quiser)")
    if ilegiveis:
        print("\nNAO ENTENDIDOS, e por isso deixados onde estao:")
        for a, e in ilegiveis:
            print("  %s  —  %s" % (a, e))
    return 0


if __name__ == "__main__":
    sys.exit(main())
