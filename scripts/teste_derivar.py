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
    {"id": "a01", "t": "Set · Artigo da bancada", "slug": "artigo-da-bancada",
     "subs": [{"id": "a01-2", "t": "Janela 0 · planilha de corpus", "prova": "maquina"}]}]}}
MAPA_ESTEIRA = {"objetivos": {"esteira": {"painel": "pipeline", "subitens": [
    {"id": "aNN-1", "prova": "estrela", "artefato": "entrada_FILOSOFICO.md"},
    {"id": "aNN-2", "prova": "maquina", "artefato": "07_NORMAS_REFERENCIAS/corpus_[slug].md"},
    {"id": "aNN-5", "prova": "maquina", "artefato": "drafts/draft_3.4apl.md"}]}}}
VAZIO = {"motivo": "", "voltar_em": "", "vidaDesde": ""}


def producao_e_entrada(tmp, lugar_do_mapa=os.path.join("08_SISTEMA", "configuracao")):
    """A pasta de producao com a forma de hoje: o mapa em 08_SISTEMA/configuracao/
    desde a reorganizacao de 15/09."""
    prod = os.path.join(tmp, "producao")
    os.makedirs(os.path.join(prod, "07_NORMAS_REFERENCIAS"))
    for slug in ("patriotismo-cristao-lutero", "artigo-da-bancada"):
        open(os.path.join(prod, "07_NORMAS_REFERENCIAS", "corpus_%s.md" % slug), "w").write("x")
    if lugar_do_mapa is not None:
        os.makedirs(os.path.join(prod, lugar_do_mapa), exist_ok=True)
        with open(os.path.join(prod, lugar_do_mapa, "mapa_portal.json"), "w",
                  encoding="utf-8") as f:
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

print("\n=== 12. Ponta a ponta: --aplicar -> --registrar -> funcao do banco ===")
# Num repositorio TEMPORARIO, com os dois scripts de verdade: o --aplicar chama o
# --registrar como subprocesso, e ele pede a marcacao a cron_pipeline_marcar (aqui,
# o arremedo dela no PostgREST de mentira). Desde 2026-10-13 nada deve ir para o
# disco — e o temporario e o que deixa provar isso sem arriscar o repositorio real.
with tempfile.TemporaryDirectory() as tmp:
    prod, entrada = producao_e_entrada(tmp)
    repo = os.path.join(tmp, "repo")
    os.makedirs(os.path.join(repo, "scripts"))
    os.makedirs(os.path.join(repo, "Cronograma"))
    for nome in ("derivar_do_pipeline.py", "dobrar_toques.py"):
        shutil.copy(os.path.join(RAIZ, "scripts", nome), os.path.join(repo, "scripts", nome))
    shutil.copy(entrada, os.path.join(repo, "Cronograma", "entrada.json"))
    b = Banco().subir().publicar(ENTRADA_REAL_FORMA)
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
        escritas = [c for c in b.escritas()]
        ok(escritas == [("POST", "rpc/cron_pipeline_marcar")],
           "    a escrita e um pedido so, a funcao do banco", escritas)
        ok(len(b.registros) == 1, "    que grava o registro junto", b.registros)
        ok(sorted(os.listdir(os.path.join(repo, "Cronograma"))) == ["entrada.json"],
           "    e nada vai para o disco: nem toque, nem estado.json",
           os.listdir(os.path.join(repo, "Cronograma")))
        r2 = subprocess.run([sys.executable, os.path.join(repo, "scripts", "derivar_do_pipeline.py"),
                             "--aplicar"], capture_output=True, text=True, env=amb)
        ok(r2.returncode == 0 and "Nada a marcar" in r2.stdout and
           len(b.registros) == 1,
           "27. rodar de novo nao remarca: o banco ja diz st=2", r2.stdout[-300:])
    finally:
        b.parar()

print("\n=== 13. O mapa no lugar novo (08_SISTEMA/configuracao/) ===")
# Desde a reorganizacao de 15/09 o mapa nao mora mais na raiz, e o script dizia
# "nada a derivar" com codigo 0 todo dia. As tres situacoes, contra o main().
for v in ("SUPABASE_URL", "SUPABASE_SECRET_KEY"):
    os.environ.pop(v, None)
with tempfile.TemporaryDirectory() as tmp:
    prod, entrada = producao_e_entrada(tmp)
    cod, saida = rodar_main(prod, entrada)
    ok(cod == 0 and "Mapa: 08_SISTEMA/configuracao/mapa_portal.json" in saida
       and "ARTEFATO PRESENTE (2)" in saida,
       "28. o mapa e achado em 08_SISTEMA/configuracao/, e a conferencia acontece",
       saida[:400])
with tempfile.TemporaryDirectory() as tmp:
    prod, entrada = producao_e_entrada(tmp, lugar_do_mapa="")
    cod, saida = rodar_main(prod, entrada)
    ok(cod == 0 and "Mapa: mapa_portal.json" in saida,
       "29. uma pasta ainda nao reorganizada, com o mapa na raiz, continua valendo",
       saida[:300])
    os.makedirs(os.path.join(prod, "08_SISTEMA", "configuracao"))
    with open(os.path.join(prod, "08_SISTEMA", "configuracao", "mapa_portal.json"), "w") as f:
        json.dump({"objetivos": {}}, f)
    # O do lugar novo e VAZIO de proposito: se ele vencer, nao ha artefato.
    cod, saida = rodar_main(prod, entrada)
    ok("08_SISTEMA/configuracao/mapa_portal.json" in saida and "nao declarou" in saida,
       "    e com os dois presentes, vale o do lugar novo", saida[:300])
with tempfile.TemporaryDirectory() as tmp:
    prod, entrada = producao_e_entrada(tmp, lugar_do_mapa=None)
    cod, saida = rodar_main(prod, entrada)
    ok(cod == 1 and "Sem mapa_portal.json" in saida and "08_SISTEMA" in saida,
       "30. pasta presente e mapa ausente e ERRO, dizendo onde procurou", (cod, saida))

# =================== A LIGACAO PELO CONCLUIDO, E OS RASCUNHOS ===================
# Decidido pelo autor em 2026-10-12: a ligacao peca <-> artigo e lida das linhas
# "Slug:" e "Id no Cronograma:" de cada CONCLUIDO, e nao de um campo do
# entrada.json que nenhuma sessao do Cowork consegue publicar. E os rascunhos de
# uma peca moram na bancada (se o artigo estiver nela) ou na caixa dele.
MAPA_V2 = {"objetivos": {"esteira": {
    "painel": "pipeline",
    "ligacao": {"registros": [
        "00_CONCLUIDO/CONCLUIDO_FILOSOFICO.md",
        "00_CONCLUIDO/_pausado/FILOSOFICO_*/CONCLUIDO_FILOSOFICO.md",
        "00_CONCLUIDO/_arquivo/FILOSOFICO_*/CONCLUIDO_FILOSOFICO.md"]},
    "rascunhos": {
        "bancada": "02_PIPELINE/04_FILOSOFICO/drafts",
        "slug_da_bancada_em": ["01_ENTRADA/entrada_FILOSOFICO.md",
                               "00_CONCLUIDO/CONCLUIDO_FILOSOFICO.md"],
        "caixas": ["00_CONCLUIDO/_pausado/FILOSOFICO_[slug]/drafts",
                   "00_CONCLUIDO/_arquivo/FILOSOFICO_[slug]/drafts"]},
    "subitens": [
        {"id": "aNN-1", "prova": "estrela", "artefato": "entrada_FILOSOFICO.md"},
        {"id": "aNN-2", "prova": "maquina", "artefato": "07_NORMAS_REFERENCIAS/corpus_[slug].md"},
        {"id": "aNN-4", "prova": "maquina", "artefato": "[drafts]/draft_1.3apl.md"}]}}}
ENTRADA_V2 = {"paineis": {"pipeline": [
    {"id": pid, "t": "Peca " + pid,
     "subs": [{"id": pid + "-2", "t": "Corpus", "prova": "maquina"},
              {"id": pid + "-4", "t": "Draft 1.3-APL", "prova": "maquina"}]}
    for pid in ("a00", "a01", "a02")]}}
PATRIOTISMO = "patriotismo-cristao-lutero"
CONSCIENCIA = "artigo-da-bancada"
CAIXA_A00 = "00_CONCLUIDO/_pausado/FILOSOFICO_%s" % PATRIOTISMO


def escrever(prod, rel, texto="x"):
    alvo = os.path.join(prod, rel)
    os.makedirs(os.path.dirname(alvo), exist_ok=True)
    with open(alvo, "w", encoding="utf-8") as f:
        f.write(texto)


def producao_v2(tmp, id_da_bancada="a01", slug_da_entrada=CONSCIENCIA,
                rascunho_da_bancada="draft_1.3apl.md"):
    """A forma real: o patriotismo pausado na caixa (com o Id escrito como no
    CONCLUIDO de verdade, em negrito e com o titulo), o outro artigo na bancada."""
    prod = os.path.join(tmp, "producao")
    escrever(prod, "08_SISTEMA/configuracao/mapa_portal.json", json.dumps(MAPA_V2))
    escrever(prod, CAIXA_A00 + "/CONCLUIDO_FILOSOFICO.md",
             "## Artigo em producao\n- Slug: %s\n\n...\n- Id no Cronograma: **a00** — "
             "\"Ago · Confusao de reinos\"\n" % PATRIOTISMO)
    escrever(prod, CAIXA_A00 + "/drafts/draft_1.3apl.md")
    escrever(prod, "00_CONCLUIDO/CONCLUIDO_FILOSOFICO.md",
             "- Slug: %s\n- **Id no Cronograma:** %s\n" % (CONSCIENCIA, id_da_bancada))
    escrever(prod, "01_ENTRADA/entrada_FILOSOFICO.md",
             "## Secao 1\n- **Slug do artigo:** %s\n" % slug_da_entrada)
    if rascunho_da_bancada:
        escrever(prod, "02_PIPELINE/04_FILOSOFICO/drafts/" + rascunho_da_bancada)
    for slug in (PATRIOTISMO, CONSCIENCIA):
        escrever(prod, "07_NORMAS_REFERENCIAS/corpus_%s.md" % slug)
    return prod


def avaliar_v2(prod, entrada=None, estado=None):
    entrada = entrada or ENTRADA_V2
    contexto, avisos = D.preparar_ligacao(MAPA_V2, entrada, prod)
    cand, div, pul, smapa = D.avaliar(entrada, estado or {"itens": {}},
                                      D.mapa_dos_artefatos(MAPA_V2), prod, contexto)
    return contexto, avisos, [c["chave"] for c in cand], div, pul


print("\n=== 14. A ligacao peca <-> artigo vem do CONCLUIDO ===")
achar = lambda texto: [m.lower() for m in D.RE_ID_NO_CRONOGRAMA.findall(texto)]
ok(achar('- Id no Cronograma: **a00** — "Ago · Confusao de reinos"') == ["a00"] and
   achar("- **Id no Cronograma:** a01") == ["a01"],
   "31. o id e lido como o CONCLUIDO o escreve: em negrito, com titulo, ou rotulado")
ok(achar("- Id no Cronograma: [aNN]") == [] and
   achar("- Id no Cronograma: [registrar na Janela 0]") == [],
   "    e o marcador de lugar NAO vira id: artigo sem Janela 0 nao e peca nenhuma")
ok(D.slugs_do_texto("- Slug: %s" % CONSCIENCIA) == [CONSCIENCIA] and
   D.slugs_do_texto("- **Slug do artigo:** %s" % CONSCIENCIA) == [CONSCIENCIA] and
   D.slugs_do_texto("- Slug:\n- **Slug do artigo:** [slug]") == [],
   "32. o slug e lido do CONCLUIDO e da entrada, e o modelo vazio nao conta")
with tempfile.TemporaryDirectory() as tmp:
    prod = producao_v2(tmp)
    ctx, avisos, cand, div, pul = avaliar_v2(prod)
    ok(ctx["slugs"] == {("pipeline", "a00"): PATRIOTISMO, ("pipeline", "a01"): CONSCIENCIA},
       "33. a00 ligado pela caixa, a01 pela bancada — sem slug nenhum no entrada.json",
       ctx["slugs"])
    ok(sorted(cand) == ["pipeline/a00/a00-2", "pipeline/a00/a00-4",
                        "pipeline/a01/a01-2", "pipeline/a01/a01-4"],
       "34. corpus e rascunho de cada peca, cada um achado no lugar dela", cand)
    ok(any(c == "pipeline/a02/a02-2" and "sem ligacao" in m for c, m in pul),
       "    e a peca sem ligacao e PULADA, dizendo onde a ligacao devia estar", pul)
    ok(avisos == [], "    sem aviso nenhum quando tudo concorda", avisos)
    arq_entrada = os.path.join(tmp, "entrada_v2.json")
    with open(arq_entrada, "w", encoding="utf-8") as f:
        json.dump(ENTRADA_V2, f)
    cod, saida = rodar_main(prod, arq_entrada)
    ok("a00  " + PATRIOTISMO in saida and "Bancada de pipeline: %s, peca a01" % CONSCIENCIA in saida,
       "35. o relatorio diz cada ligacao, de onde veio, e de quem e a bancada", saida[:700])
    # O LOG DO ACTIONS E PUBLICO. A mesma rodada, com LOG_PUBLICO=1, nao pode
    # levar para la nenhum slug da pasta de producao, que e privada.
    os.environ["LOG_PUBLICO"] = "1"
    try:
        cod, publico = rodar_main(prod, arq_entrada)
    finally:
        os.environ.pop("LOG_PUBLICO", None)
    ok(PATRIOTISMO not in publico and CONSCIENCIA not in publico and "<slug>" in publico
       and "a00  <slug>" in publico and "pipeline/a01/a01-4" in publico,
       "    com LOG_PUBLICO=1, nenhum slug vai ao log; peca e etapa continuam", publico[:700])
    ok(sys.stdout is sys.__stdout__ or not isinstance(sys.stdout, D._Redigido),
       "    e o redator sai de cena quando o main termina")

with tempfile.TemporaryDirectory() as tmp:
    prod = producao_v2(tmp, id_da_bancada="[registrar na Janela 0]")
    ctx, avisos, cand, div, pul = avaliar_v2(prod)
    ok(("pipeline", "a01") not in ctx["slugs"] and
       not any(c.startswith("pipeline/a01/") for c in cand),
       "36. sem o Id no CONCLUIDO da bancada, a01 nao e ligado, e nada dele e marcado", cand)
    ok(ctx["rascunhos"]["pipeline"]["dono_da_bancada"] == CONSCIENCIA and
       "pipeline/a00/a00-4" in cand,
       "    e o rascunho da bancada nao vai parar em outra peca", cand)

print("\n=== 15. [drafts]: o rascunho de cada peca, e de ninguem mais ===")
with tempfile.TemporaryDirectory() as tmp:
    prod = producao_v2(tmp, slug_da_entrada="outro-artigo")
    ctx, avisos, cand, div, pul = avaliar_v2(prod)
    ok("pipeline/a01/a01-4" not in cand and "pipeline/a01/a01-2" in cand,
       "37. entrada e CONCLUIDO da bancada discordam: o rascunho dela nao conta,"
       " e o corpus (que nao depende dela) sim", cand)
    ok(any("bancada nao e de ninguem" in a for a in avisos),
       "    e a discordancia e AVISADA, com os dois slugs", avisos)
with tempfile.TemporaryDirectory() as tmp:
    prod = producao_v2(tmp, rascunho_da_bancada="draft_1.3apl_parcial.md")
    ctx, avisos, cand, div, pul = avaliar_v2(prod)
    ok("pipeline/a01/a01-4" not in cand,
       "38. o rascunho PARCIAL nao prova a etapa: so o nome final prova", cand)
with tempfile.TemporaryDirectory() as tmp:
    prod = producao_v2(tmp)
    os.remove(os.path.join(prod, CAIXA_A00, "drafts", "draft_1.3apl.md"))
    est = {"itens": {"pipeline/a00/a00-4": {"st": 2, "vida": "ativo"}}}
    ctx, avisos, cand, div, pul = avaliar_v2(prod, estado=est)
    ok([c for c, _ in div] == ["pipeline/a00/a00-4"] and CAIXA_A00 in div[0][1],
       "39. marcada e sem o rascunho em lugar nenhum: DIVERGE, dizendo onde procurou", div)

print("\n=== 16. Ligacao ambigua e PULADA, nunca escolhida ===")
with tempfile.TemporaryDirectory() as tmp:
    prod = producao_v2(tmp)
    escrever(prod, "00_CONCLUIDO/_pausado/FILOSOFICO_outro/CONCLUIDO_FILOSOFICO.md",
             "- Slug: outro\n- Id no Cronograma: a00\n")
    ctx, avisos, cand, div, pul = avaliar_v2(prod)
    ok(not any(c.startswith("pipeline/a00/") for c in cand) and
       any(c.startswith("pipeline/a00/") and "ambigua" in m for c, m in pul),
       "40. o mesmo id em dois artigos: a peca e PULADA, com os dois slugs", pul)
with tempfile.TemporaryDirectory() as tmp:
    prod = producao_v2(tmp)
    escrever(prod, "00_CONCLUIDO/_pausado/FILOSOFICO_%s/CONCLUIDO_FILOSOFICO.md" % CONSCIENCIA,
             "- Slug: %s\n- Id no Cronograma: a02\n" % CONSCIENCIA)
    ctx, avisos, cand, div, pul = avaliar_v2(prod)
    ok(not any(c.startswith(("pipeline/a01/", "pipeline/a02/")) for c in cand),
       "41. o mesmo artigo em duas pecas: as duas sao PULADAS", cand)
with tempfile.TemporaryDirectory() as tmp:
    prod = producao_v2(tmp)
    escrever(prod, "00_CONCLUIDO/_pausado/FILOSOFICO_caixa-x/CONCLUIDO_FILOSOFICO.md",
             "- Slug: outro-y\n- Id no Cronograma: a02\n")
    ctx, avisos, cand, div, pul = avaliar_v2(prod)
    ok(("pipeline", "a02") not in ctx["slugs"] and
       any("a caixa e de caixa-x" in a for a in avisos),
       "42. a caixa cujo slug nao e o do nome dela e IGNORADA, com aviso", avisos)
with tempfile.TemporaryDirectory() as tmp:
    prod = producao_v2(tmp)
    entC = json.loads(json.dumps(ENTRADA_V2))
    entC["paineis"]["pipeline"][0]["slug"] = "slug-antigo"
    ctx, avisos, cand, div, pul = avaliar_v2(prod, entrada=entC)
    ok(not any(c.startswith("pipeline/a00/") for c in cand) and
       any("conflito" in m and "slug-antigo" in m for _, m in pul),
       "43. CONCLUIDO e entrada.json discordam: PULADA, com os dois", pul)
    entC["paineis"]["pipeline"][0]["slug"] = PATRIOTISMO
    ctx, avisos, cand, div, pul = avaliar_v2(prod, entrada=entC)
    ok("pipeline/a00/a00-2" in cand, "    e concordando, vale", cand)

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
