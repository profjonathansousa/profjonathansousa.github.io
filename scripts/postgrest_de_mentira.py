#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""postgrest_de_mentira.py — o cron_estado e o cron_registro, em memoria.

Usado pelo teste_registrar.py, pelo teste_derivar.py e pelo teste_sincronia.py.
NAO E O BANCO: e o minimo do PostgREST que o dobrar_toques.py usa, com as duas
regras do banco que o codigo precisa respeitar — e que um servidor de mentira
apagaria se nao as tivesse:

  · O RELOGIO (cron_estado_relogio, em sql/cron_estado.sql): uma escrita cujo
    `em` nao seja estritamente mais novo e DESCARTADA EM SILENCIO. A linha nao
    volta na resposta, e e so isso que o cliente ve.
  · O `em` VOLTA COMO O POSTGRES O DEVOLVE: um timestamptz com o fuso explicito
    ("...+00:00") e sem zeros a direita, e nao como foi escrito ("...000Z"). Um
    cliente que reenviasse o texto sem codificar o "+" mandaria um espaco — e
    aqui, como la, a linha nao casaria.

E, desde 2026-10-13, a FUNCAO QUE MARCA: o POST em /rpc/cron_pipeline_marcar
responde pelo arremedo `marcar()` abaixo, que segue a funcao de verdade
(sql/cron_pipeline_marcar.sql) recusa por recusa, com as mesmas mensagens. Um
arremedo pode divergir do original sem ninguem ver — por isso o
teste_marcar_no_banco.py roda os mesmos casos nos dois, contra um Postgres de
verdade, e compara as respostas.

Nada de rede de verdade: sobe em 127.0.0.1, numa porta livre.
"""
import datetime
import json
import re
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qsl, urlsplit

_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})"
                  r"(?:\.(\d{1,6}))?(Z|[+-]\d{2}:?\d{2})?$")


def instante(texto):
    """O texto como instante UTC. Escrito a mao, e nao com fromisoformat, para
    valer tambem no Python do macOS, que nao le fracoes de 1, 2, 4 ou 5 digitos."""
    m = _ISO.match(str(texto or "").strip())
    if not m:
        raise ValueError("instante invalido: %r" % (texto,))
    a, me, d, h, mi, s, frac, fuso = m.groups()
    micro = int((frac or "").ljust(6, "0") or 0)
    t = datetime.datetime(int(a), int(me), int(d), int(h), int(mi), int(s), micro,
                          tzinfo=datetime.timezone.utc)
    if fuso and fuso != "Z":
        sinal = 1 if fuso[0] == "+" else -1
        hh, mm = int(fuso[1:3]), int(fuso[-2:])
        t -= sinal * datetime.timedelta(hours=hh, minutes=mm)
    return t


def como_postgres(texto):
    t = instante(texto)
    fora = t.strftime("%Y-%m-%dT%H:%M:%S")
    if t.microsecond:
        fora += ("." + "%06d" % t.microsecond).rstrip("0")
    return fora + "+00:00"


class Banco(object):
    def __init__(self, dono="dono-1"):
        self.dono = dono
        self.donos = [{"uid": dono}]
        self.linhas = {}            # (dominio, chave) -> linha do cron_estado
        self.registros = {}         # id -> linha do cron_registro
        self.base = {}              # chave -> {"tipo", "valor"}: a cron_estrutura_base
        self.chamadas = []          # (metodo, tabela), na ordem
        self.falhar = {}            # "METODO tabela" -> codigo HTTP
        # Chamada no comeco de cada escrita no cron_estado, ANTES de o filtro
        # ser aplicado: e o celular gravando entre a leitura e a escrita.
        self.antes_de_gravar = None
        self.srv = None
        self.url = None

    def semear(self, chave, valor, em, aparelho="s41hky", dominio="item", apagada=False):
        self.linhas[(dominio, chave)] = {
            "dono": self.dono, "dominio": dominio, "chave": chave,
            "valor": json.loads(json.dumps(valor)), "del": apagada,
            "em": como_postgres(em), "aparelho": aparelho, "expira_em": None}

    def publicar(self, entrada):
        """A cron_estrutura_base de um entrada.json, como o --publicar-estrutura
        a grava: e dela que a funcao de marcar le a prova de cada etapa."""
        self.base = {}
        for pid, projetos in (entrada.get("paineis") or {}).items():
            for pr in (projetos or []):
                self.base["%s/%s" % (pid, pr["id"])] = {
                    "tipo": "projeto",
                    "valor": {k: pr[k] for k in ("t", "n", "mes") if k in pr}}
                for sub in (pr.get("subs") or []):
                    self.base["%s/%s/%s" % (pid, pr["id"], sub["id"])] = {
                        "tipo": "subitem",
                        "valor": {k: sub[k] for k in ("t", "n", "onde", "prova", "medida", "ordem")
                                  if k in sub}}
        return self

    def item(self, chave):
        return self.linhas.get(("item", chave))

    def escritas(self):
        return [c for c in self.chamadas if c[0] != "GET"]

    def subir(self):
        banco = self

        class Mao(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def _responder(self, corpo, codigo=200):
                bruto = b"" if corpo is None else json.dumps(corpo).encode("utf-8")
                self.send_response(204 if corpo is None else codigo)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(bruto)))
                self.end_headers()
                self.wfile.write(bruto)

            def _pedido(self, metodo):
                partes = urlsplit(self.path)
                tabela = partes.path.split("/rest/v1/", 1)[-1]
                filtros = [(k, v) for k, v in parse_qsl(partes.query, keep_blank_values=True)
                           if k not in ("select", "limit", "on_conflict")]
                banco.chamadas.append((metodo, tabela))
                n = int(self.headers.get("Content-Length") or 0)
                corpo = json.loads(self.rfile.read(n) or "null") if n else None
                return tabela, filtros, corpo, self.headers.get("Prefer") or ""

            def _falha(self, metodo, tabela):
                codigo = banco.falhar.get("%s %s" % (metodo, tabela))
                if codigo:
                    self._responder({"message": "falha de mentira"}, codigo)
                    return True
                return False

            def do_GET(self):
                tabela, filtros, _c, _p = self._pedido("GET")
                if self._falha("GET", tabela):
                    return
                if tabela == "cron_dono":
                    return self._responder(banco.donos)
                if tabela == "cron_estado":
                    return self._responder([_publica(l) for l in _casam(banco, filtros)])
                return self._responder({"message": "tabela desconhecida"}, 404)

            def do_PATCH(self):
                tabela, filtros, corpo, prefer = self._pedido("PATCH")
                if self._falha("PATCH", tabela):
                    return
                if tabela != "cron_estado":
                    return self._responder({"message": "so o cron_estado"}, 404)
                if banco.antes_de_gravar:
                    banco.antes_de_gravar(banco)
                feitas = []
                for l in _casam(banco, filtros):
                    if _relogio_recusa(l, corpo):
                        continue
                    _aplicar(l, corpo)
                    feitas.append(_publica(l))
                return self._responder(feitas if "return=representation" in prefer else None)

            def do_POST(self):
                tabela, _f, corpo, prefer = self._pedido("POST")
                if self._falha("POST", tabela):
                    return
                if tabela == "rpc/cron_pipeline_marcar":
                    corpo = corpo or {}
                    return self._responder(marcar(banco, corpo.get("p_chave"),
                                                  corpo.get("p_seco", False)))
                if tabela == "cron_registro":
                    for r in (corpo or []):
                        banco.registros.setdefault(r["id"], dict(r))
                    return self._responder(None)
                if tabela != "cron_estado":
                    return self._responder({"message": "tabela desconhecida"}, 404)
                if banco.antes_de_gravar:
                    banco.antes_de_gravar(banco)
                feitas = []
                for r in (corpo or []):
                    k = (r["dominio"], r["chave"])
                    velha = banco.linhas.get(k)
                    if velha is None:
                        nova = dict(r)
                        nova["em"] = como_postgres(r["em"])
                        banco.linhas[k] = nova
                        feitas.append(_publica(nova))
                    elif "merge-duplicates" in prefer:
                        if not _relogio_recusa(velha, r):
                            _aplicar(velha, r)
                            feitas.append(_publica(velha))
                    elif "ignore-duplicates" not in prefer:
                        return self._responder({"message": "chave duplicada"}, 409)
                return self._responder(feitas if "return=representation" in prefer else None)

        self.srv = HTTPServer(("127.0.0.1", 0), Mao)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = "http://127.0.0.1:%d" % self.srv.server_address[1]
        return self

    def parar(self):
        if self.srv:
            self.srv.shutdown()
            self.srv.server_close()


def _casam(banco, filtros):
    fora = []
    for l in banco.linhas.values():
        ok = True
        for campo, expr in filtros:
            op, _, alvo = expr.partition(".")
            valor = l.get(campo)
            if op == "eq" and campo == "em":
                try:
                    ok = instante(valor) == instante(alvo)
                except ValueError:
                    ok = False
            elif op == "eq":
                ok = str(valor) == alvo
            elif op == "like":
                ok = re.match("^" + re.escape(alvo).replace(r"\*", ".*") + "$",
                              str(valor)) is not None
            else:
                raise ValueError("operador nao emulado: %s" % op)
            if not ok:
                break
        if ok:
            fora.append(l)
    return fora


def _relogio_recusa(velha, nova):
    """O cron_estado_relogio(): `em` que nao e estritamente mais novo nao entra."""
    return instante(nova["em"]) <= instante(velha["em"])


def _aplicar(linha, corpo):
    for campo in ("valor", "del", "aparelho", "expira_em"):
        if campo in corpo:
            linha[campo] = json.loads(json.dumps(corpo[campo]))
    linha["em"] = como_postgres(corpo["em"])


def _publica(linha):
    return {"chave": linha["chave"], "valor": linha["valor"],
            "del": linha.get("del", False), "em": linha["em"]}


# ================== O ARREMEDO DA cron_pipeline_marcar ==================
# Na mesma ordem da funcao de verdade, com as mesmas mensagens e as mesmas
# chaves na resposta. Ver o teste_marcar_no_banco.py, secao 12, que os compara.
_RE_CHAVE = re.compile(r"^[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+$")
_FUSO_BRASILIA = datetime.timedelta(hours=-3)   # sem horario de verao desde 2019


def _ms(t):
    return t.replace(microsecond=t.microsecond // 1000 * 1000)


def _iso_ms(t):
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (t.microsecond // 1000)


def marcar(banco, chave, seco=False, agora=None):
    """A cron_pipeline_marcar, em memoria. `agora` existe para o teste fixar o
    relogio; sem ele, e o instante de agora, como o clock_timestamp()."""
    if not isinstance(chave, str) or not _RE_CHAVE.match(chave):
        return {"resultado": "recusada", "chave": chave, "para": 2,
                "mensagem": "Chave inválida: use painel/projeto/etapa, por exemplo "
                            "pipeline/a01/a01-3. Nada foi escrito."}
    pid, proj_id, sub_id = chave.split("/")
    if len(banco.donos) != 1:
        return {"resultado": "recusada", "chave": chave, "para": 2,
                "mensagem": "O Cronograma tem %d dono(s) cadastrado(s), e eu esperava "
                            "exatamente 1. Nada foi escrito." % len(banco.donos)}
    sub = banco.base.get(chave)
    if not sub or sub["tipo"] != "subitem":
        return {"resultado": "recusada", "chave": chave, "para": 2,
                "mensagem": "Esta etapa não está na estrutura publicada do Cronograma. "
                            "Confira o código (por exemplo pipeline/a01/a01-3). "
                            "Nada foi escrito."}
    proj = banco.base.get("%s/%s" % (pid, proj_id))
    proj_t = (proj or {}).get("valor", {}).get("t") if (proj or {}).get("tipo") == "projeto" else None
    resp = {"chave": chave, "projeto": proj_t, "etapa": sub["valor"].get("t"), "para": 2}

    prova = sub["valor"].get("prova") or ""
    if prova == "estrela":
        return dict(resp, resultado="recusada",
                    mensagem="Prova estrela: a conclusão desta etapa é decisão do autor, "
                             "e não do artefato. Ele marca no aplicativo. Nada foi escrito.")
    if prova != "maquina":
        return dict(resp, resultado="recusada",
                    mensagem='A etapa não tem prova "maquina" na estrutura publicada, e a '
                             "máquina só marca etapa assim. Nada foi escrito.")

    linha = banco.linhas.get(("item", chave))
    atual = json.loads(json.dumps((linha or {}).get("valor") or {}))
    # COMO O `->>` DO POSTGRES LE: o texto do campo, e o `st` so vale se esse
    # texto for so digitos (2 e "2" valem; 2.0, true e -1 nao).
    v = atual.get("vida")
    vida = "ativo" if v is None or v == "" else (v if isinstance(v, str) else json.dumps(v))
    st = atual.get("st")
    st_txt = st if isinstance(st, str) else (None if st is None else json.dumps(st))
    de = int(st_txt) if st_txt is not None and st_txt.isdigit() and st_txt.isascii() else None
    resp = dict(resp, de=de, vida=vida)

    if linha and linha.get("del"):
        return dict(resp, resultado="recusada",
                    mensagem="A etapa foi apagada no aplicativo, e a máquina não a traz "
                             "de volta. Nada foi escrito.")
    if vida != "ativo":
        return dict(resp, resultado="recusada",
                    mensagem='A etapa está com vida "%s" no aplicativo. Adiar, '
                             "abandonar, arquivar ou dizer que não se aplica é "
                             "decisão do autor, e a máquina só marca etapa ativa. "
                             "Nada foi escrito." % vida)
    if (de or 0) >= 2:
        return dict(resp, resultado="ja_estava",
                    mensagem="A etapa já estava concluída. Nada foi escrito.")
    if seco:
        return dict(resp, resultado="marcaria",
                    mensagem="Conferência: a etapa seria marcada como concluída. "
                             "Nada foi escrito.")

    novo = dict(atual, st=2, vida=vida)
    for campo in ("motivo", "voltar_em", "vidaDesde"):
        if not isinstance(novo.get(campo), str):
            novo[campo] = ""
    em = _ms(agora or datetime.datetime.now(datetime.timezone.utc))
    if linha and em <= instante(linha["em"]):
        em = _ms(instante(linha["em"])) + datetime.timedelta(milliseconds=1)

    if linha:
        linha.update({"valor": novo, "del": False, "em": como_postgres(_iso_ms(em)),
                      "aparelho": "cowork"})
    else:
        banco.linhas[("item", chave)] = {
            "dono": banco.dono, "dominio": "item", "chave": chave, "valor": novo,
            "del": False, "em": como_postgres(_iso_ms(em)), "aparelho": "cowork",
            "expira_em": None}

    ident = _iso_ms(em).replace(":", "-").replace(".", "-") + "-cowork-" + chave.replace("/", "-")
    if ident in banco.registros:
        raise RuntimeError("duplicate key value violates unique constraint (cron_registro)")
    banco.registros[ident] = {
        "id": ident, "dono": banco.dono, "d": (em + _FUSO_BRASILIA).date().isoformat(),
        "pid": pid, "proj_id": proj_id, "sub_id": sub_id, "proj_t": proj_t,
        "sub_t": sub["valor"].get("t"), "de": de, "para": 2, "vida": vida,
        "motivo": "", "aparelho": "cowork"}
    return dict(resp, resultado="marcada", em=como_postgres(_iso_ms(em)),
                mensagem="Etapa marcada como concluída. Ela já aparece nos aparelhos.")
