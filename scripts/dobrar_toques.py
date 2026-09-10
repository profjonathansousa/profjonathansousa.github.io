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

SEIS COISAS ATRAVESSAM APARELHOS, e cada uma tem o seu tipo de toque:
    registro   -> progresso dos subitens dos trilhos, em `itens`
    triagem    -> a marca de cada vaga na aba Vagas, em `triagem`
    meta       -> as metas do mes, uma a uma, em `metas`
    evento     -> as datas importantes, SO A DATA, em `eventos`
    prioridade -> o que voce elegeu para a semana no Hoje, em `prioridades`
    toefl      -> os itens do guia do TOEFL, um a um, em `toefl`
    retomada   -> ate quando calar sobre um projeto parado, em `retomadas`

A retomada entrou na Fase 6B. A chave e painel/projeto e o valor e a data ate
quando o projeto fica silenciado. Tambem nao tem lapide, e por um motivo
proprio: nao existe operacao de dessilenciar — a entrada morre pela data que
ela mesma carrega. A data e ABSOLUTA e nao duracao, para que um toque atrasado
nao estenda o silencio ao chegar.

O toefl entrou na Fase 6A. Ele e o caso mais simples dos seis: a chave e o `id`
do item no TOEFL_GUIA e o valor e um booleano. Nao tem lapide `del` porque o
item nao e coisa que o usuario cria — ele mora na estrutura da pagina e so pode
ser marcado ou desmarcado, nunca apagado. Desmarcar viaja como feito=false com
instante proprio; AUSENCIA NAO E false, e por isso a migracao das marcas antigas
so publica as verdadeiras.

A prioridade entrou na Fase 2 (Hoje 2.0), e entrou aqui em vez de ficar so no
aparelho porque ela e a decisao central do novo Hoje: eleger no computador na
segunda e nao ver nada no celular na terca esvaziaria a funcao. Ela seguiu o
molde da meta, que e o caso mais proximo — chave "periodo/id", lapide `del`,
e o relogio decidindo quem vence.
Toque de tipo que este script nao conhece nao e descartado: vai para o
historico e o id fica em _ids_dobrados, para nao ser contado duas vezes.

USO:
    python3 scripts/dobrar_toques.py            # dobra e relata
    python3 scripts/dobrar_toques.py --seco     # só relata, não escreve nada

    # a sessão do Cowork marcando uma etapa que o pipeline fechou:
    python3 scripts/dobrar_toques.py --registrar pipeline/a00/a00-4 --para 2
    python3 scripts/dobrar_toques.py --registrar pipeline/a00/a00-5 --para 1 --seco

    # o Cowork publicando a estrutura que acabou de montar:
    python3 scripts/dobrar_toques.py --publicar-estrutura /tmp/entrada-nova.json
    python3 scripts/dobrar_toques.py --publicar-estrutura /tmp/entrada-nova.json --seco

O --publicar-estrutura escreve Cronograma/entrada.json E registra na
cron_estrutura_base exatamente a estrutura publicada, no mesmo ato. Ele RECEBE a
estrutura pronta — não a reconstrói de outra fonte — e recusa a publicação inteira
se não puder registrar a base: publicar só metade deixaria a base mentindo, e o
merge de três vias viraria de duas em silêncio. Exige SUPABASE_URL e
SUPABASE_SECRET_KEY no ambiente.

O --registrar escreve um toque com aparelho "cowork" e dobra em seguida: grava o
arquivo na pasta conectada e lê de volta no mesmo comando. É a metade que faltava
do elo pipeline -> Cronograma.

DESDE A FASE 9G-0 ele também publica o MESMO toque no estado compartilhado (uma
linha `item` e uma linha de registro), quando SUPABASE_URL e SUPABASE_SECRET_KEY
estiverem no ambiente. Sem elas, grava o toque, diz que não publicou e segue — o
caminho do GitHub continua inteiro. O toque é o artefato durável; publicar é
melhor esforço.

REGRA DURA DO --registrar: ele RECUSA subitem de prova "estrela". O mapa_portal.json
marca assim as etapas cuja conclusão é decisão do autor e não artefato — a escolha
entre as opções A/B/C, o portão do NotebookLM, o "pronto para submeter". Escrever
toque sobre elas faria o relógio do Cowork vencer a decisão do autor e apagá-la. O
campo prova viaja no Cronograma/entrada.json. Para insistir mesmo assim: --forcar.
"""

import json
import os
import shutil
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_TOQUES = os.path.join(RAIZ, "Cronograma", "toques")
DIR_DOBRADOS = os.path.join(DIR_TOQUES, "_dobrados")
ARQ_ESTADO = os.path.join(RAIZ, "Cronograma", "estado.json")
ARQ_ENTRADA = os.path.join(RAIZ, "Cronograma", "entrada.json")
ESTADO_VERSAO = 3


def estado_vazio():
    return {
        "_versao": ESTADO_VERSAO,
        "_o_que_e": ("Estado consolidado do Cronograma. Escrito SO por "
                     "scripts/dobrar_toques.py, a partir dos arquivos de "
                     "Cronograma/toques/. Nao editar a mao."),
        "_escritor": "scripts/dobrar_toques.py",
        "_dobrado_em": None,
        "itens": {},
        "triagem": {},
        "metas": {},
        "eventos": {},
        "prioridades": {},
        "toefl": {},
        "retomadas": {},
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
    # Um estado gravado pela versao 1 ganha as secoes novas vazias acima; a
    # marca de versao precisa acompanhar, senao ele mente sobre a propria forma.
    e["_versao"] = ESTADO_VERSAO
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


def alvo(t):
    """Onde este toque manda: (secao, chave). (None, None) quando ele nao manda
    em lugar nenhum — e mesmo assim ele entra no historico.

    A chave nunca leva titulo nem texto. Um item e painel/projeto/subitem; uma
    vaga e o seu id; uma meta e mes/id. Renomear nao pode criar um item novo —
    foi exatamente esse o defeito que o log por id consertou no Passo 4."""
    tipo = t.get("tipo") or "registro"
    d = t.get("dados") or {}
    if tipo == "registro":
        if not d.get("subId"):
            return (None, None)
        return ("itens", "%s/%s/%s" % (d.get("pid"), d.get("projId"), d.get("subId")))
    if tipo == "triagem":
        if not d.get("vid"):
            return (None, None)
        return ("triagem", str(d.get("vid")))
    if tipo == "meta":
        if not d.get("mes") or not d.get("mid"):
            return (None, None)
        return ("metas", "%s/%s" % (d.get("mes"), d.get("mid")))
    if tipo == "evento":
        if not d.get("eid"):
            return (None, None)
        return ("eventos", str(d.get("eid")))
    if tipo == "prioridade":
        # Mesma forma da meta: periodo/id. A semana e ISO ("2026-W36"), que e a
        # unidade que o Hoje 2.0 usa — voce elege na segunda e a escolha vale
        # ate domingo, sem redigitar.
        if not d.get("sem") or not d.get("prid"):
            return (None, None)
        return ("prioridades", "%s/%s" % (d.get("sem"), d.get("prid")))
    if tipo == "toefl":
        # O endereco e o `id` do item, e ele e global: nao leva a fase junto.
        # Assim a marca segue o item mesmo se ele mudar de fase um dia, e o
        # indice no array — que era a chave antiga — deixa de mandar em nada.
        if not d.get("iid"):
            return (None, None)
        return ("toefl", str(d.get("iid")))
    if tipo == "retomada":
        # Painel/projeto, como o registro — menos o subitem: o silencio e do
        # PROJETO, e nao de uma etapa dele.
        if not d.get("pid") or not d.get("projId"):
            return (None, None)
        return ("retomadas", "%s/%s" % (d.get("pid"), d.get("projId")))
    return (None, None)


def valor(t):
    """O que fica gravado no estado. `quando` e `aparelho` sao de todos os tipos:
    e por `quando` que a proxima rodada decide quem vence."""
    tipo = t.get("tipo") or "registro"
    d = t.get("dados") or {}
    if tipo == "registro":
        v = {"st": d.get("para"),
             "vida": d.get("vida", "ativo"),
             "temMotivo": bool(d.get("temMotivo")),
             "projT": d.get("projT"),
             "subT": d.get("subT")}
    elif tipo == "triagem":
        v = {"st": d.get("st")}
    elif tipo == "evento":
        # O TITULO VIAJA, salvo quando o evento esta marcado como privado. A
        # primeira versao de 29/08 nao publicava titulo nenhum; o autor reverteu
        # no mesmo dia, porque data sem nome chega no outro aparelho como um
        # numero solto e nao serve. A marca e por evento, e nao global, porque o
        # risco tambem e: um retiro de igreja e um compromisso pastoral nao
        # correm o mesmo risco.
        #
        # O motivo de a marca existir e o `historico`, que nunca e podado: um
        # titulo publicado uma vez fica publico para sempre, inclusive depois de
        # o evento ser apagado. Por isso marcar privado nao e retroativo — tira
        # o titulo DESTA secao, nao do historico.
        #
        # O toque de um evento privado nao carrega `t`. Aqui a ausencia e
        # respeitada: o campo simplesmente nao entra no valor, e um titulo que
        # estivesse nesta secao some quando o evento passa a privado.
        # `del` e a lapide, pelo mesmo motivo das metas.
        v = {"data": d.get("data"), "priv": bool(d.get("priv")), "del": bool(d.get("del"))}
        if not d.get("priv") and isinstance(d.get("t"), str):
            v["t"] = d.get("t")
    elif tipo == "prioridade":
        # A PRIORIDADE DE TRILHO NAO CARREGA O TEXTO DA ETAPA. Ela carrega o
        # ENDERECO do projeto (painel + projId), e o texto e lido do trilho no
        # aparelho que desenha. E a regra dura da Fase 2: o Hoje nunca inventa
        # nem congela o estagio de um projeto. Se o texto viajasse, o celular
        # mostraria a etapa de quando a prioridade foi criada, e nao a de agora
        # — exatamente o que o pipeline existe para evitar.
        #
        # O `t` que viaja e o rotulo da prioridade LIVRE, e o titulo do projeto
        # so como legenda. Nenhum dos dois substitui o estagio.
        #
        # `feito_em` E UMA DATA, e nao um booleano. A regra de tela depende de
        # QUANDO a prioridade foi cumprida: no dia em que foi marcada ela fica
        # visivel e marcada; no dia seguinte ela sai do Hoje. Um booleano
        # obrigaria cada aparelho a adivinhar o dia, e o aparelho que recebesse
        # a marca no dia seguinte a exibiria como se fosse de hoje.
        # Vazio e "nao cumprida" — e o valor de quem nunca foi marcada e o de
        # quem foi desmarcada, que para a tela sao a mesma coisa.
        v = {"tipo": d.get("tipo") or "livre",
             "painel": d.get("painel") or "",
             "projId": d.get("projId") or "",
             "t": d.get("t", ""),
             "feito_em": d.get("feito_em", ""),
             "del": bool(d.get("del"))}
    elif tipo == "toefl":
        # So o booleano. Nem o texto do item nem a fase viajam: os dois moram no
        # TOEFL_GUIA, que e estrutura da pagina, e o aparelho que desenha os le
        # de la. Mesma regra da prioridade, pelo mesmo motivo.
        v = {"feito": bool(d.get("feito"))}
    elif tipo == "retomada":
        # So a data. O titulo do projeto e o estagio nao viajam: sao lidos do
        # trilho no aparelho que desenha, pela regra da Fase 2.
        v = {"ate": d.get("ate")}
    else:
        # A meta apagada vira lapide: fica no estado com del=true, para que o
        # aparelho que ainda a tem saiba que ela morreu. Sem isso, ausencia e
        # desconhecimento sao a mesma coisa, e a meta ressuscita no proximo
        # carregamento do outro aparelho.
        v = {"t": d.get("t", ""),
             "done": bool(d.get("done")),
             "de": d.get("de"),
             "del": bool(d.get("del"))}
    v["quando"] = t.get("quando")
    v["aparelho"] = t.get("aparelho")
    return v


def dobrar(estado, toques):
    ja = set(estado["_ids_dobrados"])
    # O `ja` cresce DENTRO desta selecao. Sem isso o conjunto era fotografado
    # uma vez e nunca mais olhado, e o mesmo toque presente em dois arquivos do
    # mesmo lote passava duas vezes — entrava duas vezes no historico e duas
    # vezes em _ids_dobrados. Passou a acontecer de verdade quando o navegador
    # ganhou nome de arquivo derivado do lote inteiro: se a resposta de um envio
    # se perde, o toque ja gravado sobe outra vez junto dos novos, e os dois
    # arquivos podem cair na mesma rodada.
    novos = []
    for t in toques:
        ident = t.get("id")
        if not ident or ident in ja:
            continue
        ja.add(ident)
        novos.append(t)
    # Ordem por relogio, nao por ordem de leitura do diretorio: quem chega
    # depois no tempo e quem manda no estado final.
    novos.sort(key=lambda t: t.get("quando") or "")
    atrasados = 0
    sem_alvo = 0
    for t in novos:
        secao, k = alvo(t)
        if secao is None:
            # Tipo que este script nao conhece — uma versao da pagina mais nova
            # do que ele, tipicamente. Vai para o historico assim mesmo: o
            # arquivo de toque sera apagado, e o que ele dizia nao pode sumir
            # junto. Quando o script aprender o tipo, o dado ainda estara aqui.
            estado["historico"].append(t)
            estado["_ids_dobrados"].append(t["id"])
            sem_alvo += 1
            continue
        # Toque atrasado NAO derruba estado mais novo. Acontece de verdade: voce
        # toca no Mac sem rede as 10h, toca no celular as 10h05 com rede, e o Mac
        # so consegue enviar depois. O toque das 10h e novo para esta funcao (id
        # nunca visto) mas velho para o item. Ele entra no historico do mesmo
        # jeito — nada se perde —, so nao manda no estado.
        atual = estado.setdefault(secao, {}).get(k)
        if atual and (atual.get("quando") or "") > (t.get("quando") or ""):
            estado["historico"].append(t)
            estado["_ids_dobrados"].append(t["id"])
            atrasados += 1
            continue
        estado[secao][k] = valor(t)
        estado["historico"].append(t)
        estado["_ids_dobrados"].append(t["id"])
    if atrasados:
        print("Toques atrasados (guardados no historico, sem mandar no estado): %d" % atrasados)
    if sem_alvo:
        print("Toques de tipo desconhecido (guardados no historico): %d" % sem_alvo)
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


def _agora_iso():
    import datetime
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def procurar_na_entrada(pid, proj_id, sub_id):
    """Devolve (titulo do projeto, titulo do subitem, prova) pelo entrada.json.
    Devolve (None, None, None) quando o entrada nao conhece o item."""
    if not os.path.exists(ARQ_ENTRADA):
        return (None, None, None)
    with open(ARQ_ENTRADA, encoding="utf-8") as f:
        ent = json.load(f)
    for proj in (ent.get("paineis", {}).get(pid) or []):
        if proj.get("id") != proj_id:
            continue
        for sub in (proj.get("subs") or []):
            if sub.get("id") == sub_id:
                return (proj.get("t"), sub.get("t"), sub.get("prova"))
    return (None, None, None)


# ===================== A PUBLICACAO DA ESTRUTURA (9G-0 B1) =====================
# O entrada.json e escrito pelo Cowork a partir do que o pipeline produziu (ver o
# `_escritor` dentro do proprio arquivo). Ate aqui isso era um `write` solto: o
# arquivo ia para o repositorio e ninguem registrava O QUE tinha sido publicado.
#
# A cron_estrutura_base existe justamente para guardar isso, e e a TERCEIRA VIA
# do merge: sem ela, discordancia entre o entrada.json e o aparelho so pode
# significar "o aparelho esta desatualizado" — e renomear a mao vira coisa que a
# proxima publicacao desfaz em silencio. Com ela, a pergunta passa a ser "o
# pipeline mudou este campo desde a ultima publicacao?", que e outra pergunta.
#
# POR ISSO OS DOIS SAO UM ATO SO. Publicar o arquivo sem registrar a base
# deixaria a base MENTINDO — dizendo "o pipeline nunca mexeu nisso" sobre um
# campo que ele acabou de mexer —, e uma base que mente e pior do que base
# nenhuma: o merge de tres vias viraria de duas sem ninguem perceber.
#
# A ORDEM E A GARANTIA. O arquivo novo e escrito num temporario, a base e
# publicada, e so entao o temporario toma o lugar do entrada.json. Se a
# publicacao falhar, o temporario e removido e NADA muda: o arquivo anterior e a
# base anterior continuam de acordo um com o outro. E por isso que aqui, ao
# contrario do --registrar, publicar NAO e melhor esforco — sem credenciais o
# comando recusa, em vez de publicar so metade.
#
# A BASE NASCE DA PRIMEIRA PUBLICACAO REAL, e nao de uma semeadura: nada aqui le
# o entrada.json que ja esta no disco para "preencher" a base. Semear seria
# afirmar que o pipeline publicou algo que ele talvez nunca tenha publicado —
# exatamente a mentira que o paragrafo acima descreve.
CAMPOS_PROJETO = ("t", "n", "mes")
CAMPOS_SUBITEM = ("t", "n", "onde", "prova", "medida", "ordem")


def _so_campos(d, campos):
    """O valor guardado e SO o que o esquema declara para aquele tipo. Guardar o
    objeto inteiro faria a base carregar campos que nao sao estrutura (um `st`,
    por exemplo) e o merge passaria a comparar progresso como se fosse titulo."""
    return {c: d[c] for c in campos if c in d}


def linhas_da_base(entrada):
    """Converte a estrutura PUBLICADA nas linhas da cron_estrutura_base. Recebe o
    objeto que vai para o disco — nunca o que ja estava la, nunca o estado."""
    fora = []
    for pid, projetos in (entrada.get("paineis") or {}).items():
        for pr in (projetos or []):
            if not pr or not pr.get("id"):
                continue
            fora.append({"chave": "%s/%s" % (pid, pr["id"]), "tipo": "projeto",
                         "valor": _so_campos(pr, CAMPOS_PROJETO)})
            for sub in (pr.get("subs") or []):
                if not sub or not sub.get("id"):
                    continue
                fora.append({"chave": "%s/%s/%s" % (pid, pr["id"], sub["id"]),
                             "tipo": "subitem",
                             "valor": _so_campos(sub, CAMPOS_SUBITEM)})
    return fora


def _conferir_entrada(entrada):
    """Recusa cedo o que nao e uma estrutura publicavel. Um arquivo meio escrito
    que chegasse a base seria pior do que um erro: viraria a versao `publicada`."""
    if not isinstance(entrada, dict):
        raise RuntimeError("a estrutura precisa ser um objeto JSON")
    paineis = entrada.get("paineis")
    if not isinstance(paineis, dict) or not paineis:
        raise RuntimeError("a estrutura nao tem `paineis`")
    if not entrada.get("_gerado_em"):
        raise RuntimeError("a estrutura nao tem `_gerado_em`: sem ele a base nao "
                           "sabe de que publicacao ela e")
    vistas = set()
    for pid, projetos in paineis.items():
        if not isinstance(projetos, list):
            raise RuntimeError("paineis['%s'] deveria ser uma lista" % pid)
        for pr in projetos:
            if not isinstance(pr, dict) or not pr.get("id"):
                raise RuntimeError("projeto sem id em '%s'" % pid)
            k = "%s/%s" % (pid, pr["id"])
            if k in vistas:
                raise RuntimeError("id de projeto repetido: %s" % k)
            vistas.add(k)
            for sub in (pr.get("subs") or []):
                if not isinstance(sub, dict) or not sub.get("id"):
                    raise RuntimeError("subitem sem id em %s" % k)
                ks = "%s/%s" % (k, sub["id"])
                if ks in vistas:
                    raise RuntimeError("id de subitem repetido: %s" % ks)
                vistas.add(ks)


def publicar_estrutura(caminho_novo, seco):
    """Publica a estrutura de `caminho_novo` como Cronograma/entrada.json e
    registra na cron_estrutura_base EXATAMENTE o que foi publicado."""
    with open(caminho_novo, "r", encoding="utf-8") as f:
        entrada = json.load(f)
    _conferir_entrada(entrada)
    linhas = linhas_da_base(entrada)
    gerado_em = entrada["_gerado_em"]

    print("Estrutura a publicar (de %s):" % os.path.relpath(caminho_novo, RAIZ))
    print("  %d projeto(s) e %d subitem(ns), gerada em %s"
          % (sum(1 for l in linhas if l["tipo"] == "projeto"),
             sum(1 for l in linhas if l["tipo"] == "subitem"), gerado_em))
    if seco:
        print("\n--seco: nada foi escrito, nem no disco nem na base.")
        return 0

    url, chave = _credenciais()
    if not url or not chave:
        print("\nRECUSADO: faltam %s e/ou %s no ambiente." % (API_URL, API_CHAVE))
        print("Publicar o arquivo sem registrar a base deixaria a base mentindo, e")
        print("o merge de tres vias viraria de duas em silencio. Nada foi escrito.")
        return 1

    # 1. o arquivo novo, ainda ao lado do definitivo
    temporario = ARQ_ENTRADA + ".novo"
    with open(temporario, "w", encoding="utf-8") as f:
        json.dump(entrada, f, ensure_ascii=False, indent=1)
        f.write("\n")

    # 2. a base, NUMA CHAMADA SO. Gravar num POST e retirar num DELETE seriam
    #    duas operacoes independentes: uma falha entre elas deixaria a base pela
    #    metade — afirmando que o pipeline publicou algo que ele nao publicou —
    #    enquanto o entrada.json antigo continuaria no disco. Compensar depois
    #    nao resolve, porque a compensacao tambem pode falhar.
    #
    #    O cron_publicar_estrutura() faz a substituicao inteira dentro de UMA
    #    transacao (ver sql/cron_estado.sql): ou a base passa a ser exatamente a
    #    estrutura publicada, ou continua sendo exatamente a anterior. E o que
    #    torna verdadeira a garantia que este comando anuncia.
    try:
        dono = _dono(url, chave)
        agora = _agora_iso()
        r = _pedir(url, chave, "/rpc/cron_publicar_estrutura", "POST", {
            "p_dono": dono, "p_gerado_em": gerado_em, "p_linhas": linhas,
        })
        conta = (r[0] if isinstance(r, list) and r else r) or {}
        mortas = int(conta.get("retiradas") or 0)
        gravadas = int(conta.get("gravadas") or len(linhas))
    except Exception as e:
        try:
            os.remove(temporario)
        except OSError:
            pass
        print("\nFALHOU ao registrar a base: %s" % e)
        print("NADA foi publicado: o entrada.json anterior e a base anterior")
        print("continuam de acordo um com o outro. Corrija e repita.")
        return 1

    # 3. so agora o arquivo toma o lugar do anterior
    os.replace(temporario, ARQ_ENTRADA)
    print("\nPublicado:")
    print("  %s" % os.path.relpath(ARQ_ENTRADA, RAIZ))
    print("  cron_estrutura_base: %d linha(s) registrada(s)%s"
          % (gravadas, (", %d retirada(s)" % mortas) if mortas else ""))
    print("  A base agora diz exatamente o que este arquivo publica (%s)." % agora)
    return 0


# ======================= O CAMINHO ONLINE DO --registrar =======================
# Fase 9G-0. O pipeline sempre foi um segundo escritor REAL, e nao um espelho: ele
# afirma um fato que so ele verifica (o artefato existe), e o afirma pela mesma
# porta por onde o iPhone entra. Ate aqui essa porta era so o arquivo de toque.
# Enquanto o caminho do GitHub existir isso basta; no dia em que ele sair, o
# pipeline ficaria sem interlocutor. Esta e a metade que faltava, e ela e
# preparada AGORA justamente para que a 9G nao precise inventar nada depois.
#
# O QUE ELE PUBLICA, e nada alem disso:
#   · uma linha `item` em cron_estado — progresso e ciclo de vida;
#   · uma linha em cron_registro, com o id DO TOQUE como chave primaria.
# Nao publica estrutura. A separacao entre progresso e estrutura e do esquema, e
# a base de tres vias (cron_estrutura_base) tem dono proprio e outro momento.
#
# O MESMO `em` NOS DOIS CAMINHOS: o `agora` que carimba o toque e o mesmo que
# sobe na linha. Sem isso o LWW de um caminho decidiria diferente do outro, e a
# prova da 9F nao teria o que comparar.
#
# A FRONTEIRA CONTINUA ANTES: a recusa de prova "estrela" acontece la em cima,
# no registrar(), e nada aqui a alcanca. Publicar e o ultimo passo de um toque
# que ja foi autorizado — nunca uma segunda chance para um que nao foi.
#
# O RELOGIO DO SERVIDOR RECUSA O ATRASADO: o gatilho cron_estado_relogio()
# descarta upsert cujo `em` nao seja mais novo. O pipeline nao pode desfazer uma
# decisao mais recente sua, nem que tente.
#
# O TOQUE E O ARTEFATO DURAVEL. Publicar e melhor esforco: se a rede cair ou as
# credenciais faltarem, o arquivo de toque ja esta gravado e a dobra segue como
# sempre. O comando diz o que deixou de fazer, em vez de fingir que fez.
API_URL   = "SUPABASE_URL"
API_CHAVE = "SUPABASE_SECRET_KEY"


def _credenciais():
    """Devolve (url, chave) ou (None, None). As duas ja existem no repositorio,
    usadas pelo avisos/enviar.mjs: SUPABASE_URL e uma variable e
    SUPABASE_SECRET_KEY um secret. NENHUMA delas mora no codigo, e nenhuma e
    inventada aqui."""
    url = (os.environ.get(API_URL) or "").rstrip("/")
    chave = os.environ.get(API_CHAVE) or ""
    return (url, chave) if (url and chave) else (None, None)


def _pedir(url, chave, caminho, metodo="GET", corpo=None, prefer=None):
    import urllib.request
    import urllib.error
    cabecalho = {"apikey": chave, "Authorization": "Bearer " + chave,
                 "Content-Type": "application/json"}
    if prefer:
        cabecalho["Prefer"] = prefer
    dados = json.dumps(corpo).encode("utf-8") if corpo is not None else None
    req = urllib.request.Request(url + "/rest/v1" + caminho, data=dados,
                                 headers=cabecalho, method=metodo)
    with urllib.request.urlopen(req, timeout=20) as r:
        bruto = r.read().decode("utf-8") or "[]"
    return json.loads(bruto) if bruto.strip() else []


def _dono(url, chave):
    """O uuid do dono vem da cron_dono, e nao de um segredo a mais. DOIS DONOS E
    AMBIGUIDADE, nao um caso a resolver por escolha: o pipeline para e diz."""
    linhas = _pedir(url, chave, "/cron_dono?select=uid&limit=2")
    if len(linhas) != 1:
        raise RuntimeError("cron_dono tem %d linha(s); esperava exatamente 1" % len(linhas))
    return linhas[0]["uid"]


def publicar_online(toque, seco):
    """Sobe o MESMO toque para o estado compartilhado. Devolve um texto do que
    aconteceu — quem chama imprime, e nunca deixa isto derrubar a gravacao."""
    url, chave = _credenciais()
    if not url or not chave:
        return ("nao publicado online: faltam %s e/ou %s no ambiente.\n"
                "  O caminho do GitHub segue inteiro. Para publicar tambem online,\n"
                "  rode onde as duas existam (ver .github/workflows/dobrar-toques.yml)."
                % (API_URL, API_CHAVE))
    if seco:
        return "--seco: nada publicado online."

    d = toque["dados"]
    dono = _dono(url, chave)
    chave_item = "%s/%s/%s" % (d["pid"], d["projId"], d["subId"])

    # `item`: progresso e ciclo de vida. Nem titulo, nem filhos — estrutura nao
    # viaja por aqui. O `motivo` vai vazio de proposito: o pipeline nao tem
    # motivo a dar, e temMotivo do toque ja e False.
    _pedir(url, chave, "/cron_estado", "POST", [{
        "dono": dono, "dominio": "item", "chave": chave_item,
        "valor": {"st": d["para"], "vida": d.get("vida") or "ativo",
                  "motivo": "", "voltar_em": "", "vidaDesde": ""},
        "del": False, "em": toque["quando"], "aparelho": "cowork",
        "expira_em": None,
    }], prefer="resolution=merge-duplicates,return=minimal")

    # `cron_registro`: a chave e o id DO TOQUE, a mesma que o caminho do GitHub
    # grava em `tid`. E o que faz as duas descidas reconhecerem a mesma linha e
    # nao duplica-la. ignore-duplicates porque reenviar tem de ser silencio.
    _pedir(url, chave, "/cron_registro", "POST", [{
        "id": toque["id"], "dono": dono, "d": d["d"],
        "pid": d["pid"], "proj_id": d["projId"], "sub_id": d["subId"],
        "proj_t": d.get("projT") or "", "sub_t": d.get("subT") or "",
        "de": d.get("de"), "para": d["para"], "vida": d.get("vida") or "ativo",
        "motivo": "", "aparelho": "cowork",
    }], prefer="resolution=ignore-duplicates,return=minimal")

    return ("publicado online: item %s e uma linha de registro (%s).\n"
            "  O relogio do servidor descarta a linha se ja houver decisao mais nova."
            % (chave_item, toque["id"]))


def registrar(alvo, para, vida, forcar, seco):
    """Escreve UM toque, como se o Cowork fosse mais um aparelho."""
    partes = (alvo or "").split("/")
    if len(partes) != 3:
        print("Alvo invalido: %r. Use painel/projeto/subitem, ex.: pipeline/a00/a00-4" % alvo)
        return 1
    pid, proj_id, sub_id = partes

    projT, subT, prova = procurar_na_entrada(pid, proj_id, sub_id)
    if prova is None and projT is None:
        print("AVISO: %s nao esta no Cronograma/entrada.json." % alvo)
        print("Se o id estiver errado, o toque nao vai aparecer em lugar nenhum.")
    if prova == "estrela" and not forcar:
        print("RECUSADO: %s tem prova 'estrela'." % alvo)
        print("Etapa cuja conclusao e decisao do autor, nao artefato. O Cowork nao")
        print("escreve toque sobre ela: o relogio dele venceria a decisao do autor e")
        print("a apagaria. Se for mesmo o caso, repita com --forcar.")
        return 1

    estado = carregar_estado()
    atual = estado["itens"].get("%s/%s/%s" % (pid, proj_id, sub_id)) or {}
    de = atual.get("st")
    if projT is None:
        projT = atual.get("projT")
    if subT is None:
        subT = atual.get("subT")

    agora = os.environ.get("TOQUE_AGORA") or _agora_iso()
    ident = agora.replace(":", "-").replace(".", "-") + "-cowork"
    toque = {"v": 1, "id": ident, "quando": agora, "aparelho": "cowork",
             "app": "dobrar_toques.py", "tipo": "registro",
             "dados": {"d": agora[:10], "pid": pid, "projId": proj_id, "subId": sub_id,
                       "projT": projT, "subT": subT, "de": de, "para": para,
                       "vida": vida, "temMotivo": False}}

    print("Toque a escrever:")
    print("  %s   %s / %s" % (alvo, projT or "?", subT or "?"))
    print("  st %s -> %s   vida=%s   prova=%s" % (de, para, vida, prova or "?"))
    if seco:
        print("\n--seco: nada foi escrito.")
        print("  " + publicar_online(toque, True))
        return 0

    os.makedirs(DIR_TOQUES, exist_ok=True)
    caminho = os.path.join(DIR_TOQUES, ident + ".json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump({"v": 1, "lote": ident, "quando": agora, "aparelho": "cowork",
                   "app": "dobrar_toques.py", "toques": [toque]},
                  f, ensure_ascii=False, indent=1)
        f.write("\n")
    print("\nEscrito em %s" % os.path.relpath(caminho, RAIZ))

    # DEPOIS de gravado, e nunca antes: o arquivo e o artefato duravel, e uma
    # rede fora nao pode custar o toque.
    try:
        print("  " + publicar_online(toque, seco))
    except Exception as e:
        print("  nao publicado online: %s" % e)
        print("  O toque esta gravado. A dobra e o caminho do GitHub seguem inteiros.")
    return 0


def arg(nome, padrao=None):
    if nome in sys.argv:
        i = sys.argv.index(nome)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return padrao


def main():
    seco = "--seco" in sys.argv

    if "--publicar-estrutura" in sys.argv:
        caminho = arg("--publicar-estrutura")
        if not caminho:
            print("Falta o arquivo: --publicar-estrutura caminho/para/entrada.json")
            return 1
        if not os.path.exists(caminho):
            print("Nao existe: %s" % caminho)
            return 1
        try:
            return publicar_estrutura(caminho, seco)
        except Exception as e:
            print("RECUSADO: %s" % e)
            print("Nada foi escrito.")
            return 1

    if "--registrar" in sys.argv:
        para = arg("--para")
        if para is None:
            print("Falta --para 0|1|2 (a fazer, em andamento, concluida).")
            return 1
        r = registrar(arg("--registrar"), int(para), arg("--vida", "ativo"),
                      "--forcar" in sys.argv, seco)
        if r or seco:
            return r
        print("")   # e segue direto para a dobra, no mesmo comando

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
    print("Trilhos no estado:   %d" % len(estado.get("itens") or {}))
    print("Vagas triadas:       %d" % len(estado.get("triagem") or {}))
    print("Metas:               %d" % len(estado.get("metas") or {}))
    print("Datas importantes:   %d" % len(estado.get("eventos") or {}))
    print("Prioridades:         %d" % len(estado.get("prioridades") or {}))

    if seco:
        print("\n--seco: nada foi escrito nem movido.")
        for t in novos:
            d = t.get("dados") or {}
            secao, k = alvo(t)
            if secao == "itens":
                detalhe = "%s / %s  ->  st=%s vida=%s" % (
                    d.get("projT"), d.get("subT"), d.get("para"), d.get("vida"))
            elif secao == "triagem":
                detalhe = "vaga %s  ->  st=%s" % (k, d.get("st"))
            elif secao == "metas":
                detalhe = "meta %s  ->  %s" % (
                    k, "apagada" if d.get("del") else ("feita" if d.get("done") else "aberta"))
            elif secao == "eventos":
                detalhe = "data %s  ->  %s" % (
                    k, "apagada" if d.get("del") else d.get("data"))
            elif secao == "prioridades":
                detalhe = "prioridade %s  ->  %s" % (
                    k, "apagada" if d.get("del")
                    else ("trilho %s/%s" % (d.get("painel"), d.get("projId"))
                          if d.get("tipo") == "trilho" else (d.get("t") or "(sem texto)")))
            else:
                detalhe = "(tipo %s, sem alvo)" % (t.get("tipo") or "?")
            print("  %s  %s" % ((t.get("quando") or "")[:16], detalhe))
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
