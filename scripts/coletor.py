#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Coletor semanal — VAGAS e CHAMADAS.

Roda no GitHub Actions, segunda 11:00 UTC (= 08:00 America/Sao_Paulo; o Brasil
nao tem horario de verao, entao o horario e estavel o ano inteiro).

POR QUE ISTO RODA NO ACTIONS E NAO NUMA TAREFA DO COWORK
--------------------------------------------------------
Verificado em 2026-08-24: api.github.com responde 403 do ambiente do Cowork
("sessions are bound to their configured repositories"). Tarefa agendada em
nuvem LE do GitHub mas nao ESCREVE, e sem o Mac ligado nao alcanca pasta
nenhuma. O Actions e a unica coisa que roda em horario, na nuvem, e escreve no
repositorio — usando o GITHUB_TOKEN que o proprio GitHub injeta. Nenhuma
credencial do usuario passa por aqui.

PRINCIPIOS
----------
1. DEGRADA, NAO TRAVA. Fonte que falha vira uma linha no batimento; as outras
   seguem. Nunca uma fonte derruba o digest inteiro.
2. SILENCIO SIGNIFICA FALHA. Todo run grava o batimento com o que rodou e o que
   quebrou. Se o arquivo nao mudar, algo esta errado — e da para ver.
3. NAO DESCARTA. Anuncio que sai da lista por prazo vencido vai para o
   historico, nao para o lixo.
4. RESPEITA O robots.txt. O PhilJobs so proibe /ajax/. As paginas /job/show/
   e /event/show/ sao publicas e permitidas — e foi por elas que entramos.
"""

import json
import os
import re
import sys
import time
import html as htmllib
from datetime import datetime, timezone, timedelta

import requests

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_DADOS = os.path.join(RAIZ, "dados")
DIR_EVENTOS = os.path.join(RAIZ, "eventos")
ARQ_ESTADO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "estado_coletor.json")

UA = "cronograma-agente-semanal/1 (+https://jonathansousa.com.br)"
TIMEOUT = 20
PAUSA = 1.2          # segundos entre requisicoes: educacao com o servidor
MAX_SONDAS = 120     # teto de ids sondados por execucao
MAX_VAZIOS = 25      # para de sondar apos N ids seguidos inexistentes

SP = timezone(timedelta(hours=-3))


# ----------------------------------------------------------------- utilidades

def agora_sp():
    return datetime.now(timezone.utc).astimezone(SP)


def ler_json(caminho, padrao):
    try:
        with open(caminho, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return padrao


def escrever_json(caminho, dados):
    os.makedirs(os.path.dirname(caminho), exist_ok=True)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(dados, f, ensure_ascii=False, indent=2, sort_keys=False)


# Rotulos que a familia PhilPapers usa. Servem de PAREDE: o valor de um campo
# termina onde o proximo rotulo comeca. Sem isto, o valor de "Deadline" engolia
# o resto da pagina quando o site poe tudo num bloco so.
ROTULOS = (r"(?:AOS|AOC|Location|Deadline|Posted|Published|Announced|Topic|Salary|"
           r"Start\s+date|Apply|Web|Email|Contact|Categoria|Localidade|City|Region|"
           r"Job\s+category|Category|Contract\s+type|Type|"
           r"Area\s+of\s+special[is]zation|Application\s+deadline|"
           r"Submission\s+deadline|Closing\s+date)")


def texto_limpo(bruto):
    """Tira script/style/tags e normaliza espacos. Parsear TEXTO em vez de
    estrutura e muito mais resistente a mudanca de markup do site.

    Blocos viram QUEBRA DE LINHA antes de as tags sumirem: e a quebra que
    delimita um campo do seguinte. Colapsar tudo num paragrafo unico foi o
    defeito que os testes pegaram em 2026-08-24 — o prazo deixava de ser lido
    e vaga vencida entrava na lista como se estivesse aberta."""
    s = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", bruto)
    s = re.sub(r"(?is)<\s*br\s*/?>", "\n", s)
    s = re.sub(r"(?is)</\s*(div|p|li|tr|td|th|h[1-6]|dt|dd|section|article)\s*>", "\n", s)
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    s = htmllib.unescape(s)
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def campo(texto, rotulos, limite=200):
    """Procura 'Rotulo: valor' e para no proximo rotulo conhecido, na quebra de
    linha, em dois espacos ou no fim — o que vier primeiro."""
    for r in rotulos:
        m = re.search(r"\b%s\b\s*:?\s*(.{1,%d}?)(?=\s+%s\b\s*:|\s{2,}|\n|$)"
                      % (re.escape(r), limite, ROTULOS),
                      texto, re.IGNORECASE)
        if m:
            v = m.group(1).strip(" .;,-|")
            if v and len(v) > 1:
                return v
    return ""


def parse_data(s):
    """Devolve AAAA-MM-DD a partir de varios formatos, ou '' se nao entender."""
    if not s:
        return ""
    s = s.strip()
    for fmt in ("%B %d, %Y", "%d %B %Y", "%Y-%m-%d", "%d/%m/%Y", "%b %d, %Y"):
        try:
            return datetime.strptime(re.sub(r",?\s*\d{1,2}:\d{2}.*$", "", s), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    return m.group(0) if m else ""


# ------------------------------------------------------------------- pontuacao

def pontuar(item, criterios):
    """Soma os pesos dos criterios. O JULGAMENTO MORA AQUI — e no arquivo de
    criterios, que e feito para voce editar. Nao ha modelo rodando no Actions."""
    campos = " ".join(str(item.get(k, "")) for k in
                      ("titulo", "instituicao", "aos", "categoria", "local", "texto")).lower()
    pontos, porque = 0, []

    for grupo, cfg in (criterios.get("termos") or {}).items():
        peso = cfg.get("peso", 0)
        achados = [p for p in cfg.get("palavras", []) if p.lower() in campos]
        if achados:
            # conta o grupo uma vez, nao uma vez por palavra
            pontos += peso
            porque.append("%s(%s) %+d" % (grupo, ", ".join(achados[:3]), peso))

    for chave, mapa, rotulo in (("regiao", criterios.get("regiao"), "regiao"),
                                ("categoria", criterios.get("categoria"), "categoria")):
        if not mapa:
            continue
        for nome, peso in mapa.items():
            if nome.lower() in campos:
                pontos += peso
                porque.append("%s:%s %+d" % (rotulo, nome, peso))
                break

    if criterios.get("aos_aberto") and re.search(r"\baos\s*:?\s*open\b", campos):
        pontos += criterios["aos_aberto"]
        porque.append("AOS aberto %+d" % criterios["aos_aberto"])

    prazo = item.get("prazo") or ""
    regras = criterios.get("prazo") or {}
    if prazo:
        try:
            dias = (datetime.strptime(prazo, "%Y-%m-%d").date() - agora_sp().date()).days
            item["dias_ate_prazo"] = dias
            if dias < 0:
                pontos += regras.get("vencido", -999)
                porque.append("vencido")
            elif dias < regras.get("curto_dias", 7):
                pontos += regras.get("curto_peso", -3)
                porque.append("prazo curto %+d" % regras.get("curto_peso", -3))
        except ValueError:
            pass

    item["pontos"] = pontos
    item["porque"] = "; ".join(porque)
    return pontos


# --------------------------------------------------------------------- fontes

def _sondar_familia_philpapers(sessao, base, caminho, estado_fonte, batimento, rotulo):
    """PhilJobs e PhilEvents sao a mesma plataforma. Anuncio individual e publico
    e indexavel; a LISTA vem por /ajax/, que o robots.txt pede para nao acessar.
    Entao avancamos por id, que e sequencial por data de publicacao."""
    ultimo = int(estado_fonte.get("ultimo_id") or 0)
    if ultimo <= 0:
        ultimo = int(estado_fonte.get("semente") or 31580)

    novos, vazios, sondados, ident = [], 0, 0, ultimo

    while vazios < MAX_VAZIOS and sondados < MAX_SONDAS:
        ident += 1
        sondados += 1
        url = "%s%s%d" % (base, caminho, ident)
        try:
            r = sessao.get(url, timeout=TIMEOUT, allow_redirects=False)
        except Exception as e:
            batimento["avisos"].append("%s id %d: %s" % (rotulo, ident, e.__class__.__name__))
            vazios += 1
            time.sleep(PAUSA)
            continue

        # id inexistente redireciona para a home
        if r.status_code != 200 or "show" not in r.url:
            vazios += 1
            time.sleep(PAUSA)
            continue

        titulo_tag = re.search(r"(?is)<title>(.*?)</title>", r.text)
        bruto = htmllib.unescape(titulo_tag.group(1)).strip() if titulo_tag else ""
        bruto = re.sub(r"\s*[-–]\s*Phil(Jobs|Events).*$", "", bruto).strip()
        if not bruto:
            vazios += 1
            time.sleep(PAUSA)
            continue

        vazios = 0
        corpo = texto_limpo(r.text)
        # o <title> vem como "Cargo, Instituicao"
        partes = [p.strip() for p in bruto.rsplit(",", 1)]
        item = {
            "id": "%s-%d" % (rotulo, ident),
            "fonte": rotulo,
            "url": url,
            "titulo": partes[0],
            "instituicao": partes[1] if len(partes) > 1 else "",
            "aos": campo(corpo, ["AOS", "Area of specialisation", "Area of specialization", "Topic"]),
            "local": campo(corpo, ["Location", "Localidade", "City"]),
            "categoria": campo(corpo, ["Job category", "Categoria", "Type", "Contract type"]),
            "prazo": parse_data(campo(corpo, ["Deadline", "Application deadline", "Submission deadline", "Closing date"])),
            "publicado": parse_data(campo(corpo, ["Posted", "Published", "Announced"])),
            "texto": corpo[:1200],
            "visto_em": agora_sp().strftime("%Y-%m-%d"),
        }
        novos.append(item)
        time.sleep(PAUSA)

    estado_fonte["ultimo_id"] = ident - vazios
    estado_fonte["ultima_sondagem"] = agora_sp().isoformat()
    batimento["fontes"][rotulo] = "ok · %d sondados · %d novos" % (sondados, len(novos))
    return novos


def fonte_philjobs(sessao, estado, batimento):
    return _sondar_familia_philpapers(
        sessao, "https://philjobs.org", "/job/show/",
        estado.setdefault("philjobs", {"semente": 31580}), batimento, "philjobs")


def fonte_philevents(sessao, estado, batimento):
    return _sondar_familia_philpapers(
        sessao, "https://philevents.org", "/event/show/",
        estado.setdefault("philevents", {"semente": 146200}), batimento, "philevents")


def fonte_opcional(sessao, estado, batimento, rotulo, url, extrator):
    """Fontes ainda NAO VERIFICADAS por mim. Ficam desligadas por padrao no
    arquivo de criterios. Se falharem, entram no batimento e nada mais acontece."""
    try:
        r = sessao.get(url, timeout=TIMEOUT)
        r.raise_for_status()
        itens = extrator(r.text)
        batimento["fontes"][rotulo] = "ok · %d itens" % len(itens)
        return itens
    except Exception as e:
        batimento["fontes"][rotulo] = "FALHOU: %s" % e.__class__.__name__
        return []


def extrator_rss(texto):
    itens = []
    for bloco in re.findall(r"(?is)<item>(.*?)</item>", texto):
        def pega(tag):
            m = re.search(r"(?is)<%s[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</%s>" % (tag, tag), bloco)
            return htmllib.unescape(m.group(1)).strip() if m else ""
        itens.append({
            "id": pega("guid") or pega("link"),
            "titulo": texto_limpo(pega("title")),
            "url": pega("link"),
            "publicado": parse_data(pega("pubDate")),
            "texto": texto_limpo(pega("description"))[:1200],
            "instituicao": "", "aos": "", "local": "", "categoria": "", "prazo": "",
            "visto_em": agora_sp().strftime("%Y-%m-%d"),
        })
    return itens


# ----------------------------------------------------------------------- fluxo

def executar(modo):
    criterios = ler_json(os.path.join(RAIZ, "criterios_%s.json" % modo), {})
    if not criterios:
        print("ERRO: criterios_%s.json nao encontrado ou vazio." % modo, file=sys.stderr)
        return 1

    estado = ler_json(ARQ_ESTADO, {})
    batimento = {"quando": agora_sp().isoformat(), "fontes": {}, "avisos": []}

    sessao = requests.Session()
    sessao.headers.update({"User-Agent": UA, "Accept-Language": "en,pt-BR;q=0.8"})

    coletados = []
    principal = fonte_philjobs if modo == "vagas" else fonte_philevents
    try:
        coletados += principal(sessao, estado, batimento)
    except Exception as e:
        batimento["fontes"]["principal"] = "FALHOU: %s: %s" % (e.__class__.__name__, e)

    for f in (criterios.get("fontes_opcionais") or []):
        if not f.get("ligada"):
            batimento["fontes"][f["nome"]] = "desligada"
            continue
        coletados += fonte_opcional(sessao, estado, batimento, f["nome"], f["url"], extrator_rss)

    for item in coletados:
        pontuar(item, criterios)

    corte = criterios.get("corte", 8)
    arq_saida = os.path.join(DIR_DADOS, "%s.json" % modo)
    anterior = ler_json(arq_saida, {"itens": []})
    por_id = {i["id"]: i for i in anterior.get("itens", [])}

    def vencido(i):
        d = i.get("dias_ate_prazo")
        return isinstance(d, int) and d < 0

    # A ordem aqui importa e ja custou um defeito: o vencido leva -999, entao
    # se o corte fosse aplicado ANTES do roteamento ele seria descartado em vez
    # de arquivado. Roteia primeiro, corta depois.
    novos_relevantes, rejeitados = [], []
    for item in coletados:
        if vencido(item):
            item["motivo_saida"] = "prazo vencido"
        elif item["pontos"] < corte:
            item["motivo_saida"] = "abaixo do corte (%d < %d)" % (item["pontos"], corte)
            rejeitados.append(item)
            continue
        else:
            if item["id"] not in por_id:
                item["novo"] = True
                novos_relevantes.append(item)
            por_id[item["id"]] = item
            continue
        por_id[item["id"]] = item          # vencido: entra so para ser arquivado

    vivos, expirados = [], []
    for i in por_id.values():
        (expirados if vencido(i) else vivos).append(i)
    vivos.sort(key=lambda i: (-i["pontos"], i.get("prazo") or "9999"))

    # Vencido nao some: vai para o historico, com o motivo.
    if expirados:
        hist = os.path.join(DIR_DADOS, "%s_historico.json" % modo)
        antigos = ler_json(hist, {"itens": []})
        ids = {i["id"] for i in antigos["itens"]}
        antigos["itens"] += [i for i in expirados if i["id"] not in ids]
        antigos["_nota"] = "Itens que sairam da lista viva por prazo. Preservados, nunca apagados."
        escrever_json(hist, antigos)

    # Rejeitado pelo corte tambem nao some calado: fica o registro minimo, com a
    # nota e a razao. E com isto que se afina o arquivo de criterios — da para
    # ver o que o filtro barrou em vez de adivinhar.
    arq_rej = os.path.join(DIR_DADOS, "%s_rejeitados.json" % modo)
    rej_ant = ler_json(arq_rej, {"itens": []})
    linhas = [{"id": i["id"], "titulo": i.get("titulo", ""), "url": i.get("url", ""),
               "pontos": i["pontos"], "porque": i.get("porque", ""),
               "motivo_saida": i["motivo_saida"], "visto_em": i.get("visto_em", "")}
              for i in rejeitados]
    todas = linhas + rej_ant.get("itens", [])
    escrever_json(arq_rej, {
        "_o_que_e": "O que o filtro barrou, com a nota e a razao. Serve para afinar "
                    "criterios_%s.json com evidencia em vez de palpite." % modo,
        "_teto": 200,
        "_barrados_nesta_rodada": len(linhas),
        "itens": todas[:200],
    })

    batimento["resumo"] = "%d vivos · %d novos nesta rodada · %d arquivados por prazo · %d barrados pelo corte" % (
        len(vivos), len(novos_relevantes), len(expirados), len(rejeitados))

    escrever_json(arq_saida, {
        "_gerado_em": batimento["quando"],
        "_batimento": batimento,
        "_corte": corte,
        "itens": vivos,
    })
    if novos_relevantes:
        escrever_json(os.path.join(DIR_EVENTOS, "%s_%s.json" % (modo, agora_sp().strftime("%Y-%m-%d"))),
                      {"quando": batimento["quando"], "itens": novos_relevantes})
    escrever_json(ARQ_ESTADO, estado)

    print("=== BATIMENTO · %s ===" % modo)
    for nome, situacao in batimento["fontes"].items():
        print("  %-14s %s" % (nome, situacao))
    for aviso in batimento["avisos"][:10]:
        print("  aviso: %s" % aviso)
    print("  %s" % batimento["resumo"])
    return 0


if __name__ == "__main__":
    modo = sys.argv[1] if len(sys.argv) > 1 else "vagas"
    if modo not in ("vagas", "chamadas"):
        print("uso: coletor.py [vagas|chamadas]", file=sys.stderr)
        sys.exit(2)
    sys.exit(executar(modo))
