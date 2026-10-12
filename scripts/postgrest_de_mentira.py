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
