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
    cand, div, pul = D.avaliar(ENTRADA, est, D.mapa_dos_artefatos(json.load(open(os.path.join(prod,"mapa_portal.json")))), prod)
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
    cand, div, pul = D.avaliar(ENTRADA, est, D.mapa_dos_artefatos(json.load(open(os.path.join(prod,"mapa_portal.json")))), prod)
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
    cand, div, pul = D.avaliar(ent2, {"itens": {}}, D.mapa_dos_artefatos(json.load(open(os.path.join(prod,"mapa_portal.json")))), prod)
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
