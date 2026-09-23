#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
teste_ponto_cego.py — a área do Ponto Cego no portal, antes de cada publicação.

    python3 scripts/teste_ponto_cego.py

Só lê. Confere links internos, a pergunta vigente igual onde aparece, a regra
de revelação (nenhum tema além do próximo), marcadores de preenchimento
esquecidos, os blocos que nunca se cortam, a navbar das páginas, cores fora
dos tokens e o vocabulário. Sai com código 1 se algo falhar.
"""
import os, re, sys
from html.parser import HTMLParser

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORTAL = os.path.join(RAIZ, "filosofia_joel-2026")
PC = os.path.join(PORTAL, "ponto-cego")
URL = "https://jonathansousa.com.br/filosofia_joel-2026/"
MOLDE = "_modelo-sessao.html"
TURMAS = ["em1_quinta.html", "em2_quinta.html", "em3_3003_quinta.html",
          "em3_3006_quinta.html", "em3_3001_sexta.html", "em3_3002_sexta.html"]
VAZIOS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
          "meta", "source", "track", "wbr"}

falhas = []
def ok(cond, texto, extra=None):
    print(("  PASSA  " if cond else "  FALHA  ") + texto +
          ("" if cond or extra is None else "  <- " + repr(extra)))
    if not cond:
        falhas.append(texto)

class Pagina(HTMLParser):
    """Links, og:image, elementos, e o texto dos marcados com data-pc/data-sessao."""
    def __init__(self, caminho):
        super().__init__(convert_charrefs=True)
        self.caminho = caminho
        self.fonte = open(caminho, encoding="utf-8").read()
        self.links, self.og_image, self.elementos = [], None, []
        self.marcados, self.sessoes = {}, {}
        self._abertos, self._prof = [], 0
        self.feed(self.fonte)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.links += [a[k] for k in ("href", "src") if a.get(k)]
        if tag == "meta" and a.get("property") == "og:image":
            self.og_image = a.get("content")
        self.elementos.append((tag, (a.get("class") or "").split(), a))
        if tag in VAZIOS:
            return
        self._prof += 1
        for chave in ("data-pc", "data-sessao"):
            if chave in a:
                self._abertos.append((chave, a[chave], [], self._prof))

    def handle_endtag(self, tag):
        if tag in VAZIOS:
            return
        for item in [x for x in self._abertos if x[3] == self._prof]:
            chave, valor, partes, _ = item
            texto = " ".join("".join(partes).split())
            if chave == "data-pc":
                self.marcados.setdefault(valor, []).append(texto)
            else:
                self.sessoes[int(valor)] = texto
            self._abertos.remove(item)
        self._prof -= 1

    def handle_data(self, data):
        for item in self._abertos:
            item[2].append(data)

def numero(nome):
    return int(re.search(r"\d+", nome).group())

publicadas = sorted((n for n in os.listdir(PC) if re.fullmatch(r"sessao-\d+\.html", n)), key=numero)
P = {rel: Pagina(os.path.join(PORTAL, rel)) for rel in
     ["index.html"] + TURMAS + ["ponto-cego/index.html", "ponto-cego/" + MOLDE] +
     ["ponto-cego/" + n for n in publicadas]}
ENTRADA = P["ponto-cego/index.html"]
publicaveis = [rel for rel in P if not os.path.basename(rel).startswith("_")]

print("=== 1. Links internos apontam para arquivos que existem ===")
for rel, pg in P.items():
    quebrados = [h for h in pg.links if not re.match(r"(https?:|mailto:|tel:|#)", h) and not
                 os.path.exists(os.path.normpath(os.path.join(os.path.dirname(pg.caminho), h.split("#")[0])))]
    ok(not quebrados, rel, quebrados)
    if pg.og_image and rel in publicaveis:
        local = os.path.join(PORTAL, pg.og_image[len(URL):])
        ok(pg.og_image.startswith(URL) and os.path.exists(local), rel + ": og:image existe", pg.og_image)

print("\n=== 2. Nenhum marcador de preenchimento nas páginas publicadas ===")
for rel in publicaveis:
    sem_comentarios = re.sub(r"<!--.*?-->", "", P[rel].fonte, flags=re.S)
    ok(not re.search(r"\[PREENCHER|\[N[\]+]", sem_comentarios), rel)

print("\n=== 3. A pergunta vigente é a mesma em todo lugar ===")
vigente = P["index.html"].marcados.get("pergunta-vigente", []) + ENTRADA.marcados.get("pergunta-vigente", [])
ok(len(vigente) == 2, "marcada no index do portal e na entrada do núcleo", vigente)
ok(len(set(vigente)) == 1, "e igual nos dois", vigente)
if publicadas:
    gancho = P["ponto-cego/" + publicadas[-1]].marcados.get("gancho", [])
    ok(gancho[:1] == vigente[:1], publicadas[-1] + ": o gancho anuncia a pergunta vigente", (gancho, vigente[:1]))

print("\n=== 4. Revelação: um tema por vez, nenhum além do próximo ===")
ok([numero(n) for n in publicadas] == list(range(1, len(publicadas) + 1)),
   "sessões publicadas em sequência, sem buraco", publicadas)
ok(bool(ENTRADA.sessoes), "o cronograma marca as sessões com data-sessao")
for k, texto in sorted(ENTRADA.sessoes.items()):
    revelado = k <= len(publicadas) + 1
    ok(("a definir" in texto) != revelado,
       "sessão %d %s" % (k, "com tema no cronograma" if revelado else "ainda «a definir»"), texto)
for anterior, seguinte in zip(publicadas, publicadas[1:]):
    ok(any(t == "a" and "pc-gancho" in c and a.get("href") == seguinte
           for t, c, a in P["ponto-cego/" + anterior].elementos),
       anterior + ": o gancho virou link para " + seguinte)
for nome in publicadas:
    ok(nome in ENTRADA.links, "a entrada do núcleo lista " + nome)

print("\n=== 5. Impasse, gancho e responda: os blocos que nunca se cortam ===")
for nome in [MOLDE] + publicadas:
    classes = {c for _, cs, _ in P["ponto-cego/" + nome].elementos for c in cs}
    faltam = [b for b in ("pc-impasse", "pc-gancho", "pc-responda") if b not in classes]
    ok(not faltam, nome, faltam)

print("\n=== 6. A navbar leva ao núcleo e às seis turmas ===")
for rel, pg in P.items():
    no_nucleo = rel.startswith("ponto-cego/")
    pilulas = [(c, a.get("href")) for t, c, a in pg.elementos if t == "a" and "nav-pill" in c]
    nucleo = [h for c, h in pilulas if "pc" in c]
    turmas = sorted(h for c, h in pilulas if "pc" not in c)
    ok(nucleo == ["index.html" if no_nucleo else "ponto-cego/index.html"], rel + ": pílula do Ponto Cego", nucleo)
    ok(turmas == sorted(("../" if no_nucleo else "") + t for t in TURMAS), rel + ": as seis turmas", turmas)

print("\n=== 7. Cores só pelos tokens do :root ===")
css = open(os.path.join(PORTAL, "style.css"), encoding="utf-8").read()
secao = re.sub(r"/\*.*?\*/", "", css[css.index("/* ── PONTO CEGO"):css.index("/* ── RESPONSIVE")], flags=re.S)
literais = re.findall(r"#[0-9A-Fa-f]{3,8}\b|rgba?\(|hsla?\(", secao)
ok(not literais, "a seção do Ponto Cego no style.css não tem cor literal", literais)
for token in ("--pc", "--pc2", "--pc-bg", "--pc-border", "--pc-header-from", "--pc-header-to"):
    n = len(re.findall(re.escape(token) + r"\s*:", css))
    ok(n == 2, token + " definido no tema escuro e no claro", n)
for rel in [r for r in P if r.startswith("ponto-cego/")]:
    fonte = P[rel].fonte
    ok("<style" not in fonte and not re.search(r'style="[^"]*(#[0-9A-Fa-f]{3}|rgb|hsl)', fonte),
       rel + ": nenhuma cor fora do style.css")

print("\n=== 8. Vocabulário e horário ===")
achados = []
for pasta, _, arquivos in os.walk(PORTAL):
    for nome in arquivos:
        if nome.endswith((".html", ".css", ".md")):
            if re.search(r"travament", open(os.path.join(pasta, nome), encoding="utf-8").read(), re.I):
                achados.append(nome)
ok(not achados, "vocabulário da v1.2 no portal: só «impasse»", achados)
for rel in ["index.html"] + [r for r in P if r.startswith("ponto-cego/")]:
    ok(not re.search(r"quinzena|12h00", P[rel].fonte, re.I), rel + ": nem «quinzenal» nem «12h00»")

print("\n" + "=" * 62)
print("Sessões publicadas: %d · FALHAS: %d" % (len(publicadas), len(falhas)))
for f in falhas:
    print("  - " + f)
sys.exit(1 if falhas else 0)
