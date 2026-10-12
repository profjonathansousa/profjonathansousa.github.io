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

O MAPA mora em 08_SISTEMA/configuracao/mapa_portal.json desde a reorganização
da pasta de produção de 15/09 (antes, na raiz; os dois lugares valem, nessa
ordem). Pasta presente e mapa ausente é erro, com código 1: foi o silêncio de
um "nada a derivar" com código 0 que escondeu a mudança de lugar.

O ESTADO É O DO BANCO (correção de 2026-10-12). Até aqui ele decidia pelo
Cronograma/estado.json, que parou em 10/09, quando a 9G-3 cortou a dobra dos
aparelhos: dava como "a fazer" etapas que você já tinha fechado no celular.
Decidindo por ele, o script remarcava o que já estava marcado e, junto com o
--registrar antigo, podia apagar adiamentos e motivos seus. Agora ele lê o
cron_estado, numa consulta por painel, com as mesmas SUPABASE_URL e
SUPABASE_SECRET_KEY que a escrita já exigia. Sem elas, o --aplicar RECUSA; o
modo seco ainda confere o mapa e o disco, mas avisa que não sabe o estado e não
diz o que marcaria.

AS REGRAS DURAS, e cada uma existe por um caso concreto:

  1. NUNCA toca em subitem de prova "estrela". A conclusão é decisão do autor, e
     o relógio do Cowork venceria essa decisão e a apagaria. A regra já vive no
     registrar(), e daqui ela NÃO é contornada com --forcar.
  2. NUNCA rebaixa. Se o artefato sumiu, não emite toque nenhum: só reporta a
     divergência. Um arquivo apagado por engano não pode apagar o histórico.
  3. NUNCA passa por cima de etapa que não está ativa. "Não se aplica" nem é
     avaliada — o a00-3 é o caso de teste: o mapa argumentativo não existe e
     não deve existir, porque o artigo foi importado. Adiada, abandonada ou
     arquivada com o artefato presente é PULADA com aviso, todo dia, até você
     decidir no aplicativo: o Cowork só marca etapa ativa (decidido em
     2026-10-12).
  4. NUNCA lê nem edita o estado.json. O escritor único continua sendo o
     dobrar_toques.py, e este script fala com ele por toque, como um aparelho.
  5. NUNCA adivinha o slug. O mapa descreve os artefatos com [slug] no caminho e
     o entrada.json identifica as peças por título; casar os dois por heurística
     erraria em silêncio. Projeto sem `slug` é PULADO com aviso.
  6. NUNCA marca por caminho que o próprio mapa diz não conferido
     (`confirmar: true`). É PULADO com a nota do mapa.
  7. NUNCA usa um caminho sem [slug] para uma etapa que o mapa descreve por
     padrão (aNN-4). Ele seria o mesmo arquivo para as treze peças, e, se
     existisse, marcaria a etapa de todas de uma vez. É PULADO com aviso.

O MODO PADRÃO É SECO, e imprime sempre a lista do que faria.
"""

import json
import os
import re
import subprocess
import sys
import textwrap

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARQ_ENTRADA = os.path.join(RAIZ, "Cronograma", "entrada.json")
DOBRAR = os.path.join(RAIZ, "scripts", "dobrar_toques.py")

# A LEITURA DO BANCO E A MESMA DO --registrar, e nao uma segunda copia dela:
# credenciais, dono e consulta vem do dobrar_toques.py. Escrever continua sendo
# so com ele, por toque (regra 4).
sys.path.insert(0, os.path.join(RAIZ, "scripts"))
import dobrar_toques as T                                    # noqa: E402

VAR_PASTA = "PASTA_PRODUCAO"
PASTA_PADRAO = os.path.expanduser(
    "~/Library/Mobile Documents/com~apple~CloudDocs/06_PRODUCAO_COWORK")

# ONDE O MAPA MORA, em ordem: o primeiro que existir vale. A reorganizacao da
# pasta de producao de 15/09 levou o mapa da raiz para 08_SISTEMA/configuracao/,
# e este script continuou procurando na raiz: dizia "nada a derivar" e saia com
# codigo 0, todo dia, sem ninguem saber. A raiz fica como segundo lugar, para
# uma pasta que ainda nao tenha sido reorganizada.
LUGARES_DO_MAPA = (os.path.join("08_SISTEMA", "configuracao", "mapa_portal.json"),
                   "mapa_portal.json")


def pasta_producao():
    return os.environ.get(VAR_PASTA) or PASTA_PADRAO


def achar_mapa(raiz):
    for rel in LUGARES_DO_MAPA:
        if os.path.isfile(os.path.join(raiz, rel)):
            return rel
    return None


def ler_json(caminho, padrao=None):
    if not os.path.exists(caminho):
        return padrao
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def padroes_do_id(sub_id):
    """Devolve os padroes que um id CONCRETO pode ter no mapa, em ordem.

    O MAPA FALA POR PADRAO, O CRONOGRAMA POR INSTANCIA. O mapa descreve a
    esteira uma vez so — `aNN-2` — e o Cronograma tem doze pecas, `a01-2` a
    `a12-2`. Sem esta ponte, nenhum dos treze subitens do mapa casa com nenhum
    dos setenta e oito do Cronograma, e o script diz "nada a marcar" estando
    cego. Foi exatamente o que aconteceu na primeira execucao real.

    A CONVENCAO E DECLARADA, NAO ADIVINHADA. O proprio mapa diz, em
    objetivos.esteira.forma: "12 pecas unicas, uma por mes, ago/26 a jul/27.
    ids a01..a12". E `aNN` e o que ele usa para falar de todas de uma vez. A
    familia ebd usa `AAAA-MM` no lugar do ano e do mes, pela mesma razao.

    DEVOLVE CANDIDATOS, E QUEM CHAMA EXIGE CASAMENTO EXATO. Nenhum padrao e
    construido "parecido": ou o mapa tem aquela chave, ou o item nao casa e e
    reportado. E o que mantem a regra 5 de pe — nada aqui adivinha.
    """
    fora = [sub_id]
    # a01-2 -> aNN-2 ; a00-4b -> aNN-4b
    porN = re.sub(r"^([a-z]+)\d+", lambda m: m.group(1) + "N" * 2, sub_id)
    if porN != sub_id:
        fora.append(porN)
    # ebd-2026-08-1 -> ebd-AAAA-MM-1
    porData = re.sub(r"^([a-z]+)-\d{4}-\d{2}", r"\1-AAAA-MM", sub_id)
    if porData != sub_id:
        fora.append(porData)
    return fora


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
                fora[str(sid)] = {"artefato": art, "prova": no.get("prova"),
                                  "confirmar": bool(no.get("confirmar")),
                                  "nota": no.get("nota_confirmar") or ""}
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


def ler_estado_online(entrada):
    """Le do cron_estado o progresso de todos os paineis do entrada.json.

    Devolve ({"itens": {chave: valor}}, None) ou (None, motivo). O valor e o da
    linha, com `del` dentro quando ela for lapide — a mesma forma que o
    estado.json tinha, para o avaliar() nao precisar saber de onde ela veio."""
    url, chave = T._credenciais()
    if not url:
        return None, "faltam %s e/ou %s no ambiente" % (T.API_URL, T.API_CHAVE)
    try:
        dono = T._dono(url, chave)
        itens = {}
        for pid in sorted((entrada.get("paineis") or {}).keys()):
            for k, linha in T.itens_do_painel(url, chave, dono, pid).items():
                valor = dict(linha.get("valor") or {})
                if linha.get("del"):
                    valor["del"] = True
                itens[k] = valor
        return {"itens": itens}, None
    except Exception as e:
        return None, "a leitura do cron_estado falhou: %s" % e


# Como cada vida aparece no relatorio. "inaplicavel" nao aparece: e pulada em
# silencio (regra 3), porque e decisao assentada, e nao pendencia.
ROTULO_DA_VIDA = {"adiado": "adiada", "abandonado": "abandonada",
                  "arquivado": "arquivada"}


def avaliar(entrada, estado, arte, raiz_producao):
    """Sem efeito colateral: classifica cada subitem e devolve as listas.

    `estado` e {"itens": {chave: valor}} LIDO DO cron_estado, ou None quando
    nao foi possivel le-lo. Sem estado, o `de` dos candidatos e None: o
    artefato existe, mas ninguem sabe se a etapa ja esta marcada — e quem chama
    tem de dizer isso, em vez de chamar o candidato de "a marcar"."""
    candidatos, divergentes, pulados, sem_mapa = [], [], [], []
    itens = None if estado is None else (estado.get("itens") or {})

    for it in subitens_do_cronograma(entrada, estado):
        sub = it["sub"]
        sid = str(sub.get("id") or "")
        # A PONTE. O mapa fala por PADRAO (aNN-2), o Cronograma por INSTANCIA
        # (a01-2). Sem ela, nenhum dos treze subitens do mapa casa com nenhum
        # dos setenta e oito do Cronograma — foi o que aconteceu na primeira
        # execucao real, e o script disse "nada a marcar" estando cego.
        # Exige casamento EXATO com uma das formas candidatas: nada e
        # construido "parecido", e e isso que mantem a regra 5 de pe.
        info, padrao = None, None
        for cand in padroes_do_id(sid):
            if cand in arte:
                info = arte[cand]
                padrao = cand if cand != sid else None
                break
        if not info:
            # SO CONTA O QUE DEVERIA TER CASADO. Um subitem `estrela` sem
            # entrada no mapa nao e falha: ele nunca seria derivado.
            if sub.get("prova") == "maquina":
                sem_mapa.append((it["chave"], sid))
            continue

        prova = sub.get("prova") or info.get("prova")
        if prova != "maquina":
            continue                                   # regra 1

        # REGRA 6 — O MAPA AVISA, E O SCRIPT ESCUTA. `confirmar: true` quer
        # dizer, nas palavras do proprio _como_ler: "caminho inferido, ainda
        # nao verificado no disco. Nao tratar como fato." Derivar marcacao de
        # um caminho assim seria marcar por um endereco que o autor do mapa
        # declarou nao conferido — e a AUSENCIA do arquivo tambem nao provaria
        # nada, porque quem pode estar errado e o endereco.
        if info.get("confirmar"):
            pulados.append((it["chave"],
                            "o mapa marca `confirmar: true` — caminho nao verificado"
                            + ((": " + info["nota"]) if info.get("nota") else "")))
            continue

        # O ESTADO DE AGORA, do banco. Linha que nao existe e item nunca tocado
        # online: vale o `st` que a estrutura publicou, como no aparelho.
        if itens is None:
            atual, st = {}, None
        else:
            atual = itens.get(it["chave"]) or {}
            st = atual.get("st")
            if st is None:
                st = sub.get("st") or 0
        vida = atual.get("vida") or sub.get("vida") or "ativo"
        if vida == "inaplicavel":
            continue                                   # regra 3

        caminho_rel = info["artefato"]
        if "[slug]" in caminho_rel:
            if not it["slug"]:
                pulados.append((it["chave"], "projeto sem `slug` no entrada.json"))
                continue                               # regra 5
            caminho_rel = caminho_rel.replace("[slug]", it["slug"])
        elif padrao:
            # REGRA 7 — UM CAMINHO PARA TODAS AS PECAS NAO PROVA NENHUMA. O mapa
            # descreve a etapa uma vez so (aNN-4), e sem [slug] o caminho e o
            # mesmo para as treze pecas. Hoje ele aponta para um lugar que nao
            # existe e o defeito dorme; no dia em que alguem o "consertar"
            # apontando para os rascunhos da bancada, o mesmo arquivo marcaria
            # a etapa de todas as pecas de uma vez.
            pulados.append((it["chave"],
                            "o mapa descreve %s por padrao, e o caminho nao tem "
                            "[slug]: %s seria o mesmo arquivo para todas as pecas"
                            % (padrao, caminho_rel)))
            continue

        existe = os.path.exists(os.path.join(raiz_producao, caminho_rel))
        pendente = st is None or st < 2

        # A OUTRA METADE DA REGRA 3 (decidida pelo autor em 2026-10-12): etapa
        # adiada, abandonada ou arquivada e decisao dele, e o Cowork so marca
        # etapa ativa. Com o artefato presente, ela e AVISADA todo dia ate ele
        # decidir no aplicativo; sem o artefato, nao ha o que dizer.
        if atual.get("del") or vida != "ativo":
            if existe and pendente:
                pulados.append((it["chave"],
                                "etapa %s no aplicativo, com o artefato presente: "
                                "decisao sua, e a maquina so marca etapa ativa"
                                % ("apagada" if atual.get("del")
                                   else ROTULO_DA_VIDA.get(vida, vida))))
            continue

        if existe and pendente:
            candidatos.append({"chave": it["chave"], "de": st,
                               "artefato": caminho_rel, "subT": sub.get("t") or ""})
        elif not existe and st is not None and st >= 2:
            divergentes.append((it["chave"], caminho_rel))   # regra 2

    return candidatos, divergentes, pulados, sem_mapa


def imprimir_pulados(pulados):
    """Um bloco por motivo, e nao uma linha por subitem: o mesmo motivo em
    treze pecas e UMA informacao, e treze linhas iguais escondem a que difere."""
    ordem, por_motivo = [], {}
    for chave, motivo in pulados:
        if motivo not in por_motivo:
            por_motivo[motivo] = []
            ordem.append(motivo)
        por_motivo[motivo].append(chave)
    for motivo in ordem:
        chaves = por_motivo[motivo]
        print("PULADO (%d)  %s" % (len(chaves), motivo))
        print(textwrap.fill("  ".join(chaves), width=78,
                            initial_indent="    ", subsequent_indent="    "))


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

    # PASTA PRESENTE E MAPA AUSENTE E CONFIGURACAO QUEBRADA, e nao "nada a
    # derivar". A ausencia da PASTA e o caso normal do Actions; a do mapa, com a
    # pasta ali, e exatamente o silencio que escondeu a mudanca de 15/09.
    rel_mapa = achar_mapa(raiz)
    if rel_mapa is None:
        print("Sem mapa_portal.json em %s." % raiz)
        print("Procurado em: %s." % ", ".join(LUGARES_DO_MAPA))
        print("A pasta de producao existe e o mapa nao: nada foi derivado, e isso")
        print("e um erro de configuracao, nao 'esta tudo em dia'.")
        return 1
    mapa = ler_json(os.path.join(raiz, rel_mapa))

    entrada = ler_json(ARQ_ENTRADA)
    if entrada is None:
        print("Sem %s — nada a derivar." % os.path.relpath(ARQ_ENTRADA, RAIZ))
        return 0
    arte = mapa_dos_artefatos(mapa)
    if not arte:
        print("O mapa (%s) nao declarou nenhum `artefato`. Nada a derivar." % rel_mapa)
        return 0

    # O ESTADO DE AGORA, do banco. Sem ele, aplicar seria decidir as cegas, e
    # foi decidir pelo estado.json parado que fez desta rodada um risco.
    estado, sem_estado = ler_estado_online(entrada)
    if estado is None and aplicar:
        print("RECUSADO: o estado atual nao foi lido (%s)." % sem_estado)
        print("Sem ele, marcar seria decidir as cegas: remarcar o que voce ja fechou,")
        print("ou passar por cima de uma etapa que voce adiou. Nada foi escrito.")
        print("Para so conferir o mapa e o disco, rode sem --aplicar.")
        return 1

    candidatos, divergentes, pulados, sem_mapa = avaliar(entrada, estado, arte, raiz)

    print("Pasta de producao: %s" % raiz)
    print("Mapa: %s" % rel_mapa)
    print("Subitens com artefato declarado no mapa: %d" % len(arte))
    print("Casaram com o Cronograma: %d" % (len(candidatos) + len(divergentes) + len(pulados)))
    if estado is None:
        print("ESTADO ATUAL NAO LIDO (%s)." % sem_estado)
        print("  O que segue e so o que o mapa e o disco dizem: o que ja esta")
        print("  marcado, adiado ou arquivado no aplicativo nao entrou na conta.")
    print("")

    # CEGUEIRA NAO E SILENCIO. A primeira versao imprimia "nada a marcar"
    # quando NENHUM subitem do mapa casava com o Cronograma — um relatorio
    # tranquilizador sobre uma comparacao que nao aconteceu. E o mesmo tipo de
    # silencio que escondeu por tres semanas o fato de o Cowork nunca ter
    # marcado nada. Agora a falta de casamento e ruido, e nao calma.
    if sem_mapa:
        print("SEM CORRESPONDENCIA no mapa (%d subitens de prova `maquina`):" % len(sem_mapa))
        for chave, sid in sem_mapa[:8]:
            print("  %s  (id %s)" % (chave, sid))
        if len(sem_mapa) > 8:
            print("  ... e mais %d" % (len(sem_mapa) - 8))
        print("  Estes NAO foram avaliados: o mapa nao declara artefato para eles.")
        print("")

    imprimir_pulados(pulados)
    for chave, caminho in divergentes:
        print("DIVERGE %s  esta marcado, e o artefato nao existe: %s" % (chave, caminho))
        print("        Nenhum toque foi emitido: este script nunca rebaixa.")
    if pulados or divergentes:
        print("")

    if not candidatos:
        if estado is None:
            print("Nenhum artefato presente entre os subitens avaliados.")
        elif sem_mapa or pulados:
            print("Nada a marcar — mas veja acima: ha subitens que nem chegaram a")
            print("ser avaliados. Isso NAO e o mesmo que 'esta tudo em dia'.")
        else:
            print("Nada a marcar: todo artefato presente ja tem a etapa concluida.")
        return 0

    if estado is None:
        # SEM ESTADO NAO HA "A MARCAR". O artefato existe; se a etapa ja esta
        # marcada, adiada ou arquivada, so o banco sabe.
        print("ARTEFATO PRESENTE (%d) — sem o estado, isto NAO diz o que seria marcado:"
              % len(candidatos))
        for c in candidatos:
            print("  %s  %s" % (c["chave"], c["subT"]))
            print("      artefato: %s" % c["artefato"])
        print("")
        print("--seco (padrao): nada foi escrito.")
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
