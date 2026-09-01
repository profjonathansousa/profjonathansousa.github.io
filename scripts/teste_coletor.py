#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Testes do coletor v2. Nao toca a rede. Roda: python3 teste_coletor.py

Os casos vieram de anuncios REAIS do jobs.csv (105 linhas, 2026-02-25 a
2026-08-21) e das paginas verificadas em 2026-08-25.
"""
import json, os, re, sys, datetime
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import coletor as C

# Os criterios moram na RAIZ do repositorio; este teste mora em scripts/.
# Aceita os dois lugares para rodar tanto do repositorio quanto de uma pasta
# de rascunho onde tudo esta junto.
def _criterios(nome):
    for base in (os.path.dirname(AQUI), AQUI):
        caminho = os.path.join(base, nome)
        if os.path.exists(caminho):
            return json.load(open(caminho, encoding="utf-8"))
    raise SystemExit("nao achei %s nem em %s nem em %s" % (nome, os.path.dirname(AQUI), AQUI))

CRIT = _criterios("criterios_vagas.json")
falhas = []
def ok(cond, nome, detalhe=""):
    print(("  PASSA  " if cond else "  FALHA  ") + nome + (("  <- " + str(detalhe)) if not cond and detalhe else ""))
    if not cond: falhas.append(nome)

def dia(n):
    return (C.hoje() + datetime.timedelta(days=n)).isoformat()

print("\n=== 1. Fronteira de palavra (o defeito verificado em 2026-08-25) ===")
ok(C.casa(["logic"], "theological ethics") == [], "'logic' NAO casa 'theological ethics'")
ok(C.casa(["logic"], "formal logic") == ["logic"], "'logic' casa 'formal logic'")
ok(C.casa(["ethics"], "bioethics") == [], "'ethics' NAO casa 'bioethics'")
ok(C.casa(["doctoral"], "postdoctoral fellow") == [], "'doctoral' NAO casa 'postdoctoral'")
ok(C.casa(["tenure-track"], "tenure-track assistant prof") != [], "termo com hifen casa")
ok(C.casa(["philosophy of religion"], "aos: philosophy of religion") != [], "termo com espacos casa")

print("\n=== 2. Acentos ===")
ok(C.casa(["filosofia da religiao"], C.normalizar("Filosofia da Religião")) != [],
   "'religiao' casa 'Religião'")
ok(C.casa(["etica"], C.normalizar("ÉTICA TEOLÓGICA")) != [], "'etica' casa 'ÉTICA'")

print("\n=== 3. parse_data ===")
casos = [("2026-10-31", "2026-10-31", False), ("2026-10-01 (soft)", "2026-10-01", True),
         ("31/10/2026", "2026-10-31", False), ("03/04/2026", "2026-04-03", False),
         ("12 ago 2026", "2026-08-12", False), ("19 de agosto de 2026", "2026-08-19", False),
         ("October 31, 2026", "2026-10-31", False), ("", "", False), ("sob demanda", "", False)]
for entrada, esperado, brando_esp in casos:
    d, b = C.parse_data(entrada)
    ok(d == esperado and b == brando_esp, "parse_data(%r) -> %r" % (entrada, esperado), (d, b))

print("\n=== 4. Classificacao de anuncios REAIS do jobs.csv ===")
reais = [
  # (titulo, aos, job type, contract, local, esperado_relevancia, esperado_tipo, esperado_bloco)
  ("Early Modern, assistant professor (tenure-track)", "Early Modern Philosophy",
   "Junior faculty", "Tenure-track or similar", "Notre Dame, United States",
   "competencia", "tenure-track", "C"),
  ("Great Books (Associate/Full Professor)",
   "political thought, philosophy, literature, religious studies, and the liberal arts",
   "Senior faculty", "Tenured, continuing or permanent", "Austin, United States",
   "nicho", "senior", "C"),
  ("Ethics Postdoctoral Fellows", "Ethics", "Postdoc or similar", "Fixed term",
   "Notre Dame, United States", "competencia", "pos-doc", "C"),
  ("Research Fellow (Biomedical Ethics)", "Biomedical Ethics, Ethics, Normative Ethics",
   "Postdoc or similar", "Fixed term", "Singapore", None, None, None),   # vetado
  ("Assistant Professor", "Ancient Greek and Roman Philosophy", "Junior faculty",
   "Tenure-track or similar", "United States", None, None, None),        # vetado
  ("Fully funded PhD fellowship", "Social and Political Philosophy",
   "Graduate fellowship", "Fixed term", "Norway", None, None, None),     # discente
  ("Postdoctoral Teaching Fellow", "Open", "Postdoc or similar", "Fixed term",
   "Reno, United States", "aberto", "pos-doc", "C"),
  ("Visiting Assistant Professor of Ethics", "Ethics", "Visiting fellowship / Professorship",
   "Fixed term", "Westminster College, United States", "competencia", "visitante", "C"),
  ("Postdoctoral Fellow in AI Ethics", "AI Ethics", "Postdoc or similar", "Fixed term",
   "Cincinnati, United States", None, None, None),                       # vetado
]
for titulo, aos, jt, ct, local, rel_esp, tipo_esp, bloco_esp in reais:
    it = {"titulo": titulo, "aos": aos, "aoc": "", "categoria": jt, "contrato": ct,
          "local": local, "instituicao": local, "texto": "", "prazo": dia(60)}
    C.descarte_barato(it, CRIT); C.classificar(it, CRIT, "vaga")
    if rel_esp is None:
        ok(it.get("descartado"), "DESCARTA · %s" % titulo[:44], it.get("motivo_saida"))
    else:
        acertou = (not it.get("descartado") and it.get("relevancia") == rel_esp
                   and it.get("tipo") == tipo_esp and it.get("bloco") == bloco_esp)
        ok(acertou, "%-12s %-13s %s · %s" % (rel_esp, tipo_esp, bloco_esp, titulo[:36]),
           (it.get("descartado"), it.get("relevancia"), it.get("tipo"), it.get("bloco"),
            it.get("motivo_saida")))

print("\n=== 5. Blocos brasileiros (A e B) ===")
br = [("Concurso publico para professor efetivo de Filosofia - UFRJ", "efetivo", "A", "Alto"),
      ("Processo seletivo para professor substituto de Filosofia - UFU", "substituto", "B", "Baixo"),
      ("Edital de pos-doutorado PNPD em Filosofia - UERJ", "pos-doc", "A", "Medio"),
      ("Professor visitante - UFF", "visitante", "B", "Baixo")]
for titulo, tipo_esp, bloco_esp, esforco_esp in br:
    it = {"titulo": titulo, "aos": "Filosofia", "aoc": "", "categoria": "", "contrato": "",
          "local": "Rio de Janeiro, RJ", "instituicao": "Brasil", "pais": "Brasil",
          "texto": "filosofia", "prazo": dia(30), "relevancia": "nicho"}
    C.descarte_barato(it, CRIT); C.classificar(it, CRIT, "edital")
    ok(it.get("tipo") == tipo_esp and it.get("bloco") == bloco_esp
       and it.get("esforco") == esforco_esp and it.get("elegibilidade") == "Aberto"
       and it.get("uf") == "RJ",
       "%s/%s/%s · %s" % (bloco_esp, tipo_esp, esforco_esp, titulo[:40]),
       (it.get("tipo"), it.get("bloco"), it.get("esforco"), it.get("elegibilidade"), it.get("uf")))

print("\n=== 6. Elegibilidade e idioma ===")
it = {"titulo": "Assistant Professor of Philosophy", "aos": "Philosophy of Religion", "aoc": "",
      "categoria": "Junior faculty", "contrato": "Tenure-track or similar",
      "local": "United States", "instituicao": "X", "texto": "", "prazo": dia(60)}
C.descarte_barato(it, CRIT); C.classificar(it, CRIT, "vaga")
ok(it["elegibilidade"] == "Provavel c/ patrocinio", "TT nos EUA -> patrocinio", it["elegibilidade"])

it = {"titulo": "Postdoc in Philosophy of Religion", "aos": "Philosophy of Religion", "aoc": "",
      "categoria": "Postdoc or similar", "contrato": "Fixed term", "local": "United States",
      "instituicao": "X", "texto": "", "prazo": dia(60)}
C.descarte_barato(it, CRIT); C.classificar(it, CRIT, "vaga")
ok(it["elegibilidade"] == "Aberto", "pos-doc nos EUA -> Aberto", it["elegibilidade"])

it = {"titulo": "Lecturer in Theology", "aos": "Theology", "aoc": "", "categoria": "Junior faculty",
      "contrato": "Fixed term", "local": "United Kingdom", "instituicao": "X",
      "texto": "Applicants must already have the right to work in the UK.", "prazo": dia(60)}
C.descarte_barato(it, CRIT); C.classificar(it, CRIT, "vaga")
ok(it["elegibilidade"] == "Restrito", "'must already have the right to work' -> Restrito",
   it["elegibilidade"])

it = {"titulo": "Professur fur Religionsphilosophie", "aos": "Philosophy of Religion", "aoc": "",
      "categoria": "Junior faculty", "contrato": "Fixed term", "local": "Germany",
      "instituicao": "X", "texto": "Erwartet werden verhandlungssicher Deutschkenntnisse.",
      "prazo": dia(60)}
C.descarte_barato(it, CRIT); C.classificar(it, CRIT, "vaga")
ok(it["idioma"] == "DE" and "exige alemao fluente" in it.get("marcas", []),
   "Alemanha -> DE + alerta de fluencia", (it["idioma"], it.get("marcas")))

print("\n=== 7. Prazo: urgencia, brando, sem prazo, vencido ===")
def mk(prazo, brando=False):
    it = {"titulo": "Postdoc in Philosophy of Religion", "aos": "Philosophy of Religion",
          "aoc": "", "categoria": "Postdoc or similar", "contrato": "Fixed term",
          "local": "Germany", "instituicao": "X", "texto": "", "prazo": prazo,
          "prazo_brando": brando}
    C.descarte_barato(it, CRIT); C.classificar(it, CRIT, "vaga"); return it

u = mk(dia(7));   ok(u["urgente"] and not u.get("descartado"),
                     "prazo em 7 dias -> urgente, e NAO descontado", u.get("marcas"))
n = mk(dia(60));  ok(not n["urgente"], "prazo em 60 dias -> nao urgente")
b = mk(dia(60), True); ok("prazo brando" in b["marcas"], "prazo (soft) -> marca 'prazo brando'")
s = mk("");       ok(not s["urgente"] and not C.vencido(s) and "sem prazo" in s["marcas"],
                     "sem prazo -> marcado, nunca urgente NEM vencido", s.get("marcas"))
v = mk(dia(-3));  ok(C.vencido(v) and not v.get("descartado"),
                     "vencido -> roteado (nao descartado)", v.get("descartado"))

print("\n=== 8. Ordem (secao 6 do agente) ===")
itens = [
  {"urgente": False, "bloco": "C", "relevancia": "aberto",      "prazo": dia(90), "titulo": "c-aberto"},
  {"urgente": True,  "bloco": "C", "relevancia": "competencia", "prazo": dia(5),  "titulo": "URGENTE"},
  {"urgente": False, "bloco": "A", "relevancia": "nicho",       "prazo": dia(40), "titulo": "a-nicho"},
  {"urgente": False, "bloco": "C", "relevancia": "nicho",       "prazo": dia(10), "titulo": "c-nicho"},
  {"urgente": False, "bloco": "A", "relevancia": "nicho",       "prazo": "",      "titulo": "a-sem-prazo"},
  {"urgente": True,  "bloco": "A", "relevancia": "nicho", "vencida": True,
   "prazo": dia(-2), "titulo": "VENCIDA"},
]
ordem = [i["titulo"] for i in C.ordenar(itens)]
ok(ordem == ["URGENTE", "a-nicho", "a-sem-prazo", "c-nicho", "c-aberto", "VENCIDA"],
   "urgente > bloco > relevancia > prazo; vencida SEMPRE no fim", ordem)

print("\n=== 8b. Carencia da vencida (Passo 4) ===")
carencia = CRIT["prazo"]["dias_de_carencia_vencida"]
def simula_carencia(dias_atras):
    """Reproduz o roteamento de executar(): historico sempre, lista viva so
    dentro da carencia."""
    it = {"id": "x", "prazo": dia(-dias_atras), "dias_ate_prazo": -dias_atras}
    vivos, expirados = [], []
    if C.vencido(it):
        expirados.append(it)
        if abs(it["dias_ate_prazo"]) <= carencia:
            it["vencida"] = True
            vivos.append(it)
    else:
        vivos.append(it)
    return len(vivos), len(expirados), it.get("vencida")

v, e, marca = simula_carencia(3)
ok(v == 1 and e == 1 and marca, "vencida ha 3 dias: fica visivel MARCADA e vai ao historico", (v, e, marca))
v, e, marca = simula_carencia(carencia + 5)
ok(v == 0 and e == 1, "vencida ha %d dias: so historico, some da lista" % (carencia + 5), (v, e))
ok(CRIT["prazo"]["dias_de_carencia_vencida"] == 21, "carencia de vagas = 21 dias")

print("\n=== 8c. CHAMADAS: forma em vez de bloco ===")
CH = _criterios("criterios_chamadas.json")
chamadas = [
  ("Dossie: Lutero e a teologia politica — Revista Numen", "dossie", "publicacao"),
  ("Call for papers: Spinoza e a liberdade religiosa", "periodico", "publicacao"),
  ("Edited volume: Reformation and Modernity", "volume", "publicacao"),
  ("Congresso Internacional de Filosofia da Religiao", "congresso", "evento"),
  ("Summer school on early modern philosophy of religion", "escola", "evento"),
]
for titulo, tipo_esp, forma_esp in chamadas:
    it = {"titulo": titulo, "aos": titulo, "aoc": "", "categoria": "", "contrato": "",
          "local": "", "instituicao": "", "texto": "", "prazo": dia(45)}
    C.descarte_barato(it, CH); C.classificar(it, CH, "vaga")
    ok(it.get("tipo") == tipo_esp and it.get("forma") == forma_esp
       and it.get("bloco") is None and it.get("esforco") == "",
       "%-11s %-11s %s" % (tipo_esp, forma_esp, titulo[:34]),
       (it.get("tipo"), it.get("forma"), it.get("bloco"), it.get("esforco")))

it = {"titulo": "Dossie sobre Lutero", "aos": "Lutero", "aoc": "", "categoria": "",
      "contrato": "", "local": "", "instituicao": "", "texto": "", "prazo": dia(15)}
C.descarte_barato(it, CH); C.classificar(it, CH, "vaga")
ok(it["urgente"], "chamada em 15 dias -> urgente (corte de 21, nao 14)", it.get("marcas"))
ok("so com texto pronto" not in it.get("marcas", []),
   "15 dias ainda nao e 'so com texto pronto' (corte de 10)", it.get("marcas"))

it = {"titulo": "Dossie sobre Spinoza", "aos": "Spinoza", "aoc": "", "categoria": "",
      "contrato": "", "local": "", "instituicao": "", "texto": "", "prazo": dia(6)}
C.descarte_barato(it, CH); C.classificar(it, CH, "vaga")
ok("so com texto pronto" in it.get("marcas", []),
   "chamada em 6 dias -> 'so com texto pronto'", it.get("marcas"))

ordem = [i["titulo"] for i in C.ordenar([
  {"urgente": False, "forma": "evento",     "relevancia": "nicho", "prazo": dia(30), "titulo": "evento"},
  {"urgente": False, "forma": "publicacao", "relevancia": "nicho", "prazo": dia(50), "titulo": "publicacao"},
  {"urgente": True,  "forma": "evento",     "relevancia": "nicho", "prazo": dia(9),  "titulo": "URGENTE"},
])]
ok(ordem == ["URGENTE", "publicacao", "evento"], "ordem das chamadas: urgente > publicacao > evento", ordem)

print("\n=== 8d. Reparticao do <title> do PhilJobs ===")
# Casos REAIS, tirados do dados/vagas.json que o run v1 publicou em 2026-08-24.
titulos = [
  ("Postdoctoral Teaching Fellow, University of Nevada, Reno",
   "Postdoctoral Teaching Fellow", "University of Nevada", "Reno"),
  ("Assistant Professor of Philosophy, University of Wisconsin, Madison",
   "Assistant Professor of Philosophy", "University of Wisconsin", "Madison"),
  ("Director, Uehiro Oxford Institute, University of Oxford",
   "Director, Uehiro Oxford Institute", "University of Oxford", ""),
  ("Assistant Teaching Professor of Philosophy, Colorado State University",
   "Assistant Teaching Professor of Philosophy", "Colorado State University", ""),
  ("Visiting Assistant Professor of Ethics, Westminster College, Pennsylvania",
   "Visiting Assistant Professor of Ethics", "Westminster College", "Pennsylvania"),
  ("Ethics Postdoctoral Fellows, University of Notre Dame",
   "Ethics Postdoctoral Fellows", "University of Notre Dame", ""),
  ("Professur fur Religionsphilosophie", "Professur fur Religionsphilosophie", "", ""),
]
for bruto, cargo_esp, inst_esp, cidade_esp in titulos:
    c, i_, cid = C._partir_titulo(bruto)
    ok(c == cargo_esp and i_ == inst_esp and cid == cidade_esp,
       "%-44s -> %s | %s" % (bruto[:44], cargo_esp[:30], inst_esp[:24]), (c, i_, cid))

def edital(titulo, texto, **extra):
    base = {"titulo": titulo, "aos": "", "aoc": "", "categoria": "", "contrato": "",
            "local": "", "instituicao": "", "prazo": "", "texto": texto}
    base.update(extra)
    return base

print("\n=== 9. A PORTA 'filosofia' — abre ou fecha, nunca elege ===")
orc = {"restante": 0}   # sem orcamento: nao busca a pagina do edital
longo = "areas: " + ("medicina enfermagem odontologia fisioterapia nutricao " * 12)
it = edital("UFTM abre 4 vagas", longo)
C.resolver_area(None, it, CRIT, {"avisos": []}, orc)
ok(it["porta_passou"] is False and "relevancia" not in it,
   "texto longo sem filosofia -> porta FECHADA, sem tocar em relevancia",
   (it.get("porta_passou"), it.get("relevancia")))

it = edital("UFU abre 5 vagas", "Engenharia Fisica, Filosofia, Fisica, Quimica")
C.resolver_area(None, it, CRIT, {"avisos": []}, orc)
ok(it["porta_passou"] is True and it["area_confirmada"] and "relevancia" not in it,
   "'Filosofia' na listagem -> porta ABERTA, relevancia intocada", it.get("relevancia"))

it = edital("UFRGS abre 20 vagas de Magisterio Superior", "edital 09/2026")
C.resolver_area(None, it, CRIT, {"avisos": []}, orc)
ok(it["porta_passou"] is None and not it["area_confirmada"],
   "texto curto, so PDF -> ignorancia (ENTRA marcado)", it.get("porta_passou"))

it = edital("Chamada", "vagas para Filosofica e areas afins")
C.resolver_area(None, it, CRIT, {"avisos": []}, orc)
ok(it["porta_passou"] is True, "prefixo 'filosof' pega 'Filosofica'", it.get("porta_passou"))

print("\n=== 9b. O DEFEITO DE 2026-08-25: o corpo elegia ===")
# Pagina de navegacao da ANPOF: o corpo diz 'Filosofia' (esta no nome da
# associacao), o cabeca nao diz nada. Saiam 33 destas no topo da lista, nicho.
it = edital("Historico da ANPOF",
            "ANPOF - Associacao Nacional de Pos-Graduacao em Filosofia. " * 12)
C.resolver_area(None, it, CRIT, {"avisos": []}, {"restante": 0})
C.classificar(it, CRIT, "edital")
ok(it.get("relevancia") != "nicho",
   "corpo cheio de 'Filosofia' + cabeca mudo -> NAO e nicho", it.get("relevancia"))
ok(it.get("relevancia") == "aberto",
   "...e sim 'aberto': passou pela porta, o cabeca nao declara area", it.get("relevancia"))

it = edital("Professor Substituto - Instituto de Filosofia da Religiao", "filosofia")
C.resolver_area(None, it, CRIT, {"avisos": []}, {"restante": 0})
C.classificar(it, CRIT, "edital")
ok(it.get("relevancia") == "nicho",
   "nicho NO CABECA continua elegendo no edital", it.get("relevancia"))

it = edital("Concurso para Professor de Filosofia Politica - UFF", "filosofia")
C.resolver_area(None, it, CRIT, {"avisos": []}, {"restante": 0})
C.classificar(it, CRIT, "edital")
ok(it.get("relevancia") == "competencia",
   "competencia no cabeca tambem elege", it.get("relevancia"))

it = edital("UFTM abre 4 vagas", longo)
C.resolver_area(None, it, CRIT, {"avisos": []}, {"restante": 0})
C.classificar(it, CRIT, "edital")
ok(it.get("descartado") and "sem filosofia" in (it.get("motivo_saida") or ""),
   "porta fechada -> descartado, com a razao registrada", it.get("motivo_saida"))

it = edital("UFRGS abre 20 vagas", "edital 09/2026")
C.resolver_area(None, it, CRIT, {"avisos": []}, {"restante": 0})
C.classificar(it, CRIT, "edital")
ok("area nao confirmada" in (it.get("marcas") or []),
   "ignorancia sai MARCADA — a marca que o arquivo declarava e ninguem escrevia",
   it.get("marcas"))

print("\n=== 9c. A PORTA 'posdoc' — fomento nao se mede por area ===")
it = edital("Edital 12/2026 - Apoio a Infraestrutura Hospitalar",
            "apoio a infraestrutura de hospitais universitarios " * 12)
C.resolver_area(None, it, CRIT, {"avisos": []}, {"restante": 0}, "posdoc")
ok(it["porta_passou"] is False,
   "edital de infraestrutura -> porta posdoc FECHADA", it.get("motivo_porta"))

for trecho in ("Bolsa de Pos-Doutorado Nota 10",
               "Programa de pos-doc para jovens pesquisadores",
               "Chamada para Bolsas de Pos-Doutoral no Estado",
               "Postdoctoral fellowships in any area",
               "Bolsa para recem-doutor"):
    it = edital("Edital FAPERJ", trecho + " " + ("texto do edital " * 30))
    C.resolver_area(None, it, CRIT, {"avisos": []}, {"restante": 0}, "posdoc")
    ok(it["porta_passou"] is True, "porta posdoc abre em %-46r" % trecho[:44],
       it.get("porta_passou"))

it = edital("Edital 39/2025 - Pos-Doutorado Nota 10",
            "bolsa de pos-doutorado para todas as areas " * 12)
C.resolver_area(None, it, CRIT, {"avisos": []}, {"restante": 0}, "posdoc")
C.classificar(it, CRIT, "edital")
ok(not it.get("descartado") and it.get("relevancia") == "aberto",
   "pos-doc de fomento ENTRA sem 'filosofia' em lugar nenhum",
   (it.get("descartado"), it.get("relevancia")))

it = edital("Selecao de Doutorado em Filosofia", "selecao de doutorado " * 25)
C.resolver_area(None, it, CRIT, {"avisos": []}, {"restante": 0}, "posdoc")
ok(it["porta_passou"] is False,
   "'doutorado' sozinho NAO abre a porta posdoc", it.get("porta_passou"))

print("\n=== 10. 'Discente' nao gasta requisicao (descarte barato) ===")
it = {"titulo": "Selecao Mestrado PPGF-UFAM 2027", "aos": "Filosofia", "aoc": "",
      "categoria": "", "contrato": "", "texto": "filosofia"}
morreu = C.descarte_barato(it, CRIT)
ok(morreu and it["tipo"] == "discente", "selecao de mestrado morre ANTES da busca do edital",
   (morreu, it.get("tipo")))
it2 = {"titulo": "Doutorado em Filosofia UFES - Turma 2027", "aos": "Filosofia", "aoc": "",
       "categoria": "", "contrato": "", "texto": ""}
ok(C.descarte_barato(it2, CRIT), "'Turma 2027' tambem morre cedo", it2.get("motivo_saida"))

# Os tres que PASSARAM na coleta de 2026-08-25 11h38. A lista dizia
# "selecao de mestrado"; a ANPOF escreve "do", e as vezes preposicao nenhuma.
for titulo in ("Selecao do Mestrado em Filosofia do PPGF-UFAM 2027",
               "Selecao do Mestrado em Filosofia do PPGF-UFAM - Edital exclusivo para pessoas indigenas",
               "Selecao Doutorado em Filosofia UFG"):
    it = {"titulo": titulo, "aos": "Filosofia", "aoc": "", "categoria": "",
          "contrato": "", "texto": "filosofia"}
    ok(C.descarte_barato(it, CRIT) and it.get("tipo") == "discente",
       "passou em 25/08, agora morre: %-44s" % titulo[:44], it.get("motivo_saida"))

# A guarda da secao 5.2, do outro lado: nenhum termo novo pode comer pos-doc.
for titulo in ("Post-doctoral fellowship in philosophy of religion",
               "Pos-doutorado em Filosofia - Edital 39/2025",
               "Chamada de pos-doutorado em teologia"):
    it = {"titulo": titulo, "aos": "", "aoc": "", "categoria": "", "contrato": "", "texto": ""}
    ok(not C.descarte_barato(it, CRIT),
       "pos-doc NAO cai como discente: %-44s" % titulo[:44], it.get("motivo_saida"))

print("\n=== 11. Peneira pelo texto da ancora (texto_padrao) ===")
# Por que existe: padrao de URL largo + teto de itens = os itens reais nunca
# sao avaliados. FAPERJ, 25/08: 215 links, teto de 40, zero edital de verdade.
html_faperj = ("<a href='https://www.faperj.br/?id=1.2.3'>Quem somos na FAPERJ</a>"
               "<a href='https://www.faperj.br/?id=4.5.6'>Fale conosco da FAPERJ</a>"
               "<a href='https://www.faperj.br/?id=7.8.9'>Edital 12/2026 - Pos-Doutorado Nota 10</a>")
todos = C._links_da_pagina(html_faperj, "https://www.faperj.br/",
                           "faperj\\.br/(rp/downloads/|\\?id=)")
ok(len(todos) == 3, "sem peneira, o padrao de URL leva a navegacao junto", len(todos))
padrao = [f for f in CRIT["fontes"] if f["nome"] == "faperj"][0]["texto_padrao"]
sobram = [(u, t) for u, t in todos if re.search(padrao, t, re.IGNORECASE)]
ok(len(sobram) == 1 and "Edital" in sobram[0][1],
   "com a peneira de ancora, sobra o edital de verdade", [t for _, t in sobram])

print("\n=== 12. As portas estao declaradas onde devem ===")
portas = {f["nome"]: f.get("porta") for f in CRIT["fontes"] if f.get("ligada")}
ok(portas.get("anpof") == "filosofia" and portas.get("docentefederal") == "filosofia",
   "agregadores (IFES, Pedro II, CAps) pedem filosofia", portas)
ok(portas.get("faperj") == "posdoc",
   "fomento (FAPERJ) pede pos-doc, nao area", portas)
fapesp = [f for f in CRIT["fontes"] if f["nome"] == "fapesp"][0]
ok(not fapesp.get("ligada") and "_DESLIGADA_DE_NOVO_2026-08-25" in fapesp,
   "a VITRINE da FAPESP esta desligada, e a razao esta no arquivo", fapesp.get("ligada"))
curadas_v = [f for f in CRIT["fontes"] if f["nome"] == "curadas"][0]
ok(curadas_v.get("ligada") and curadas_v.get("porta") == "posdoc",
   "...e o PROGRAMA da FAPESP continua vivo, pela fonte curada", curadas_v.get("arquivo"))
ok(portas.get("philjobs") is None,
   "philjobs nao tem porta: unidade 'vaga', o cabeca ja carrega o AOS", portas)
ok(not [f for f in CRIT["fontes"] if f["nome"] == "dou"][0]["ligada"],
   "DOU descartado por decisao, e continua desligado", "ok")

print("\n=== 13. Fonte curada a mao (metodo 'manual') ===")
# De ponta a ponta e sem rede: le o arquivo, passa pelo descarte, pela porta e
# pelo classificar. E o unico teste daqui que toca dado de producao.
for modo, minimo in (("vagas", 1), ("chamadas", 5)):
    crit = C.ler_json(os.path.join(C.RAIZ, "criterios_%s.json" % modo), {})
    fonte = [f for f in crit["fontes"] if f["nome"] == "curadas"]
    ok(len(fonte) == 1 and fonte[0].get("metodo") == "manual",
       "%s: a fonte 'curadas' esta declarada" % modo, fonte)
    cfg = fonte[0]
    bat = {"fontes": {}, "avisos": []}
    itens = C.fonte_manual(cfg, bat)
    ok(len(itens) >= minimo, "%s: o arquivo curado carrega (%d itens)" % (modo, len(itens)),
       bat["fontes"].get("curadas"))
    for it in itens:
        if not C.descarte_barato(it, crit) and cfg.get("unidade") == "edital":
            C.resolver_area(None, it, crit, bat, {"restante": 0}, cfg.get("porta", "filosofia"))
        C.classificar(it, crit, cfg.get("unidade", "vaga"))
    mortos = [i["titulo"][:40] for i in itens if i.get("descartado")]
    ok(not mortos, "%s: nenhum item curado morre no pipeline" % modo, mortos)

crit_v = C.ler_json(os.path.join(C.RAIZ, "criterios_vagas.json"), {})
cfg_v = [f for f in crit_v["fontes"] if f["nome"] == "curadas"][0]
fapesp = C.fonte_manual(cfg_v, {"fontes": {}, "avisos": []})[0]
C.descarte_barato(fapesp, crit_v)
C.resolver_area(None, fapesp, crit_v, {"avisos": []}, {"restante": 0}, "posdoc")
ok(fapesp["porta_passou"] is True,
   "FAPESP: a porta posdoc abre no proprio texto curado, sem gastar requisicao",
   fapesp.get("porta_passou"))
C.classificar(fapesp, crit_v, "edital")
ok(fapesp.get("tipo") == "pos-doc" and fapesp.get("relevancia") == "aberto",
   "FAPESP: pos-doc de fluxo continuo entra como 'aberto'",
   (fapesp.get("tipo"), fapesp.get("relevancia")))
ok("sem prazo" in (fapesp.get("marcas") or []),
   "FAPESP: fluxo continuo sai marcado 'sem prazo'", fapesp.get("marcas"))

crit_c = C.ler_json(os.path.join(C.RAIZ, "criterios_chamadas.json"), {})
cfg_c = [f for f in crit_c["fontes"] if f["nome"] == "curadas"][0]
lsn = C.fonte_manual(cfg_c, {"fontes": {}, "avisos": []})
for it in lsn:
    C.descarte_barato(it, crit_c)
    C.classificar(it, crit_c, "vaga")
ok(all(i.get("forma") == "publicacao" for i in lsn),
   "LSN: toda chamada de periodico sai como PUBLICACAO, nenhuma como evento",
   {i["titulo"][:28]: i.get("forma") for i in lsn})
ok(all(i.get("relevancia") == "nicho" for i in lsn),
   "LSN: o cabeca ('theology', 'lutheran') elege nicho, sem ajuda do corpo",
   {i["titulo"][:24]: i.get("relevancia") for i in lsn})
com_prazo = [i for i in lsn if i.get("prazo")]
ok(len(com_prazo) == 1 and com_prazo[0]["prazo"] == "2026-10-01",
   "LSN: o unico prazo duro do boletim e o do JLE, 01/10/2026",
   [(i["titulo"][:28], i.get("prazo")) for i in lsn])

print("\n=== 13. O link do item da ANPOF (o 404 medido em 2026-08-26) ===")
# A listagem mora em /agenda/concursos-e-selecoes, SEM barra final. O urljoin
# descarta o ultimo segmento e monta /agenda/agenda/..., que da 404 - e foi por
# isso que os 28 itens da ANPOF sairam com o corpo vazio, sem prazo nenhum.
LISTA_ANPOF = "https://anpof.org.br/agenda/concursos-e-selecoes"
html_anpof = ("<a href='agenda/concursos-e-selecoes/edital-ufpi-filosofia-medieval'>"
              "Concurso Publico para o Magisterio Superior na UFPI - Filosofia Medieval</a>"
              "<a href='agenda/agenda'>Agenda da ANPOF</a>")
cru = C._links_da_pagina(html_anpof, LISTA_ANPOF, "/concursos-e-selecoes/")
ok(len(cru) == 1 and cru[0][0].count("/agenda/agenda/") == 1,
   "sem base_item o urljoin dobra o 'agenda' (o defeito, preservado)", cru)
cfg_anpof = [f for f in CRIT["fontes"] if f["nome"] == "anpof"][0]
ok(cfg_anpof.get("base_item") == "https://anpof.org.br/agenda/concursos-e-selecoes/",
   "a fonte anpof declara base_item", cfg_anpof.get("base_item"))
com = C._links_da_pagina(html_anpof, LISTA_ANPOF, "/concursos-e-selecoes/",
                         cfg_anpof["base_item"])
ok(len(com) == 1 and com[0][0] == ("https://anpof.org.br/agenda/concursos-e-selecoes/"
                                   "edital-ufpi-filosofia-medieval"),
   "com base_item sai o endereco vivo, com um 'agenda' so", com)
ok(all("/agenda/agenda/" not in u for u, _ in com),
   "nenhum link remontado conserva o 'agenda' dobrado", com)
# A peneira tem que rodar ANTES da remontagem. Se rodasse depois, todo link do
# site viraria base_item + ultimo segmento e passaria pelo padrao.
html_menu = "<a href='agenda/podcast-anpof'>Podcast Anpof da ANPOF</a>"
ok(C._links_da_pagina(html_menu, LISTA_ANPOF, "/concursos-e-selecoes/",
                      cfg_anpof["base_item"]) == [],
   "a remontagem nao deixa o menu do site entrar pela porta dos fundos")
cfg_ch_anpof = [f for f in crit_c["fontes"] if f["nome"] == "anpof-chamadas"][0]
ok(cfg_ch_anpof.get("base_item")
   == "https://anpof.org.br/agenda/lancamentos-e-chamadas-de-revistas/",
   "anpof-chamadas declara base_item (mesmo defeito, mesma casa)",
   cfg_ch_anpof.get("base_item"))

print("\n=== 14. Fronteira DIREITA: flexao casa, colisao nao (2026-08-26) ===")
ok(C.casa(["espinosa"], C.normalizar("Cadernos Espinosanos")) != [],
   "'espinosa' casa 'Espinosanos' (ia para os rejeitados)")
ok(C.casa(["epistemologia"], C.normalizar("epistemologias do sul-global")) != [],
   "'epistemologia' casa o plural 'epistemologias'")
ok(C.casa(["barth"], C.normalizar("Roland Barthes e o texto")) == [],
   "'barth' NAO casa 'Barthes' - a lista de COLISOES segura")
ok(C.casa(["barth"], C.normalizar("Karl Barth e a dogmatica")) != [],
   "'barth' continua casando 'Barth'")
# A esquerda e que carrega as protecoes de 2026-08-25. Nada la mudou.
ok(C.casa(["ethics"], "bioethics") == [], "'ethics' segue NAO casando 'bioethics'")
ok(C.casa(["logic"], "theological ethics") == [], "'logic' segue NAO casando 'theological'")
ok(C.casa(["doctoral"], "postdoctoral fellow") == [], "'doctoral' segue NAO casando 'postdoctoral'")

print("\n=== 15. salvo_se: lancamento nao mata chamada de verdade ===")
regras = [{"rotulo": "anuncio", "descarta": True,
           "quando": ["lancamento", "novo numero"],
           "salvo_se": ["chamada", "call for"]}]
ok(C._primeira_regra(regras, C.normalizar("Lancamento da Revista Ideacao 53")).get("descarta"),
   "anuncio de numero e descartado")
ok(not C._primeira_regra(regras, C.normalizar(
       "Griot - Revista de Filosofia: Novo Numero e Chamada de Artigos")).get("descarta"),
   "'Novo Numero E CHAMADA de Artigos' NAO e descartado")
ok(not C._primeira_regra(regras, C.normalizar(
       "Chamada de trabalho - Alter (PUC-Rio), v. 20")).get("descarta"),
   "chamada sem palavra de lancamento passa intacta")

print("\n=== 16. Chamada brasileira sem area no cabeca entra como 'aberto' ===")
alvo = (crit_c.get("relevancia") or {}).get("aberto") or {}
ok(alvo.get("fontes_sem_area_no_cabeca") == ["anpof-chamadas"],
   "criterios_chamadas declara a fonte sem area no cabeca",
   alvo.get("fontes_sem_area_no_cabeca"))
for titulo in ("Politica, Comunidade e Emancipacao: Leituras Filosoficas",
               "Philosophy of Brazilian Religions",
               "Dossie Ensino de Filosofia: dialogos desde a America do Sul"):
    it = {"id": "anpof-chamadas-x", "fonte": "anpof-chamadas", "titulo": titulo,
          "aos": "", "aoc": "", "texto": "", "prazo": "", "url": ""}
    C.descarte_barato(it, crit_c)
    C.classificar(it, crit_c, "vaga")
    ok(not it.get("descartado") and it.get("relevancia") == "aberto",
       "entra como aberto: %-52s" % titulo[:52],
       it.get("motivo_saida") or it.get("relevancia"))
it = {"id": "philevents-x", "fonte": "philevents", "titulo": "Workshop on Category Theory",
      "aos": "", "aoc": "", "texto": "", "prazo": "", "url": ""}
C.descarte_barato(it, crit_c); C.classificar(it, crit_c, "vaga")
ok(it.get("descartado"), "a regra NAO vale para o philevents (so a fonte declarada)",
   it.get("relevancia"))

print("\n=== 17. A propria listagem nao entra como item ===")
BASE = "https://anpof.org.br/agenda/lancamentos-e-chamadas-de-revistas/"
html_l = ("<a href='agenda/lancamentos-e-chamadas-de-revistas/'>Lancamentos e Chamadas de Revistas</a>"
          "<a href='agenda/lancamentos-e-chamadas-de-revistas/dossie-ensino-de-filosofia'>"
          "Dossie Ensino de Filosofia: dialogos desde a America do Sul</a>")
saiu = C._links_da_pagina(html_l, "https://anpof.org.br/agenda/lancamentos-e-chamadas-de-revistas",
                          "/lancamentos-e-chamadas-de-revistas/", BASE)
ok(len(saiu) == 1 and saiu[0][0].endswith("dossie-ensino-de-filosofia"),
   "o link para a propria pagina de listagem e descartado", saiu)

print("\n=== 18. O rotulo precisa estar em POSICAO de rotulo (2026-09-01) ===")
# Frase institucional do rodape da ANPOF, copiada de dados/vagas.json. Ela era
# o AOS de 22 dos 42 itens da fonte — e o AOS entra no cabeca, que e onde veto,
# tipo e relevancia se decidem.
RODAPE = (u"A Associacao Nacional de Pos-Graduacao em Filosofia (Anpof) foi fundada "
          u"em 1983 com o objetivo de representar os interesses da area "
          u"[de Filosofia] junto aos orgaos competentes [e] estimular, em todos "
          u"os niveis, a investigacao filosofica no Pais.")
ok(C.campo(RODAPE, [u"Área", "Area", "Disciplina"]) == "",
   "a frase do rodape NAO vira mais AOS", repr(C.campo(RODAPE, [u"Área", "Area"])))

# O rotulo real da ANPOF e 'Area de Conhecimento', com asterisco de markdown em
# volta. A versao antiga casava so 'Area' e devolvia 'de Conhecimento:* ...'.
EDITAL = (u"Concurso publico para Professor do Magisterio Superior\n"
          u"*Área de Conhecimento:* História da Filosofia\n"
          u"*Objetos de Avaliação:*")
ok(C.campo(EDITAL, [u"Área de Conhecimento", u"Área", "Area"]) == u"História da Filosofia",
   "o qualificador do rotulo fica FORA do valor",
   repr(C.campo(EDITAL, [u"Área de Conhecimento", u"Área", "Area"])))

# Titulo da pagina: 'Concurso na Area de Ensino de Filosofia ... | ANPOF'. E
# prosa, nao campo — e terminava no AOS com o separador do titulo junto.
TITULO_PAG = u"Concurso na Área de Ensino de Filosofia na UFPB | ANPOF"
ok(C.campo(TITULO_PAG, [u"Área", "Area"]) == "",
   "o titulo da pagina NAO vira AOS", repr(C.campo(TITULO_PAG, [u"Área", "Area"])))

print("\n=== 19. PhilJobs: metadado estruturado ganha da prosa (2026-09-01) ===")
# No PhilJobs rotulo e valor sao duas celulas de tabela, entao viram duas
# LINHAS — sem dois-pontos nenhum. E a mesma pagina repete o AOS na prosa do
# anuncio, de forma abreviada. Tentar a prosa primeiro devolvia 'Early Modern'
# no lugar de 'Early Modern Philosophy'. MEDIDO em dados/vagas.json.
PHILJOBS = (u"Job category\n Junior faculty / Tenure-track or similar\n"
            u" AOS\n Early Modern Philosophy\n AOS categories\n"
            u" Early Modern Philosophy\n AOC\n Open\n Workload\n Full time\n"
            u" Rank: Assistant Professor (tenure-track). AOS: Early Modern. "
            u"AOC: Open. Standard teaching load.")
ok(C.campo(PHILJOBS, ["AOS", "Area of specialisation"]) == "Early Modern Philosophy",
   "a tabela do PhilJobs ganha da prosa do anuncio",
   repr(C.campo(PHILJOBS, ["AOS", "Area of specialisation"])))
ok(C.campo(PHILJOBS, ["AOC"]) == "Open", "AOC de duas linhas continua legivel",
   repr(C.campo(PHILJOBS, ["AOC"])))

# O prazo e o UNICO campo que pode casar frouxo: quem o valida e o parse_data.
FRASE_PRAZO = u"As inscrições podem ser realizadas até as 12h do dia 02/09/2026 ."
ok(C.parse_data(C.campo(FRASE_PRAZO, ["Prazo", u"Inscrições até", u"até"],
                        frouxo=True))[0] == "2026-09-02",
   "o prazo em prosa continua sendo lido (frouxo)",
   C.campo(FRASE_PRAZO, [u"até"], frouxo=True))
ok(C.campo(FRASE_PRAZO, [u"até"]) == "",
   "e o mesmo casamento frouxo NAO vale para os campos do cabeca")

print("\n=== 20. Poda da moldura do site (2026-09-01) ===")
MENU = u"Histórico da ANPOF\nPodcast Anpof\nColeção XX Encontro Nacional Anpof (2024)"
paginas = [MENU + u"\nEdital 1: Filosofia Medieval\nÁrea: Medieval",
           MENU + u"\nEdital 2: Epistemologia\nÁrea: Epistemologia",
           MENU + u"\nEdital 3: Etica\nÁrea: Etica"]
podadas = C.podar_repetido(paginas)
ok(all(u"Podcast Anpof" not in x for x in podadas), "o menu repetido sai", podadas[0])
ok(all(u"Edital" in x for x in podadas), "o conteudo proprio de cada pagina fica")
ok(C.podar_repetido(paginas[:2]) == paginas[:2],
   "com menos de 3 paginas nao ha o que comparar: devolve intacto")

# A guarda que custou 31 anuncios do PhilJobs no ensaio de 2026-09-01: a linha
# 'AOS' e identica em toda pagina do PhilJobs, que e a propria definicao de
# moldura usada aqui. Rotulo que se repete e ESTRUTURA, nao moldura.
pj = [u"AOS\nEarly Modern Philosophy\nAOC\nOpen",
      u"AOS\nEpistemology\nAOC\nOpen",
      u"AOS\nEthics\nAOC\nOpen"]
ok(all(x.startswith("AOS") for x in C.podar_repetido(pj)),
   "a poda NAO come a linha de rotulo do PhilJobs", C.podar_repetido(pj)[0])
ok(all(C.campo(x, ["AOS"]) for x in C.podar_repetido(pj)),
   "e o AOS continua legivel depois da poda")

print("\n=== 21. Validacao da extracao: apaga o que nao da para ler ===")
sujo = {"id": "anpof-x", "fonte": "anpof", "titulo": u"Concurso para Professor",
        "aos": u"] junto aos órgãos competentes [e] estimular", "aoc": "",
        "pais": "Brasil", "texto": "edital", "prazo": ""}
C.validar_extracao(sujo, CRIT)
ok(sujo["aos"] == "", "AOS contaminado e APAGADO antes do cabeca", sujo["aos"])
ok(sujo["extracao"] == "suspeita" and sujo["avisos_extracao"],
   "e a razao fica registrada", sujo.get("avisos_extracao"))

# O defeito da primeira versao desta camada, medido no mesmo ensaio: AOS
# legitimo, longo, escrito como frase pelo empregador, era jogado fora.
limpo = {"id": "philjobs-x", "fonte": "philjobs", "titulo": "Assistant Professor - Philosophy",
         "aos": ("Epistemology (especially Applied Epistemology, Social Epistemology, "
                 "Political Epistemology, Feminist Epistemology, Virtue Epistemology)"),
         "aoc": "Open", "pais": "United States", "texto": "corpo", "prazo": ""}
C.validar_extracao(limpo, CRIT)
ok(limpo["aos"].startswith("Epistemology (especially"),
   "AOS legitimo e longo NAO e apagado: comprimento nao e prova de nada",
   limpo["aos"])
ok(limpo["extracao"] == "ok", "e o item nao vai para revisao por causa disso",
   limpo.get("avisos_extracao"))

# Ano lido errado poe a vaga no topo para sempre, porque ela nunca vence.
absurdo = {"id": "x", "fonte": "anpof", "titulo": u"Concurso para Professor",
           "aos": "", "aoc": "", "pais": "Brasil", "texto": "corpo", "prazo": dia(4000)}
C.validar_extracao(absurdo, CRIT)
ok(absurdo["prazo"] == "", "prazo improvavel e apagado", absurdo["prazo"])

print("\n=== 22. A validacao roda ANTES da classificacao ===")
# O cabeca e titulo + aos + aoc. Se o AOS contaminado chegar inteiro ate aqui,
# quem decide veto, tipo e relevancia e o rodape do site.
env = {"id": "anpof-y", "fonte": "anpof", "url": "", "titulo": u"Selecao de Mestrado 2027",
       "aos": u"] junto aos órgãos competentes, a investigacao filosofica no Pais",
       "aoc": "", "pais": "Brasil", "texto": "corpo do edital", "prazo": "",
       "categoria": "", "contrato": "", "local": "", "instituicao": ""}
C.validar_extracao(env, CRIT)
C.descarte_barato(env, CRIT)
C.classificar(env, CRIT, "edital")
ok(u"junto aos" not in " ".join(str(env.get(k, "")) for k in ("aos", "aoc")),
   "o cabeca chega limpo na classificacao", env.get("aos"))
ok(env.get("descartado") and "discente" in (env.get("motivo_saida") or ""),
   "e a selecao de mestrado morre no descarte barato, como sempre",
   env.get("motivo_saida"))
ok(any("AOS" in m for m in (env.get("marcas") or [])) or env.get("avisos_extracao"),
   "a marca da extracao suspeita acompanha o item ate o painel",
   env.get("marcas"))

print("\n" + ("=" * 62))
print("FALHAS: %d" % len(falhas))
for f in falhas: print("  - " + f)
sys.exit(1 if falhas else 0)
