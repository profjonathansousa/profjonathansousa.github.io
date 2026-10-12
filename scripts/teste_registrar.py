#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""teste_registrar.py — o --registrar decide pelo BANCO e nao apaga decisao sua.

    python3 scripts/teste_registrar.py

A correcao de 2026-10-12, provada contra o dobrar_toques.py de verdade e um
PostgREST de mentira (scripts/postgrest_de_mentira.py). Nao toca a rede nem o
repositorio: o Cronograma inteiro e montado num diretorio temporario.

O QUE ESTE TESTE GUARDA, e o caso concreto de cada um:
  · o `de` vem do cron_estado, e nao do estado.json — que parou em 10/09 e dava
    como "a fazer" etapas ja fechadas no celular;
  · so o `st` muda: vida, motivo, data de volta e vidaDesde ficam. O valor
    montado do zero apagava o adiamento de uma etapa adiada;
  · etapa que nao esta ativa e RECUSADA (decisao do autor, 2026-10-12), e o
    --forcar passa sem apagar nada;
  · a escrita so vale se a linha nao mudou desde a leitura, e o descarte do
    relogio nao passa por sucesso;
  · o banco vem antes do arquivo de toque: se a publicacao nao acontece, nada
    e gravado, e o codigo de saida diz que falhou.
"""
import contextlib
import io
import json
import os
import shutil
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import dobrar_toques as T                                    # noqa: E402
from postgrest_de_mentira import Banco                       # noqa: E402

falhas = []


def ok(cond, nome, detalhe=None):
    print(("  PASSA  " if cond else "  FALHA  ") + nome +
          ("" if cond or detalhe is None else "  <- " + repr(detalhe)))
    if not cond:
        falhas.append(nome)


ENTRADA = {"_versao": 1, "_gerado_em": "2026-09-11T10:00:00Z", "paineis": {"pipeline": [
    {"id": "a00", "t": "Ago · Confusao de reinos", "slug": "patriotismo-cristao-lutero",
     "subs": [{"id": "a00-1", "t": "Brainstorm", "prova": "estrela"},
              {"id": "a00-2", "t": "Janela 0 · planilha de corpus", "prova": "maquina"},
              {"id": "a00-3", "t": "Mapa argumentativo", "prova": "maquina"},
              {"id": "a00-4", "t": "Janela 1 · draft", "prova": "maquina"},
              {"id": "a00-5", "t": "Janela 2 · auditoria", "prova": "maquina"}]}]}}

# O ESTADO.JSON PARADO, de proposito contrario ao banco: se algum valor daqui
# aparecer no resultado, o --registrar leu o arquivo que nao devia.
ESTADO_PARADO = {"_versao": 3, "itens": {
    "pipeline/a00/a00-2": {"st": 1, "vida": "ativo", "quando": "2026-09-10T12:06:42.811Z"},
    "pipeline/a00/a00-4": {"st": 0, "vida": "ativo", "quando": "2026-09-10T12:00:00.000Z"}},
    "triagem": {}, "metas": {}, "eventos": {}, "prioridades": {}, "toefl": {},
    "retomadas": {}, "historico": [], "_ids_dobrados": []}

ATIVA = {"st": 1, "vida": "ativo", "motivo": "falta a secao 3",
         "voltar_em": "", "vidaDesde": "2026-09-01"}
EM_VELHO = "2026-09-11T00:47:17.307Z"


def montar():
    tmp = tempfile.mkdtemp(prefix="cronograma-registrar-")
    os.makedirs(os.path.join(tmp, "Cronograma"))
    with open(os.path.join(tmp, "Cronograma", "entrada.json"), "w", encoding="utf-8") as f:
        json.dump(ENTRADA, f, ensure_ascii=False)
    with open(os.path.join(tmp, "Cronograma", "estado.json"), "w", encoding="utf-8") as f:
        json.dump(ESTADO_PARADO, f, ensure_ascii=False)
    T.DIR_TOQUES = os.path.join(tmp, "Cronograma", "toques")
    T.DIR_DOBRADOS = os.path.join(T.DIR_TOQUES, "_dobrados")
    T.ARQ_ESTADO = os.path.join(tmp, "Cronograma", "estado.json")
    T.ARQ_ENTRADA = os.path.join(tmp, "Cronograma", "entrada.json")
    return tmp


def toques_gravados():
    if not os.path.isdir(T.DIR_TOQUES):
        return []
    fora = []
    for a in sorted(os.listdir(T.DIR_TOQUES)):
        if a.endswith(".json"):
            with open(os.path.join(T.DIR_TOQUES, a), encoding="utf-8") as f:
                fora.extend(json.load(f)["toques"])
    return fora


def rodar(alvo, para=2, vida=None, forcar=False, seco=False):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        codigo = T.registrar(alvo, para, vida, forcar, seco)
    return codigo, buf.getvalue()


def cli(*args):
    argv = sys.argv
    sys.argv = ["dobrar_toques.py"] + list(args)
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            codigo = T.main()
    finally:
        sys.argv = argv
    return codigo, buf.getvalue()


def cenario(semear=None):
    """Um banco novo e um Cronograma novo para cada caso: nada vaza de um
    cenario para o outro."""
    tmp = montar()
    b = Banco().subir()
    os.environ[T.API_URL] = b.url
    os.environ[T.API_CHAVE] = "chave-de-mentira"
    os.environ["TOQUE_AGORA"] = "2026-10-12T15:00:00.000Z"
    for chave, valor, em in (semear or []):
        b.semear(chave, valor, em)
    return tmp, b


def fechar(tmp, b):
    b.parar()
    shutil.rmtree(tmp, ignore_errors=True)


try:
    print("=== 1. O `de` vem do banco, e nao do estado.json parado ===")
    tmp, b = cenario([("pipeline/a00/a00-2", {"st": 0, "vida": "ativo", "motivo": "",
                                              "voltar_em": "", "vidaDesde": ""}, EM_VELHO)])
    cod, saida = rodar("pipeline/a00/a00-2")
    ok(cod == 0, "a etapa ativa e marcada", saida[-300:])
    ok(b.item("pipeline/a00/a00-2")["valor"]["st"] == 2, "e o banco passa a dizer st=2")
    reg = list(b.registros.values())
    ok(len(reg) == 1 and reg[0]["de"] == 0,
       "o registro diz de=0, que e o do banco (o estado.json dizia 1)", reg)
    ok("st 0 -> 2" in saida, "e o relatorio tambem", saida)
    ok([t["dados"]["de"] for t in toques_gravados()] == [0],
       "e o toque gravado carrega o mesmo `de`")
    fechar(tmp, b)

    print("\n=== 2. So o `st` muda: motivo, datas e vida ficam ===")
    tmp, b = cenario([("pipeline/a00/a00-4", ATIVA, EM_VELHO)])
    cod, saida = rodar("pipeline/a00/a00-4")
    v = b.item("pipeline/a00/a00-4")["valor"]
    ok(cod == 0 and v["st"] == 2, "a etapa e marcada", (cod, v))
    ok(v["motivo"] == "falta a secao 3", "o motivo fica", v)
    ok(v["vidaDesde"] == "2026-09-01" and v["voltar_em"] == "", "as datas ficam", v)
    ok(v["vida"] == "ativo", "e a vida tambem", v)
    ok(b.item("pipeline/a00/a00-4")["aparelho"] == "cowork",
       "assinado como `cowork`, um aparelho a mais")
    ok(toques_gravados()[0]["dados"]["temMotivo"] is True,
       "o toque diz que ha motivo, sem levar o texto ao repositorio publico")
    fechar(tmp, b)

    print("\n=== 3. Etapa que nao esta ativa e decisao do autor: RECUSA ===")
    for vida in ("adiado", "abandonado", "arquivado", "inaplicavel"):
        valor = {"st": 1, "vida": vida, "motivo": "esperar o parecer",
                 "voltar_em": "2026-11-01", "vidaDesde": "2026-10-01"}
        tmp, b = cenario([("pipeline/a00/a00-4", valor, EM_VELHO)])
        antes = json.dumps(b.item("pipeline/a00/a00-4"), sort_keys=True)
        cod, saida = rodar("pipeline/a00/a00-4")
        ok(cod != 0 and "RECUSADO" in saida and vida in saida,
           "vida '%s': RECUSADO, dizendo qual" % vida, saida[-200:])
        ok(json.dumps(b.item("pipeline/a00/a00-4"), sort_keys=True) == antes and
           not b.escritas() and not toques_gravados(),
           "   e nada foi escrito: nem o item, nem registro, nem toque", b.escritas())
        fechar(tmp, b)

    print("\n=== 4. --forcar passa, e mesmo assim nada se apaga ===")
    valor = {"st": 1, "vida": "adiado", "motivo": "esperar o parecer",
             "voltar_em": "2026-11-01", "vidaDesde": "2026-10-01"}
    tmp, b = cenario([("pipeline/a00/a00-4", valor, EM_VELHO)])
    cod, saida = rodar("pipeline/a00/a00-4", forcar=True)
    v = b.item("pipeline/a00/a00-4")["valor"]
    ok(cod == 0 and v["st"] == 2, "com --forcar a etapa e marcada", saida[-200:])
    ok(v["vida"] == "adiado" and v["motivo"] == "esperar o parecer" and
       v["voltar_em"] == "2026-11-01" and v["vidaDesde"] == "2026-10-01",
       "e o adiamento, o motivo e as datas continuam la", v)
    fechar(tmp, b)

    print("\n=== 5. Escrita condicional: o que voce fez no meio-tempo vence ===")
    tmp, b = cenario([("pipeline/a00/a00-4", ATIVA, EM_VELHO)])

    def celular(banco):
        # Entre a leitura e a escrita, voce adia a etapa no celular.
        banco.antes_de_gravar = None
        banco.semear("pipeline/a00/a00-4",
                     {"st": 1, "vida": "adiado", "motivo": "viagem",
                      "voltar_em": "2026-11-01", "vidaDesde": "2026-10-12"},
                     "2026-10-12T14:59:59.900Z")
    b.antes_de_gravar = celular
    cod, saida = rodar("pipeline/a00/a00-4")
    v = b.item("pipeline/a00/a00-4")["valor"]
    ok(cod != 0 and "NAO GRAVADO" in saida, "a escrita nao pega, e o comando diz",
       saida[-240:])
    ok(v["vida"] == "adiado" and v["motivo"] == "viagem" and v["st"] == 1,
       "o adiamento feito no celular fica intacto", v)
    ok(not b.registros and not toques_gravados(),
       "e nao sobra registro nem toque de uma marcacao que nao aconteceu")
    fechar(tmp, b)

    print("\n=== 6. O relogio do banco recusa, e isso nao passa por sucesso ===")
    tmp, b = cenario([("pipeline/a00/a00-4", ATIVA, "2030-01-01T00:00:00.000Z")])
    cod, saida = rodar("pipeline/a00/a00-4")
    ok(cod != 0 and "NAO GRAVADO" in saida,
       "decisao com relogio mais novo: o descarte e dito, nao engolido", saida[-200:])
    ok(b.item("pipeline/a00/a00-4")["valor"]["st"] == 1 and not toques_gravados(),
       "o item fica como estava, e nada e gravado no disco")
    fechar(tmp, b)

    print("\n=== 7. Item nunca tocado online: a linha nasce ===")
    tmp, b = cenario()
    cod, saida = rodar("pipeline/a00/a00-5")
    linha = b.item("pipeline/a00/a00-5")
    ok(cod == 0 and linha and linha["valor"] == {"st": 2, "vida": "ativo", "motivo": "",
                                                 "voltar_em": "", "vidaDesde": ""},
       "o item e criado ja concluido, com os campos que o aparelho espera",
       linha and linha["valor"])
    ok(list(b.registros.values())[0]["de"] is None, "e o registro diz de=None")
    fechar(tmp, b)

    print("\n=== 8. Item criado no meio-tempo: o de la vence ===")
    tmp, b = cenario()

    def criou(banco):
        banco.antes_de_gravar = None
        banco.semear("pipeline/a00/a00-5", {"st": 0, "vida": "inaplicavel", "motivo": "",
                                            "voltar_em": "", "vidaDesde": "2026-10-12"},
                     "2026-10-12T14:59:00.000Z")
    b.antes_de_gravar = criou
    cod, saida = rodar("pipeline/a00/a00-5")
    ok(cod != 0 and b.item("pipeline/a00/a00-5")["valor"]["vida"] == "inaplicavel",
       "a linha criada no celular nao e sobrescrita", saida[-200:])
    ok(not toques_gravados(), "e nada e gravado no disco")
    fechar(tmp, b)

    print("\n=== 9. O banco primeiro: sem ele, nada e gravado ===")
    tmp, b = cenario([("pipeline/a00/a00-4", ATIVA, EM_VELHO)])
    os.environ[T.API_URL] = "http://127.0.0.1:9"         # porta morta
    cod, saida = rodar("pipeline/a00/a00-4")
    ok(cod != 0 and "RECUSADO" in saida,
       "sem conseguir LER o estado de agora, recusa", saida[-200:])
    ok(not toques_gravados(), "e nao deixa toque para tras")
    os.environ[T.API_URL] = b.url
    b.falhar["PATCH cron_estado"] = 500
    cod, saida = rodar("pipeline/a00/a00-4")
    ok(cod != 0 and "NAO PUBLICADO" in saida,
       "se a ESCRITA do item falha, sai com erro", saida[-200:])
    ok(not toques_gravados() and not b.registros,
       "e nao grava toque nem registro: um arquivo sozinho mentiria")
    fechar(tmp, b)

    print("\n=== 10. Falha so no registro: o item entrou, e isso e dito ===")
    tmp, b = cenario([("pipeline/a00/a00-4", ATIVA, EM_VELHO)])
    b.falhar["POST cron_registro"] = 500
    cod, saida = rodar("pipeline/a00/a00-4")
    ok(cod == 0 and b.item("pipeline/a00/a00-4")["valor"]["st"] == 2,
       "o item foi marcado, e o comando nao finge que nao", saida[-200:])
    ok("AVISO" in saida and "registro" in saida, "mas avisa que faltou o historico")
    ok(len(toques_gravados()) == 1, "e o toque e gravado: o estado de fato mudou")
    fechar(tmp, b)

    print("\n=== 11. --seco le o banco e nao escreve nada ===")
    tmp, b = cenario([("pipeline/a00/a00-4", ATIVA, EM_VELHO)])
    cod, saida = rodar("pipeline/a00/a00-4", seco=True)
    ok(cod == 0 and "st 1 -> 2" in saida, "mostra o `de` verdadeiro, o do banco", saida)
    ok(not b.escritas() and not toques_gravados(), "e nao escreve em lugar nenhum",
       b.escritas())
    for v_ in (T.API_URL, T.API_CHAVE):
        os.environ.pop(v_, None)
    cod, saida = rodar("pipeline/a00/a00-4", seco=True)
    ok(cod == 0 and "st ? -> 2" in saida and "nao lido" in saida,
       "sem credenciais, o --seco diz que nao sabe o estado", saida)
    fechar(tmp, b)

    print("\n=== 12. Pela linha de comando: sem --vida, a vida fica ===")
    valor = {"st": 1, "vida": "adiado", "motivo": "esperar o parecer",
             "voltar_em": "2026-11-01", "vidaDesde": "2026-10-01"}
    tmp, b = cenario([("pipeline/a00/a00-4", valor, EM_VELHO)])
    cod, saida = cli("--registrar", "pipeline/a00/a00-4", "--para", "2", "--forcar")
    ok(cod == 0 and b.item("pipeline/a00/a00-4")["valor"]["vida"] == "adiado",
       "o padrao do --vida nao reativa mais a etapa", saida[-200:])
    ok(os.path.exists(T.ARQ_ESTADO) and
       json.load(open(T.ARQ_ESTADO, encoding="utf-8"))["itens"]["pipeline/a00/a00-4"]["st"] == 2,
       "e a dobra do mesmo comando leva o toque ao estado.json (trilha auditavel)")
    fechar(tmp, b)

    tmp, b = cenario([("pipeline/a00/a00-2", dict(ATIVA), EM_VELHO)])
    cod, saida = cli("--registrar", "pipeline/a00/a00-2", "--para", "0",
                     "--vida", "inaplicavel")
    v = b.item("pipeline/a00/a00-2")["valor"]
    ok(cod == 0 and v["vida"] == "inaplicavel" and v["vidaDesde"] == "2026-10-12",
       "--vida dito de proposito muda a vida, com a data de hoje", v)
    ok(v["motivo"] == "falta a secao 3", "e o motivo fica", v)
    # O RELOGIO ANDA entre uma decisao e a outra. Com o mesmo instante, o banco
    # recusaria a segunda — que e a regra do relogio, provada no cenario 6.
    os.environ["TOQUE_AGORA"] = "2026-10-12T15:05:00.000Z"
    cod, saida = cli("--registrar", "pipeline/a00/a00-2", "--para", "2",
                     "--vida", "ativo", "--forcar")
    v = b.item("pipeline/a00/a00-2")["valor"]
    ok(cod == 0 and v["vida"] == "ativo" and v["motivo"] == "" and v["voltar_em"] == "",
       "voltar a ativa limpa motivo e data de volta, como no aparelho", v)
    cod, saida = cli("--registrar", "pipeline/a00/a00-2", "--para", "2",
                     "--vida", "inaplicável")
    ok(cod != 0 and "nao existe" in saida, "--vida que o aplicativo nao conhece e recusado",
       saida)
    fechar(tmp, b)

    print("\n=== 13. A prova `estrela` continua recusada antes de tudo ===")
    tmp, b = cenario()
    cod, saida = rodar("pipeline/a00/a00-1")
    ok(cod != 0 and "estrela" in saida and not b.chamadas,
       "recusa sem nem consultar o banco", b.chamadas)
    fechar(tmp, b)
finally:
    for v_ in (T.API_URL, T.API_CHAVE, "TOQUE_AGORA"):
        os.environ.pop(v_, None)

print("\n" + "=" * 62)
print("FALHAS: %d" % len(falhas))
for f in falhas:
    print("  - " + f)
sys.exit(1 if falhas else 0)
