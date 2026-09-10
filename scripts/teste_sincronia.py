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
const FONTE=SRCS.map(s=>fs.readFileSync(path.join(RAIZ,"Cronograma",s.split("?")[0]),"utf8")).join("\\n")+
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


# ============================================================
# O QUE SOBROU DESTE TESTE, e por que (Fase 9G-2)
# ============================================================
# Ele provava o round-trip INTEIRO do caminho legado: pagina -> toques ->
# dobrar_toques.py -> estado.json -> pagina, para prioridade, TOEFL, retomada e
# os quatro tipos antigos. A 9G-2 cortou a subida legada do APLICATIVO: a
# pagina nao emite mais toque nenhum, entao aquelas secoes ficaram sem sujeito
# — nao "quebraram", deixaram de ter o que medir.
#
# NAO HOUVE PERDA DE COBERTURA. Os mesmos dominios sao provados entre dois
# aparelhos pelo teste_sync.js, agora pelo caminho que existe de verdade.
#
# O QUE CONTINUA VALENDO e o que este arquivo passou a ser: o round-trip do
# PIPELINE, que segue emitindo toque pelo `--registrar` e depende da dobra e da
# descida. Enquanto a 9G-3 nao cortar a descida, este e o unico teste que
# atravessa as duas linguagens com o codigo de verdade dos dois lados.
TMP2 = montar_repo_falso()
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
console.log(JSON.stringify({fechada: sx.st, fila: (d.LS("cron:sync-fila", []) || []).length,
                            estagio: (d.estagioDoTrilho("pipeline","a00")||{}).subId}));
""" % json.dumps(est5), RAIZ)
ok(depois["fechada"] == 2, "e o aparelho recebe a etapa fechada", depois)
ok(depois["estagio"] != "a00-4", "e ja aponta para a seguinte", depois["estagio"])
ok(depois["fila"] == 0, "sem escrever de volta (sem eco)", depois["fila"])
buf = _io.StringIO()
with contextlib.redirect_stdout(buf):
    cod_estrela = dobrar_toques.registrar("pipeline/a00/a00-1", 2, "ativo", False, False)
ok(cod_estrela != 0, "e ele RECUSA etapa de prova 'estrela' (decisao sua)",
   buf.getvalue()[-160:])

print("\n" + "=" * 62)
print("FALHAS: %d" % len(falhas))
for f in falhas:
    print("  - " + f)
sys.exit(1 if falhas else 0)
