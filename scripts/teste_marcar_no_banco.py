#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""teste_marcar_no_banco.py — a cron_pipeline_marcar contra um Postgres de verdade.

    python3 scripts/teste_marcar_no_banco.py

A marcacao instantanea do Cowork (2026-10-13) mora numa funcao do banco, e
regra de banco se prova em banco. Este teste sobe um Postgres descartavel num
diretorio temporario, carrega um arremedo do que o Supabase ja traz pronto
(auth.users, auth.uid(), os papeis anon, authenticated e service_role, os
privilegios padrao, a publicacao do Realtime) e, por cima dele, o
sql/cron_estado.sql e o sql/cron_pipeline_marcar.sql DE VERDADE — os mesmos
arquivos que vao para producao. Nao toca a rede nem o banco de producao.

O QUE ESTE TESTE GUARDA, e o caso concreto de cada um:
  · so etapa de prova "maquina" na estrutura publicada: "estrela" e decisao do
    autor, e etapa fora da estrutura e codigo errado;
  · so etapa ativa: adiada, abandonada, arquivada, "nao se aplica" e apagada
    ficam como estao, com o motivo e as datas;
  · o valor e o de agora com o `st` novo — montar do zero apagava o adiamento;
  · etapa ja concluida nao e reescrita, e o p_seco nao escreve nada;
  · o relogio do banco nao engole a marcacao quando o aparelho esta adiantado;
  · o item e a linha do registro entram juntos, com o dia de Brasilia;
  · duas chamadas ao mesmo tempo marcam uma vez so;
  · o aplicativo (anon, authenticated) nao chama a funcao; a service_role chama;
  · e o arremedo dela no postgrest_de_mentira.py, que os outros testes usam,
    responde exatamente como ela, caso a caso.

SEM POSTGRES NA MAQUINA (initdb, pg_ctl e psql), o teste diz PULADO e sai com
0: no Mac do autor nao ha Postgres, e isso nao e falha do codigo. Rodando como
root (o conteiner do Claude Code), o servidor sobe como o usuario `postgres`.
"""
import glob
import json
import os
import pwd
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)
import postgrest_de_mentira as P                             # noqa: E402
SQL_ESTADO = os.path.join(RAIZ, "sql", "cron_estado.sql")
SQL_MARCAR = os.path.join(RAIZ, "sql", "cron_pipeline_marcar.sql")

DONO = "00000000-0000-4000-8000-000000000001"
OUTRO = "00000000-0000-4000-8000-000000000002"

falhas = []


def ok(cond, nome, detalhe=None):
    print(("  PASSA  " if cond else "  FALHA  ") + nome +
          ("" if cond or detalhe is None else "  <- " + repr(detalhe)))
    if not cond:
        falhas.append(nome)


def achar_binarios():
    """O diretorio com initdb, pg_ctl e psql, ou None."""
    candidatos = []
    w = shutil.which("initdb")
    if w:
        candidatos.append(os.path.dirname(w))
    for padrao in ("/usr/lib/postgresql/*/bin", "/opt/homebrew/opt/postgresql*/bin",
                   "/usr/local/opt/postgresql*/bin",
                   "/Applications/Postgres.app/Contents/Versions/*/bin"):
        candidatos.extend(sorted(glob.glob(padrao), reverse=True))
    for d in candidatos:
        if all(os.path.exists(os.path.join(d, b)) for b in ("initdb", "pg_ctl", "psql")):
            return d
    return None


def porta_livre():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Postgres(object):
    """Um Postgres de mentira no sentido bom: descartavel, e de verdade."""

    def __init__(self, bindir):
        self.bindir = bindir
        self.tmp = tempfile.mkdtemp(prefix="cron-marcar-pg-")
        self.dados = os.path.join(self.tmp, "dados")
        self.porta = porta_livre()
        self.prefixo = []
        if os.geteuid() == 0:
            # O initdb recusa root. No conteiner existe o usuario `postgres`.
            pw = pwd.getpwnam("postgres")
            os.chown(self.tmp, pw.pw_uid, pw.pw_gid)
            self.prefixo = ["runuser", "-u", "postgres", "--"]

    def _bin(self, nome):
        return os.path.join(self.bindir, nome)

    def subir(self):
        subprocess.run(self.prefixo + [self._bin("initdb"), "-D", self.dados, "-U", "postgres",
                                       "-A", "trust", "-E", "UTF8", "--no-locale"],
                       check=True, capture_output=True)
        opcoes = "-k %s -p %d -c listen_addresses='' -c timezone=UTC" % (self.tmp, self.porta)
        subprocess.run(self.prefixo + [self._bin("pg_ctl"), "-D", self.dados, "-o", opcoes,
                                       "-l", os.path.join(self.tmp, "log"), "-w", "start"],
                       check=True, capture_output=True)
        return self

    def parar(self):
        subprocess.run(self.prefixo + [self._bin("pg_ctl"), "-D", self.dados, "-m", "fast",
                                       "-w", "stop"], capture_output=True)
        shutil.rmtree(self.tmp, ignore_errors=True)

    def psql_cmd(self, *comandos):
        cmd = [self._bin("psql"), "-h", self.tmp, "-p", str(self.porta), "-U", "postgres",
               "-d", "postgres", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"]
        for c in comandos:
            cmd += ["-c", c]
        return cmd

    def sql(self, *comandos):
        """Roda os comandos numa sessao so e devolve a saida. Erro vira excecao
        com a mensagem do Postgres."""
        r = subprocess.run(self.psql_cmd(*comandos), capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.strip())
        return r.stdout.strip()

    def arquivo(self, caminho):
        cmd = [self._bin("psql"), "-h", self.tmp, "-p", str(self.porta), "-U", "postgres",
               "-d", "postgres", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", caminho]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.strip())


# O QUE O SUPABASE TRAZ PRONTO, no minimo que os dois arquivos usam. Os
# privilegios padrao sao os dele: toda tabela e toda funcao nova do `public`
# nasce com acesso para anon, authenticated e service_role. E por isso que o
# revoke do cron_pipeline_marcar.sql e o que este teste prova, e nao um detalhe.
ARREMEDO = r"""
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create publication supabase_realtime;
"""

# A estrutura publicada, no molde da de producao: a etapa 1 e estrela, as de
# artefato sao maquina, e a etapa sem prova fica de fora do que a maquina marca.
ESTRUTURA = [
    {"chave": "pipeline/a01", "tipo": "projeto", "valor": {"t": "Ago · Artigo de exemplo", "n": 1}},
    {"chave": "pipeline/a01/a01-1", "tipo": "subitem", "valor": {"t": "Brainstorm", "prova": "estrela"}},
    {"chave": "pipeline/a01/a01-2", "tipo": "subitem", "valor": {"t": "Janela 0 · planilha", "prova": "maquina"}},
    {"chave": "pipeline/a01/a01-3", "tipo": "subitem", "valor": {"t": "Mapa argumentativo", "prova": "maquina"}},
    {"chave": "pipeline/a01/a01-4", "tipo": "subitem", "valor": {"t": "Janela 1 · draft", "prova": "maquina"}},
    {"chave": "pipeline/a01/a01-5", "tipo": "subitem", "valor": {"t": "Janela 2 · auditoria", "prova": "maquina"}},
    {"chave": "pipeline/a01/a01-9", "tipo": "subitem", "valor": {"t": "Sem prova"}},
]

ATIVA = {"st": 1, "vida": "ativo", "motivo": "falta a secao 3",
         "voltar_em": "", "vidaDesde": "2026-09-01", "extra": "fica"}
EM_VELHO = "2026-09-11T00:47:17.307Z"
RE_ID = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-cowork-pipeline-a01-a01-\d$")


def lit(s):
    return "'" + str(s).replace("'", "''") + "'"


def preparar(pg, itens=None, donos=(DONO,)):
    """Banco limpo para cada caso: nada vaza de um cenario para o outro."""
    pg.sql("truncate public.cron_estado, public.cron_registro, "
           "public.cron_estrutura_base, public.cron_dono")
    for d in donos:
        pg.sql("insert into public.cron_dono (uid, rotulo) values (%s, 'autor')" % lit(d))
    pg.sql("select * from public.cron_publicar_estrutura(%s, '2026-09-11T10:00:00Z', %s::jsonb)"
           % (lit(DONO), lit(json.dumps(ESTRUTURA, ensure_ascii=False))))
    for chave, valor, em, *resto in (itens or []):
        apagado = bool(resto and resto[0])
        pg.sql("insert into public.cron_estado (dono, dominio, chave, valor, del, em, aparelho) "
               "values (%s, 'item', %s, %s::jsonb, %s, %s, 's41hky')"
               % (lit(DONO), lit(chave), lit(json.dumps(valor, ensure_ascii=False)),
                  "true" if apagado else "false", lit(em)))


def marcar(pg, chave, seco=None, papel=None):
    args = lit(chave) if chave is not None else "null"
    if seco is not None:
        args += ", " + ("true" if seco else "false")
    cmds = (["set role " + papel] if papel else []) + \
           ["select public.cron_pipeline_marcar(%s)::text" % args]
    return json.loads(pg.sql(*cmds))


def item(pg, chave):
    bruto = pg.sql("select json_build_object('valor', valor, 'del', del, 'em', em, "
                   "'aparelho', aparelho)::text from public.cron_estado "
                   "where dominio = 'item' and chave = %s" % lit(chave))
    return json.loads(bruto) if bruto else None


def registros(pg):
    bruto = pg.sql("select coalesce(json_agg(r order by r.servidor_em, r.id), '[]')::text "
                   "from public.cron_registro r")
    return json.loads(bruto)


def em_ms(pg, chave):
    """O `em` como o aparelho o veria, em milissegundos desde a epoca."""
    return int(pg.sql("select (extract(epoch from em) * 1000)::bigint from public.cron_estado "
                      "where dominio = 'item' and chave = %s" % lit(chave)))


def main():
    bindir = achar_binarios()
    if not bindir:
        print("PULADO: nao ha Postgres nesta maquina (initdb, pg_ctl e psql).")
        print("O teste roda onde houver um; no conteiner do Claude Code ha.")
        return 0
    pg = Postgres(bindir)
    try:
        pg.subir()
    except Exception as e:
        print("PULADO: o Postgres local nao subiu (%s)." % e)
        pg.parar()
        return 0

    try:
        pg.sql(ARREMEDO)
        pg.sql("insert into auth.users (id) values (%s), (%s)" % (lit(DONO), lit(OUTRO)))
        pg.arquivo(SQL_ESTADO)
        pg.arquivo(SQL_MARCAR)
        pg.arquivo(SQL_MARCAR)   # idempotente: rodar de novo nao quebra nada
        cenarios(pg)
    finally:
        pg.parar()

    print("\n" + "=" * 62)
    print("FALHAS: %d" % len(falhas))
    for f in falhas:
        print("  - " + f)
    return 1 if falhas else 0


def cenarios(pg):
    print("=== 1. Etapa nunca tocada: nasce concluida, com o registro junto ===")
    preparar(pg)
    r = marcar(pg, "pipeline/a01/a01-3")
    v = item(pg, "pipeline/a01/a01-3")
    ok(r["resultado"] == "marcada", "resultado marcada", r)
    ok(v and v["valor"] == {"st": 2, "vida": "ativo", "motivo": "", "voltar_em": "",
                            "vidaDesde": ""},
       "o valor tem a forma que o aplicativo escreve", v)
    ok(v and v["aparelho"] == "cowork" and v["del"] is False, "aparelho cowork, sem lapide", v)
    ok(r.get("projeto") == "Ago · Artigo de exemplo" and r.get("etapa") == "Mapa argumentativo",
       "os titulos vem da estrutura publicada", r)
    regs = registros(pg)
    ok(len(regs) == 1, "uma linha de registro", regs)
    if regs:
        g = regs[0]
        ok(RE_ID.match(g["id"] or ""), "id no molde dos aparelhos, com a chave junto", g["id"])
        ok(g["pid"] == "pipeline" and g["proj_id"] == "a01" and g["sub_id"] == "a01-3",
           "painel, projeto e etapa separados", g)
        ok(g["de"] is None and g["para"] == 2 and g["vida"] == "ativo" and g["motivo"] == "",
           "de desconhecido (nunca tocada), para 2", g)
        ok(g["proj_t"] == "Ago · Artigo de exemplo" and g["sub_t"] == "Mapa argumentativo",
           "o registro fotografa os titulos", g)
        ok(g["aparelho"] == "cowork", "o registro diz que foi o Cowork", g)
    ms = em_ms(pg, "pipeline/a01/a01-3")
    ok(ms % 1 == 0 and abs(ms - time.time() * 1000) < 60000,
       "o `em` e o instante de agora, em milissegundos", ms)
    ok(pg.sql("select (extract(microseconds from em)::bigint % 1000) from public.cron_estado "
              "where chave = 'pipeline/a01/a01-3'") == "0",
       "cortado no milissegundo, como o relogio dos aparelhos")

    print("\n=== 2. Etapa ativa em andamento: so o `st` muda ===")
    preparar(pg, [("pipeline/a01/a01-4", ATIVA, EM_VELHO)])
    r = marcar(pg, "pipeline/a01/a01-4")
    v = item(pg, "pipeline/a01/a01-4")["valor"]
    ok(r["resultado"] == "marcada" and r["de"] == 1, "marcada, de 1", r)
    esperado = dict(ATIVA)
    esperado["st"] = 2
    ok(v == esperado, "motivo, vidaDesde e campo desconhecido ficam", v)
    regs = registros(pg)
    ok(len(regs) == 1 and regs[0]["de"] == 1, "o registro diz de onde a etapa veio", regs)

    print("\n=== 3. Ja concluida: nada e reescrito ===")
    feita = dict(ATIVA, st=2)
    preparar(pg, [("pipeline/a01/a01-2", feita, EM_VELHO)])
    antes = item(pg, "pipeline/a01/a01-2")
    r = marcar(pg, "pipeline/a01/a01-2")
    ok(r["resultado"] == "ja_estava", "resultado ja_estava", r)
    ok(item(pg, "pipeline/a01/a01-2") == antes, "a linha nem foi tocada (o `em` e o mesmo)")
    ok(registros(pg) == [], "e nenhuma linha de registro")

    print("\n=== 4. Prova estrela, etapa sem prova e etapa fora da estrutura ===")
    preparar(pg, [("pipeline/a01/a01-1", dict(ATIVA, st=0), EM_VELHO)])
    r = marcar(pg, "pipeline/a01/a01-1")
    ok(r["resultado"] == "recusada" and "estrela" in r["mensagem"], "estrela e recusada", r)
    ok(item(pg, "pipeline/a01/a01-1")["valor"]["st"] == 0, "e fica como estava")
    r = marcar(pg, "pipeline/a01/a01-9")
    ok(r["resultado"] == "recusada" and "maquina" in r["mensagem"], "sem prova e recusada", r)
    r = marcar(pg, "pipeline/a01/a01-7")
    ok(r["resultado"] == "recusada" and "estrutura publicada" in r["mensagem"],
       "etapa que a estrutura nao conhece e recusada", r)
    r = marcar(pg, "pipeline/a99/a99-3")
    ok(r["resultado"] == "recusada", "projeto que nao existe e recusado", r)
    ok(item(pg, "pipeline/a01/a01-7") is None and item(pg, "pipeline/a01/a01-9") is None,
       "nenhuma linha nasce de uma recusa")
    ok(registros(pg) == [], "e nenhum registro")

    print("\n=== 5. So etapa ativa: as decisoes do autor ficam ===")
    for vida in ("adiado", "abandonado", "arquivado", "inaplicavel"):
        valor = {"st": 1, "vida": vida, "motivo": "esperando o parecer",
                 "voltar_em": "2026-11-01", "vidaDesde": "2026-10-01"}
        preparar(pg, [("pipeline/a01/a01-4", valor, EM_VELHO)])
        r = marcar(pg, "pipeline/a01/a01-4")
        depois = item(pg, "pipeline/a01/a01-4")
        ok(r["resultado"] == "recusada" and vida in r["mensagem"] and r["vida"] == vida,
           "vida %s e recusada, e a resposta diz qual" % vida, r)
        ok(depois["valor"] == valor and depois["em"].startswith("2026-09-11"),
           "  e o motivo, a data de volta e o `em` ficam", depois)
    preparar(pg, [("pipeline/a01/a01-4", ATIVA, EM_VELHO, True)])
    r = marcar(pg, "pipeline/a01/a01-4")
    ok(r["resultado"] == "recusada" and "apagada" in r["mensagem"], "etapa apagada e recusada", r)
    ok(item(pg, "pipeline/a01/a01-4")["del"] is True, "e a lapide fica")
    ok(registros(pg) == [], "nenhum registro de recusa")

    print("\n=== 6. Aparelho adiantado: o relogio do banco nao engole a marcacao ===")
    futuro = "2030-01-02T01:30:00.000Z"
    preparar(pg, [("pipeline/a01/a01-4", ATIVA, futuro)])
    r = marcar(pg, "pipeline/a01/a01-4")
    v = item(pg, "pipeline/a01/a01-4")
    ok(r["resultado"] == "marcada" and v["valor"]["st"] == 2,
       "marcada mesmo com o `em` da linha no futuro", r)
    ok(em_ms(pg, "pipeline/a01/a01-4") == 1893547800001,
       "o `em` novo e 1 ms depois do que estava la")
    regs = registros(pg)
    ok(len(regs) == 1 and regs[0]["d"] == "2030-01-01",
       "o dia do registro e o de Brasilia (01h30 UTC ainda e o dia anterior)", regs)
    # E O RELOGIO CONTINUA VALENDO DEPOIS: um toque atrasado de um aparelho, com
    # instante anterior ao da marcacao, e descartado pelo gatilho.
    pg.sql("update public.cron_estado set valor = '{\"st\":0,\"vida\":\"ativo\"}'::jsonb, "
           "em = '2030-01-02T01:29:00.000Z', aparelho = 'y95kis' "
           "where chave = 'pipeline/a01/a01-4'")
    ok(item(pg, "pipeline/a01/a01-4")["valor"]["st"] == 2,
       "toque atrasado de outro aparelho nao desfaz a marcacao")

    print("\n=== 7. p_seco: confere sem escrever ===")
    preparar(pg, [("pipeline/a01/a01-4", ATIVA, EM_VELHO)])
    antes = item(pg, "pipeline/a01/a01-4")
    r = marcar(pg, "pipeline/a01/a01-4", seco=True)
    ok(r["resultado"] == "marcaria" and r["de"] == 1, "diz que marcaria", r)
    ok(item(pg, "pipeline/a01/a01-4") == antes and registros(pg) == [], "e nao escreve nada")
    r = marcar(pg, "pipeline/a01/a01-5", seco=True)
    ok(r["resultado"] == "marcaria" and item(pg, "pipeline/a01/a01-5") is None,
       "etapa nunca tocada: marcaria, e nenhuma linha nasce", r)
    r = marcar(pg, "pipeline/a01/a01-1", seco=True)
    ok(r["resultado"] == "recusada", "a conferencia tambem recusa estrela", r)
    r = marcar(pg, "pipeline/a01/a01-4", seco=False)
    ok(r["resultado"] == "marcada", "p_seco false escreve, como sem o parametro", r)

    print("\n=== 8. Chave malformada e dono ambiguo ===")
    preparar(pg)
    for ruim in (None, "", "pipeline/a01", "pipeline/a01/a01-3/x", "pipeline/a01/a01 3",
                 "pipeline/a01/a01-3'; drop table public.cron_estado; --"):
        r = marcar(pg, ruim)
        ok(r["resultado"] == "recusada" and "Chave" in r["mensagem"],
           "chave %r e recusada" % (ruim,), r)
    ok(pg.sql("select count(*) from public.cron_estado") == "0", "e nada foi escrito")
    preparar(pg, donos=(DONO, OUTRO))
    r = marcar(pg, "pipeline/a01/a01-3")
    ok(r["resultado"] == "recusada" and "2 dono" in r["mensagem"], "dois donos: recusa", r)
    preparar(pg, donos=())
    r = marcar(pg, "pipeline/a01/a01-3")
    ok(r["resultado"] == "recusada" and "0 dono" in r["mensagem"], "nenhum dono: recusa", r)

    print("\n=== 9. Quem pode chamar ===")
    preparar(pg)
    for papel in ("anon", "authenticated"):
        try:
            marcar(pg, "pipeline/a01/a01-3", papel=papel)
            ok(False, "%s nao pode chamar" % papel, "chamou")
        except RuntimeError as e:
            ok("permission denied" in str(e), "%s nao pode chamar" % papel, str(e))
    r = marcar(pg, "pipeline/a01/a01-3", papel="service_role")
    ok(r["resultado"] == "marcada", "a service_role chama, e a escrita passa pela RLS", r)
    ok(item(pg, "pipeline/a01/a01-3")["valor"]["st"] == 2, "e a etapa esta marcada")
    acl = pg.sql("select array_to_string(proacl, ',') from pg_proc "
                 "where proname = 'cron_pipeline_marcar'")
    ok("anon=" not in acl and "authenticated=" not in acl and not acl.startswith("=")
       and ",=" not in acl, "o EXECUTE nao e de public, anon nem authenticated", acl)

    print("\n=== 10. Duas etapas no mesmo comando: dois registros ===")
    preparar(pg)
    bruto = pg.sql("select public.cron_pipeline_marcar('pipeline/a01/a01-3')->>'resultado', "
                   "public.cron_pipeline_marcar('pipeline/a01/a01-4')->>'resultado'")
    ok(bruto == "marcada|marcada", "as duas marcadas", bruto)
    regs = registros(pg)
    ok(len(regs) == 2 and len({g["id"] for g in regs}) == 2,
       "cada uma com a sua linha de registro", [g["id"] for g in regs])

    print("\n=== 11. Duas chamadas ao mesmo tempo marcam uma vez so ===")
    for caso, itens in (("linha que ja existe", [("pipeline/a01/a01-4", ATIVA, EM_VELHO)]),
                        ("etapa nunca tocada", [])):
        preparar(pg, itens)
        primeira = subprocess.Popen(
            pg.psql_cmd("begin",
                        "select public.cron_pipeline_marcar('pipeline/a01/a01-4')->>'resultado'",
                        "select pg_sleep(1.5)", "commit"),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        time.sleep(0.5)
        inicio = time.time()
        segunda = pg.sql("select public.cron_pipeline_marcar('pipeline/a01/a01-4')->>'resultado'")
        esperou = time.time() - inicio
        saida1, erro1 = primeira.communicate(timeout=30)
        ok(saida1.strip().splitlines()[:1] == ["marcada"], "%s: a primeira marca" % caso,
           (saida1, erro1))
        ok(segunda == "ja_estava" and esperou > 0.5,
           "%s: a segunda espera a primeira e responde ja_estava" % caso, (segunda, esperou))
        ok(len(registros(pg)) == 1, "%s: um registro so" % caso, registros(pg))

    print("\n=== 12. O arremedo do postgrest_de_mentira responde como a funcao ===")
    # OS OUTROS TESTES (teste_registrar, teste_derivar, teste_sincronia) falam com
    # o arremedo, e nao com o Postgres. Um arremedo que divergisse da funcao
    # faria esses testes provarem outra coisa — entao cada caso roda nos dois.
    adiada = {"st": 1, "vida": "adiado", "motivo": "esperando o parecer",
              "voltar_em": "2026-11-01", "vidaDesde": "2026-10-01"}
    casos = [
        ("nunca tocada", [], "pipeline/a01/a01-3", None, (DONO,)),
        ("ativa em andamento", [("pipeline/a01/a01-4", ATIVA, EM_VELHO)],
         "pipeline/a01/a01-4", None, (DONO,)),
        ("ja concluida", [("pipeline/a01/a01-2", dict(ATIVA, st=2), EM_VELHO)],
         "pipeline/a01/a01-2", None, (DONO,)),
        ("st em texto", [("pipeline/a01/a01-2", dict(ATIVA, st="2"), EM_VELHO)],
         "pipeline/a01/a01-2", None, (DONO,)),
        ("estrela", [], "pipeline/a01/a01-1", None, (DONO,)),
        ("sem prova", [], "pipeline/a01/a01-9", None, (DONO,)),
        ("fora da estrutura", [], "pipeline/a01/a01-7", None, (DONO,)),
        ("adiada", [("pipeline/a01/a01-4", adiada, EM_VELHO)], "pipeline/a01/a01-4", None, (DONO,)),
        ("apagada", [("pipeline/a01/a01-4", ATIVA, EM_VELHO, True)],
         "pipeline/a01/a01-4", None, (DONO,)),
        ("chave malformada", [], "pipeline/a01", None, (DONO,)),
        ("seco", [("pipeline/a01/a01-4", ATIVA, EM_VELHO)], "pipeline/a01/a01-4", True, (DONO,)),
        ("seco nunca tocada", [], "pipeline/a01/a01-5", True, (DONO,)),
        ("aparelho adiantado", [("pipeline/a01/a01-4", ATIVA, "2030-01-02T01:30:00.000Z")],
         "pipeline/a01/a01-4", None, (DONO,)),
        ("dois donos", [], "pipeline/a01/a01-3", None, (DONO, OUTRO)),
    ]
    campos_reg = ("d", "pid", "proj_id", "sub_id", "proj_t", "sub_t", "de", "para",
                  "vida", "motivo", "aparelho")
    for nome, itens, chave, seco, donos in casos:
        preparar(pg, itens, donos=donos)
        r_pg = marcar(pg, chave, seco=seco)
        i_pg = item(pg, chave) if chave.count("/") == 2 else None
        g_pg = sorted(tuple(g[c] for c in campos_reg) for g in registros(pg))

        b = P.Banco()
        b.donos = [{"uid": d} for d in donos]
        b.base = {l["chave"]: {"tipo": l["tipo"], "valor": l["valor"]} for l in ESTRUTURA}
        for chave_s, valor_s, em_s, *resto in itens:
            b.semear(chave_s, valor_s, em_s, apagada=bool(resto and resto[0]))
        r_fk = P.marcar(b, chave, seco=bool(seco))
        i_fk = b.item(chave)
        g_fk = sorted(tuple(g[c] for c in campos_reg) for g in b.registros.values())

        sem_em = lambda r: {k: v for k, v in r.items() if k != "em"}   # noqa: E731
        ok(sem_em(r_pg) == sem_em(r_fk), "%s: a mesma resposta" % nome,
           {"funcao": r_pg, "arremedo": r_fk})
        mesmo_item = ((i_pg is None and i_fk is None) or
                      (i_pg and i_fk and i_pg["valor"] == i_fk["valor"] and
                       i_pg["del"] == i_fk["del"] and i_pg["aparelho"] == i_fk["aparelho"]))
        ok(mesmo_item, "%s: o mesmo item depois" % nome, {"funcao": i_pg, "arremedo": i_fk})
        if nome == "aparelho adiantado":
            ok(P.instante(i_pg["em"]) == P.instante(i_fk["em"]),
               "%s: o mesmo `em`, 1 ms depois do da linha" % nome, (i_pg["em"], i_fk["em"]))
        ok(g_pg == g_fk, "%s: o mesmo registro" % nome, {"funcao": g_pg, "arremedo": g_fk})


if __name__ == "__main__":
    sys.exit(main())
