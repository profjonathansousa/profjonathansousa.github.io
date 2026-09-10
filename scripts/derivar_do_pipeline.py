#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
derivar_do_pipeline.py — marca no Cronograma o que o ARTEFATO já prova.

    python3 scripts/derivar_do_pipeline.py            # seco: só lista
    python3 scripts/derivar_do_pipeline.py --aplicar  # escreve os toques

O PROBLEMA QUE ELE RESOLVE. O mapa_portal.json declara `prova: "maquina"` como
"a etapa está feita porque o arquivo existe", mas nada lia a pasta de produção:
a marcação dependia de alguém rodar `--registrar` na sessão de Cowork certa, com
a pasta certa conectada. Auditado em 10/09/2026 contra o estado real: NENHUM
toque com aparelho "cowork" existe — nem no estado.json (247 linhas de
histórico, dois aparelhos, nenhum deles o Cowork) nem no cron_estado. A regra
sempre foi especificação, nunca comportamento, e o painel ficava atrás do
trabalho mentindo por omissão.

Este script inverte a dependência: em vez de esperar que alguém se lembre, ele
pergunta ao disco. Roda uma vez por dia e resgata retroativamente tudo o que
ficou para trás — não é preciso caçar os "não" registrados nos CONCLUIDO.

ONDE RODA. Só onde a pasta de produção existe, isto é, no Mac. O GitHub Actions
não enxerga o iCloud, e por isso a derivação NÃO pode viver no
dobrar-toques.yml: ausência da pasta não é erro, é o caso normal de lá — o
script sai limpo, com código 0, sem escrever nada.

AS CINCO REGRAS DURAS, e cada uma existe por um caso concreto:

  1. NUNCA toca em subitem de prova "estrela". A conclusão é decisão do autor, e
     o relógio do Cowork venceria essa decisão e a apagaria. A regra já vive no
     registrar(), e daqui ela NÃO é contornada com --forcar.
  2. NUNCA rebaixa. Se o artefato sumiu, não emite toque nenhum: só reporta a
     divergência. Um arquivo apagado por engano não pode apagar o histórico.
  3. NUNCA sobrescreve vida "inaplicavel". O a00-3 é o caso de teste: o mapa
     argumentativo não existe e não deve existir, porque o artigo foi importado.
  4. NUNCA edita o estado.json. O escritor único continua sendo o
     dobrar_toques.py, e este script fala com ele por toque, como um aparelho.
  5. NUNCA adivinha o slug. O mapa descreve os artefatos com [slug] no caminho e
     o entrada.json identifica as peças por título; casar os dois por heurística
     erraria em silêncio. Projeto sem `slug` é PULADO com aviso.

O MODO PADRÃO É SECO, e imprime sempre a lista do que faria.
"""

import json
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ_ENTRADA = os.path.join(RAIZ, "Cronograma", "entrada.json")
ARQ_ESTADO = os.path.join(RAIZ, "Cronograma", "estado.json")
DOBRAR = os.path.join(RAIZ, "scripts", "dobrar_toques.py")

VAR_PASTA = "PASTA_PRODUCAO"
PASTA_PADRAO = os.path.expanduser(
    "~/Library/Mobile Documents/com~apple~CloudDocs/06_PRODUCAO_COWORK")


def pasta_producao():
    return os.environ.get(VAR_PASTA) or PASTA_PADRAO


def ler_json(caminho, padrao=None):
    if not os.path.exists(caminho):
        return padrao
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def mapa_dos_artefatos(mapa):
    """Achata o mapa_portal.json em {sub_id: {"artefato":…, "prova":…}}.

    O FORMATO NÃO É INVENTADO AQUI. O mapa é lido como vier: procura-se, em
    qualquer profundidade, todo dicionário que tenha ao mesmo tempo um id de
    subitem e um campo `artefato`. Fixar um caminho rígido faria o script
    quebrar em silêncio no dia em que o mapa ganhasse um nível — e quebrar em
    silêncio é exatamente o defeito que ele veio corrigir.
    """
    fora = {}

    def visitar(no, chave_pai=None):
        if isinstance(no, dict):
            art = no.get("artefato")
            sid = no.get("id") or chave_pai
            if art and sid and isinstance(art, str):
                fora[str(sid)] = {"artefato": art, "prova": no.get("prova")}
            for k, v in no.items():
                visitar(v, k)
        elif isinstance(no, list):
            for x in no:
                visitar(x)

    visitar(mapa)
    return fora


def subitens_do_cronograma(entrada, estado):
    """Devolve a lista de (pid, proj, projT, slug, sub) que o Cronograma conhece."""
    fora = []
    for pid, projs in (entrada.get("paineis") or {}).items():
        for pr in (projs or []):
            for sub in (pr.get("subs") or []):
                fora.append({
                    "pid": pid,
                    "proj_id": pr.get("id"),
                    "projT": pr.get("t") or "",
                    "slug": pr.get("slug"),
                    "sub": sub,
                    "chave": "%s/%s/%s" % (pid, pr.get("id"), sub.get("id")),
                })
    return fora


def avaliar(entrada, estado, arte, raiz_producao):
    """Sem efeito colateral: classifica cada subitem e devolve as listas."""
    candidatos, divergentes, pulados = [], [], []

    for it in subitens_do_cronograma(entrada, estado):
        sub = it["sub"]
        sid = str(sub.get("id") or "")
        info = arte.get(sid)
        if not info:
            continue                                   # o mapa não fala dele

        prova = sub.get("prova") or info.get("prova")
        if prova != "maquina":
            continue                                   # regra 1

        atual = (estado.get("itens") or {}).get(it["chave"]) or {}
        vida = atual.get("vida") or sub.get("vida") or "ativo"
        if vida == "inaplicavel":
            continue                                   # regra 3

        st = atual.get("st")
        if st is None:
            st = sub.get("st") or 0

        caminho_rel = info["artefato"]
        if "[slug]" in caminho_rel:
            if not it["slug"]:
                pulados.append((it["chave"], "projeto sem `slug` no entrada.json"))
                continue                               # regra 5
            caminho_rel = caminho_rel.replace("[slug]", it["slug"])

        existe = os.path.exists(os.path.join(raiz_producao, caminho_rel))

        if existe and st < 2:
            candidatos.append({"chave": it["chave"], "de": st,
                               "artefato": caminho_rel, "subT": sub.get("t") or ""})
        elif not existe and st >= 2:
            divergentes.append((it["chave"], caminho_rel))   # regra 2

    return candidatos, divergentes, pulados


def emitir(chave, aplicar):
    """Fala com o dobrar_toques.py, que continua sendo o escritor único (regra 4)."""
    cmd = [sys.executable, DOBRAR, "--registrar", chave, "--para", "2"]
    if not aplicar:
        cmd.append("--seco")
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def main():
    aplicar = "--aplicar" in sys.argv
    raiz = pasta_producao()

    if not os.path.isdir(raiz):
        print("Pasta de producao ausente: %s" % raiz)
        print("Nada a derivar. (Ausencia de pasta nao e erro: e o caso do Actions.)")
        print("Para apontar outra, defina %s no ambiente." % VAR_PASTA)
        return 0

    mapa = ler_json(os.path.join(raiz, "mapa_portal.json"))
    if mapa is None:
        print("Sem mapa_portal.json em %s — nada a derivar." % raiz)
        return 0

    entrada = ler_json(ARQ_ENTRADA)
    if entrada is None:
        print("Sem %s — nada a derivar." % os.path.relpath(ARQ_ENTRADA, RAIZ))
        return 0
    estado = ler_json(ARQ_ESTADO, {}) or {}

    arte = mapa_dos_artefatos(mapa)
    if not arte:
        print("O mapa_portal.json nao declarou nenhum `artefato`. Nada a derivar.")
        return 0

    candidatos, divergentes, pulados = avaliar(entrada, estado, arte, raiz)

    print("Pasta de producao: %s" % raiz)
    print("Subitens com artefato declarado no mapa: %d" % len(arte))
    print("")

    for chave, motivo in pulados:
        print("PULADO  %s  (%s)" % (chave, motivo))
    for chave, caminho in divergentes:
        print("DIVERGE %s  esta marcado, e o artefato nao existe: %s" % (chave, caminho))
        print("        Nenhum toque foi emitido: este script nunca rebaixa.")
    if pulados or divergentes:
        print("")

    if not candidatos:
        print("Nada a marcar: todo artefato presente ja tem a etapa concluida.")
        return 0

    print("A MARCAR (%d):" % len(candidatos))
    for c in candidatos:
        print("  %s  st %s -> 2" % (c["chave"], c["de"]))
        print("      %s" % c["subT"])
        print("      artefato: %s" % c["artefato"])
    print("")

    if not aplicar:
        print("--seco (padrao): nada foi escrito. Repita com --aplicar.")
        return 0

    falhas = 0
    for c in candidatos:
        codigo, saida = emitir(c["chave"], True)
        marca = "ok" if codigo == 0 else "FALHOU"
        print("%s  %s" % (marca, c["chave"]))
        for linha in saida.strip().split("\n"):
            print("      " + linha)
        if codigo != 0:
            falhas += 1
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
