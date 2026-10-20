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
  5. NUNCA adivinha a ligação peça <-> artigo. Ela vem do CONCLUIDO de cada
     artigo — as linhas "Slug:" e "Id no Cronograma:", escritas na abertura do
     artigo (até 2026-10-20, na Janela 0) — e,
     na falta, do campo slug do entrada.json; existindo os dois, têm de
     concordar. Casar título com slug por heurística erraria em silêncio. Peça
     sem ligação, ou com ligação ambígua, é PULADA com aviso.
  6. NUNCA marca por caminho que o próprio mapa diz não conferido
     (`confirmar: true`). É PULADO com a nota do mapa.
  7. NUNCA usa um caminho sem [slug] nem [drafts] para uma etapa que o mapa
     descreve por padrão (aNN-4). Ele seria o mesmo arquivo para as treze
     peças, e, se existisse, marcaria a etapa de todas de uma vez. É PULADO.

A LIGAÇÃO E OS RASCUNHOS (2026-10-12). Os rascunhos não levam slug no nome,
de propósito: a bancada guarda um artigo por vez. Por isso o mapa diz [drafts]
— a pasta de rascunhos DAQUELA peça: a bancada, quando o slug da entrada e o do
CONCLUIDO dela são o do artigo, ou a caixa dele em _pausado/ ou _arquivo/. A
bancada cujos dois arquivos discordam não é de ninguém, e o rascunho dela não
conta para peça nenhuma. Onde ler a ligação e onde moram os rascunhos é dado do
mapa (`ligacao` e `rascunhos`), e não deste código: a próxima reorganização da
pasta muda o mapa, e não o script.

O MODO PADRÃO É SECO, e imprime sempre a lista do que faria.
"""

import glob
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


def subitens_do_cronograma(entrada, estado, slugs=None):
    """Devolve a lista de (pid, proj, projT, slug, sub) que o Cronograma conhece.

    `slugs` e a ligacao ja resolvida, {(pid, proj_id): slug}. Sem ela vale o
    campo `slug` do entrada.json, que foi a unica fonte ate 2026-10-12."""
    fora = []
    for pid, projs in (entrada.get("paineis") or {}).items():
        for pr in (projs or []):
            slug = (slugs.get((pid, pr.get("id"))) if slugs is not None
                    else pr.get("slug"))
            for sub in (pr.get("subs") or []):
                fora.append({
                    "pid": pid,
                    "proj_id": pr.get("id"),
                    "projT": pr.get("t") or "",
                    "slug": slug,
                    "sub": sub,
                    "chave": "%s/%s/%s" % (pid, pr.get("id"), sub.get("id")),
                })
    return fora


# =============== A LIGACAO PECA <-> ARTIGO, e os rascunhos (2026-10-12) ===============
# O mapa descreve os artefatos com [slug] e [drafts] no caminho, e o Cronograma
# conhece as pecas por id (a00, a01...). Quem sabe de que artigo e cada peca e
# o pipeline: na Janela 0, o CONCLUIDO do artigo registra a linha "Slug:" e a
# linha "Id no Cronograma: aNN". Ate aqui a
# ligacao era um campo `slug` no Cronograma/entrada.json, que nenhuma sessao do
# Cowork consegue publicar — e por isso so o a00 o tinha. Agora ela e lida de
# onde o pipeline ja a escreve (`ligacao` no mapa), e o campo do entrada.json,
# quando existir, tem de concordar.
#
# AMBIGUIDADE NAO E ESCOLHA. O mesmo id com dois slugs, o mesmo artigo em duas
# pecas, uma caixa cujo slug nao e o do nome dela: a peca e PULADA, com o
# motivo. E a regra 5 — nada aqui adivinha.
#
# Casa "Id no Cronograma: a01", "- **Id no Cronograma:** a01" e "Id no
# Cronograma: **a00** — titulo". O placeholder ("[aNN]", "[registrar na
# Janela 0]") nao casa: artigo sem id ainda nao e peca nenhuma.
RE_ID_NO_CRONOGRAMA = re.compile(r"Id no Cronograma\W*([a-z]+\d{2})\b", re.I)
# "- Slug: x" no CONCLUIDO; "- **Slug do artigo:** x" no entrada_FILOSOFICO.md.
RE_SLUG = re.compile(r"^[ \t>*-]*Slug(?: do artigo)?\s*\**\s*:\s*\**\s*`?"
                     r"([a-z0-9]+(?:-[a-z0-9]+)*)`?\s*$", re.I | re.M)

SEM_LIGACAO = ("peca sem ligacao a um artigo: nenhum CONCLUIDO registra o 'Id no "
               "Cronograma' dela (registrado na abertura do artigo), e o entrada.json "
               "nao tem slug")

# Todo slug que a leitura da pasta de producao encontrou. E o que o LOG_PUBLICO
# esconde (ver _Redigido, abaixo do main).
VISTOS = set()


def ler_texto(caminho):
    try:
        with open(caminho, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return None


def slugs_do_texto(texto):
    return sorted(set(m.lower() for m in RE_SLUG.findall(texto or "")))


def objetivo_do_painel(mapa, pid):
    """O objetivo do mapa que descreve o painel `pid` — a esteira e o `pipeline`."""
    for obj in ((mapa or {}).get("objetivos") or {}).values():
        if isinstance(obj, dict) and obj.get("painel") == pid:
            return obj
    return None


def _slug_da_caixa(padrao, rel):
    """O pedaco do caminho que o * do padrao casou: em
    `_pausado/FILOSOFICO_*/CONCLUIDO_FILOSOFICO.md`, o slug que a caixa diz ser."""
    for p, r in zip(padrao.split("/"), rel.replace(os.sep, "/").split("/")):
        if "*" in p:
            antes, _, depois = p.partition("*")
            return r[len(antes):len(r) - len(depois)]
    return None


def ler_ligacoes(raiz, registros):
    """Le, em cada CONCLUIDO, a linha "Slug:" e a linha "Id no Cronograma:".

    Devolve ({aNN: [(slug, caminho)]}, avisos). Registro sem id e artigo que
    ainda nao passou pela Janela 0: isso nao e aviso, e o estado normal dele."""
    por_id, avisos = {}, []
    for padrao in registros or []:
        for caminho in sorted(glob.glob(os.path.join(raiz, padrao))):
            rel = os.path.relpath(caminho, raiz)
            texto = ler_texto(caminho)
            slugs = slugs_do_texto(texto)
            da_caixa = _slug_da_caixa(padrao, rel)
            VISTOS.update(slugs + ([da_caixa] if da_caixa else []))
            ids = sorted(set(m.lower() for m in RE_ID_NO_CRONOGRAMA.findall(texto or "")))
            if not ids:
                continue
            if len(ids) > 1:
                avisos.append("%s registra mais de um Id no Cronograma (%s): ignorado"
                              % (rel, ", ".join(ids)))
                continue
            if len(slugs) != 1:
                avisos.append("%s registra o Id %s, mas %s: ignorado" % (
                    rel, ids[0], "nenhum Slug" if not slugs
                    else "mais de um Slug (%s)" % ", ".join(slugs)))
                continue
            if da_caixa is not None and da_caixa != slugs[0]:
                avisos.append("%s diz Slug %s, mas a caixa e de %s: ignorado"
                              % (rel, slugs[0], da_caixa))
                continue
            por_id.setdefault(ids[0], []).append((slugs[0], rel))
    return por_id, avisos


def preparar_rascunhos(cfg, raiz, avisos):
    """Onde moram os rascunhos das pecas de um painel, e de quem e a bancada.
    None quando o mapa nao declara `rascunhos` para o painel.

    A BANCADA SO E DE ALGUEM QUANDO OS DOIS ARQUIVOS CONCORDAM. E o Passo 0 de
    toda janela (instrucoes_FILOSOFICO.md, "A bancada"): o slug da entrada e o
    do CONCLUIDO, iguais. Discordando, os rascunhos dela nao contam para peca
    nenhuma — atribui-los a um dos dois seria escolher. Faltando um dos dois, a
    bancada esta vazia ou o artigo acabou de abrir, e ainda nao e de ninguem."""
    if not isinstance(cfg, dict):
        return None
    vistos = []
    for rel in cfg.get("slug_da_bancada_em") or []:
        texto = ler_texto(os.path.join(raiz, rel))
        if texto is None:
            vistos = []
            break
        s = slugs_do_texto(texto)
        VISTOS.update(s)
        vistos.append((rel, s[0] if len(s) == 1 else None))
    dono = None
    if vistos:
        unicos = set(s for _, s in vistos)
        if len(unicos) == 1 and None not in unicos:
            dono = unicos.pop()
        else:
            avisos.append("a bancada nao e de ninguem: %s. Os rascunhos dela nao "
                          "contam para peca nenhuma." % ", ".join(
                              "%s diz %s" % (r, s or "?") for r, s in vistos))
    return {"bancada": cfg.get("bancada"), "dono_da_bancada": dono,
            "caixas": list(cfg.get("caixas") or [])}


def preparar_ligacao(mapa, entrada, raiz):
    """Resolve o slug do artigo de cada peca do entrada.json e onde moram os
    rascunhos de cada painel. Devolve (contexto, avisos), e o contexto e o que o
    avaliar() recebe."""
    slugs, origem, motivos, rascunhos, avisos = {}, {}, {}, {}, []
    for pid, projs in (entrada.get("paineis") or {}).items():
        obj = objetivo_do_painel(mapa, pid) or {}
        lig = obj.get("ligacao") if isinstance(obj.get("ligacao"), dict) else {}
        por_id, av = ler_ligacoes(raiz, lig.get("registros"))
        avisos.extend(av)
        pecas_do_artigo = {}
        for aid, lista in por_id.items():
            for slug, _ in lista:
                pecas_do_artigo.setdefault(slug, set()).add(aid)
        for pr in (projs or []):
            pr_id = str(pr.get("id") or "")
            k = (pid, pr.get("id"))
            achados = por_id.get(pr_id.lower(), [])
            do_concluido = sorted(set(s for s, _ in achados))
            da_entrada = pr.get("slug")
            if da_entrada:
                VISTOS.add(da_entrada)
            if len(do_concluido) > 1:
                motivos[k] = ("ligacao ambigua: o CONCLUIDO liga %s a mais de um "
                              "artigo (%s)" % (pr_id, ", ".join(do_concluido)))
            elif do_concluido:
                s = do_concluido[0]
                outras = sorted(pecas_do_artigo.get(s, set()) - {pr_id.lower()})
                if outras:
                    motivos[k] = ("ligacao ambigua: o artigo %s esta ligado tambem a %s"
                                  % (s, ", ".join(outras)))
                elif da_entrada and da_entrada != s:
                    motivos[k] = ("ligacao em conflito: o CONCLUIDO diz %s e o "
                                  "entrada.json diz %s" % (s, da_entrada))
                else:
                    slugs[k], origem[k] = s, achados[0][1]
            elif da_entrada:
                slugs[k], origem[k] = da_entrada, "Cronograma/entrada.json"
        rascunhos[pid] = preparar_rascunhos(obj.get("rascunhos"), raiz, avisos)
    return ({"slugs": slugs, "origem": origem, "motivos": motivos,
             "rascunhos": rascunhos}, avisos)


def caminhos_da_peca(artefato, slug, rasc):
    """Onde o artefato DESTA peca pode estar, relativo a pasta de producao. O
    [drafts] e a bancada, se ela for do artigo, e as caixas dele."""
    if "[drafts]" not in artefato:
        return [artefato.replace("[slug]", slug)]
    pastas = []
    if rasc.get("bancada") and rasc.get("dono_da_bancada") == slug:
        pastas.append(rasc["bancada"])
    pastas.extend(c.replace("[slug]", slug) for c in rasc.get("caixas") or [])
    return [artefato.replace("[drafts]", p).replace("[slug]", slug) for p in pastas]


def imprimir_ligacao(contexto, avisos):
    """Diz, antes de tudo, quais pecas estao ligadas a qual artigo e de quem e a
    bancada: e o que explica um "PULADO" la embaixo antes que ele apareca."""
    slugs, origem = contexto.get("slugs") or {}, contexto.get("origem") or {}
    if slugs:
        print("Ligacoes peca <-> artigo:")
        for (pid, proj), slug in sorted(slugs.items()):
            print("  %s  %-34s (%s)" % (proj, slug, origem.get((pid, proj), "?")))
    for pid, rasc in sorted((contexto.get("rascunhos") or {}).items()):
        dono = (rasc or {}).get("dono_da_bancada")
        if not dono:
            continue
        pecas = sorted(proj for (p, proj), s in slugs.items() if p == pid and s == dono)
        print("Bancada de %s: %s%s" % (pid, dono, (", peca %s" % pecas[0]) if pecas else
              " — ainda sem peca: o CONCLUIDO dela nao registra o 'Id no Cronograma'"))
    for a in avisos:
        print("AVISO  " + a)


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


def avaliar(entrada, estado, arte, raiz_producao, contexto=None):
    """Sem efeito colateral: classifica cada subitem e devolve as listas.

    `estado` e {"itens": {chave: valor}} LIDO DO cron_estado, ou None quando
    nao foi possivel le-lo. Sem estado, o `de` dos candidatos e None: o
    artefato existe, mas ninguem sabe se a etapa ja esta marcada — e quem chama
    tem de dizer isso, em vez de chamar o candidato de "a marcar".

    `contexto` e o que o preparar_ligacao() resolveu: o slug de cada peca e onde
    moram os rascunhos. Sem ele, o slug e o do entrada.json e [drafts] nao se
    resolve."""
    candidatos, divergentes, pulados, sem_mapa = [], [], [], []
    itens = None if estado is None else (estado.get("itens") or {})
    contexto = contexto or {}
    motivos = contexto.get("motivos") or {}
    rascunhos = contexto.get("rascunhos") or {}

    for it in subitens_do_cronograma(entrada, estado, contexto.get("slugs")):
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
        if "[slug]" in caminho_rel or "[drafts]" in caminho_rel:
            if not it["slug"]:
                pulados.append((it["chave"],
                                motivos.get((it["pid"], it["proj_id"])) or SEM_LIGACAO))
                continue                               # regra 5
            rasc = rascunhos.get(it["pid"])
            if "[drafts]" in caminho_rel and not rasc:
                pulados.append((it["chave"], "o mapa usa [drafts], mas nao declara "
                                "`rascunhos` para o painel %s" % it["pid"]))
                continue
            caminhos = caminhos_da_peca(caminho_rel, it["slug"], rasc)
            if not caminhos:
                pulados.append((it["chave"], "o mapa usa [drafts], mas `rascunhos` "
                                "nao declara pasta nenhuma"))
                continue
        elif padrao:
            # REGRA 7 — UM CAMINHO PARA TODAS AS PECAS NAO PROVA NENHUMA. O mapa
            # descreve a etapa uma vez so (aNN-4), e sem [slug] nem [drafts] o
            # caminho e o mesmo para as treze pecas. Ate 2026-10-12 os rascunhos
            # da esteira eram assim, e o defeito dormia porque o lugar nao
            # existia; no dia em que alguem o "consertasse" apontando para a
            # bancada, o mesmo arquivo marcaria a etapa de todas as pecas.
            pulados.append((it["chave"],
                            "o mapa descreve %s por padrao, e o caminho nao tem "
                            "[slug] nem [drafts]: %s seria o mesmo arquivo para "
                            "todas as pecas" % (padrao, caminho_rel)))
            continue
        else:
            caminhos = [caminho_rel]

        achados = [c for c in caminhos if os.path.exists(os.path.join(raiz_producao, c))]
        existe = bool(achados)
        caminho_rel = achados[0] if achados else " ou ".join(caminhos)
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
        print(textwrap.fill(_resumo_das_chaves(chaves), width=78,
                            initial_indent="    ", subsequent_indent="    "))


def _resumo_das_chaves(chaves):
    """Ate seis subitens, por extenso. Mais que isso, por peca: o mesmo motivo
    em 48 etapas de 12 pecas se le como 12 pecas, e nao como 48 linhas."""
    if len(chaves) <= 6:
        return "  ".join(chaves)
    ordem, conta = [], {}
    for c in chaves:
        peca = c.rsplit("/", 1)[0]
        if peca not in conta:
            conta[peca] = 0
            ordem.append(peca)
        conta[peca] += 1
    return "  ".join("%s (%d %s)" % (p, conta[p], "etapa" if conta[p] == 1 else "etapas")
                     for p in ordem)


def emitir(chave, aplicar):
    """Fala com o dobrar_toques.py, que continua sendo o escritor único (regra 4)."""
    cmd = [sys.executable, DOBRAR, "--registrar", chave, "--para", "2"]
    if not aplicar:
        cmd.append("--seco")
    r = subprocess.run(cmd, capture_output=True, text=True)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def main():
    saida = sys.stdout
    try:
        return _main()
    finally:
        sys.stdout = saida


class _Redigido(object):
    """O LOG DO ACTIONS E PUBLICO, porque este repositorio e (a mesma razao do
    avisos/enviar.mjs, que tira do log o resumo do dia). A pasta de producao e
    privada: com LOG_PUBLICO=1, todo slug que a leitura dela encontrou sai como
    <slug> — nas ligacoes, nos caminhos e nos avisos. Peca, etapa e titulo ficam:
    ja sao publicos no entrada.json."""

    def __init__(self, destino, segredos):
        self.destino = destino
        self.segredos = sorted((s for s in segredos if s and len(s) >= 4),
                               key=len, reverse=True)

    def write(self, texto):
        for s in self.segredos:
            texto = texto.replace(s, "<slug>")
        return self.destino.write(texto)

    def flush(self):
        return self.destino.flush()


VAR_LOG_PUBLICO = "LOG_PUBLICO"


def _main():
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

    contexto, avisos_da_ligacao = preparar_ligacao(mapa, entrada, raiz)
    candidatos, divergentes, pulados, sem_mapa = avaliar(entrada, estado, arte, raiz,
                                                         contexto)
    if os.environ.get(VAR_LOG_PUBLICO):
        sys.stdout = _Redigido(sys.stdout, VISTOS)

    print("Pasta de producao: %s" % raiz)
    print("Mapa: %s" % rel_mapa)
    imprimir_ligacao(contexto, avisos_da_ligacao)
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
