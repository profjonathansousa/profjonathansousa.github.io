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

print("\n" + ("=" * 62))
print("FALHAS: %d" % len(falhas))
for f in falhas: print("  - " + f)
sys.exit(1 if falhas else 0)
