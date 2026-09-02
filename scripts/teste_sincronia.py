#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prova de ponta a ponta da sincronia de PRIORIDADES (Fase 2), do GUIA DO
TOEFL (Fase 6A) e das RETOMADAS SILENCIADAS (Fase 6B).

    python3 scripts/teste_sincronia.py

Os outros testes exercitam um lado de cada vez: o teste_hoje.js prova o que a
pagina faz, e nada prova o que acontece ENTRE os dois aparelhos. Este aqui
atravessa a fronteira das duas linguagens, com o codigo de verdade dos dois
lados e nada simulado no meio:

    node (pagina, aparelho "mac")  ->  toque
        -> scripts/dobrar_toques.py (o script de verdade, nao uma copia)
            -> estado.json
                -> node (pagina, aparelho "celular")  ->  prioridade na tela

Nada e escrito no repositorio: a rodada inteira acontece num diretorio
temporario com a mesma forma do repositorio.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)

falhas = []


def ok(cond, nome, detalhe=""):
    print(("  PASSA  " if cond else "  FALHA  ") + nome +
          (("  <- " + str(detalhe)) if not cond and detalhe != "" else ""))
    if not cond:
        falhas.append(nome)


NODE = """
const fs=require("fs"), path=require("path"), vm=require("vm");
const RAIZ=%s;
const HTML=fs.readFileSync(path.join(RAIZ,"Cronograma","index.html"),"utf8");
/* Os scripts reais, na ordem do HTML (Fase 7): o <script> inline deixou de
   existir e a lista vem do proprio index.html. */
const SRCS=(HTML.match(/<script[^>]*\\ssrc="[^"]+"[^>]*><\\/script>/g)||[])
  .map(t=>t.match(/src="([^"]+)"/)[1]);
const FONTE=SRCS.map(s=>fs.readFileSync(path.join(RAIZ,"Cronograma",s),"utf8")).join("\\n")+
  "\\n;globalThis.__const={DIAS,PAINEIS,monthKey};";
function no(id){return {id,innerHTML:"",hidden:false,value:"",open:false,
  classList:{add(){},remove(){},toggle(){},contains(){return false}},
  appendChild(){},setAttribute(){},removeAttribute(){},addEventListener(){},
  querySelector(){return null},querySelectorAll(){return []},focus(){},blur(){},remove(){}};}
function aparelho(nome, armazem, texto){
  const nos={};
  /* A entrada real, como no teste_hoje.js: o a00 (patriotismo) so existe
     depois do mesclarEntrada, porque ele nasce no Cronograma/entrada.json. */
  if(!armazem["cron:entrada"]) armazem["cron:entrada"] =
    fs.readFileSync(path.join(RAIZ,"Cronograma","entrada.json"),"utf8");
  const ls={getItem:k=>(k in armazem?armazem[k]:null),
            setItem:(k,v)=>{armazem[k]=String(v)},
            removeItem:k=>{delete armazem[k]}, clear(){}};
  const doc={getElementById:id=>(nos[id]=nos[id]||no(id)),querySelector:()=>null,
             querySelectorAll:()=>[],addEventListener(){},createElement:()=>no("x"),
             body:no("body"),documentElement:no("html"),visibilityState:"visible"};
  const ctx={localStorage:ls,document:doc,console,
    window:{addEventListener(){},location:{href:"",reload(){}}},
    navigator:{userAgent:"node",onLine:true},location:{href:"",reload(){}},
    setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
    fetch:()=>Promise.reject(new Error("sem rede")),
    alert(){},confirm:()=>true,prompt:()=>texto,
    Date,Math,JSON,String,Number,Object,Array,Boolean,RegExp,Error,isFinite,isNaN};
  ctx.globalThis=ctx; vm.createContext(ctx); vm.runInContext(FONTE,ctx);
  Object.assign(ctx,ctx.__const||{});
  try{ctx.mesclarEntrada();}catch(e){}
  return ctx;
}
%s
"""


def node(corpo, raiz):
    fonte = NODE % (json.dumps(raiz), corpo)
    r = subprocess.run(["node", "-e", fonte], capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout)
        print(r.stderr, file=sys.stderr)
        raise SystemExit("node falhou")
    return json.loads(r.stdout.strip().splitlines()[-1])


def montar_repo_falso():
    tmp = tempfile.mkdtemp(prefix="cronograma-sinc-")
    os.makedirs(os.path.join(tmp, "Cronograma", "toques"))
    for nome in ("index.html", "entrada.json"):
        shutil.copy(os.path.join(RAIZ, "Cronograma", nome),
                    os.path.join(tmp, "Cronograma", nome))
    # Fase 7: o codigo mora em Cronograma/js/, e o repo falso tem de te-lo.
    shutil.copytree(os.path.join(RAIZ, "Cronograma", "js"),
                    os.path.join(tmp, "Cronograma", "js"))
    return tmp


def dobrar_em(tmp):
    """Roda o dobrar_toques.py DE VERDADE, so com os caminhos apontados para o
    diretorio temporario. Recarregado a cada chamada porque os caminhos sao
    constantes de modulo."""
    import importlib
    import dobrar_toques
    importlib.reload(dobrar_toques)
    dobrar_toques.DIR_TOQUES = os.path.join(tmp, "Cronograma", "toques")
    dobrar_toques.DIR_DOBRADOS = os.path.join(tmp, "Cronograma", "toques", "_dobrados")
    dobrar_toques.ARQ_ESTADO = os.path.join(tmp, "Cronograma", "estado.json")
    dobrar_toques.ARQ_ENTRADA = os.path.join(tmp, "Cronograma", "entrada.json")
    argv = sys.argv
    sys.argv = ["dobrar_toques.py"]
    try:
        import io as _io
        import contextlib
        buf = _io.StringIO()
        with contextlib.redirect_stdout(buf):
            codigo = dobrar_toques.main()
    finally:
        sys.argv = argv
    if codigo != 0:
        raise SystemExit("dobrar_toques.main() devolveu %s" % codigo)
    with open(os.path.join(tmp, "Cronograma", "estado.json"), encoding="utf-8") as f:
        return json.load(f)


def gravar_toques(tmp, toques, nome):
    caminho = os.path.join(tmp, "Cronograma", "toques", nome)
    with open(caminho, "w", encoding="utf-8") as f:
        json.dump({"v": 1, "lote": nome, "toques": toques}, f, ensure_ascii=False)


print("\n=== 1. computador -> dobra -> celular ===")
TMP = montar_repo_falso()
saida = node("""
const mac = aparelho("mac", {"cron:aparelho":JSON.stringify("mac")}, "Pos-doc Notre Dame");
mac.addPrioridadeLivre();
mac.addPrioridadeTrilho("pipeline/a00");
console.log(JSON.stringify({toques: mac.getToques(), prio: mac.getPrio()}));
""", RAIZ)
gravar_toques(TMP, saida["toques"], "lote-mac.json")
estado = dobrar_em(TMP)

ok("prioridades" in estado, "o estado.json ganhou a secao 'prioridades'",
   list(estado.keys()))
ok(len(estado["prioridades"]) == 2, "com as duas prioridades do computador",
   estado["prioridades"])
chaves = list(estado["prioridades"])
ok(all("/" in k and k.split("/")[0].startswith("20") and "-W" in k for k in chaves),
   "chaveadas por semana/id, como as metas sao por mes/id", chaves)
valores = list(estado["prioridades"].values())
ok(all(v.get("quando") and v.get("aparelho") == "mac" for v in valores),
   "com quando e aparelho, como todo toque", valores[0])
trilho = [v for v in valores if v["tipo"] == "trilho"]
ok(len(trilho) == 1 and trilho[0]["painel"] == "pipeline" and trilho[0]["projId"] == "a00",
   "a de trilho guardou o ENDERECO", trilho and trilho[0])
ok(all("Janela" not in json.dumps(v, ensure_ascii=False) for v in valores),
   "e nenhuma guardou o texto da etapa", valores)

celular = node("""
const est = %s;
const cel = aparelho("celular", {"cron:aparelho":JSON.stringify("celular")}, null);
const antes = cel.getPrio().length;
cel.aplicarPrioridadesDoEstado(est);
const p = cel.getPrio();
const t = p.filter(x=>x.tipo==="trilho")[0];
const et = t ? cel.estagioDoTrilho(t.painel, t.projId) : null;
console.log(JSON.stringify({antes, prio:p, estagio: et && et.subT}));
""" % json.dumps(estado), RAIZ)
ok(celular["antes"] == 0, "o celular comeca sem nada")
ok(len(celular["prio"]) == 2, "e recebe as duas", celular["prio"])
ok(any(p["t"] == "Pos-doc Notre Dame" for p in celular["prio"]),
   "a livre chegou com o texto")
ok(bool(celular["estagio"]) and len(celular["estagio"]) > 5,
   "e a de trilho virou o ESTAGIO REAL, lido no celular", celular["estagio"])
print("      estagio lido no celular: %r" % celular["estagio"])

print("\n=== 2. celular -> dobra -> computador ===")
saida2 = node("""
const cel = aparelho("celular", {"cron:aparelho":JSON.stringify("celular")}, "Revisar TOEFL");
cel.addPrioridadeLivre();
console.log(JSON.stringify({toques: cel.getToques()}));
""", RAIZ)
gravar_toques(TMP, saida2["toques"], "lote-celular.json")
estado2 = dobrar_em(TMP)
ok(len(estado2["prioridades"]) == 3, "o estado agora tem as tres",
   len(estado2["prioridades"]))
mac2 = node("""
const est = %s;
const mac = aparelho("mac", {"cron:aparelho":JSON.stringify("mac")}, null);
mac.aplicarPrioridadesDoEstado(est);
console.log(JSON.stringify(mac.getPrio()));
""" % json.dumps(estado2), RAIZ)
ok(any(p["t"] == "Revisar TOEFL" for p in mac2),
   "e o computador recebe a que nasceu no celular", mac2)

print("\n=== 3. apagar no celular apaga no computador (lapide) ===")
saida3 = node("""
const est = %s;
const cel = aparelho("celular", {"cron:aparelho":JSON.stringify("celular")}, null);
cel.aplicarPrioridadesDoEstado(est);
const alvo = cel.getPrio().filter(p=>p.t==="Pos-doc Notre Dame")[0];
cel.delPrioridade(alvo.id);
console.log(JSON.stringify({toques: cel.getToques(), restou: cel.getPrio().length}));
""" % json.dumps(estado2), RAIZ)
gravar_toques(TMP, saida3["toques"], "lote-apaga.json")
estado3 = dobrar_em(TMP)
apagadas = [v for v in estado3["prioridades"].values() if v.get("del")]
ok(len(apagadas) == 1, "a lapide chegou ao estado", apagadas)
mac3 = node("""
const est = %s;
const mac = aparelho("mac", {"cron:aparelho":JSON.stringify("mac")}, null);
mac.aplicarPrioridadesDoEstado(est);
console.log(JSON.stringify(mac.getPrio()));
""" % json.dumps(estado3), RAIZ)
ok(not any(p["t"] == "Pos-doc Notre Dame" for p in mac3),
   "e o computador tira da tela", mac3)
ok(len(mac3) == 2, "sem levar as outras junto", mac3)

print("\n=== 4. os quatro tipos antigos continuam dobrando ===")
TMP2 = montar_repo_falso()
antigos = node("""
const d = aparelho("velho", {"cron:aparelho":JSON.stringify("velho")}, "meta nova");
d.vgMarcar("philjobs-31649", 1);
const et = d.estagioDoTrilho("pipeline","a00");
d.marcarDoHoje("pipeline","a00",et.subId,true);
d.addMeta();
const m = d.getMetas(); m[m.length-1].t="Meta de teste"; d.setMetas(m);
d.tocarMeta(d.monthKey, m[m.length-1], false);
d.addEv();
const e = d.getEventos(); const ult = e[e.length-1];
d.dateEv(ult.id, "2026-12-25");
console.log(JSON.stringify({toques: d.getToques()}));
""", RAIZ)
gravar_toques(TMP2, antigos["toques"], "lote-antigos.json")
est4 = dobrar_em(TMP2)
ok(len(est4.get("itens") or {}) == 1, "registro -> itens", est4.get("itens"))
ok(len(est4.get("triagem") or {}) == 1, "triagem -> triagem", est4.get("triagem"))
ok(len(est4.get("metas") or {}) >= 1, "meta -> metas", est4.get("metas"))
ok(len(est4.get("eventos") or {}) == 1, "evento -> eventos", est4.get("eventos"))
ok(len(est4.get("prioridades") or {}) == 0,
   "e a secao nova fica vazia quando nao ha prioridade nenhuma")
ok(len(est4.get("historico") or []) == len(antigos["toques"]),
   "todos os toques foram para o historico, como sempre")

print("\n=== 5. pipeline -> --registrar -> estado -> trilho ===")
import importlib
import dobrar_toques
importlib.reload(dobrar_toques)
dobrar_toques.DIR_TOQUES = os.path.join(TMP2, "Cronograma", "toques")
dobrar_toques.DIR_DOBRADOS = os.path.join(TMP2, "Cronograma", "toques", "_dobrados")
dobrar_toques.ARQ_ESTADO = os.path.join(TMP2, "Cronograma", "estado.json")
dobrar_toques.ARQ_ENTRADA = os.path.join(TMP2, "Cronograma", "entrada.json")
import io as _io
import contextlib
buf = _io.StringIO()
with contextlib.redirect_stdout(buf):
    cod = dobrar_toques.registrar("pipeline/a00/a00-4", 2, "ativo", False, False)
ok(cod == 0, "o --registrar do pipeline escreve o toque", buf.getvalue()[-200:])
# registrar() SO ESCREVE O TOQUE. Quem consolida e a dobra seguinte — no uso
# real o proprio main() encadeia as duas na mesma execucao.
est5 = dobrar_em(TMP2)
ok(est5["itens"].get("pipeline/a00/a00-4", {}).get("st") == 2,
   "e a dobra fecha a etapa no estado", est5["itens"].get("pipeline/a00/a00-4"))
ok(est5["itens"]["pipeline/a00/a00-4"].get("aparelho") == "cowork",
   "com o aparelho 'cowork'", est5["itens"].get("pipeline/a00/a00-4"))
depois = node("""
const est = %s;
const d = aparelho("celular", {"cron:aparelho":JSON.stringify("celular")}, null);
const ps = d.getProjs("pipeline"), pr = ps.filter(x=>x.id==="a00")[0];
const alvo = est.itens["pipeline/a00/a00-4"];
const sx = pr.subs.filter(x=>x.id==="a00-4")[0];
if((sx.em||"") < alvo.quando){ sx.st = alvo.st; sx.em = alvo.quando; d.setProjs("pipeline", ps); }
console.log(JSON.stringify({fechada: sx.st, toques: d.getToques().length,
                            estagio: (d.estagioDoTrilho("pipeline","a00")||{}).subId}));
""" % json.dumps(est5), RAIZ)
ok(depois["fechada"] == 2, "e o aparelho recebe a etapa fechada", depois)
ok(depois["estagio"] != "a00-4", "e ja aponta para a seguinte", depois["estagio"])
ok(depois["toques"] == 0, "sem gerar toque de volta (sem eco)", depois["toques"])
buf = _io.StringIO()
with contextlib.redirect_stdout(buf):
    cod_estrela = dobrar_toques.registrar("pipeline/a00/a00-1", 2, "ativo", False, False)
ok(cod_estrela != 0, "e ele RECUSA etapa de prova 'estrela' (decisao sua)",
   buf.getvalue()[-160:])

print("\n=== 6. TOEFL: o guia atravessa (Fase 6A) ===")
TMP3 = montar_repo_falso()
# O computador marca dois itens do guia; um deles ele desmarca em seguida.
saida_t = node("""
const mac = aparelho("mac", {"cron:aparelho":JSON.stringify("mac")}, null);
mac.marcarGuia("f1-conta", true);
mac.marcarGuia("f1-anki", true);
mac.marcarGuia("f1-anki", false);
console.log(JSON.stringify({toques: mac.getToques().filter(t=>t.tipo==="toefl")}));
""", RAIZ)
gravar_toques(TMP3, saida_t["toques"], "lote-toefl.json")
est_t = dobrar_em(TMP3)
ok("toefl" in est_t, "o estado.json ganhou a secao 'toefl'", sorted(est_t.keys()))
ok(est_t["toefl"].get("f1-conta", {}).get("feito") is True,
   "a marca chegou como booleano", est_t["toefl"].get("f1-conta"))
ok(est_t["toefl"].get("f1-anki", {}).get("feito") is False,
   "e a desmarcacao venceu a marcacao anterior do mesmo item",
   est_t["toefl"].get("f1-anki"))
ok(all(v.get("quando") and v.get("aparelho") == "mac" for v in est_t["toefl"].values()),
   "cada uma com quando e aparelho", est_t["toefl"])
ok(all("t" not in v and "fase" not in v for v in est_t["toefl"].values()),
   "e o texto e a fase NAO viajam", est_t["toefl"])

# Redobra: o mesmo lote outra vez nao muda nada e nao duplica o historico.
antes_hist = len(est_t["historico"])
gravar_toques(TMP3, saida_t["toques"], "lote-toefl-repetido.json")
est_t2 = dobrar_em(TMP3)
ok(est_t2["toefl"] == est_t["toefl"], "redobrar o mesmo lote nao muda o estado")
ok(len(est_t2["historico"]) == antes_hist,
   "e nao duplica o historico (idempotente)",
   (antes_hist, len(est_t2["historico"])))

# Toque atrasado de outro aparelho: entra no historico, nao manda no estado.
atrasado = [{"v": 1, "id": "2020-01-01T00-00-00-000Z-velho",
             "quando": "2020-01-01T00:00:00.000Z", "aparelho": "celular",
             "app": "teste", "tipo": "toefl",
             "dados": {"iid": "f1-conta", "feito": False}}]
gravar_toques(TMP3, atrasado, "lote-atrasado.json")
est_t3 = dobrar_em(TMP3)
ok(est_t3["toefl"]["f1-conta"]["feito"] is True,
   "toque atrasado NAO desmarca o que ja estava mais novo",
   est_t3["toefl"]["f1-conta"])
ok(any(t.get("id") == "2020-01-01T00-00-00-000Z-velho" for t in est_t3["historico"]),
   "mas ele fica no historico: nada se perde")

# Uniao: o celular marca outro item, e os dois convivem.
saida_c = node("""
const cel = aparelho("celular", {"cron:aparelho":JSON.stringify("celular")}, null);
cel.marcarGuia("f2-reading", true);
console.log(JSON.stringify({toques: cel.getToques().filter(t=>t.tipo==="toefl")}));
""", RAIZ)
gravar_toques(TMP3, saida_c["toques"], "lote-cel.json")
est_t4 = dobrar_em(TMP3)
ok(est_t4["toefl"].get("f1-conta", {}).get("feito") is True and
   est_t4["toefl"].get("f2-reading", {}).get("feito") is True,
   "ids diferentes coexistem: a uniao preserva os dois aparelhos",
   sorted(est_t4["toefl"].keys()))
# E a pagina do outro lado recebe os dois, sem gerar toque de volta.
volta = node("""
const est = %s;
const d = aparelho("mac2", {"cron:aparelho":JSON.stringify("mac2")}, null);
const antes = d.getToques().length;
d.aplicarToeflDoEstado(est);
console.log(JSON.stringify({conta: d.guiaFeito("f1-conta"),
                            reading: d.guiaFeito("f2-reading"),
                            anki: d.guiaFeito("f1-anki"),
                            novos: d.getToques().length - antes}));
""" % json.dumps(est_t4), RAIZ)
ok(volta["conta"] is True and volta["reading"] is True,
   "o aparelho que nunca marcou nada recebe as duas", volta)
ok(volta["anki"] is False, "e o item desmarcado chega desmarcado", volta)
ok(volta["novos"] == 0, "sem gerar toque de volta (sem eco)", volta["novos"])

print("\n=== 7. Retomadas: o silencio atravessa (Fase 6B) ===")
TMP4 = montar_repo_falso()
saida_r = node("""
const mac = aparelho("mac", {"cron:aparelho":JSON.stringify("mac")}, null);
mac.adiarRetomada("pipeline", "a01");
console.log(JSON.stringify({toques: mac.getToques().filter(t=>t.tipo==="retomada"),
                            ate: mac.LS("cron:retomadas-adiadas",{})["pipeline/a01"].ate}));
""", RAIZ)
gravar_toques(TMP4, saida_r["toques"], "lote-ret.json")
est_r = dobrar_em(TMP4)
R = est_r.get("retomadas", {})
ok("retomadas" in est_r, "o estado.json ganhou a secao 'retomadas'", sorted(est_r.keys()))
ok("pipeline/a01" in R, "o alvo e painel/projeto", sorted(R.keys()))
ok(R["pipeline/a01"].get("ate") == saida_r["ate"],
   "o `ate` chegou preservado", R["pipeline/a01"])
ok(R["pipeline/a01"].get("quando") and R["pipeline/a01"].get("aparelho") == "mac",
   "com quando e aparelho postos pela maquina existente", R["pipeline/a01"])
ok(all(k not in R["pipeline/a01"] for k in ("t", "projT", "subT")),
   "e nenhum titulo ou texto viajou", R["pipeline/a01"])

antes_hist_r = len(est_r["historico"])
gravar_toques(TMP4, saida_r["toques"], "lote-ret-repetido.json")
est_r2 = dobrar_em(TMP4)
ok(est_r2["retomadas"] == R, "redobrar o mesmo lote nao muda o estado")
ok(len(est_r2["historico"]) == antes_hist_r,
   "e nao duplica o historico (idempotente)",
   (antes_hist_r, len(est_r2["historico"])))

gravar_toques(TMP4, [{"v": 1, "id": "2020-01-01T00-00-00-000Z-ret",
                      "quando": "2020-01-01T00:00:00.000Z", "aparelho": "celular",
                      "app": "teste", "tipo": "retomada",
                      "dados": {"pid": "pipeline", "projId": "a01",
                                "ate": "2020-01-15"}}], "lote-ret-atrasado.json")
est_r3 = dobrar_em(TMP4)
ok(est_r3["retomadas"]["pipeline/a01"]["ate"] == saida_r["ate"],
   "toque atrasado NAO derruba o silencio mais novo",
   est_r3["retomadas"]["pipeline/a01"])
ok(any(t.get("id") == "2020-01-01T00-00-00-000Z-ret" for t in est_r3["historico"]),
   "mas ele fica no historico: nada se perde")

saida_r2 = node("""
const cel = aparelho("celular", {"cron:aparelho":JSON.stringify("celular")}, null);
cel.adiarRetomada("pipeline", "a02");
console.log(JSON.stringify({toques: cel.getToques().filter(t=>t.tipo==="retomada")}));
""", RAIZ)
gravar_toques(TMP4, saida_r2["toques"], "lote-ret-cel.json")
est_r4 = dobrar_em(TMP4)
ok(sorted(est_r4["retomadas"].keys()) == ["pipeline/a01", "pipeline/a02"],
   "dois aparelhos com projetos diferentes produzem uniao",
   sorted(est_r4["retomadas"].keys()))

shutil.rmtree(TMP, ignore_errors=True)
shutil.rmtree(TMP2, ignore_errors=True)
shutil.rmtree(TMP3, ignore_errors=True)
shutil.rmtree(TMP4, ignore_errors=True)
print("\n" + "=" * 62)
print("FALHAS: %d" % len(falhas))
for f in falhas:
    print("  - " + f)
sys.exit(1 if falhas else 0)
