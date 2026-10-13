#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""teste_registrar.py — o --registrar marca pela funcao do banco, e so por ela.

    python3 scripts/teste_registrar.py

Desde 2026-10-13 quem marca e a cron_pipeline_marcar (sql/cron_pipeline_marcar.sql),
a mesma que o Cowork chama pelo conector no fim de cada janela. As REGRAS dela
sao provadas contra um Postgres de verdade no teste_marcar_no_banco.py. Este
teste prova o outro lado: o que o dobrar_toques.py faz com ela, contra o
dobrar_toques.py de verdade e o arremedo da funcao no PostgREST de mentira
(scripts/postgrest_de_mentira.py — que aquele teste compara com a funcao).
Nao toca a rede nem o repositorio: o Cronograma e montado num temporario.

O QUE ESTE TESTE GUARDA, e o caso concreto de cada um:
  · o pedido vai a /rpc/cron_pipeline_marcar, e a nada mais: o comando nao
    escreve no cron_estado por conta propria;
  · nada vai para o disco — nem toque, nem estado.json. A copia publica do
    historico parou em 2026-10-13, a pedido do autor;
  · o codigo de saida diz o que a funcao respondeu: marcada, ja concluida e
    "marcaria" (--seco) sao 0; recusa, falha de rede e resposta estranha, 1;
  · o --para 0|1, o --vida e o --forcar sairam, e sao recusados sem chamar o
    banco: voltar, mudar a vida ou forcar e coisa do aplicativo;
  · sem credenciais, recusa; com --seco, mostra o alvo e diz que a funcao nao
    foi consultada;
  · com LOG_PUBLICO=1, o titulo do projeto nao sai no log publico do Actions.
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
import postgrest_de_mentira as P                             # noqa: E402
from postgrest_de_mentira import Banco                       # noqa: E402

falhas = []


def ok(cond, nome, detalhe=None):
    print(("  PASSA  " if cond else "  FALHA  ") + nome +
          ("" if cond or detalhe is None else "  <- " + repr(detalhe)))
    if not cond:
        falhas.append(nome)


ENTRADA = {"_versao": 1, "_gerado_em": "2026-09-11T10:00:00Z", "paineis": {"pipeline": [
    {"id": "a00", "t": "Ago · Artigo de exemplo",
     "subs": [{"id": "a00-1", "t": "Brainstorm", "prova": "estrela"},
              {"id": "a00-2", "t": "Janela 0 · planilha de corpus", "prova": "maquina"},
              {"id": "a00-3", "t": "Mapa argumentativo", "prova": "maquina"},
              {"id": "a00-4", "t": "Janela 1 · draft", "prova": "maquina"},
              {"id": "a00-5", "t": "Janela 2 · auditoria", "prova": "maquina"}]}]}}

ATIVA = {"st": 1, "vida": "ativo", "motivo": "falta a secao 3",
         "voltar_em": "", "vidaDesde": "2026-09-01"}
EM_VELHO = "2026-09-11T00:47:17.307Z"


def montar():
    tmp = tempfile.mkdtemp(prefix="cronograma-registrar-")
    os.makedirs(os.path.join(tmp, "Cronograma"))
    with open(os.path.join(tmp, "Cronograma", "entrada.json"), "w", encoding="utf-8") as f:
        json.dump(ENTRADA, f, ensure_ascii=False)
    T.DIR_TOQUES = os.path.join(tmp, "Cronograma", "toques")
    T.DIR_DOBRADOS = os.path.join(T.DIR_TOQUES, "_dobrados")
    T.ARQ_ESTADO = os.path.join(tmp, "Cronograma", "estado.json")
    T.ARQ_ENTRADA = os.path.join(tmp, "Cronograma", "entrada.json")
    return tmp


def disco(tmp):
    """O que existe no Cronograma de mentira alem do entrada.json."""
    fora = []
    for raiz, _d, arquivos in os.walk(os.path.join(tmp, "Cronograma")):
        for a in arquivos:
            rel = os.path.relpath(os.path.join(raiz, a), os.path.join(tmp, "Cronograma"))
            if rel != "entrada.json":
                fora.append(rel)
    return fora


def rodar(alvo, seco=False):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        codigo = T.registrar(alvo, seco)
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
    cenario para o outro. O banco ja tem a estrutura publicada."""
    tmp = montar()
    b = Banco().subir().publicar(ENTRADA)
    os.environ[T.API_URL] = b.url
    os.environ[T.API_CHAVE] = "chave-de-mentira"
    os.environ.pop(T.VAR_LOG_PUBLICO, None)
    for chave, valor, em in (semear or []):
        b.semear(chave, valor, em)
    return tmp, b


def fechar(tmp, b):
    b.parar()
    shutil.rmtree(tmp, ignore_errors=True)


try:
    print("=== 1. Marca pela funcao, e so por ela ===")
    tmp, b = cenario([("pipeline/a00/a00-4", ATIVA, EM_VELHO)])
    cod, saida = rodar("pipeline/a00/a00-4")
    v = (b.item("pipeline/a00/a00-4") or {}).get("valor") or {}
    ok(cod == 0 and "marcada" in saida, "sai com 0 e diz que marcou", saida)
    ok(b.chamadas == [("POST", "rpc/cron_pipeline_marcar")],
       "um pedido so, a /rpc/cron_pipeline_marcar", b.chamadas)
    ok(v.get("st") == 2 and v.get("motivo") == "falta a secao 3",
       "a etapa fecha, e o motivo fica (regra da funcao)", v)
    ok(len(b.registros) == 1, "com a linha de registro junto", b.registros)
    ok(disco(tmp) == [], "e nada vai para o disco: nem toque, nem estado.json", disco(tmp))
    ok("Ago · Artigo de exemplo" in saida and "Janela 1 · draft" in saida,
       "a saida diz qual projeto e qual etapa", saida)
    fechar(tmp, b)

    print("\n=== 2. Ja concluida: 0, e nada e reescrito ===")
    tmp, b = cenario([("pipeline/a00/a00-2", dict(ATIVA, st=2), EM_VELHO)])
    antes = json.dumps(b.item("pipeline/a00/a00-2"), sort_keys=True)
    cod, saida = rodar("pipeline/a00/a00-2")
    ok(cod == 0 and "ja_estava" in saida, "sai com 0 e diz que ja estava", saida)
    ok(json.dumps(b.item("pipeline/a00/a00-2"), sort_keys=True) == antes and not b.registros,
       "a linha nem foi tocada")
    fechar(tmp, b)

    print("\n=== 3. Recusa da funcao vira codigo 1 ===")
    tmp, b = cenario()
    cod, saida = rodar("pipeline/a00/a00-1")
    ok(cod == 1 and "estrela" in saida, "prova estrela: 1, e diz por que", saida)
    adiada = {"st": 1, "vida": "adiado", "motivo": "esperando o parecer",
              "voltar_em": "2026-11-01", "vidaDesde": "2026-10-01"}
    b.semear("pipeline/a00/a00-4", adiada, EM_VELHO)
    cod, saida = rodar("pipeline/a00/a00-4")
    ok(cod == 1 and "adiado" in saida, "etapa adiada: 1, e diz a vida", saida)
    ok(b.item("pipeline/a00/a00-4")["valor"] == adiada, "e o adiamento fica inteiro")
    cod, saida = rodar("pipeline/a00/a00-9")
    ok(cod == 1 and "estrutura publicada" in saida, "etapa que nao existe: 1", saida)
    ok(not b.registros and disco(tmp) == [], "nenhuma recusa escreve nada")
    fechar(tmp, b)

    print("\n=== 4. --seco: a funcao confere e nao escreve ===")
    tmp, b = cenario([("pipeline/a00/a00-4", ATIVA, EM_VELHO)])
    cod, saida = cli("--registrar", "pipeline/a00/a00-4", "--para", "2", "--seco")
    ok(cod == 0 and "marcaria" in saida, "diz que marcaria, com 0", saida)
    ok(b.item("pipeline/a00/a00-4")["valor"]["st"] == 1 and not b.registros,
       "e nao escreve nada")
    cod, saida = rodar("pipeline/a00/a00-1", seco=True)
    ok(cod == 1 and "estrela" in saida, "a conferencia tambem recusa estrela", saida)
    fechar(tmp, b)

    print("\n=== 5. Sem credenciais ===")
    tmp, b = cenario()
    for v_ in (T.API_URL, T.API_CHAVE):
        os.environ.pop(v_, None)
    cod, saida = rodar("pipeline/a00/a00-4")
    ok(cod == 1 and "RECUSADO" in saida and "conector" in saida,
       "recusa, e lembra que no Cowork o caminho e o conector", saida)
    cod, saida = rodar("pipeline/a00/a00-4", seco=True)
    ok(cod == 0 and "nao foi consultada" in saida and "Janela 1 · draft" in saida,
       "o --seco mostra o alvo e diz que a funcao nao foi consultada", saida)
    ok(b.chamadas == [] and disco(tmp) == [], "e nenhum pedido sai, nada e escrito")
    fechar(tmp, b)

    print("\n=== 6. Banco fora, erro HTTP, resposta estranha: 1, nada escrito ===")
    tmp, b = cenario([("pipeline/a00/a00-4", ATIVA, EM_VELHO)])
    os.environ[T.API_URL] = "http://127.0.0.1:9"
    cod, saida = rodar("pipeline/a00/a00-4")
    ok(cod == 1 and "NAO MARCADO" in saida, "rede fora: 1, NAO MARCADO", saida)
    os.environ[T.API_URL] = b.url
    b.falhar["POST rpc/cron_pipeline_marcar"] = 500
    cod, saida = rodar("pipeline/a00/a00-4")
    ok(cod == 1 and "NAO MARCADO" in saida, "erro 500: 1", saida)
    del b.falhar["POST rpc/cron_pipeline_marcar"]
    original = P.marcar
    P.marcar = lambda banco, chave, seco=False, agora=None: []
    try:
        cod, saida = rodar("pipeline/a00/a00-4")
    finally:
        P.marcar = original
    ok(cod == 1 and "resposta inesperada" in saida, "resposta sem `resultado`: 1", saida)
    ok(b.item("pipeline/a00/a00-4")["valor"]["st"] == 1 and disco(tmp) == [],
       "e a etapa fica como estava")
    fechar(tmp, b)

    print("\n=== 7. O que saiu: --para 0|1, --vida e --forcar ===")
    tmp, b = cenario([("pipeline/a00/a00-4", ATIVA, EM_VELHO)])
    for args in (("--para", "1"), ("--para", "0"), ("--para", "2", "--vida", "ativo"),
                 ("--para", "2", "--forcar")):
        cod, saida = cli("--registrar", "pipeline/a00/a00-4", *args)
        ok(cod == 1 and "saiu em 2026-10-13" in saida and "aplicativo" in saida,
           "%s e recusado, apontando o aplicativo" % " ".join(args), saida)
    ok(b.chamadas == [], "e nenhum deles chega ao banco", b.chamadas)
    cod, saida = cli("--registrar", "pipeline/a00/a00-4")
    ok(cod == 0 and "marcada" in saida, "sem --para tambem marca (so ha um destino)", saida)
    fechar(tmp, b)

    print("\n=== 8. Alvo malformado ===")
    tmp, b = cenario()
    for ruim in ("pipeline/a00", "pipeline//a00-4", "", None):
        cod, saida = rodar(ruim)
        ok(cod == 1 and "Alvo invalido" in saida, "alvo %r e recusado" % (ruim,), saida)
    ok(b.chamadas == [], "sem chamar o banco", b.chamadas)
    fechar(tmp, b)

    print("\n=== 9. LOG_PUBLICO=1: o titulo do projeto nao sai no log ===")
    tmp, b = cenario([("pipeline/a00/a00-4", ATIVA, EM_VELHO)])
    os.environ[T.VAR_LOG_PUBLICO] = "1"
    cod, saida = rodar("pipeline/a00/a00-4")
    os.environ.pop(T.VAR_LOG_PUBLICO, None)
    ok(cod == 0 and "Ago · Artigo de exemplo" not in saida and "Janela 1 · draft" in saida,
       "sai a etapa, nao o projeto", saida)
    fechar(tmp, b)
finally:
    for v_ in (T.API_URL, T.API_CHAVE, T.VAR_LOG_PUBLICO):
        os.environ.pop(v_, None)

print("\n" + "=" * 62)
print("FALHAS: %d" % len(falhas))
for f in falhas:
    print("  - " + f)
sys.exit(1 if falhas else 0)
