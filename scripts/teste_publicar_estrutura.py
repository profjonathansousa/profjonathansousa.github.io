"""Testes da Fase 9G-0 B1 — a publicacao da estrutura dos trilhos.

    python3 scripts/teste_publicar_estrutura.py

NAO TOCA A REDE DE VERDADE e NAO TOCA O REPOSITORIO: sobe um PostgREST de
mentira em localhost e aponta o publicador para ele com SUPABASE_URL. O
Cronograma/entrada.json de verdade e preservado e restaurado ao fim — o que se
testa e o comando, nao o conteudo do arquivo do autor.

O QUE ESTE TESTE GUARDA, e por que cada um importa:
  · a base registra EXATAMENTE a estrutura publicada, e nao outra coisa;
  · publicar de novo faz a base acompanhar, inclusive retirando o que saiu;
  · uma falha na base NAO publica o arquivo pela metade — e a invariante que
    mantem o merge de tres vias verdadeiro;
  · sem credenciais o comando RECUSA, em vez de publicar so o arquivo.
"""
import json
import os
import shutil
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "scripts"))
import dobrar_toques as D                                   # noqa: E402

falhas = []


def ok(cond, nome, detalhe=None):
    print(("  PASSA  " if cond else "  FALHA  ") + nome +
          ("" if cond or detalhe is None else "  <- " + repr(detalhe)))
    if not cond:
        falhas.append(nome)


# ===================== O POSTGREST DE MENTIRA =====================
class Base(object):
    def __init__(self):
        self.linhas = {}          # chave -> linha
        self.donos = [{"uid": "dono-1"}]
        self.falhar_em = None     # "base" para simular a rede caindo no meio
        self.chamadas = 0         # quantas vezes a base foi escrita


BASE = Base()


class Mao(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _responder(self, corpo, codigo=200):
        bruto = json.dumps(corpo).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(bruto)))
        self.end_headers()
        self.wfile.write(bruto)

    def do_GET(self):
        if self.path.startswith("/rest/v1/cron_dono"):
            return self._responder(BASE.donos)
        if self.path.startswith("/rest/v1/cron_estrutura_base"):
            return self._responder([{"chave": k} for k in BASE.linhas])
        return self._responder([], 404)

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        corpo = json.loads(self.rfile.read(n) or "null")
        if not self.path.startswith("/rest/v1/rpc/cron_publicar_estrutura"):
            return self._responder({"message": "so a RPC escreve a base"}, 404)
        BASE.chamadas += 1
        if BASE.falhar_em == "base":
            # A falha acontece DENTRO da transacao: nada e aplicado.
            return self._responder({"message": "rede fora"}, 500)
        if BASE.falhar_em == "meio":
            # Uma recusa da propria funcao (um raise dentro dela): a transacao
            # aborta e a base continua sendo exatamente a anterior.
            return self._responder({"message": "linha invalida no meio"}, 400)
        try:
            return self._responder(self._transacao(corpo))
        except Exception as e:
            return self._responder({"message": str(e)}, 400)

    def _transacao(self, corpo):
        """Espelha o cron_publicar_estrutura(): substitui a base inteira, e ou
        tudo entra ou nada entra. Emular isso importa — um servidor de mentira
        que aplicasse pela metade provaria o contrario do que o teste afirma."""
        linhas = (corpo or {}).get("p_linhas")
        gerado = (corpo or {}).get("p_gerado_em")
        dono = (corpo or {}).get("p_dono")
        if not dono or not gerado or not isinstance(linhas, list):
            raise ValueError("argumentos invalidos")
        if not linhas:
            raise ValueError("estrutura vazia nao e publicacao")
        nova = {}
        for l in linhas:
            if not l.get("chave") or l.get("tipo") not in ("projeto", "subitem"):
                raise ValueError("linha invalida: %r" % (l,))
            nova[l["chave"]] = {"chave": l["chave"], "tipo": l["tipo"],
                                "valor": l.get("valor") or {},
                                "gerado_em": gerado, "dono": dono}
        retiradas = len([k for k in BASE.linhas if k not in nova])
        BASE.linhas = nova              # a troca so acontece se nada acima levantou
        return [{"gravadas": len(nova), "retiradas": retiradas}]


def subir_servidor():
    srv = HTTPServer(("127.0.0.1", 0), Mao)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    return srv


def estrutura(gerado_em, titulo_a1="Artigo Lutero", com_a02=True):
    paineis = {"pipeline": [
        {"id": "a01", "t": titulo_a1, "mes": "2026-09", "subs": [
            {"id": "a01-1", "t": "Levantamento", "onde": "escrivaninha", "prova": "maquina"},
            {"id": "a01-2", "t": "Redacao", "prova": "estrela"},
        ]},
    ]}
    if com_a02:
        paineis["pipeline"].append(
            {"id": "a02", "t": "Artigo Spinoza", "mes": "2026-10", "subs": [
                {"id": "a02-1", "t": "Fichamento", "prova": "maquina"}]})
    return {"_versao": 1, "_gerado_em": gerado_em,
            "_escritor": "Cowork. Nao editar a mao.", "paineis": paineis}


def publicar(obj, seco=False):
    caminho = os.path.join(RAIZ, "_teste_entrada.json")
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)
    try:
        return D.publicar_estrutura(caminho, seco)
    finally:
        os.remove(caminho)


def principal():
    srv = subir_servidor()
    porta = srv.server_address[1]
    os.environ["SUPABASE_URL"] = "http://127.0.0.1:%d" % porta
    os.environ["SUPABASE_SECRET_KEY"] = "chave-de-mentira"

    guardado = D.ARQ_ENTRADA + ".guardado-pelo-teste"
    tinha = os.path.exists(D.ARQ_ENTRADA)
    if tinha:
        shutil.copy2(D.ARQ_ENTRADA, guardado)

    try:
        print("\n=== 1. A base nasce da primeira publicacao real ===")
        ok(BASE.linhas == {}, "a base comeca vazia: nada foi semeado", BASE.linhas)
        r = publicar(estrutura("2026-09-10T10:00:00Z"))
        ok(r == 0, "a publicacao terminou bem", r)
        ok(os.path.exists(D.ARQ_ENTRADA), "o entrada.json foi escrito")
        with open(D.ARQ_ENTRADA, encoding="utf-8") as f:
            no_disco = json.load(f)
        ok(no_disco["_gerado_em"] == "2026-09-10T10:00:00Z",
           "e e a estrutura que foi passada ao comando", no_disco["_gerado_em"])

        ok(len(BASE.linhas) == 5,
           "a base tem 2 projetos + 3 subitens = 5 linhas", len(BASE.linhas))
        ok(set(BASE.linhas) == {"pipeline/a01", "pipeline/a01/a01-1", "pipeline/a01/a01-2",
                                "pipeline/a02", "pipeline/a02/a02-1"},
           "com as chaves painel/proj e painel/proj/sub", sorted(BASE.linhas))
        ok(BASE.linhas["pipeline/a01"]["tipo"] == "projeto" and
           BASE.linhas["pipeline/a01/a01-1"]["tipo"] == "subitem",
           "e o tipo certo em cada uma")
        ok(BASE.linhas["pipeline/a01"]["gerado_em"] == "2026-09-10T10:00:00Z",
           "todas carimbadas com o `_gerado_em` DA PUBLICACAO",
           BASE.linhas["pipeline/a01"]["gerado_em"])

        # EXATAMENTE a estrutura publicada, campo a campo.
        ok(BASE.linhas["pipeline/a01"]["valor"] ==
           {"t": "Artigo Lutero", "mes": "2026-09"},
           "o projeto guarda so t/n/mes", BASE.linhas["pipeline/a01"]["valor"])
        ok(BASE.linhas["pipeline/a01/a01-1"]["valor"] ==
           {"t": "Levantamento", "onde": "escrivaninha", "prova": "maquina"},
           "e o subitem so t/n/onde/prova/medida/ordem",
           BASE.linhas["pipeline/a01/a01-1"]["valor"])
        ok("subs" not in BASE.linhas["pipeline/a01"]["valor"] and
           "id" not in BASE.linhas["pipeline/a01"]["valor"],
           "nem os filhos nem o id entram no valor: a chave ja diz quem e")

        print("\n=== 2. Republicar: a base acompanha a versao publicada ===")
        r = publicar(estrutura("2026-09-11T10:00:00Z",
                               titulo_a1="Artigo sobre Lutero", com_a02=False))
        ok(r == 0, "a segunda publicacao terminou bem", r)
        ok(BASE.linhas["pipeline/a01"]["valor"]["t"] == "Artigo sobre Lutero",
           "o titulo renomeado esta na base", BASE.linhas["pipeline/a01"]["valor"])
        ok(BASE.linhas["pipeline/a01"]["gerado_em"] == "2026-09-11T10:00:00Z",
           "com o carimbo da NOVA publicacao")
        ok("pipeline/a02" not in BASE.linhas and "pipeline/a02/a02-1" not in BASE.linhas,
           "e a peca que saiu do arquivo saiu da base", sorted(BASE.linhas))
        ok(BASE.chamadas == 2,
           "e tudo isso numa CHAMADA so por publicacao: gravar e retirar sao "
           "uma transacao, nao duas operacoes", BASE.chamadas)
        with open(D.ARQ_ENTRADA, encoding="utf-8") as f:
            ok(len(json.load(f)["paineis"]["pipeline"]) == 1,
               "o arquivo tambem ficou com uma peca so")

        print("\n=== 3. Falha na base NAO publica o arquivo pela metade ===")
        antes = open(D.ARQ_ENTRADA, encoding="utf-8").read()
        base_antes = json.dumps(BASE.linhas, sort_keys=True)
        BASE.falhar_em = "base"
        r = publicar(estrutura("2026-09-12T10:00:00Z", titulo_a1="NUNCA DEVIA APARECER"))
        BASE.falhar_em = None
        ok(r == 1, "o comando devolveu erro", r)
        ok(open(D.ARQ_ENTRADA, encoding="utf-8").read() == antes,
           "o entrada.json anterior ficou intacto")
        ok(json.dumps(BASE.linhas, sort_keys=True) == base_antes,
           "e a base tambem: os dois continuam de acordo um com o outro")
        ok(not os.path.exists(D.ARQ_ENTRADA + ".novo"),
           "e o temporario foi removido, sem lixo no disco")

        print("\n=== 3b. Erro DENTRO da substituicao: nem base, nem arquivo ===")
        antes = open(D.ARQ_ENTRADA, encoding="utf-8").read()
        base_antes = json.dumps(BASE.linhas, sort_keys=True)
        BASE.falhar_em = "meio"
        r = publicar(estrutura("2026-09-12T11:00:00Z", titulo_a1="TAMBEM NAO DEVIA"))
        BASE.falhar_em = None
        ok(r == 1, "o comando devolveu erro quando a base recusou no meio", r)
        ok(json.dumps(BASE.linhas, sort_keys=True) == base_antes,
           "a base nao ficou pela metade: e uma transacao, nao um lote")
        ok(open(D.ARQ_ENTRADA, encoding="utf-8").read() == antes,
           "e o entrada.json anterior continua no disco")

        print("\n=== 3c. A garantia mora no SQL, e nao numa compensacao ===")
        SQL = open(os.path.join(RAIZ, "sql", "cron_estado.sql"), encoding="utf-8").read()
        ok("create or replace function public.cron_publicar_estrutura" in SQL,
           "a funcao existe no esquema")
        corpo_sql = SQL.split("create or replace function public.cron_publicar_estrutura")[1]
        corpo_sql = corpo_sql.split("$$;")[0]
        ok("insert into public.cron_estrutura_base" in corpo_sql and
           "delete from public.cron_estrutura_base" in corpo_sql,
           "gravar e retirar acontecem DENTRO dela — uma transacao so")
        ok("jsonb_array_length(p_linhas) = 0" in corpo_sql,
           "estrutura vazia e recusada, e nao tratada como `apagar tudo`")
        ok("not exists" in corpo_sql and "not in (" not in corpo_sql,
           "a retirada usa `not exists`: um `chave` nulo nao a faria sumir em silencio")
        import re as _re
        concessao = _re.search(
            r"grant execute on function public\.cron_publicar_estrutura[^;]*;", SQL)
        ok(bool(concessao) and "service_role" in concessao.group(0) and
           "authenticated" not in concessao.group(0),
           "e so a service_role pode chama-la",
           concessao.group(0) if concessao else None)
        ok("revoke all on function public.cron_publicar_estrutura" in SQL,
           "revogada de public/anon/authenticated: o navegador nao a alcanca")

        # E o publicador nao tem mais como fazer meia publicacao: uma chamada so.
        fonte = open(os.path.join(RAIZ, "scripts", "dobrar_toques.py"), encoding="utf-8").read()
        corpo_pub = fonte.split("def publicar_estrutura")[1].split("\ndef ")[0]
        ok(corpo_pub.count("_pedir(") == 1,
           "o publicador faz UMA chamada de escrita, e nao um POST mais N DELETEs",
           corpo_pub.count("_pedir("))
        ok("/rpc/cron_publicar_estrutura" in corpo_pub,
           "e ela e a RPC transacional")

        print("\n=== 4. Sem credenciais, RECUSA — nao publica so o arquivo ===")
        url = os.environ.pop("SUPABASE_URL")
        r = publicar(estrutura("2026-09-13T10:00:00Z", titulo_a1="TAMBEM NAO"))
        os.environ["SUPABASE_URL"] = url
        ok(r == 1, "recusou", r)
        ok(open(D.ARQ_ENTRADA, encoding="utf-8").read() == antes,
           "e o arquivo continua o de antes: publicar so metade nao e opcao")

        print("\n=== 5. Estrutura invalida nao chega a base ===")
        base_antes = json.dumps(BASE.linhas, sort_keys=True)
        for ruim, nome in [
            ({"paineis": {"pipeline": []}}, "sem `_gerado_em`"),
            ({"_gerado_em": "x", "paineis": {}}, "sem paineis"),
            ({"_gerado_em": "x", "paineis": {"pipeline": [{"t": "sem id"}]}},
             "projeto sem id"),
            ({"_gerado_em": "x", "paineis": {"pipeline": [
                {"id": "a01"}, {"id": "a01"}]}}, "id repetido"),
        ]:
            try:
                D._conferir_entrada(ruim)
                ok(False, "recusa estrutura " + nome)
            except RuntimeError:
                ok(True, "recusa estrutura " + nome)
        ok(json.dumps(BASE.linhas, sort_keys=True) == base_antes,
           "e nenhuma delas encostou na base")

        print("\n=== 6. O --seco nao escreve nada, em lugar nenhum ===")
        antes = open(D.ARQ_ENTRADA, encoding="utf-8").read()
        base_antes = json.dumps(BASE.linhas, sort_keys=True)
        r = publicar(estrutura("2026-09-14T10:00:00Z", titulo_a1="SECO"), seco=True)
        ok(r == 0, "o --seco termina bem", r)
        ok(open(D.ARQ_ENTRADA, encoding="utf-8").read() == antes, "sem tocar o arquivo")
        ok(json.dumps(BASE.linhas, sort_keys=True) == base_antes, "nem a base")

        print("\n=== 7. O segredo nunca esta no codigo ===")
        fonte = open(os.path.join(RAIZ, "scripts", "dobrar_toques.py"),
                     encoding="utf-8").read()
        ok("os.environ.get(API_CHAVE)" in fonte,
           "a chave vem do ambiente, e so de la")
        import re
        ok(not re.search(r"eyJ[A-Za-z0-9_-]{20,}", fonte),
           "e nenhuma chave esta gravada no arquivo")

    finally:
        if tinha:
            shutil.move(guardado, D.ARQ_ENTRADA)
        elif os.path.exists(D.ARQ_ENTRADA):
            os.remove(D.ARQ_ENTRADA)
        for lixo in (D.ARQ_ENTRADA + ".novo",):
            if os.path.exists(lixo):
                os.remove(lixo)
        srv.shutdown()

    print("\n==============================================================")
    print("FALHAS: %d" % len(falhas))
    for f in falhas:
        print("  - " + f)
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(principal())
