#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
teste_derivar.py — as cinco regras duras do derivar_do_pipeline.py.

    python3 scripts/teste_derivar.py

Monta uma pasta de producao FALSA e um Cronograma falso, e prova cada regra
contra o codigo real. Nao toca em nada do repositorio.
"""
import json, os, shutil, sys, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "scripts"))
import derivar_do_pipeline as D

falhas = []
def ok(cond, texto, extra=None):
    print(("  PASSA  " if cond else "  FALHA  ") + texto +
          ("" if cond or extra is None else "  <- " + repr(extra)))
    if not cond:
        falhas.append(texto)

MAPA = {"paineis": {"pipeline": {"subitens": [
    {"id": "a00-1", "prova": "estrela", "artefato": "drafts/escolha_[slug].md"},
    {"id": "a00-2", "prova": "maquina", "artefato": "07_NORMAS/corpus_[slug].md"},
    {"id": "a00-3", "prova": "maquina", "artefato": "drafts/mapa_[slug].md"},
    {"id": "a00-4", "prova": "maquina", "artefato": "drafts/draft_[slug].md"},
    {"id": "a00-5", "prova": "maquina", "artefato": "drafts/final_[slug].md"},
    {"id": "b01-1", "prova": "maquina", "artefato": "drafts/corpus_[slug].md"}
]}}}

def montar(tmp, artefatos):
    prod = os.path.join(tmp, "producao")
    for rel in artefatos:
        alvo = os.path.join(prod, rel)
        os.makedirs(os.path.dirname(alvo), exist_ok=True)
        open(alvo, "w").write("x")
    os.makedirs(prod, exist_ok=True)
    with open(os.path.join(prod, "mapa_portal.json"), "w", encoding="utf-8") as f:
        json.dump(MAPA, f)
    return prod

ENTRADA = {"paineis": {"pipeline": [
    {"id": "a00", "t": "Ago · Confusao de reinos", "slug": "patriotismo-cristao-lutero",
     "subs": [{"id": "a00-1", "t": "Escolha A/B/C", "prova": "estrela", "st": 0},
              {"id": "a00-2", "t": "Janela 0 · planilha de corpus", "prova": "maquina", "st": 0},
              {"id": "a00-3", "t": "Mapa argumentativo", "prova": "maquina", "st": 0},
              {"id": "a00-4", "t": "Draft 1.3", "prova": "maquina", "st": 0},
              {"id": "a00-5", "t": "Final", "prova": "maquina", "st": 2}]},

]}}

print("=== 1. So o que tem artefato, e so prova `maquina` ===")
with tempfile.TemporaryDirectory() as tmp:
    # O ARTEFATO DO a00-3 EXISTE DE PROPOSITO. Sem ele, o a00-3 sairia da lista
    # por falta de arquivo e o teste da regra 3 nao provaria nada — foi o que
    # aconteceu na primeira versao desta secao, e a mutacao que apagava a regra
    # passou incolume. Com o arquivo la, a UNICA coisa que o exclui e o
    # `inaplicavel`. O mesmo vale para o a00-1 e a regra da `estrela`.
    prod = montar(tmp, ["07_NORMAS/corpus_patriotismo-cristao-lutero.md",
                        "drafts/escolha_patriotismo-cristao-lutero.md",
                        "drafts/mapa_patriotismo-cristao-lutero.md"])
    est = {"itens": {"pipeline/a00/a00-3": {"st": 0, "vida": "inaplicavel"},
                     "pipeline/a00/a00-5": {"st": 2, "vida": "ativo"}}}
    cand, div, pul, smapa = D.avaliar(ENTRADA, est, D.mapa_dos_artefatos(json.load(open(os.path.join(prod,"mapa_portal.json")))), prod)
    chaves = [c["chave"] for c in cand]
    ok(chaves == ["pipeline/a00/a00-2"],
       "1. so o a00-2 e candidato: artefato existe e st < 2", chaves)
    ok("pipeline/a00/a00-1" not in chaves,
       "2. REGRA 1 — a00-1 e `estrela` e NUNCA entra, mesmo com o artefato la")
    ok("pipeline/a00/a00-3" not in chaves,
       "3. REGRA 3 — a00-3 e `inaplicavel` e nao e tocado")

print("\n=== 2. REGRA 2 — artefato sumido nao rebaixa ===")
with tempfile.TemporaryDirectory() as tmp:
    prod = montar(tmp, [])          # nenhum artefato
    est = {"itens": {"pipeline/a00/a00-5": {"st": 2, "vida": "ativo"}}}
    cand, div, pul, smapa = D.avaliar(ENTRADA, est, D.mapa_dos_artefatos(json.load(open(os.path.join(prod,"mapa_portal.json")))), prod)
    ok(cand == [], "4. nada a marcar quando nenhum artefato existe", cand)
    ok(any(c == "pipeline/a00/a00-5" for c, _ in div),
       "5. e o a00-5, marcado sem artefato, e REPORTADO como divergencia", div)
    ok(all("a00-5" not in c["chave"] for c in cand),
       "   e nunca vira toque: o script nao rebaixa")

print("\n=== 3. REGRA 5 — projeto sem slug e pulado, nunca adivinhado ===")
with tempfile.TemporaryDirectory() as tmp:
    prod = montar(tmp, ["drafts/corpus_qualquer-coisa.md"])
    ent2 = json.loads(json.dumps(ENTRADA))
    ent2["paineis"]["pipeline"].append(
        {"id": "b01", "t": "Peca sem slug",
         "subs": [{"id": "b01-1", "t": "Corpus", "prova": "maquina", "st": 0}]})
    cand, div, pul, smapa = D.avaliar(ent2, {"itens": {}}, D.mapa_dos_artefatos(json.load(open(os.path.join(prod,"mapa_portal.json")))), prod)
    ok(any(c == "pipeline/b01/b01-1" for c, _ in pul),
       "6. o projeto sem `slug` e pulado com aviso", pul)
    ok(all("b01" not in c["chave"] for c in cand),
       "   e nao entra como candidato por heuristica nenhuma")

print("\n=== 4. REGRA 4 — o escritor unico continua sendo o dobrar_toques.py ===")
fonte = open(os.path.join(RAIZ, "scripts", "derivar_do_pipeline.py"), encoding="utf-8").read()
import re
codigo = re.sub(r'"""[\s\S]*?"""', "", fonte)
codigo = re.sub(r'^\s*#.*$', "", codigo, flags=re.M)
ok("--registrar" in codigo and "dobrar_toques" in codigo,
   "7. ele emite pelo --registrar do dobrar_toques.py")
ok("ARQ_ESTADO" in codigo and not re.search(r'open\(\s*ARQ_ESTADO\s*,\s*["\']w', codigo),
   "8. e NUNCA abre o estado.json para escrita")
ok("--forcar" not in codigo,
   "9. REGRA 1 — o --forcar nao aparece: `estrela` nao e contornavel daqui")

# O MAPA REAL FALA POR PADRAO. O fixture MAPA acima usa ids concretos de
# proposito, para as secoes 1 a 3; este reproduz a forma do mapa_portal.json de
# verdade, que descreve a esteira uma vez so com `aNN-*`.
MAPA_PADRAO = {"objetivos": {"esteira": {"painel": "pipeline", "subitens": [
    {"id": "aNN-1", "prova": "estrela", "artefato": "entrada_[slug].md"},
    {"id": "aNN-2", "prova": "maquina", "artefato": "07_NORMAS/corpus_[slug].md"}
]}}}

def montar_padrao(tmp, artefatos, ajustar=None):
    prod = os.path.join(tmp, "producao")
    for rel in artefatos:
        alvo = os.path.join(prod, rel)
        os.makedirs(os.path.dirname(alvo), exist_ok=True)
        open(alvo, "w").write("x")
    os.makedirs(prod, exist_ok=True)
    m = json.loads(json.dumps(MAPA_PADRAO))
    if ajustar:
        ajustar(m)
    with open(os.path.join(prod, "mapa_portal.json"), "w", encoding="utf-8") as f:
        json.dump(m, f)
    return prod

print("\n=== 6. A PONTE padrao <-> instancia (o defeito de 11/09) ===")
# O mapa fala por PADRAO e o Cronograma por INSTANCIA. Na primeira execucao
# real, os 13 subitens do mapa casaram com ZERO dos 78 do Cronograma e o script
# disse "nada a marcar" estando cego.
ok(D.padroes_do_id("a01-2") == ["a01-2", "aNN-2"],
   "11. a01-2 gera o padrao aNN-2", D.padroes_do_id("a01-2"))
ok("aNN-4b" in D.padroes_do_id("a00-4b"),
   "    e a00-4b gera aNN-4b (o sufixo com letra sobrevive)", D.padroes_do_id("a00-4b"))
ok("ebd-AAAA-MM-1" in D.padroes_do_id("ebd-2026-08-1"),
   "    e a familia ebd vira ebd-AAAA-MM-1", D.padroes_do_id("ebd-2026-08-1"))
ok(D.padroes_do_id("aNN-2")[0] == "aNN-2",
   "    o id exato continua sendo a primeira tentativa")

with tempfile.TemporaryDirectory() as tmp:
    # O MESMO MAPA POR PADRAO, e um Cronograma com ids CONCRETOS.
    prod = montar_padrao(tmp, ["07_NORMAS/corpus_lutero.md"])
    entP = {"paineis": {"pipeline": [
        {"id": "a07", "t": "Peca sete", "slug": "lutero",
         "subs": [{"id": "a07-2", "t": "Corpus", "prova": "maquina", "st": 0}]}]}}
    arte = D.mapa_dos_artefatos(json.load(open(os.path.join(prod, "mapa_portal.json"))))
    cand, div, pul, smapa = D.avaliar(entP, {"itens": {}}, arte, prod)
    ok([c["chave"] for c in cand] == ["pipeline/a07/a07-2"],
       "12. a07-2 casa com o aNN-2 do mapa e vira candidato", [c["chave"] for c in cand])
    ok(smapa == [], "    e nada fica sem correspondencia", smapa)

with tempfile.TemporaryDirectory() as tmp:
    # UM ID QUE O MAPA NAO CONHECE tem de ser REPORTADO, nao engolido.
    prod = montar_padrao(tmp, [])
    entX = {"paineis": {"pipeline": [
        {"id": "z99", "t": "Fora do mapa", "slug": "x",
         "subs": [{"id": "z99-9", "t": "Etapa orfa", "prova": "maquina", "st": 0}]}]}}
    arte = D.mapa_dos_artefatos(json.load(open(os.path.join(prod, "mapa_portal.json"))))
    cand, div, pul, smapa = D.avaliar(entX, {"itens": {}}, arte, prod)
    ok([c for c, _ in smapa] == ["pipeline/z99/z99-9"],
       "13. subitem `maquina` sem entrada no mapa e REPORTADO", smapa)

print("\n=== 7. REGRA 6 — `confirmar: true` nao vira marcacao ===")
# O _como_ler do mapa e explicito: "true = caminho inferido, ainda nao
# verificado no disco. Nao tratar como fato."
with tempfile.TemporaryDirectory() as tmp:
    def marcar_confirmar(m):
        for s in m["objetivos"]["esteira"]["subitens"]:
            if s["id"] == "aNN-2":
                s["confirmar"] = True
                s["nota_confirmar"] = "PASTA_NORMAS nao verificada"
    prod = montar_padrao(tmp, ["07_NORMAS/corpus_lutero.md"], marcar_confirmar)
    mapa = json.load(open(os.path.join(prod, "mapa_portal.json")))
    entP = {"paineis": {"pipeline": [
        {"id": "a07", "t": "Peca sete", "slug": "lutero",
         "subs": [{"id": "a07-2", "t": "Corpus", "prova": "maquina", "st": 0}]}]}}
    cand, div, pul, smapa = D.avaliar(entP, {"itens": {}}, D.mapa_dos_artefatos(mapa), prod)
    ok(cand == [],
       "14. com `confirmar: true`, o artefato existir NAO basta", cand)
    ok(any("confirmar" in motivo for _, motivo in pul),
       "    e o motivo dito e o `confirmar`, nao outro qualquer", pul)
    ok(any("PASTA_NORMAS" in motivo for _, motivo in pul),
       "    a nota do mapa e repassada a quem le", pul)

print("\n=== 5. Pasta ausente sai limpo, codigo 0 ===")
import subprocess
amb = dict(os.environ, PASTA_PRODUCAO=os.path.join(tempfile.gettempdir(), "nao-existe-xyz"))
r = subprocess.run([sys.executable, os.path.join(RAIZ, "scripts", "derivar_do_pipeline.py")],
                   capture_output=True, text=True, env=amb)
ok(r.returncode == 0, "10. codigo de saida 0 com a pasta ausente", r.returncode)
ok("ausente" in r.stdout, "    e diz claramente que a pasta nao existe")

print("\n" + "=" * 62)
print("FALHAS: %d" % len(falhas))
for f in falhas:
    print("  - " + f)
sys.exit(1 if falhas else 0)
