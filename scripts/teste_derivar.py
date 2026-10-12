#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
teste_derivar.py — as regras duras do derivar_do_pipeline.py.

    python3 scripts/teste_derivar.py

Monta uma pasta de producao FALSA e um Cronograma falso, e prova cada regra
contra o codigo real. O estado de agora vem de um PostgREST de mentira
(scripts/postgrest_de_mentira.py), em localhost. Nao toca em nada do
repositorio nem na rede.
"""
import json, os, shutil, subprocess, sys, tempfile

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
# DESDE 2026-10-12 a regra ficou mais dura: ele tambem nao LE o estado.json. O
# arquivo parou em 10/09, quando a 9G-3 cortou a dobra dos aparelhos, e decidir
# por ele era remarcar o que ja estava marcado e atropelar o que voce adiou.
ok("ARQ_ESTADO" not in codigo and "estado.json" not in codigo,
   "8. e NUNCA le nem escreve o estado.json: o estado de agora e o do banco")
ok("ler_estado_online" in codigo and "itens_do_painel" in codigo,
   "   ele le o cron_estado, pela mesma leitura do --registrar")
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

print("\n=== 8. REGRA 3, a outra metade — so etapa ATIVA e marcada ===")
# Decidido pelo autor em 2026-10-12: etapa adiada, abandonada ou arquivada e
# decisao dele. Com o artefato presente ela e AVISADA, e nunca marcada.
with tempfile.TemporaryDirectory() as tmp:
    prod = montar(tmp, ["07_NORMAS/corpus_patriotismo-cristao-lutero.md"])
    arte = D.mapa_dos_artefatos(json.load(open(os.path.join(prod, "mapa_portal.json"))))
    for vida, rotulo in (("adiado", "adiada"), ("abandonado", "abandonada"),
                         ("arquivado", "arquivada")):
        est = {"itens": {"pipeline/a00/a00-2": {"st": 0, "vida": vida,
                                                "motivo": "esperar o parecer"}}}
        cand, div, pul, smapa = D.avaliar(ENTRADA, est, arte, prod)
        ok(cand == [], "15. vida '%s' com o artefato la: NAO e candidata" % vida, cand)
        ok(any(c == "pipeline/a00/a00-2" and rotulo in m for c, m in pul),
           "    e e AVISADA como %s, para voce decidir no aplicativo" % rotulo, pul)
    est = {"itens": {"pipeline/a00/a00-2": {"st": 0, "vida": "inaplicavel"}}}
    cand, div, pul, smapa = D.avaliar(ENTRADA, est, arte, prod)
    ok(cand == [] and all(c != "pipeline/a00/a00-2" for c, _ in pul),
       "16. `inaplicavel` nem e avaliada: decisao assentada nao vira aviso diario")
    est = {"itens": {"pipeline/a00/a00-2": {"st": 0, "vida": "ativo", "del": True}}}
    cand, div, pul, smapa = D.avaliar(ENTRADA, est, arte, prod)
    ok(cand == [] and any("apagada" in m for _, m in pul),
       "17. linha apagada (lapide) tambem nao e marcada", pul)
    est = {"itens": {"pipeline/a00/a00-2": {"st": 0, "vida": "adiado"}}}
    os.remove(os.path.join(prod, "07_NORMAS/corpus_patriotismo-cristao-lutero.md"))
    cand, div, pul, smapa = D.avaliar(ENTRADA, est, arte, prod)
    ok(cand == [] and pul == [],
       "18. adiada SEM o artefato: nao ha o que avisar", pul)

print("\n=== 9. REGRA 7 — caminho sem [slug] nao marca todas as pecas de uma vez ===")
# O mapa real descreve os rascunhos como `drafts/draft_1.3apl.md`, sem [slug]:
# o mesmo arquivo para as treze pecas. Com ele presente, a versao anterior
# marcaria o aNN-4 de TODAS. O arquivo existe aqui de proposito.
with tempfile.TemporaryDirectory() as tmp:
    def com_rascunho(m):
        m["objetivos"]["esteira"]["subitens"].append(
            {"id": "aNN-4", "prova": "maquina", "artefato": "drafts/draft_1.3apl.md"})
    prod = montar_padrao(tmp, ["drafts/draft_1.3apl.md"], com_rascunho)
    entD = {"paineis": {"pipeline": [
        {"id": "a07", "t": "Peca sete", "slug": "lutero",
         "subs": [{"id": "a07-4", "t": "Draft", "prova": "maquina", "st": 0}]},
        {"id": "a08", "t": "Peca oito", "slug": "spinoza",
         "subs": [{"id": "a08-4", "t": "Draft", "prova": "maquina", "st": 0}]}]}}
    arte = D.mapa_dos_artefatos(json.load(open(os.path.join(prod, "mapa_portal.json"))))
    cand, div, pul, smapa = D.avaliar(entD, {"itens": {}}, arte, prod)
    ok(cand == [], "19. nenhuma das duas pecas vira candidata pelo mesmo arquivo", cand)
    ok(sorted(c for c, _ in pul) == ["pipeline/a07/a07-4", "pipeline/a08/a08-4"] and
       all("aNN-4" in m and "[slug]" in m for _, m in pul),
       "    as duas sao PULADAS, e o motivo diz qual padrao e por que", pul)
with tempfile.TemporaryDirectory() as tmp:
    # O MESMO CAMINHO SEM [slug], mas para um id CONCRETO: ai ele so pode ser
    # daquela peca, e vale.
    prod = os.path.join(tmp, "producao")
    os.makedirs(os.path.join(prod, "drafts"))
    open(os.path.join(prod, "drafts", "draft_unico.md"), "w").write("x")
    arte = {"a07-4": {"artefato": "drafts/draft_unico.md", "prova": "maquina",
                      "confirmar": False, "nota": ""}}
    entU = {"paineis": {"pipeline": [{"id": "a07", "t": "Peca sete", "slug": "lutero",
        "subs": [{"id": "a07-4", "t": "Draft", "prova": "maquina", "st": 0}]}]}}
    cand, div, pul, smapa = D.avaliar(entU, {"itens": {}}, arte, prod)
    ok([c["chave"] for c in cand] == ["pipeline/a07/a07-4"],
       "20. caminho sem [slug] para um id concreto continua valendo", cand)

print("\n=== 10. Sem o estado lido, nada vira 'a marcar' ===")
with tempfile.TemporaryDirectory() as tmp:
    prod = montar(tmp, ["07_NORMAS/corpus_patriotismo-cristao-lutero.md"])
    arte = D.mapa_dos_artefatos(json.load(open(os.path.join(prod, "mapa_portal.json"))))
    cand, div, pul, smapa = D.avaliar(ENTRADA, None, arte, prod)
    ok([c["chave"] for c in cand] == ["pipeline/a00/a00-2"] and cand[0]["de"] is None,
       "21. o artefato presente aparece, com o `de` DESCONHECIDO (None)", cand)
    ok(div == [], "    e nenhuma divergencia e afirmada: sem estado, nao ha o que comparar", div)

# ======================= CONTRA O BANCO (de mentira) =======================
from postgrest_de_mentira import Banco
import contextlib, io

ENTRADA_REAL_FORMA = {"_versao": 1, "_gerado_em": "2026-09-11T10:00:00Z",
                      "paineis": {"pipeline": [
    {"id": "a00", "t": "Ago · Confusao de reinos", "slug": "patriotismo-cristao-lutero",
     "subs": [{"id": "a00-1", "t": "Brainstorm", "prova": "estrela"},
              {"id": "a00-2", "t": "Janela 0 · planilha de corpus", "prova": "maquina"},
              {"id": "a00-5", "t": "Janela 2 · auditoria", "prova": "maquina"}]},
    {"id": "a01", "t": "Set · A consciencia", "slug": "consciencia-lutero-spinoza",
     "subs": [{"id": "a01-2", "t": "Janela 0 · planilha de corpus", "prova": "maquina"}]}]}}
MAPA_ESTEIRA = {"objetivos": {"esteira": {"painel": "pipeline", "subitens": [
    {"id": "aNN-1", "prova": "estrela", "artefato": "entrada_FILOSOFICO.md"},
    {"id": "aNN-2", "prova": "maquina", "artefato": "07_NORMAS_REFERENCIAS/corpus_[slug].md"},
    {"id": "aNN-5", "prova": "maquina", "artefato": "drafts/draft_3.4apl.md"}]}}}
VAZIO = {"motivo": "", "voltar_em": "", "vidaDesde": ""}


def producao_e_entrada(tmp):
    prod = os.path.join(tmp, "producao")
    os.makedirs(os.path.join(prod, "07_NORMAS_REFERENCIAS"))
    for slug in ("patriotismo-cristao-lutero", "consciencia-lutero-spinoza"):
        open(os.path.join(prod, "07_NORMAS_REFERENCIAS", "corpus_%s.md" % slug), "w").write("x")
    with open(os.path.join(prod, "mapa_portal.json"), "w", encoding="utf-8") as f:
        json.dump(MAPA_ESTEIRA, f)
    entrada = os.path.join(tmp, "entrada.json")
    with open(entrada, "w", encoding="utf-8") as f:
        json.dump(ENTRADA_REAL_FORMA, f, ensure_ascii=False)
    return prod, entrada


def rodar_main(prod, entrada, *args):
    argv, arq = sys.argv, D.ARQ_ENTRADA
    sys.argv = ["derivar_do_pipeline.py"] + list(args)
    D.ARQ_ENTRADA = entrada
    os.environ["PASTA_PRODUCAO"] = prod
    buf = io.StringIO()
    try:
        with contextlib.redirect_stdout(buf):
            codigo = D.main()
    finally:
        sys.argv, D.ARQ_ENTRADA = argv, arq
        os.environ.pop("PASTA_PRODUCAO", None)
    return codigo, buf.getvalue()


print("\n=== 11. O estado de agora vem do cron_estado ===")
with tempfile.TemporaryDirectory() as tmp:
    prod, entrada = producao_e_entrada(tmp)
    b = Banco().subir()
    os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"] = b.url, "chave-de-mentira"
    try:
        # O CASO REAL DE 10/09: no estado.json o a00-2 estava em andamento e o
        # a01-2 a fazer; no banco, os dois ja estavam fechados.
        b.semear("pipeline/a00/a00-2", dict(VAZIO, st=2, vida="ativo"), "2026-09-11T00:47:17.307Z")
        b.semear("pipeline/a01/a01-2", dict(VAZIO, st=2, vida="ativo"), "2026-09-11T18:15:10.923Z")
        cod, saida = rodar_main(prod, entrada)
        ok(cod == 0 and "A MARCAR" not in saida and "Nada a marcar" in saida,
           "22. o que o banco ja tem fechado NAO e remarcado", saida[-400:])
        # E o contrario: o banco diz a fazer, o artefato existe -> a marcar.
        b.semear("pipeline/a01/a01-2", dict(VAZIO, st=0, vida="ativo"), "2026-10-01T00:00:00.000Z")
        cod, saida = rodar_main(prod, entrada)
        ok("A MARCAR (1)" in saida and "pipeline/a01/a01-2  st 0 -> 2" in saida,
           "23. o que o banco tem aberto, com o artefato presente, vira candidato", saida[-400:])
        ok(any(c == ("GET", "cron_estado") for c in b.chamadas) and not b.escritas(),
           "    lido do cron_estado, e o modo seco nao escreve nada", b.chamadas)
        ok("PULADO (1)" in saida and "aNN-5" in saida,
           "    e o rascunho sem [slug] aparece como PULADO, com o padrao", saida)
    finally:
        b.parar()
        for v in ("SUPABASE_URL", "SUPABASE_SECRET_KEY"):
            os.environ.pop(v, None)

    cod, saida = rodar_main(prod, entrada, "--aplicar")
    ok(cod == 1 and "RECUSADO" in saida and "A MARCAR" not in saida,
       "24. --aplicar sem credenciais RECUSA antes de decidir qualquer coisa", saida[-300:])
    cod, saida = rodar_main(prod, entrada)
    ok(cod == 0 and "ESTADO ATUAL NAO LIDO" in saida and "ARTEFATO PRESENTE (2)" in saida
       and "A MARCAR" not in saida,
       "25. o modo seco sem credenciais confere o disco e diz que nao sabe o estado",
       saida[-500:])

print("\n=== 12. Ponta a ponta: --aplicar -> --registrar -> banco ===")
# Num repositorio TEMPORARIO, com os dois scripts de verdade: o --aplicar chama o
# --registrar como subprocesso, e ele grava o toque na pasta do repositorio em
# que roda. Rodar isto no repositorio real escreveria nele.
with tempfile.TemporaryDirectory() as tmp:
    prod, entrada = producao_e_entrada(tmp)
    repo = os.path.join(tmp, "repo")
    os.makedirs(os.path.join(repo, "scripts"))
    os.makedirs(os.path.join(repo, "Cronograma"))
    for nome in ("derivar_do_pipeline.py", "dobrar_toques.py"):
        shutil.copy(os.path.join(RAIZ, "scripts", nome), os.path.join(repo, "scripts", nome))
    shutil.copy(entrada, os.path.join(repo, "Cronograma", "entrada.json"))
    b = Banco().subir()
    try:
        b.semear("pipeline/a00/a00-2", dict(VAZIO, st=0, vida="ativo"), "2026-09-01T00:00:00.000Z")
        b.semear("pipeline/a01/a01-2", dict(VAZIO, st=1, vida="adiado", motivo="viagem",
                                            voltar_em="2026-11-01"), "2026-10-01T00:00:00.000Z")
        amb = dict(os.environ, PASTA_PRODUCAO=prod, SUPABASE_URL=b.url,
                   SUPABASE_SECRET_KEY="chave-de-mentira")
        r = subprocess.run([sys.executable, os.path.join(repo, "scripts", "derivar_do_pipeline.py"),
                            "--aplicar"], capture_output=True, text=True, env=amb)
        a00 = b.item("pipeline/a00/a00-2")
        a01 = b.item("pipeline/a01/a01-2")
        ok(r.returncode == 0 and a00["valor"]["st"] == 2 and a00["aparelho"] == "cowork",
           "26. a etapa ativa com artefato e marcada no banco, como `cowork`",
           (r.returncode, r.stdout[-600:]))
        ok(a01["valor"] == dict(VAZIO, st=1, vida="adiado", motivo="viagem",
                                voltar_em="2026-11-01"),
           "    a adiada fica exatamente como estava", a01)
        ok("adiada no aplicativo" in r.stdout, "    e e avisada no relatorio", r.stdout[-600:])
        toques = os.listdir(os.path.join(repo, "Cronograma", "toques")) \
            if os.path.isdir(os.path.join(repo, "Cronograma", "toques")) else []
        ok(os.path.exists(os.path.join(repo, "Cronograma", "estado.json")),
           "    e o toque e dobrado no estado.json do repositorio (trilha auditavel)", toques)
        r2 = subprocess.run([sys.executable, os.path.join(repo, "scripts", "derivar_do_pipeline.py"),
                             "--aplicar"], capture_output=True, text=True, env=amb)
        ok(r2.returncode == 0 and "Nada a marcar" in r2.stdout and
           len(b.registros) == 1,
           "27. rodar de novo nao remarca: o banco ja diz st=2", r2.stdout[-300:])
    finally:
        b.parar()

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
