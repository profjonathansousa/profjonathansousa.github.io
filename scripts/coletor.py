#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Coletor semanal — VAGAS e CHAMADAS.  v2, Passo 3b da reforma do Portal.

Roda no GitHub Actions, segunda 11:00 UTC (= 08:00 America/Sao_Paulo; o Brasil
nao tem horario de verao, entao o horario e estavel o ano inteiro).

    python scripts/coletor.py vagas
    python scripts/coletor.py chamadas
    python scripts/coletor.py vagas --diagnostico     # nao escreve nada

POR QUE ISTO RODA NO ACTIONS E NAO NUMA TAREFA DO COWORK
--------------------------------------------------------
Verificado em 2026-08-24: api.github.com responde 403 do ambiente do Cowork
("sessions are bound to their configured repositories"). Tarefa agendada em
nuvem LE do GitHub mas nao ESCREVE. O Actions e a unica coisa que roda em
horario, na nuvem, e escreve no repositorio — com o GITHUB_TOKEN que o proprio
GitHub injeta. Nenhuma credencial do usuario passa por aqui.

O QUE MUDOU DA v1 (2026-08-25)
------------------------------
A v1 PONTUAVA: somava pesos e comparava com um corte. Na primeira execucao real
20 de 29 anuncios passaram e NENHUM disparou o grupo 'nucleo' — regiao (+5) e
categoria (+9) somavam 14 num corte de 8, e atributo estrutural elegia sozinho.

A v2 CLASSIFICA. Nao ha corte, nem peso, nem soma. Cada decisao vira uma coluna
visivel da tabela: Bloco, Tipo, Esforco, Elegibilidade, Idioma, Prazo. Quem
ordena e o prazo, que e o que aperta. E quem tria e o usuario, no Cronograma,
no celular — Passo 4.

Sai tambem o jobs.csv e a trava de fingerprint da secao 2.1 do agente_VAGAS.md:
a pagina de ajuda do PhilJobs diz, literal, "Anyone can search for positions on
PhilJobs", e /job/show/<id> abre completo sem login. Era o unico ponto do
desenho capaz de derrubar o digest inteiro.

PRINCIPIOS — cada um destes ja custou um defeito
------------------------------------------------
1. DEGRADA, NAO TRAVA. Fonte que falha vira uma linha no batimento; as outras
   seguem. Nunca uma fonte derruba o digest.
2. SILENCIO SIGNIFICA FALHA. Todo run grava o batimento com o que rodou e o que
   quebrou. Se o arquivo nao mudar, algo esta errado — e da para ver.
3. NAO DESCARTA. Vencido vai para o historico. Barrado vai para os rejeitados,
   com a razao. Nada some calado.
4. NAO MENTE SOBRE O QUE NAO LEU. Prazo ilegivel nao vira "aberto"; area nao
   lida nao vira "sem filosofia". As duas coisas saem marcadas.
5. RESPEITA O robots.txt. O PhilJobs so proibe /ajax/. As paginas /job/show/ e
   /event/show/ sao publicas e permitidas — e foi por elas que entramos.
"""

import json
import os
import re
import sys
import time
import html as htmllib
import unicodedata
from datetime import datetime, timezone, timedelta
from urllib.parse import urljoin, urlparse

import requests

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_DADOS = os.path.join(RAIZ, "dados")
DIR_EVENTOS = os.path.join(RAIZ, "eventos")
ARQ_ESTADO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "estado_coletor.json")

UA = "cronograma-agente-semanal/2 (+https://jonathansousa.com.br)"
TIMEOUT = 20
PAUSA = 1.2           # segundos entre requisicoes: educacao com o servidor
MAX_SONDAS = 120      # teto de ids sondados por execucao
MAX_VAZIOS = 25       # para de sondar apos N ids seguidos inexistentes
MAX_ITENS_LISTA = 40  # teto de itens novos buscados por fonte de lista

SP = timezone(timedelta(hours=-3))


# ----------------------------------------------------------------- utilidades

def agora_sp():
    return datetime.now(timezone.utc).astimezone(SP)


def hoje():
    return agora_sp().date()


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


def normalizar(s):
    """Minuscula e sem acento, dos dois lados da comparacao. Sem isto,
    'filosofia da religiao' nao casa 'Filosofia da Religiao'."""
    s = unicodedata.normalize("NFKD", str(s or "").lower())
    return "".join(c for c in s if not unicodedata.combining(c))


SUFIXO_MAX = 3          # 'espinosa' -> 'espinosanos'; 'epistemologia' -> 'as'
COLISOES_DE_SUFIXO = (  # termo que vira OUTRA COISA com sufixo. So cresce por
    "barth",           # defeito medido: 'Barthes' (Roland) nao e 'Barth' (Karl)
)


def casa(termos, texto_norm):
    """Casamento com FRONTEIRA DE PALAVRA, e devolve o que casou.

    VERIFICADO em 2026-08-25: 'logic' esta dentro de 'theological', e 'ethic'
    dentro de 'bioethics'. A v1 casava por substring pura ('p in campos'), o que
    significa que no dia em que alguem escrevesse 'logic' no veto, etica
    teologica passaria a ser vetada em silencio.

    O HIFEN CONTA COMO LETRA na fronteira, e isso nao e detalhe. Com o \\b
    comum, o termo 'doctoral fellowship' (lista de descarte) casaria dentro de
    'post-doctoral fellowship', porque '-' e fronteira de palavra — e todo
    pos-doc escrito com hifen seria descartado como selecao de doutorado, em
    silencio. Pego no teste de 2026-08-25. Por isso [\\w-] nos dois lados.
    """
    achados = []
    for t in (termos or []):
        alvo = normalizar(t).strip()
        if not alvo:
            continue
        # FRONTEIRA ESQUERDA: intocada. E ela que impede 'ethics' de casar
        # dentro de 'bioethics' e 'logic' dentro de 'theological' — os dois
        # defeitos de 2026-08-25. Todas as assercoes daquele dia dependem
        # dela, e nenhuma da direita.
        # FRONTEIRA DIREITA: aceita ate SUFIXO_MAX letras, para o termo casar
        # a propria flexao. MEDIDO em 2026-08-26: 'espinosa' nao casava
        # 'Cadernos Espinosanos' e 'epistemologia' nao casava o plural
        # 'epistemologias' — duas chamadas boas foram para os rejeitados.
        # Nao e whitelist de formas (essa cresceria sem fim): e lista de
        # COLISOES, que so cresce quando alguma quebra de verdade.
        if alvo in COLISOES_DE_SUFIXO or len(alvo) < 5:
            direita = r"(?![\w-])"
        else:
            direita = r"[a-z]{0,%d}(?![\w-])" % SUFIXO_MAX
        if re.search(r"(?<![\w-])" + re.escape(alvo) + direita, texto_norm):
            achados.append(t)
    return achados


def achar_pais(texto_norm, texto_bruto, criterios):
    """O pais nao sai de heuristica de virgula.

    A v2 tentava so o padrao ', Pais' no fim do campo Location. Funciona para
    'Notre Dame, Indiana, United States' e falha para 'United States' sozinho —
    e o teste pegou: vaga tenure-track nos EUA saia como 'Aberto' em vez de
    'Provavel c/ patrocinio', porque o pais nunca era lido. Casa contra os
    nomes que o proprio arquivo de criterios ja conhece; a virgula fica so
    como ultimo recurso.
    """
    nomes = list((criterios.get("paises_conhecidos") or {}).get("lista") or [])
    nomes += [k for k in ((criterios.get("idioma") or {}).get("por_pais") or {})
              if not k.startswith("_")]
    for regra in (criterios.get("elegibilidade") or {}).get("regras", []):
        nomes += regra.get("quando_pais") or []
    # mais longo primeiro: 'United States' antes de qualquer 'States'
    for nome in sorted(set(nomes), key=len, reverse=True):
        if casa([nome], texto_norm):
            return nome
    m = re.search(r",\s*([A-Za-zÀ-ÿ\. ]{3,30})\s*$", (texto_bruto or "").strip())
    return m.group(1).strip() if m else ""


# Rotulos que a familia PhilPapers usa. Servem de PAREDE: o valor de um campo
# termina onde o proximo rotulo comeca. Sem isto, o valor de "Deadline" engolia
# o resto da pagina quando o site poe tudo num bloco so.
ROTULOS = (r"(?:AOS|AOC|Location|Deadline|Posted|Published|Announced|Topic|Salary|"
           r"Start\s+date|Apply|Web|Email|Contact|Categoria|Localidade|City|Region|"
           r"Job\s+category|Category|Contract\s+type|Type|Inscricoes|Inscrições|"
           r"Prazo|Edital|Vagas|Cargo|Area|Área|Instituição|"
           r"Area\s+of\s+special[is]zation|Application\s+deadline|"
           r"Submission\s+deadline|Closing\s+date)")


def texto_limpo(bruto):
    """Tira script/style/tags e normaliza espacos. Parsear TEXTO em vez de
    estrutura e muito mais resistente a mudanca de markup do site — e foi o que
    permitiu escrever raspador para fontes cujo HTML eu nunca vi.

    Blocos viram QUEBRA DE LINHA antes de as tags sumirem: e a quebra que
    delimita um campo do seguinte. Colapsar tudo num paragrafo unico foi o
    defeito que os testes pegaram em 2026-08-24 — o prazo deixava de ser lido e
    vaga vencida entrava na lista como se estivesse aberta. NAO REINTRODUZIR.
    """
    s = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", bruto)
    s = re.sub(r"(?is)<\s*br\s*/?>", "\n", s)
    s = re.sub(r"(?is)</\s*(div|p|li|tr|td|th|h[1-6]|dt|dd|section|article)\s*>", "\n", s)
    s = re.sub(r"(?s)<[^>]+>", " ", s)
    s = htmllib.unescape(s)
    s = re.sub(r"[ \t\r\f\v]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


# Um rotulo em POSICAO DE ROTULO: comeco do texto, comeco de linha, ou depois
# de um marcador. O texto limpo colapsa espaco horizontal mas preserva a quebra
# de linha, entao a quebra e o que sobrou da estrutura da pagina — e e por ela
# que se reconhece um campo. Palavra solta no meio de uma frase NAO e rotulo.
INICIO_DE_ROTULO = r"(?:^|[\n•·|>*])[ \t]*"

# Pontuacao de moldura que sobra na borda do valor: o asterisco do
# '*Area de Conhecimento:*' da ANPOF, o colchete, o travessao da lista.
LIXO_DE_BORDA = " \t*.;,-|:•·>»\"'[]"


def _linha_de_rotulo(linha):
    """Linha que e so um rotulo ('AOS', 'Deadline:') ou comeca por um.

    ISTO E O QUE A PODA NAO PODE COMER, e custou um defeito medido em
    2026-09-01 no ensaio contra os dados publicados: no PhilJobs o rotulo e o
    valor sao duas celulas de tabela, entao viram duas linhas — 'AOS' sozinha
    numa, 'Early Modern Philosophy' na seguinte. A linha 'AOS' e identica em
    TODA pagina do PhilJobs, que e exatamente a definicao de moldura usada
    aqui. Sem esta guarda a poda apagava o rotulo, o campo() nao achava mais
    nada, e 31 dos 43 anuncios do PhilJobs caiam em 'sem aderencia no cabeca' —
    o remedio matando mais do que a doenca.

    Rotulo que se repete nao e moldura: e estrutura. Moldura e o menu."""
    return bool(re.match(r"^\s*%s\b\s*:?\s*$" % ROTULOS, linha, re.IGNORECASE)
                or re.match(r"^\s*%s\b[^\n:]{0,30}?:" % ROTULOS, linha, re.IGNORECASE))


def podar_repetido(corpos, limiar=0.6, min_paginas=3):
    """Tira de cada pagina as linhas que se repetem NAS OUTRAS paginas da mesma
    fonte, na mesma rodada. Menu, rodape, barra lateral e aviso de cookie.

    POR QUE ASSIM E NAO POR SELETOR DE CSS: o mesmo motivo do _links_da_pagina —
    eu nao vi o HTML bruto destas fontes, e seletor escrito no escuro quebra na
    primeira mudanca de tema. O que define boilerplate nao e a tag: e o fato de
    ser IGUAL em todas as paginas. Isso da para medir sem ver o site.

    MEDIDO em 2026-09-01 sobre as 42 paginas da ANPOF de dados/vagas.json:
    100.568 caracteres viram 39.845, e 47 linhas de moldura saem — entre elas a
    frase institucional que envenenava o AOS e as 10 linhas de 'Colecao XX
    Encontro Nacional' que faziam toda pagina do site conter 'Filosofia'.

    Tres consequencias, todas medidas:
      1. o corte de 2500 caracteres do texto passa a guardar EDITAL, e nao
         menu — na amostra o menu comia os primeiros ~900;
      2. casa('filosofia') no corpo deixa de ser verdadeiro por causa do nome
         da associacao (41 de 42 paginas antes; 39 depois, e essas 39 falam de
         filosofia de verdade);
      3. o campo() tem muito menos prosa onde se enganar.

    DEGRADA, NAO TRAVA (principio 1): com menos de min_paginas paginas nao ha
    o que comparar, e devolve tudo intacto. Fonte de uma pagina so nunca perde
    conteudo por causa disto.
    """
    corpos = list(corpos)
    if len(corpos) < min_paginas:
        return corpos
    frequencia = {}
    for corpo in corpos:
        for linha in {l.strip() for l in corpo.split("\n") if l.strip()}:
            frequencia[linha] = frequencia.get(linha, 0) + 1
    corte = max(min_paginas, int(len(corpos) * limiar))
    comuns = {l for l, n in frequencia.items()
              if n >= corte and not _linha_de_rotulo(l)}
    if not comuns:
        return corpos
    podados = []
    for corpo in corpos:
        linhas = [l for l in (x.strip() for x in corpo.split("\n"))
                  if l and l not in comuns]
        # Se a poda levasse a pagina inteira, e a pagina que era a moldura.
        # Melhor devolver o original e deixar a validacao marcar do que
        # entregar vazio calado.
        podados.append("\n".join(linhas) if linhas else corpo)
    return podados


def campo(texto, rotulos, limite=200, frouxo=False):
    """Procura 'Rotulo: valor' e para no proximo rotulo conhecido, na quebra de
    linha, em dois espacos ou no fim — o que vier primeiro.

    O ROTULO PRECISA ESTAR EM POSICAO DE ROTULO. MEDIDO em 2026-09-01 sobre os
    42 itens da ANPOF publicados em dados/vagas.json: a versao antiga casava
    \bArea\b em qualquer lugar do texto, entao a frase institucional do rodape
    do site — "representar os interesses da area [de Filosofia] junto aos
    orgaos competentes [e] estimular, em todos os niveis, a investigacao
    filosofica no Pais" — virava o AOS de 22 dos 42 itens. Os outros 11 saiam
    truncados ('de Conhecimento:* Historia da Filosofia') porque o rotulo real
    e 'Area de Conhecimento' e o casamento parava em 'Area'. AOS limpo: zero.

    Isso nao era cosmetico. O AOS entra no CABECA (onde_se_decide), que e onde
    veto, tipo e relevancia se decidem — a decisao inteira estava sendo tomada
    sobre o rodape do site.

    A ORDEM DOS TRES PADROES importa, e cada um paga um caso medido:

      1. rotulo em posicao de rotulo COM dois-pontos, aceitando qualificador
         ('Area de Conhecimento:' conta como rotulo 'Area', e o qualificador
         fica fora do valor);
      2. rotulo em posicao de rotulo SEM dois-pontos — e o PhilJobs, onde
         rotulo e valor sao duas celulas de tabela e viram duas linhas;
      3. ultimo recurso: dois-pontos COLADOS no rotulo, em qualquer lugar. E a
         prosa do anuncio ('AOS: Early Modern.'). Vem por ultimo de proposito:
         VERIFICADO em 2026-09-01 que tentar este primeiro faz o PhilJobs
         devolver 'Early Modern' (a prosa) em vez de 'Early Modern Philosophy'
         (a tabela). Metadado estruturado ganha de prosa.

    frouxo=True volta ao casamento antigo, permissivo. Existe para UM caso: o
    prazo. 'As inscricoes podem ser realizadas ate as 12h do dia 02/09/2026'
    nao tem rotulo nenhum, e exigir posicao de rotulo perderia a data — que e
    a chave de ordenacao da lista inteira. E so seguro ali porque o resultado
    passa pelo parse_data, que devolve vazio se nao for data. NAO usar frouxo
    em campo que va para o cabeca: la nao ha validador nenhum depois.
    """
    fim = r"(?=\s+%s\b\s*:|\s{2,}|\n|$)" % ROTULOS
    for r in rotulos:
        rot = re.escape(r)
        if frouxo:
            padroes = [r"\b%s\b\s*:?\s*(.{1,%d}?)%s" % (rot, limite, fim)]
        else:
            padroes = [
                INICIO_DE_ROTULO + r"%s\b[^\n:]{0,30}?:[ \t]*(.{1,%d}?)%s" % (rot, limite, fim),
                INICIO_DE_ROTULO + r"%s\b[ \t]*:?\s*(.{1,%d}?)%s" % (rot, limite, fim),
                r"%s\b[ \t]{0,3}:[ \t]*(.{1,%d}?)%s" % (rot, limite, fim),
            ]
        for padrao in padroes:
            m = re.search(padrao, texto, re.IGNORECASE)
            if m:
                v = m.group(1).strip(LIXO_DE_BORDA)
                if v and len(v) > 1:
                    return v
    return ""


MESES_PT = {"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
            "jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12}


def parse_data(s):
    """Devolve (AAAA-MM-DD, brando) — brando = prazo marcado '(soft)'.

    VERIFICADO no jobs.csv: o PhilJobs escreve '2026-10-01 (soft)' em metade dos
    anuncios. Prazo brando e informacao, nao sujeira: a leitura comeca na data
    mas as inscricoes seguem. Vira coluna.
    """
    if not s:
        return "", False
    s = str(s).strip()
    brando = bool(re.search(r"\(\s*soft\s*\)|\bbrando\b|\bprorrogav", s, re.IGNORECASE))
    limpo = re.sub(r"\(\s*soft\s*\)", " ", s, flags=re.IGNORECASE).strip()
    limpo = re.sub(r",?\s*\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?.*$", "", limpo, flags=re.IGNORECASE).strip()

    # ISO em qualquer lugar da string
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", limpo)
    if m:
        return m.group(0), brando

    # DD/MM/AAAA — o formato brasileiro. Vem antes dos formatos ingleses de
    # proposito: 03/04/2026 no Brasil e 3 de abril, nao 4 de marco.
    m = re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", limpo)
    if m:
        d, mes, a = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return datetime(a, mes, d).strftime("%Y-%m-%d"), brando
        except ValueError:
            pass

    # "12 ago 2026" / "12 de agosto de 2026"
    m = re.search(r"\b(\d{1,2})\s*(?:de\s+)?([a-zç]{3,})\.?\s*(?:de\s+)?(\d{4})\b",
                  normalizar(limpo))
    if m and m.group(2)[:3] in MESES_PT:
        try:
            return datetime(int(m.group(3)), MESES_PT[m.group(2)[:3]],
                            int(m.group(1))).strftime("%Y-%m-%d"), brando
        except ValueError:
            pass

    for fmt in ("%B %d, %Y", "%d %B %Y", "%b %d, %Y", "%d %b %Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(limpo, fmt).strftime("%Y-%m-%d"), brando
        except ValueError:
            continue
    return "", brando


UFS = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapa", "AM": "Amazonas", "BA": "Bahia",
    "CE": "Ceara", "DF": "Distrito Federal", "ES": "Espirito Santo", "GO": "Goias",
    "MA": "Maranhao", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais", "PA": "Para", "PB": "Paraiba", "PR": "Parana",
    "PE": "Pernambuco", "PI": "Piaui", "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte", "RS": "Rio Grande do Sul", "RO": "Rondonia",
    "RR": "Roraima", "SC": "Santa Catarina", "SP": "Sao Paulo",
    "SE": "Sergipe", "TO": "Tocantins",
}


def achar_uf(texto, texto_norm):
    """UF pela sigla (com fronteira, para 'PARA' nao virar Para) ou pelo nome."""
    m = re.search(r"(?<![A-Za-z])(" + "|".join(UFS) + r")(?![A-Za-z])", texto)
    if m:
        return m.group(1)
    for sigla, nome in UFS.items():
        if casa([nome], texto_norm):
            return sigla
    return ""


# -------------------------------------------------- validacao da extracao

# Comeco de fragmento de prosa, nao de nome de area. Uma area comeca por
# substantivo ('Historia da Filosofia', 'Epistemologia'); um pedaco de frase
# cortado no meio comeca por preposicao ou conjuncao. MEDIDO em 2026-09-01:
# 'de Filosofia estao abertas', 'das Humanidades. Doutorado em qualquer area',
# 'de Concentracao em Filosofia, oferece duas linhas de pesquisa'.
COMECO_DE_PROSA = (
    "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas",
    "que", "para", "com", "por", "junto", "ao", "aos", "a", "o", "as", "os",
)


def _parece_prosa(valor):
    """Devolve a razao pela qual o valor NAO parece um campo, ou '' se parece.

    O QUE DENUNCIA CONTAMINACAO E ONDE O VALOR COMECA, NAO O TAMANHO DELE.
    Custou um defeito medido em 2026-09-01, no ensaio contra os 88 itens
    publicados: a primeira versao desta funcao barrava valor com mais de 120
    caracteres ou 16 palavras, e com isso jogava fora dois AOS legitimos do
    PhilJobs — 'Epistemology (especially Applied Epistemology, Social
    Epistemology, Political Epistemology, Feminist Epistemology, Virtue
    Epistemology)' e 'The area of research specialization is the text-based
    approach to History of Philosophy...'. Os dois eram o campo de verdade,
    escritos como frase pelo empregador, e os dois viravam 'sem aderencia no
    cabeca'. Comprimento nao e prova de nada: quem anuncia escreve como quer.

    O que e prova, e foi o que os 42 itens da ANPOF mostraram, e o valor
    COMECAR NO MEIO DE OUTRA COISA — em pontuacao ou em preposicao. Isso nao
    acontece com campo lido; acontece com frase cortada.

    O teto de tamanho, alias, ja existe e mora no campo(): o valor nunca passa
    de `limite` caracteres. Repetir isso aqui so servia para errar.
    """
    v = (valor or "").strip()
    if not v:
        return ""
    if not v[0].isalnum():
        return "comeca com pontuacao"
    if normalizar(v).split()[0] in COMECO_DE_PROSA:
        return "comeca no meio de uma frase"
    if "|" in v:
        return "traz separador de titulo de pagina"
    return ""


def validar_extracao(item, criterios):
    """A CAMADA QUE FALTAVA: entre a coleta e a classificacao.

    A cadeia era coleta -> classificacao -> triagem. O defeito medido em
    2026-09-01 nao estava na classificacao nem nos criterios: estava ANTES
    deles. O AOS de 22 dos 42 itens da ANPOF era a frase institucional do
    rodape do site, e o AOS entra no CABECA, que e onde veto, tipo e relevancia
    se decidem. Aumentar palavra-chave nao conserta isso — so faz o
    classificador errar com mais vocabulario.

    Agora a cadeia e coleta -> VALIDACAO -> classificacao -> triagem.

    O QUE ELA FAZ, e nao faz mais do que isto:
      1. olha cada campo e decide se ele PARECE o campo que diz ser;
      2. APAGA o que nao parece, para que nao entre no cabeca;
      3. deixa a marca do que apagou e por que.

    Apagar e o ponto, e e o principio 4 do cabecalho deste arquivo — NAO MENTE
    SOBRE O QUE NAO LEU. Area ilegivel virando area falsa e pior do que area
    vazia: a vazia o usuario ve; a falsa decide sozinha.

    Nao descarta ninguem. Campo suspeito e assunto de TRIAGEM, e a triagem e do
    usuario (Vagas 2: Relevante / Revisar / Rejeitado). Aqui so se registra.
    """
    regras = criterios.get("validacao_da_extracao") or {}
    avisos = []

    for nome in (regras.get("campos_de_area") or ["aos", "aoc"]):
        razao = _parece_prosa(item.get(nome))
        if razao:
            avisos.append("%s ilegivel: %s" % (nome.upper(), razao))
            item[nome] = ""              # nao entra no cabeca

    if not (item.get("titulo") or "").strip():
        avisos.append("sem titulo")
    elif len(item["titulo"].strip()) < regras.get("titulo_minimo", 12):
        avisos.append("titulo curto demais para ser anuncio")

    if not (item.get("texto") or "").strip():
        avisos.append("sem corpo")

    if not (item.get("pais") or "").strip():
        avisos.append("pais nao lido")

    # Ano lido errado e o modo classico de o prazo mentir: '02/09/2026' virando
    # 2036 poe a vaga no topo da lista para sempre, porque nunca vence.
    if item.get("prazo"):
        try:
            dias = (datetime.strptime(item["prazo"], "%Y-%m-%d").date() - hoje()).days
            if dias > regras.get("prazo_maximo_dias", 1095):
                avisos.append("prazo improvavel (%s)" % item["prazo"])
                item["prazo"] = ""
        except ValueError:
            avisos.append("prazo ilegivel (%s)" % item["prazo"])
            item["prazo"] = ""

    item["avisos_extracao"] = avisos
    item["extracao"] = "suspeita" if avisos else "ok"
    return item


# ------------------------------------------------------------- classificacao

def _primeira_regra(regras, alvo_norm):
    """Percorre as regras NA ORDEM e devolve a primeira que casar. A ordem no
    arquivo de criterios nao e alfabetica: e a ordem em que os rotulos se
    canibalizam. 'PhD fellowship' tem que morrer em 'discente' antes de
    'fellowship' o transformar em pos-doc."""
    ultimo = None
    for r in (regras or []):
        termos = r.get("quando") or []
        if not termos:
            ultimo = r          # a regra sem termos e o padrao, no fim
            continue
        if casa(termos, alvo_norm) and not casa(r.get("salvo_se") or [], alvo_norm):
            return r
    return ultimo or {"rotulo": "outro"}


def descarte_barato(item, criterios):
    """Veto e tipo 'discente' decididos SEM gastar requisicao nenhuma.

    Existe porque a resolucao de area do bloco brasileiro busca a pagina do
    edital, e seria absurdo gastar essa busca numa 'Selecao de Mestrado 2027'
    que vai ser descartada de qualquer jeito — ~80% da agenda da ANPOF e disso.
    """
    onde = criterios.get("onde_se_decide") or {}
    cabeca = normalizar(" ".join(str(item.get(k, "")) for k in
                                 (onde.get("cabeca") or ["titulo", "aos", "aoc"])))
    controlado = normalizar(" ".join(str(item.get(k, "")) for k in
                                     ("categoria", "contrato", "tipo_fonte")))

    vetadas = casa((criterios.get("veto") or {}).get("termos"), cabeca)
    if vetadas:
        item["descartado"] = True
        item["motivo_saida"] = "veto no cabeca: %s" % ", ".join(vetadas[:3])
        return True

    regra = _primeira_regra((criterios.get("tipo") or {}).get("regras"),
                            cabeca + " " + controlado)
    if regra.get("descarta"):
        item["tipo"] = regra.get("rotulo", "outro")
        item["descartado"] = True
        item["motivo_saida"] = "tipo '%s' nao e vaga" % item["tipo"]
        return True
    return False


# Os rotulos do CABECA moram aqui, e nao dentro de cada fonte, porque agora ha
# dois lugares que precisam deles: a coleta, que le a pagina pela primeira vez,
# e a reclassificacao, que reabre o corpo ja guardado. Duas listas divergindo
# em silencio seria o defeito classico — a reclassificacao lendo com regua
# diferente da coleta.
ROTULOS_DO_CABECA = {
    "lista_html": {
        "aos": ["Área de Conhecimento", "Área de Concentração",
                "Área", "Area", "Disciplina"],
    },
    "sonda_id": {
        "aos": ["AOS", "Area of specialisation", "Area of specialization", "Topic"],
        "aoc": ["AOC"],
    },
}


def reextrair_cabeca(item, corpo, metodo):
    """Refaz AOS e AOC a partir do corpo ja guardado.

    So o CABECA. Prazo, instituicao e local ficam como estao, e a razao e o
    truncamento: o corpo guardado tem 2500 caracteres (1200 no PhilJobs), e um
    prazo que morava depois do corte sumiria numa releitura — perder prazo e
    perder a chave de ordenacao da lista inteira. O cabeca nao corre esse
    risco: AOS e AOC moram no topo da pagina, nos dois formatos.

    GARANTIA DE NAO-PERDA: se a releitura vier vazia e o valor guardado for
    legivel, o guardado FICA. Releitura so substitui quando tem o que pör no
    lugar, ou quando o que estava la nao era legivel de todo jeito.
    """
    rotulos = ROTULOS_DO_CABECA.get(metodo) or {}
    for chave, lista in rotulos.items():
        novo = campo(corpo, lista)
        if novo:
            item[chave] = novo
        elif _parece_prosa(item.get(chave)):
            item[chave] = ""          # era lixo e nao ha substituto: some
    return item


def descarte_pelo_corpo(item, criterios):
    """REGRA B da Vagas 2: o corpo pode provar que uma coisa NAO e vaga.

    ISTO NAO VIOLA 'O CORPO NUNCA ELEGE NINGUEM'. Descartar nao e eleger, e a
    assimetria ja existe neste arquivo: o resolver_area deixa o corpo FECHAR a
    porta (porta_passou = False) e nunca abrir. Aqui e a mesma assimetria
    escrita para o outro lado.

    O caso que a pediu, MEDIDO em 2026-09-01: 'PPGFIL/UFSC Processo Seletivo -
    Inscricoes Prorrogadas' entrava como vaga. O titulo diz so 'Processo
    Seletivo', que nenhuma regra de tipo pega, e o corpo diz, sem ambiguidade,
    'processo seletivo para ingresso nos cursos de mestrado e doutorado'.

    Roda ANTES do resolver_area de proposito, pelo mesmo motivo do
    descarte_barato: a resolucao de area custa uma requisicao, e seria absurdo
    gasta-la numa selecao de mestrado que vai ser descartada de qualquer jeito.

    O salvo_se e lido SO NO TITULO. Procurar 'professor' no corpo resgataria
    tudo — a pagina de uma selecao de mestrado fala de orientador, banca e
    corpo docente o tempo inteiro.
    """
    regras = criterios.get("descarte_pelo_corpo") or {}
    frases = regras.get("frases") or []
    if not frases or item.get("descartado"):
        return False
    titulo = normalizar(item.get("titulo", ""))
    if casa(regras.get("salvo_se") or [], titulo):
        return False
    achou = casa(frases, normalizar(item.get("texto", "")))
    if not achou:
        return False
    item["tipo"] = regras.get("rotulo", "discente")
    item["descartado"] = True
    item["motivo_saida"] = "selecao discente pelo corpo: %s" % achou[0]
    return True


def veredicto(item, criterios):
    """O eixo da Vagas 2: relevante / revisar / rejeitado.

    E o veredicto da MAQUINA. NAO e a triagem — a triagem e do usuario, mora no
    aparelho (cron:triagem) e vale 'vou me candidatar' / 'descartar' /
    'arquivar'. Os dois eixos convivem sem se sobrescrever, que e a invariante
    do painel: O ARQUIVO DESCREVE, O APARELHO DECIDE. Foi por isso que este
    campo nao se chama triagem.

    Tambem nao substitui a relevancia: ela continua dizendo POR QUE (nicho,
    competencia, aberto, nao confirmada) e continua desenhando as etiquetas.
    O veredicto e o resumo em tres estados de que a lista precisa para filtrar.

    DUAS REGRAS QUE NAO SAO OBVIAS, e as duas vieram de medicao:

    1. Rejeicao feita sobre o que nao deu para ler vira REVISAR. Se a validacao
       apagou o AOS e o item caiu em 'sem aderencia no cabeca', a decisao foi
       tomada sobre um campo vazio, e campo vazio nao e prova de nada. Veto e
       tipo continuam rejeitando, porque disparam sobre evidencia POSITIVA no
       titulo, que a validacao nao toca.

    2. Edital que passou pela porta e cujo tipo e docente reconhecido vira
       RELEVANTE mesmo sem area declarada. Sem isto o mapeamento ingenuo
       ('aberto' -> revisar) dava revisar 49 contra relevante 39 nos 88 itens
       publicados: a fila de julgamento maior que a lista boa, que e o oposto
       do que a Vagas 2 existe para fazer. 'Edital geral' nao e caso
       limitrofe — e a forma normal do edital brasileiro, que nao carrega area
       no cabeca. Com a regra: 53 / 23 / 12.

    AOS Open NAO entra na regra 2 (ela exige porque == 'edital geral'): Open
    declarado pelo empregador continua indo para revisar, nunca eliminado e
    nunca promovido, que e o que a secao 23 do briefing pede.
    """
    regras = criterios.get("veredicto") or {}
    docentes = regras.get("tipos_docentes") or []

    def decidir(estado, porque):
        item["veredicto"] = estado
        item["porque_veredicto"] = porque
        return estado

    # A validacao apagou area? Entao o cabeca chegou incompleto na decisao.
    area_apagada = any(a.startswith(("AOS", "AOC"))
                       for a in (item.get("avisos_extracao") or []))

    if item.get("descartado"):
        motivo = item.get("motivo_saida") or "descartado"
        if area_apagada and "sem aderencia" in motivo:
            return decidir("revisar", "rejeitada sem area legivel")
        return decidir("rejeitado", motivo)

    if item.get("extracao") == "suspeita":
        return decidir("revisar", "extracao suspeita")

    rel = item.get("relevancia")
    if rel in ("nicho", "competencia"):
        return decidir("relevante", item.get("porque") or rel)
    if rel == "aberto":
        if item.get("porque") == "edital geral" and item.get("tipo") in docentes:
            return decidir("relevante",
                           "edital de %s, area nao declarada" % item.get("tipo"))
        return decidir("revisar", item.get("porque") or "AOS aberto")
    return decidir("revisar", rel or "sem relevancia")


def classificar(item, criterios, unidade="vaga"):
    """CLASSIFICA. Nao pontua, nao soma, nao compara com corte.

    Cada passo abaixo produz uma COLUNA da tabela do agente_VAGAS.md. Nenhum
    deles produz uma nota, e por isso nenhum atributo estrutural pode eleger
    sozinho — que era exatamente o defeito da v1.

    A relevancia se decide no CABECA (titulo + AOS + AOC). O CORPO nunca elege
    ninguem: so preenche pais, prazo, elegibilidade e idioma. No teste de
    2026-08-24 o corpo elegeu — 'ethics' no boilerplate institucional pesava
    igual a 'AOS: Ethics'.
    """
    if item.get("descartado"):
        return item          # ja morreu no descarte_barato; nao ressuscita aqui

    onde = criterios.get("onde_se_decide") or {}
    campos_cabeca = onde.get("cabeca") or ["titulo", "aos", "aoc"]
    campos_corpo = onde.get("corpo") or ["texto", "local", "categoria", "instituicao"]

    cabeca = normalizar(" ".join(str(item.get(k, "")) for k in campos_cabeca))
    corpo = normalizar(" ".join(str(item.get(k, "")) for k in campos_corpo))
    tudo = cabeca + " \n " + corpo

    # As marcas comecam com o que a validacao da extracao encontrou: o painel
    # ja desenha "marcas", entao campo ilegivel aparece sem mexer na interface.
    marcas = list(item.get("avisos_extracao") or [])

    # ---- 1. VETO — so o cabeca ----
    vetadas = casa((criterios.get("veto") or {}).get("termos"), cabeca)
    if vetadas:
        item["descartado"] = True
        item["motivo_saida"] = "veto no cabeca: %s" % ", ".join(vetadas[:3])
        return item

    # ---- 2. TIPO — antes da relevancia, porque 'discente' descarta ----
    # Campos de vocabulario fechado primeiro (Job type / Contract type no
    # PhilJobs, 'Efetivo/Substituto/Visitante' na docentefederal); so depois o
    # titulo. Vocabulario fechado erra menos que texto livre.
    controlado = normalizar(" ".join(str(item.get(k, "")) for k in
                                     ("categoria", "contrato", "tipo_fonte")))
    regra_tipo = _primeira_regra((criterios.get("tipo") or {}).get("regras"),
                                 controlado if controlado.strip() else "")
    if regra_tipo.get("rotulo") in (None, "outro") or not controlado.strip():
        regra_tipo = _primeira_regra((criterios.get("tipo") or {}).get("regras"),
                                     cabeca + " " + controlado)
    item["tipo"] = regra_tipo.get("rotulo", "outro")

    if regra_tipo.get("descarta"):
        item["descartado"] = True
        item["motivo_saida"] = "tipo '%s' nao e vaga" % item["tipo"]
        return item

    # ---- 3. RELEVANCIA — estado, nao nota ----
    rel = criterios.get("relevancia") or {}
    if unidade == "edital":
        # No Brasil a unidade publicada e o EDITAL, com N areas num anexo em
        # PDF. O corpo do edital ABRE OU FECHA A PORTA (resolver_area) — ele
        # nunca elege. Quem elege e o cabeca, aqui embaixo. Sem esta separacao,
        # 'Historico da ANPOF' sai como nicho, porque a pagina inteira do site
        # da ANPOF contem a palavra 'Filosofia'. Medido em 2026-08-25.
        if item.get("porta_passou") is False:
            item["descartado"] = True
            item["motivo_saida"] = item.get("motivo_porta") or "porta fechada"
            return item
        nicho = casa((rel.get("nicho") or {}).get("termos"), cabeca)
        comp = casa((rel.get("competencia") or {}).get("termos"), cabeca)
        if nicho:
            estado, item["porque"] = "nicho", "nicho: " + ", ".join(nicho[:3])
        elif comp:
            estado, item["porque"] = "competencia", "competencia: " + ", ".join(comp[:3])
        else:
            # Passou pela porta e o cabeca nao diz mais nada: e edital geral.
            # ENTRA, marcado e ordenado por ultimo — nunca descartado, porque
            # o cabeca do edital brasileiro simplesmente nao carrega a area.
            estado, item["porque"] = "aberto", "edital geral"
        if item.get("porta_passou") is None:
            marcas.append((criterios.get("resolucao_de_area") or {}).get(
                "marca_quando_nao_confirmada", "area nao confirmada"))
    else:
        nicho = casa((rel.get("nicho") or {}).get("termos"), cabeca)
        comp = casa((rel.get("competencia") or {}).get("termos"), cabeca)
        padrao_aberto = (rel.get("aberto") or {}).get("padrao_aos")
        eh_aberto = bool(padrao_aberto and re.search(padrao_aberto,
                                                     normalizar(item.get("aos", ""))))
        if nicho:
            estado, item["porque"] = "nicho", "nicho: " + ", ".join(nicho[:3])
        elif comp:
            estado, item["porque"] = "competencia", "competencia: " + ", ".join(comp[:3])
        elif eh_aberto:
            estado, item["porque"] = "aberto", "AOS aberto"
        elif item.get("fonte") in ((rel.get("aberto") or {}).get(
                "fontes_sem_area_no_cabeca") or []):
            # Espelho da decisao de 2026-08-25 para o edital brasileiro: o
            # cabeca nao carrega a area. MEDIDO em 2026-08-26: das 43 chamadas
            # unicas barradas da ANPOF, 17 eram CFP de verdade do recorte dele
            # ('Politica, Comunidade e Emancipacao', 'Philosophy of Brazilian
            # Religions', 'Dossie Ensino de Filosofia'), sem termo nenhum no
            # titulo. Entra marcado e por ultimo; quem tria e o usuario.
            estado, item["porque"] = "aberto", "chamada brasileira sem area no titulo"
        else:
            item["descartado"] = True
            item["motivo_saida"] = "sem aderencia no cabeca (titulo/AOS/AOC)"
            return item
    item["relevancia"] = estado

    # ---- 4. PAIS e UF ----
    local = str(item.get("local", "")) + " " + str(item.get("instituicao", ""))
    loc_norm = normalizar(local)
    pais = item.get("pais") or ""
    if not pais:
        pais = "Brasil" if casa(["brazil", "brasil"], loc_norm) \
            else achar_pais(loc_norm, local, criterios)
    item["pais"] = pais
    eh_br = bool(casa(["brasil", "brazil"], normalizar(pais)))
    item["uf"] = achar_uf(local, loc_norm) if eh_br else ""

    # ---- 5. BLOCO (vagas) ou FORMA (chamadas) ----
    # Os dois arquivos de criterios agrupam por eixos diferentes, e e o proprio
    # arquivo que diz qual: 'bloco' (A/B/C, por pais e tipo) nas vagas, 'forma'
    # (publicacao/evento) nas chamadas. Chamada nao tem bloco: dossie de
    # periodico nao tem geografia.
    formas = criterios.get("forma") or {}
    if formas:
        item["forma"] = "evento"
        for nome, cfg in formas.items():
            if nome.startswith("_"):
                continue
            if item["tipo"] in (cfg.get("tipos") or []):
                item["forma"] = nome
                break
        item["bloco"] = None
    else:
        blocos = criterios.get("bloco") or {}
        bloco = "C"
        if eh_br:
            bloco = "A"
            for nome in ("A", "B"):
                cfg = blocos.get(nome) or {}
                if item["tipo"] in (cfg.get("tipos") or []):
                    bloco = nome
                    break
        elif not pais:
            # Pais ilegivel nao vira Brasil por omissao — vira internacional
            # marcado. Adivinhar aqui poria vaga estrangeira no bloco A.
            marcas.append("pais nao lido")
        item["bloco"] = bloco

    # ---- 6. ESFORCO — tabela bloco:tipo. So vagas tem esforco: a coluna
    # responde "quanto custa se candidatar", e chamada nao se candidata. ----
    bloco = item.get("bloco")
    item["esforco"] = (criterios.get("esforco") or {}).get(
        "%s:%s" % (bloco, item["tipo"]), "Medio") if bloco else ""

    # ---- 7. ELEGIBILIDADE — primeira regra que casar ----
    item["elegibilidade"] = "Aberto"
    for regra in (criterios.get("elegibilidade") or {}).get("regras", []):
        if regra.get("_padrao"):
            item["elegibilidade"] = regra["resultado"]
            break
        if regra.get("onde") == "corpo":
            if casa(regra.get("quando"), corpo):
                item["elegibilidade"] = regra["resultado"]
                break
            continue
        if regra.get("quando_bloco") and bloco in regra["quando_bloco"]:
            item["elegibilidade"] = regra["resultado"]
            break
        if regra.get("quando_tipo") and item["tipo"] in regra["quando_tipo"]:
            item["elegibilidade"] = regra["resultado"]
            break
        if regra.get("quando_pais"):
            if casa(regra["quando_pais"], normalizar(pais)) and \
               (not regra.get("e_tipo") or item["tipo"] in regra["e_tipo"]):
                item["elegibilidade"] = regra["resultado"]
                break

    # ---- 8. IDIOMA ----
    idi = criterios.get("idioma") or {}
    lingua = (idi.get("padrao_por_bloco") or {}).get(bloco, "EN")
    for nome_pais, codigo in (idi.get("por_pais") or {}).items():
        if nome_pais.startswith("_"):
            continue
        if casa([nome_pais], normalizar(pais)):
            lingua = codigo
            break
    item["idioma"] = lingua
    if casa((idi.get("alerta_alemao_fluente") or {}).get("termos"), tudo):
        marcas.append("exige alemao fluente")

    # ---- 9. PRAZO — urgencia, brando, sem prazo ----
    regras_prazo = criterios.get("prazo") or {}
    urgente_dias = regras_prazo.get("urgente_dias", 14)
    if item.get("prazo"):
        try:
            dias = (datetime.strptime(item["prazo"], "%Y-%m-%d").date() - hoje()).days
            item["dias_ate_prazo"] = dias
            # Urgente e SIMBOLO e posicao no topo — nunca desconto. A v1
            # penalizava prazo curto em -4, empurrando para baixo exatamente o
            # que precisava subir.
            item["urgente"] = 0 <= dias <= urgente_dias
            if item["urgente"]:
                marcas.append("prazo em %d dia(s)" % dias)
            curto = regras_prazo.get("so_com_texto_pronto_dias")
            if curto and 0 <= dias <= curto:
                marcas.append("so com texto pronto")
        except ValueError:
            item["dias_ate_prazo"] = None
    else:
        item["dias_ate_prazo"] = None
        item["urgente"] = False
        marcas.append("sem prazo")
    if item.get("prazo_brando"):
        marcas.append("prazo brando")

    item["descartado"] = False
    item["marcas"] = marcas
    return item


def vencido(item):
    """Vencido e ROTEAMENTO, nunca penalidade — e nunca por adivinhacao.
    Prazo que nao foi lido NAO conta como vencido: nao se sabe."""
    d = item.get("dias_ate_prazo")
    return isinstance(d, int) and d < 0


# --------------------------------------------------------------------- fontes

INSTITUICAO_PISTAS = ("university", "universite", "universidade", "universitat", "universiteit",
                      "college", "institute", "instituto", "school", "escola", "faculdade",
                      "academy", "academia", "seminary", "seminario", "hochschule", "universita")


def _partir_titulo(bruto):
    """Reparte 'Cargo, Instituicao, Cidade' — e o numero de virgulas VARIA.

    A v1 cortava na ultima virgula. VERIFICADO no dados/vagas.json publicado em
    2026-08-24, isso produziu lixo em metade dos casos:
      'Postdoctoral Teaching Fellow, University of Nevada' + inst 'Reno'
      'Assistant Professor of Philosophy, University of Wis' + inst 'Madison'
    O nome da universidade ficava partido ao meio e a cidade virava instituicao.

    Aqui a instituicao e achada por PISTA, da direita para a esquerda: o pedaco
    que contem 'University', 'College', 'Institute' e afins. O que vem antes e
    cargo, o que vem depois e cidade. Isso acerta tambem o caso em que o proprio
    cargo tem virgula — 'Director, Uehiro Oxford Institute, University of
    Oxford' devolve cargo 'Director, Uehiro Oxford Institute'.
    """
    partes = [p.strip() for p in bruto.split(",") if p.strip()]
    if len(partes) <= 1:
        return (bruto.strip(), "", "")
    for i in range(len(partes) - 1, -1, -1):
        if any(p in normalizar(partes[i]) for p in INSTITUICAO_PISTAS):
            cargo = ", ".join(partes[:i]).strip()
            cidade = ", ".join(partes[i + 1:]).strip()
            return (cargo or partes[i], partes[i], cidade)
    # Sem pista nenhuma: volta ao comportamento antigo, que ao menos e previsivel.
    return (", ".join(partes[:-1]), partes[-1], "")


def _sondar_familia_philpapers(sessao, cfg, estado_fonte, batimento):
    """PhilJobs e PhilEvents sao a mesma plataforma. O anuncio individual e
    publico e permitido; a LISTA vem por /ajax/, que o robots.txt (regra unica
    do site) pede para nao acessar. Entao avancamos por id, que e sequencial
    por data de publicacao."""
    rotulo = cfg["nome"]
    base, caminho = cfg["base"], cfg["caminho"]
    ultimo = int(estado_fonte.get("ultimo_id") or 0) or int(cfg.get("semente") or 31580)

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

        if r.status_code != 200 or "show" not in r.url:
            vazios += 1
            time.sleep(PAUSA)
            continue

        tt = re.search(r"(?is)<title>(.*?)</title>", r.text)
        bruto = htmllib.unescape(tt.group(1)).strip() if tt else ""
        bruto = re.sub(r"\s*[-–]\s*Phil(Jobs|Events).*$", "", bruto).strip()
        if not bruto:
            vazios += 1
            time.sleep(PAUSA)
            continue

        vazios = 0
        corpo = texto_limpo(r.text)
        titulo, instituicao, cidade = _partir_titulo(bruto)
        prazo, brando = parse_data(campo(corpo, ["Deadline", "Application deadline",
                                                 "Submission deadline", "Closing date"],
                                         frouxo=True))
        pub, _ = parse_data(campo(corpo, ["Posted", "Published", "Announced"],
                                  frouxo=True))
        novos.append({
            "id": "%s-%d" % (rotulo, ident),
            "fonte": rotulo,
            "url": url,
            "titulo": titulo,
            "instituicao": instituicao,
            "aos": campo(corpo, ROTULOS_DO_CABECA["sonda_id"]["aos"]),
            "aoc": campo(corpo, ROTULOS_DO_CABECA["sonda_id"]["aoc"]),
            "local": campo(corpo, ["Location", "Localidade", "City"]) or cidade,
            "categoria": campo(corpo, ["Job category", "Categoria", "Category"]),
            "contrato": campo(corpo, ["Contract type", "Type"]),
            "prazo": prazo,
            "prazo_brando": brando,
            "publicado": pub,
            "texto": corpo[:1200],
            "visto_em": hoje().isoformat(),
        })
        time.sleep(PAUSA)

    estado_fonte["ultimo_id"] = ident - vazios
    estado_fonte["ultima_sondagem"] = agora_sp().isoformat()
    batimento["fontes"][rotulo] = "ok · %d sondados · %d novos" % (sondados, len(novos))
    return novos


def _links_da_pagina(html, url_base, padrao, base_item=None):
    """Extrai (url, texto da ancora) e filtra por padrao de URL.

    Deliberadamente generico: eu NAO vi o HTML bruto destas fontes — o WebFetch
    entrega markdown convertido. Seletor escrito no escuro quebra na primeira
    mudanca de tema. Isto pega todos os <a>, filtra por padrao configuravel, e
    o modo --diagnostico existe justamente para ajustar o padrao com evidencia.

    base_item: remonta o endereco como base_item + ultimo segmento do caminho,
    para a pagina cujo link relativo NAO resolve contra a propria URL da
    listagem. VERIFICADO em 2026-08-26: a listagem da ANPOF mora em
    /agenda/concursos-e-selecoes, SEM barra final, entao o urljoin descarta o
    ultimo segmento e devolve /agenda/agenda/concursos-e-selecoes/<slug>, que
    da 404. O 'agenda dobrado e do site' registrado na sessao 4 era artefato
    nosso: o endereco vivo tem um 'agenda' so.
    """
    achados, vistos = [], set()
    for href, dentro in re.findall(
            r'(?is)<a\s[^>]*href\s*=\s*["\']([^"\']+)["\'][^>]*>(.*?)</a>', html):
        absoluto = urljoin(url_base, htmllib.unescape(href.strip()))
        if padrao and not re.search(padrao, absoluto, re.IGNORECASE):
            continue
        if base_item:
            # A peneira roda ANTES daqui de proposito: se a remontagem viesse
            # primeiro, todo link do site viraria base_item + ultimo segmento
            # e entraria pela porta dos fundos.
            partes = [p for p in urlparse(absoluto).path.split("/") if p]
            if not partes:
                continue
            # A propria pagina de listagem aparece no menu dela mesma, e
            # chega aqui com o "agenda" dobrado — comparar a URL inteira
            # nao pega. Quem denuncia e o ultimo segmento.
            fim_base = [p for p in urlparse(base_item).path.split("/") if p]
            if fim_base and partes[-1] == fim_base[-1]:
                continue
            absoluto = urljoin(base_item, partes[-1])
        if absoluto in vistos:
            continue
        rotulo = texto_limpo(dentro)
        if len(rotulo) < 8:      # "leia mais", setas, icones
            continue
        vistos.add(absoluto)
        achados.append((absoluto, rotulo))
    return achados


def fonte_manual(cfg, batimento):
    """Fonte CURADA A MAO, num arquivo do repositorio.

    Existe para o que nao tem pagina que se raspe toda semana: o boletim
    trimestral que chega por e-mail (Lutheran Scholars Network) e o programa de
    fluxo continuo que fica aberto o ano inteiro (pos-doc da FAPESP). Raspar
    isso toda segunda seria muita maquina para uma coisa que se move quatro
    vezes por ano — e maquina que falha em silencio e o defeito mais caro que
    este desenho pode ter (secao 4.11).

    Por que ARQUIVO e nao conector de e-mail: o arquivo mora no repositorio,
    entao funciona no Actions E na tarefa semanal, que leem tudo pelo
    raw.githubusercontent, sem token. Conector OAuth numa sessao agendada pode
    simplesmente nao estar la — e ai a chamada some sem ninguem avisar.
    """
    rotulo = cfg["nome"]
    dados = ler_json(os.path.join(RAIZ, cfg.get("arquivo", "")), {})
    itens = dados.get("itens") or []
    if not itens:
        batimento["fontes"][rotulo] = "arquivo vazio ou ausente: %s" % cfg.get("arquivo")
        return []
    batimento["fontes"][rotulo] = "ok · %d curados · atualizado em %s" % (
        len(itens), dados.get("_atualizado_em", "sem data"))
    saida = []
    for n, it in enumerate(itens):
        saida.append({
            "id": it.get("id") or "%s-%d" % (rotulo, n),
            "fonte": rotulo,
            "url": it.get("url", ""),
            "titulo": it.get("titulo", ""),
            "instituicao": it.get("instituicao", ""),
            "aos": it.get("aos", ""),
            "aoc": it.get("aoc", ""),
            "local": it.get("local", ""),
            "categoria": it.get("categoria", ""),
            "contrato": it.get("contrato", ""),
            "pais": it.get("pais") or cfg.get("pais_padrao", ""),
            "prazo": it.get("prazo", ""),
            "prazo_brando": it.get("prazo_brando", False),
            "publicado": it.get("publicado", ""),
            "texto": it.get("texto", ""),
            "visto_em": hoje().isoformat(),
        })
    return saida


def fonte_lista_html(sessao, cfg, conhecidos, batimento, diagnostico=False):
    """Fontes brasileiras: uma pagina de listagem, um item por link."""
    rotulo = cfg["nome"]
    try:
        r = sessao.get(cfg["url"], timeout=TIMEOUT)
        r.raise_for_status()
    except Exception as e:
        batimento["fontes"][rotulo] = "FALHOU: %s" % e.__class__.__name__
        return []

    if diagnostico:
        print("\n--- DIAGNOSTICO · %s ---" % rotulo)
        print("    %s → HTTP %d, %d bytes" % (cfg["url"], r.status_code, len(r.text)))
        todos = _links_da_pagina(r.text, cfg["url"], None)
        print("    %d links com texto; com o padrao atual: %d"
              % (len(todos), len(_links_da_pagina(r.text, cfg["url"], cfg.get("link_padrao"),
                                                  cfg.get("base_item")))))
        for u, t in todos[:30]:
            print("      %-70s | %s" % (u[:70], t[:60]))
        print("    --- primeiras linhas do texto limpo ---")
        for linha in texto_limpo(r.text).split("\n")[:25]:
            print("      %s" % linha[:110])
        return []

    if cfg.get("sem_link_proprio"):
        return _itens_sem_link(r.text, cfg, batimento)

    links = _links_da_pagina(r.text, cfg["url"], cfg.get("link_padrao"),
                             cfg.get("base_item"))
    # Segunda peneira, pelo TEXTO da ancora. Existe porque padrao de URL largo
    # somado a teto de itens faz os itens reais nunca serem avaliados: em
    # 2026-08-25 a FAPERJ deu 215 links (a navegacao inteira) e o teto de 40
    # cortou antes dos 17 editais de verdade. O batimento dizia "ok".
    if cfg.get("texto_padrao"):
        links = [(u, t) for u, t in links
                 if re.search(cfg["texto_padrao"], t, re.IGNORECASE)]
    batimento["fontes"][rotulo] = "ok · %d links" % len(links)
    if not links:
        batimento["avisos"].append(
            "%s: 0 links com o padrao '%s'. Rode --diagnostico e ajuste link_padrao."
            % (rotulo, cfg.get("link_padrao")))
        return []

    # DUAS PASSADAS, e a razao esta no podar_repetido: so da para saber o que e
    # moldura do site depois de ter as paginas todas na mao. A primeira passada
    # so BUSCA; a segunda EXTRAI, ja com o menu e o rodape fora do caminho.
    brutos, buscados, vazios = [], 0, 0
    for url, rotulo_link in links:
        ident = "%s-%s" % (rotulo, re.sub(r"\W+", "-", urlparse(url).path).strip("-")[-60:])
        if ident in conhecidos:
            continue                      # ja visto: nao gasta requisicao
        if buscados >= MAX_ITENS_LISTA:
            batimento["avisos"].append("%s: teto de %d itens novos atingido"
                                       % (rotulo, MAX_ITENS_LISTA))
            break
        buscados += 1
        try:
            ri = sessao.get(url, timeout=TIMEOUT)
            corpo = texto_limpo(ri.text) if ri.status_code == 200 else ""
            if ri.status_code != 200:
                batimento["avisos"].append("%s: HTTP %d em %s"
                                           % (rotulo, ri.status_code, url[:70]))
        except Exception as e:
            batimento["avisos"].append("%s: %s em %s" % (rotulo, e.__class__.__name__, url[:60]))
            corpo = ""
        if not corpo:
            vazios += 1
        time.sleep(PAUSA)
        brutos.append((ident, url, rotulo_link, corpo))

    corpos = podar_repetido([b[3] for b in brutos])
    encolheu = sum(len(b[3]) for b in brutos) - sum(len(c) for c in corpos)
    if encolheu > 0:
        batimento["fontes"][rotulo] += " · moldura podada: %d chars" % encolheu

    novos = []
    for (ident, url, rotulo_link, _), corpo in zip(brutos, corpos):
        # O prazo e o unico campo que pode casar frouxo: ele passa pelo
        # parse_data logo em seguida, que devolve vazio se nao for data.
        prazo, brando = parse_data(campo(corpo, ["Prazo", "Inscrições até",
                                                 "Deadline", "até", "Data limite",
                                                 "Encerramento"], frouxo=True) or rotulo_link)
        novos.append({
            "id": ident,
            "fonte": rotulo,
            "url": url,
            "titulo": rotulo_link,
            "instituicao": campo(corpo, ["Instituição", "Universidade"]) or "",
            "aos": campo(corpo, ROTULOS_DO_CABECA["lista_html"]["aos"]),
            "aoc": "",
            "local": campo(corpo, ["Local", "Localidade", "Cidade"]),
            "categoria": campo(corpo, ["Tipo", "Cargo", "Categoria"]),
            "contrato": "",
            "pais": cfg.get("pais_padrao", ""),
            "prazo": prazo,
            "prazo_brando": brando,
            "publicado": "",
            "texto": corpo[:2500],
            "visto_em": hoje().isoformat(),
        })
    # O silencio era o defeito: em 2026-08-25 a ANPOF entregou 40 paginas
    # vazias (404 no endereco remontado errado) e o batimento dizia
    # "ok - 487 links". Corpo vazio em massa agora aparece.
    if vazios:
        batimento["avisos"].append("%s: %d de %d paginas vieram SEM CORPO"
                                   % (rotulo, vazios, buscados))
    return novos


def _itens_sem_link(html, cfg, batimento):
    """ANPOF /agenda/chamadas: VERIFICADO em 2026-08-25 que os itens NAO tem URL
    propria, ao contrario da lista de concursos. Entao o item sai com a URL da
    lista e uma marca dizendo isso. Melhor um item sem link do que um link
    inventado."""
    rotulo = cfg["nome"]
    linhas = [l.strip() for l in texto_limpo(html).split("\n") if len(l.strip()) > 25]
    itens = []
    for i, linha in enumerate(linhas):
        prazo, brando = parse_data(linha)
        if not prazo:
            continue
        titulo = re.sub(r"\s*\d{1,2}/\d{1,2}/\d{4}\s*", " ", linha).strip(" |·-")
        if len(titulo) < 15:
            continue
        itens.append({
            "id": "%s-%s" % (rotulo, re.sub(r"\W+", "-", normalizar(titulo))[:60]),
            "fonte": rotulo,
            "url": cfg["url"],
            "titulo": titulo,
            "instituicao": "", "aos": titulo, "aoc": "", "local": "",
            "categoria": "", "contrato": "",
            "pais": cfg.get("pais_padrao", ""),
            "prazo": prazo, "prazo_brando": brando, "publicado": "",
            "texto": " ".join(linhas[max(0, i - 1):i + 2])[:1500],
            "link_e_da_lista": True,
            "visto_em": hoje().isoformat(),
        })
    batimento["fontes"][rotulo] = "ok · %d itens (lista sem link proprio)" % len(itens)
    return itens


def fonte_rss(sessao, cfg, batimento):
    """Fontes ainda NAO VERIFICADAS. Desligadas por padrao no arquivo de
    criterios. Se falharem, entram no batimento e nada mais acontece."""
    rotulo = cfg["nome"]
    try:
        r = sessao.get(cfg["url"], timeout=TIMEOUT)
        r.raise_for_status()
    except Exception as e:
        batimento["fontes"][rotulo] = "FALHOU: %s" % e.__class__.__name__
        return []
    itens = []
    for bloco in re.findall(r"(?is)<item>(.*?)</item>", r.text):
        def pega(tag):
            m = re.search(r"(?is)<%s[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</%s>" % (tag, tag), bloco)
            return htmllib.unescape(m.group(1)).strip() if m else ""
        pub, _ = parse_data(pega("pubDate"))
        itens.append({
            "id": "%s-%s" % (rotulo, re.sub(r"\W+", "-", pega("guid") or pega("link"))[-60:]),
            "fonte": rotulo, "url": pega("link"),
            "titulo": texto_limpo(pega("title")),
            "instituicao": "", "aos": "", "aoc": "", "local": "",
            "categoria": "", "contrato": "", "prazo": "", "prazo_brando": False,
            "publicado": pub,
            "texto": texto_limpo(pega("description"))[:1200],
            "visto_em": hoje().isoformat(),
        })
    batimento["fontes"][rotulo] = "ok · %d itens" % len(itens)
    return itens


# --------------------------------------------------- resolucao de area (opcao c)

def resolver_area(sessao, item, criterios, batimento, orcamento, porta="filosofia"):
    """O problema brasileiro, VERIFICADO em 2026-08-25: aqui a unidade de
    publicacao e o EDITAL, nao a vaga. O anuncio e 'UFRGS abre 20 vagas de
    Magisterio Superior, edital 09/2026' e as areas estao num anexo em PDF.
    Prova: a busca ?s=filosofia na docentefederal devolve 0 resultados, mas a
    listagem da mesma semana mostra 'UFU · Engenharia Fisica, Filosofia,
    Fisica, Quimica · Substituto'.

    Opcao (c), decidida em 2026-08-25: procura os termos no texto que ja temos;
    se nao achar e houver link de edital em HTML, busca UMA vez mais. PDF nao e
    aberto. O que nao se conseguir resolver ENTRA marcado — nunca e descartado
    por duvida.

    ISTO E UMA PORTA, NAO UM ELEITOR (corrigido em 2026-08-25, sessao 4). Ela
    responde 'este edital serve de candidato?' e escreve porta_passou. Quem
    decide a relevancia continua sendo o CABECA, no classificar(). Antes desta
    correcao a funcao escrevia relevancia='nicho' direto, e como toda pagina do
    site da ANPOF contem a palavra 'Filosofia', 'Historico da ANPOF' saia no
    topo da lista como nicho. Medido no dados/vagas.json das 11h38.

    Duas portas, escolhidas por fonte:
      filosofia  ANPOF, docentefederal — agregadores onde IFES, Pedro II e os
                 CAps publicam vaga de FILOSOFIA. Aqui a area e o que importa.
      posdoc     FAPERJ, FAPESP — fomento. O edital e geral e quase nunca diz
                 filosofia; o que importa e ser pos-doc e estar aberto.
    """
    cfg = criterios.get("resolucao_de_area") or {}
    if porta == "posdoc":
        porta_cfg = criterios.get("porta_posdoc") or {}
        termos = porta_cfg.get("termos") or ["pos-doutorado"]
        motivo_fechada = porta_cfg.get("motivo_fechada") or \
            "edital lido, nao e de pos-doutorado"
    else:
        termos = cfg.get("termos") or ["filosof"]
        motivo_fechada = "areas do edital lidas, sem filosofia"
    texto = normalizar(item.get("titulo", "") + " " + item.get("aos", "") + " " + item.get("texto", ""))

    # Casamento por PREFIXO aqui, de proposito: 'filosof' tem que pegar
    # filosofia, filosofica e filosoficas. Fronteira de palavra so no comeco.
    def achou(t):
        return any(re.search(r"(?<!\w)" + re.escape(normalizar(x)), t) for x in termos)

    if achou(texto):
        item["porta_passou"] = True
        item["area_confirmada"] = True
        return item

    if cfg.get("seguir_link_do_edital") and orcamento["restante"] > 0:
        alvo = _link_do_edital(item)
        if alvo:
            orcamento["restante"] -= 1
            try:
                r = sessao.get(alvo, timeout=TIMEOUT)
                if r.status_code == 200 and "pdf" not in (r.headers.get("Content-Type") or "").lower():
                    extra = texto_limpo(r.text)
                    item["texto"] = (item.get("texto", "") + "\n" + extra)[:4000]
                    if achou(normalizar(extra)):
                        item["porta_passou"] = True
                        item["area_confirmada"] = True
                        item["edital_lido"] = alvo
                        return item
                    texto = normalizar(extra)
            except Exception as e:
                batimento["avisos"].append("edital %s: %s" % (alvo[:50], e.__class__.__name__))
            time.sleep(PAUSA)

    # Heuristica declarada, e por isso ajustavel: se o texto resolvido e longo o
    # bastante para conter a lista de areas e filosofia nao esta la, e ausencia
    # de verdade. Se e curto (so PDF, ou pagina que nao abriu), e ignorancia —
    # e ignorancia sai marcada, nao descartada.
    minimo = cfg.get("min_texto_para_confiar", 400)
    if len(texto) >= minimo:
        item["porta_passou"] = False          # AUSENCIA: lemos, e nao esta la
        item["area_confirmada"] = False
        item["motivo_porta"] = motivo_fechada
    else:
        item["porta_passou"] = None           # IGNORANCIA: entra marcado
        item["area_confirmada"] = False
    return item


def _link_do_edital(item):
    """Procura no texto do item uma URL que pareca a pagina do edital."""
    m = re.search(r"https?://[^\s\"'<>)]+", item.get("texto", ""))
    if m and not m.group(0).lower().endswith(".pdf"):
        return m.group(0)
    return None


# ----------------------------------------------------------------------- fluxo

def ordenar(itens):
    """Secao 6 do agente_VAGAS.md: nao ha nota para ordenar — ordena-se pelo
    prazo, que e o que aperta. Urgentes primeiro, de qualquer bloco."""
    peso_rel = {"nicho": 0, "competencia": 1, "nao confirmada": 2, "aberto": 3}
    peso_grupo = {"A": 0, "B": 1, "C": 2, "publicacao": 0, "evento": 1}
    return sorted(itens, key=lambda i: (
        1 if i.get("vencida") else 0,          # vencida em carencia: sempre no fim
        0 if i.get("urgente") else 1,
        peso_grupo.get(i.get("bloco") or i.get("forma"), 3),
        peso_rel.get(i.get("relevancia"), 9),
        i.get("prazo") or "9999-99-99",
    ))


def executar(modo, diagnostico=False):
    criterios = ler_json(os.path.join(RAIZ, "criterios_%s.json" % modo), {})
    if not criterios:
        print("ERRO: criterios_%s.json nao encontrado ou vazio." % modo, file=sys.stderr)
        return 1

    estado = ler_json(ARQ_ESTADO, {})
    batimento = {"quando": agora_sp().isoformat(), "fontes": {}, "avisos": []}

    sessao = requests.Session()
    sessao.headers.update({"User-Agent": UA, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"})

    arq_saida = os.path.join(DIR_DADOS, "%s.json" % modo)
    anterior = ler_json(arq_saida, {"itens": []})
    por_id = {i["id"]: i for i in anterior.get("itens", [])}
    conhecidos = set(por_id) | {i["id"] for i in
                                ler_json(os.path.join(DIR_DADOS, "%s_historico.json" % modo),
                                         {"itens": []}).get("itens", [])}

    coletados, unidade_de, porta_de = [], {}, {}
    for cfg in (criterios.get("fontes") or []):
        nome = cfg.get("nome", "?")
        if not cfg.get("ligada"):
            batimento["fontes"][nome] = "desligada"
            continue
        metodo = cfg.get("metodo")
        try:
            if metodo == "sonda_id":
                if diagnostico:
                    batimento["fontes"][nome] = "pulada no diagnostico"
                    continue
                itens = _sondar_familia_philpapers(
                    sessao, cfg, estado.setdefault(nome, {"semente": cfg.get("semente")}), batimento)
            elif metodo == "lista_html":
                itens = fonte_lista_html(sessao, cfg, conhecidos, batimento, diagnostico)
            elif metodo == "rss":
                itens = fonte_rss(sessao, cfg, batimento)
            elif metodo == "manual":
                itens = fonte_manual(cfg, batimento)
            else:
                batimento["fontes"][nome] = "metodo desconhecido: %s" % metodo
                continue
        except Exception as e:
            batimento["fontes"][nome] = "FALHOU: %s: %s" % (e.__class__.__name__, e)
            continue
        for it in itens:
            unidade_de[it["id"]] = cfg.get("unidade", "vaga")
            porta_de[it["id"]] = cfg.get("porta", "filosofia")
        coletados += itens

    if diagnostico:
        print("\n=== DIAGNOSTICO · %s — nada foi escrito ===" % modo)
        for nome, situacao in batimento["fontes"].items():
            print("  %-18s %s" % (nome, situacao))
        for aviso in batimento["avisos"]:
            print("  aviso: %s" % aviso)
        return 0

    orcamento = {"restante": (criterios.get("resolucao_de_area") or {}).get(
        "max_seguimentos_por_rodada", 25)}
    for item in coletados:
        unidade = unidade_de.get(item["id"], "vaga")
        # A VALIDACAO VEM ANTES DE TUDO. Se o AOS estiver contaminado, ele ja
        # esta no cabeca quando o descarte barato roda — e o descarte barato e
        # a primeira decisao da cadeia. Validar depois seria validar tarde.
        validar_extracao(item, criterios)
        # O descarte barato vem PRIMEIRO: veto e 'discente' nao custam
        # requisicao, e a resolucao de area custa. Sem isto, cada 'Selecao de
        # Mestrado 2027' da ANPOF gastaria uma busca para ser jogada fora.
        # O descarte pelo corpo vem junto, e pela mesma razao: ele tambem nao
        # custa requisicao, e economiza a do resolver_area.
        morreu = (descarte_barato(item, criterios)
                  or descarte_pelo_corpo(item, criterios))
        if not morreu and unidade == "edital":
            resolver_area(sessao, item, criterios, batimento, orcamento,
                          porta_de.get(item["id"], "filosofia"))
        classificar(item, criterios, unidade)
        veredicto(item, criterios)

    # ---- RECLASSIFICACAO DOS ITENS JA VIVOS (Vagas 2) ----
    # O executar() so classificava item NOVO; os que ja estavam no arquivo eram
    # repassados verbatim, com os campos do dia em que entraram. Isso significa
    # que a correcao de extracao da Vagas 1 nunca alcancaria os 88 itens ja
    # publicados: o AOS envenenado ficaria la ate a vaga vencer.
    #
    # Esta passada nao usa rede: o corpo ja esta guardado no item, e o
    # porta_passou tambem. Ela tambem conserta um efeito colateral antigo —
    # dias_ate_prazo e urgente estavam congelados na data da coleta, e sao eles
    # que ordenam a lista.
    #
    # NAO REMOVE NADA. Item que a reclassificacao considerar rejeitado CONTINUA
    # no arquivo vivo, marcado. Foi decisao explicita do usuario em 2026-09-01:
    # a primeira rodada e para AUDITAR o resultado real antes de automatizar
    # qualquer remocao. O peneiramento abaixo so olha `coletados`, entao basta
    # nao mexer nele para que a garantia valha.
    cfg_por_fonte = {f.get("nome"): f for f in (criterios.get("fontes") or [])}
    novos_ids = {i["id"] for i in coletados}
    antigos = [i for i in por_id.values() if i.get("id") not in novos_ids]

    # Por FONTE, porque a poda so sabe o que e moldura comparando as paginas de
    # um mesmo site. E a poda tem de acontecer aqui tambem: o corpo guardado
    # dos itens antigos foi colhido antes da Vagas 1 e ainda carrega o menu.
    por_fonte = {}
    for item in antigos:
        por_fonte.setdefault(item.get("fonte"), []).append(item)

    refeitos = 0
    for fonte, itens_da_fonte in por_fonte.items():
        cfg = cfg_por_fonte.get(fonte) or {}
        metodo = cfg.get("metodo")
        corpos = [i.get("texto", "") for i in itens_da_fonte]
        if metodo == "lista_html":
            corpos = podar_repetido(corpos)
        for item, corpo in zip(itens_da_fonte, corpos):
            item["texto"] = corpo[:2500]
            reextrair_cabeca(item, corpo, metodo)
            item.pop("descartado", None)      # a decisao e refeita, nao herdada
            item.pop("motivo_saida", None)
            validar_extracao(item, criterios)
            (descarte_barato(item, criterios)
             or descarte_pelo_corpo(item, criterios))
            classificar(item, criterios, cfg.get("unidade", "vaga"))
            veredicto(item, criterios)
            refeitos += 1
    if refeitos:
        batimento["avisos"].append(
            "%d itens ja vivos reclassificados (sem rede, sem remocao)" % refeitos)

    # A ORDEM DESTAS PENEIRAS IMPORTA, e cada uma ja custou um defeito:
    #   descartado -> veto, tipo discente, ou sem aderencia no cabeca
    #   vencido    -> ROTEIA para o historico; nunca e descartado
    #   o resto    -> entra. Nao ha corte: quem tria e o usuario, no Cronograma.
    novos, rejeitados = [], []
    for item in coletados:
        if item.get("descartado"):
            rejeitados.append(item)
            continue
        if vencido(item):
            por_id[item["id"]] = item          # entra so para ser arquivado
            item["motivo_saida"] = "prazo vencido"
            continue
        if item["id"] not in por_id:
            item["novo"] = True
            novos.append(item)
        por_id[item["id"]] = item

    # CARENCIA DA VENCIDA (Passo 4, decidido em 2026-08-25).
    # Vencida vai para o historico SEMPRE — isso nao muda. Mas ela tambem
    # continua na lista viva, marcada, por alguns dias. A razao e o celular:
    # o Cronograma so acrescenta e atualiza, nunca remove. Se a vaga sumisse do
    # arquivo no dia do vencimento, ela ficaria pendurada no aparelho para
    # sempre, sem nunca aparecer como vencida. Marcada, voce arquiva num toque
    # — e 'st' e 'vida' continuam sendo so do aparelho, que era a regra a
    # preservar.
    carencia = (criterios.get("prazo") or {}).get("dias_de_carencia_vencida", 21)
    vivos, expirados = [], []
    for i in por_id.values():
        if vencido(i):
            expirados.append(i)
            if abs(i.get("dias_ate_prazo") or 0) <= carencia:
                i["vencida"] = True
                vivos.append(i)
        else:
            i["vencida"] = False
            vivos.append(i)
    vivos = ordenar(vivos)

    if expirados:
        hist = os.path.join(DIR_DADOS, "%s_historico.json" % modo)
        antigos = ler_json(hist, {"itens": []})
        ids = {i["id"] for i in antigos["itens"]}
        antigos["itens"] += [i for i in expirados if i["id"] not in ids]
        antigos["_o_que_e"] = ("Itens que sairam da lista viva por prazo. Preservados, "
                               "nunca apagados. Roteados ANTES de qualquer filtro.")
        escrever_json(hist, antigos)

    arq_rej = os.path.join(DIR_DADOS, "%s_rejeitados.json" % modo)
    rej_ant = ler_json(arq_rej, {"itens": []})
    linhas = [{"id": i["id"], "titulo": i.get("titulo", ""), "url": i.get("url", ""),
               "motivo_saida": i.get("motivo_saida", ""), "visto_em": i.get("visto_em", "")}
              for i in rejeitados]
    escrever_json(arq_rej, {
        "_o_que_e": "O que o filtro barrou, com a razao. Serve para afinar "
                    "criterios_%s.json com evidencia em vez de palpite." % modo,
        "_teto": 200,
        "_barrados_nesta_rodada": len(linhas),
        "itens": (linhas + rej_ant.get("itens", []))[:200],
    })

    contagem = {}
    for i in vivos:
        chave = i.get("bloco") or i.get("forma") or "?"
        contagem[chave] = contagem.get(chave, 0) + 1
    grupos = " ".join("%s:%d" % (k, contagem[k]) for k in sorted(contagem))
    urgentes = sum(1 for i in vivos if i.get("urgente"))
    batimento["resumo"] = (
        "%d vivos (%s) · %d urgentes · %d novos · "
        "%d arquivados por prazo · %d barrados" % (
            len(vivos), grupos or "vazio", urgentes, len(novos),
            len(expirados), len(rejeitados)))

    escrever_json(arq_saida, {
        "_gerado_em": batimento["quando"],
        "_o_que_e": "Lista viva. Classificada, nao pontuada. A ordem e a da secao 6 "
                    "do agente_%s.md: urgentes primeiro, depois bloco, depois prazo." % modo.upper(),
        "_batimento": batimento,
        "itens": vivos,
    })
    if novos:
        escrever_json(os.path.join(DIR_EVENTOS, "%s_%s.json" % (modo, hoje().isoformat())),
                      {"quando": batimento["quando"], "itens": novos})
    escrever_json(ARQ_ESTADO, estado)

    print("=== BATIMENTO · %s ===" % modo)
    for nome, situacao in batimento["fontes"].items():
        print("  %-18s %s" % (nome, situacao))
    for aviso in batimento["avisos"][:12]:
        print("  aviso: %s" % aviso)
    print("  %s" % batimento["resumo"])
    return 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    modo = args[0] if args else "vagas"
    if modo not in ("vagas", "chamadas"):
        print("uso: coletor.py [vagas|chamadas] [--diagnostico]", file=sys.stderr)
        sys.exit(2)
    sys.exit(executar(modo, diagnostico="--diagnostico" in sys.argv))
