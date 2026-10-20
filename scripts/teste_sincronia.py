#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prova de ponta a ponta do PIPELINE ate a tela: o --registrar marca, e o
aparelho recebe.

    python3 scripts/teste_sincronia.py

Os outros testes exercitam um lado de cada vez: o teste_registrar.py prova o
comando, o teste_marcar_no_banco.py a funcao do banco, o teste_sync.js os
aparelhos. Este atravessa a fronteira das duas linguagens, com o codigo de
verdade dos dois lados:

    scripts/dobrar_toques.py --registrar (o script de verdade)
        -> /rpc/cron_pipeline_marcar (o arremedo da funcao, que o
           teste_marcar_no_banco.py compara com a de verdade)
            -> a linha `item` no cron_estado
                -> node (pagina, aparelho "celular"): aplicarItemOnline -> trilho

Ate 2026-10-13 o caminho passava por um toque, pela dobra e pelo estado.json;
a copia publica do historico saiu, e o caminho e este. Nada e escrito no
repositorio: a rodada inteira acontece num diretorio temporario.
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
    os.makedirs(os.path.join(tmp, "Cronograma"))
    for nome in ("index.html", "entrada.json"):
        shutil.copy(os.path.join(RAIZ, "Cronograma", nome),
                    os.path.join(tmp, "Cronograma", nome))
    # Fase 7: o codigo mora em Cronograma/js/, e o repo falso tem de te-lo.
    shutil.copytree(os.path.join(RAIZ, "Cronograma", "js"),
                    os.path.join(tmp, "Cronograma", "js"))
    return tmp


def disco(tmp):
    """O que existe no Cronograma temporario alem do que foi copiado para la."""
    copiados = {"index.html", "entrada.json"}
    return sorted(a for a in os.listdir(os.path.join(tmp, "Cronograma"))
                  if a not in copiados and a != "js")


# ============================================================
# O QUE ESTE ARQUIVO E (2026-10-13)
# ============================================================
# Ele provava o round-trip do caminho legado: pagina -> toques ->
# dobrar_toques.py -> estado.json -> pagina. A 9G-2 tirou a pagina desse
# caminho (os dominios dela sao provados entre dois aparelhos pelo
# teste_sync.js), e em 2026-10-13 o pipeline tambem saiu: o --registrar marca
# pela funcao do banco, e o estado.json deixou o repositorio. O que sobra para
# provar aqui e a ponta que so este teste atravessa: o que o pipeline escreve
# chega a tela de um aparelho.
TMP2 = montar_repo_falso()
print("\n=== 5. pipeline -> --registrar -> funcao do banco -> trilho ===")
import importlib
import dobrar_toques
importlib.reload(dobrar_toques)
dobrar_toques.DIR_TOQUES = os.path.join(TMP2, "Cronograma", "toques")
dobrar_toques.DIR_DOBRADOS = os.path.join(TMP2, "Cronograma", "toques", "_dobrados")
dobrar_toques.ARQ_ESTADO = os.path.join(TMP2, "Cronograma", "estado.json")
dobrar_toques.ARQ_ENTRADA = os.path.join(TMP2, "Cronograma", "entrada.json")
import io as _io
import contextlib


def registrar(alvo):
    buf = _io.StringIO()
    with contextlib.redirect_stdout(buf):
        codigo = dobrar_toques.registrar(alvo)
    return codigo, buf.getvalue()


# SEM CREDENCIAIS, ELE RECUSA: quem marca e a funcao do banco, e sem as duas
# variaveis nao ha como chama-la. Nada vai para o disco no lugar.
for _v in (dobrar_toques.API_URL, dobrar_toques.API_CHAVE):
    os.environ.pop(_v, None)
cod_sem, saida = registrar("pipeline/a00/a00-4")
ok(cod_sem != 0, "sem credenciais o --registrar RECUSA", saida[-160:])
ok(disco(TMP2) == [], "   e nao deixa nada no disco (nem toque, nem estado.json)", disco(TMP2))

# COM A REDE FORA, tambem recusa, e tambem nao escreve nada.
os.environ[dobrar_toques.API_URL] = "http://127.0.0.1:9"
os.environ[dobrar_toques.API_CHAVE] = "chave-de-mentira-do-teste"
cod_rede, saida = registrar("pipeline/a00/a00-4")
ok(cod_rede != 0, "com a rede fora o --registrar RECUSA", saida[-200:])
ok(disco(TMP2) == [], "   e nao deixa nada no disco", disco(TMP2))

# COM O BANCO RESPONDENDO (um PostgREST de mentira, em localhost, com a
# estrutura do entrada.json de verdade publicada nele), a funcao marca.
from postgrest_de_mentira import Banco
with open(os.path.join(TMP2, "Cronograma", "entrada.json"), encoding="utf-8") as _f:
    BANCO = Banco().subir().publicar(json.load(_f))
os.environ[dobrar_toques.API_URL] = BANCO.url
cod, saida = registrar("pipeline/a00/a00-4")
# Desde 2026-10-20 a unica etapa 'estrela' da esteira e a 4b, do NotebookLM.
cod_estrela, saida_estrela = registrar("pipeline/a00/a00-4b")
BANCO.parar()
for _v in (dobrar_toques.API_URL, dobrar_toques.API_CHAVE):
    os.environ.pop(_v, None)
linha = BANCO.item("pipeline/a00/a00-4") or {}
ok(cod == 0, "o --registrar do pipeline marca", saida[-200:])
ok((linha.get("valor") or {}).get("st") == 2 and linha.get("aparelho") == "cowork",
   "   a linha `item` fecha a etapa, assinada como `cowork`", linha)
ok(disco(TMP2) == [], "   e o disco continua intocado", disco(TMP2))
ok(cod_estrela != 0 and "estrela" in saida_estrela,
   "e ele RECUSA etapa de prova 'estrela' (decisao sua)", saida_estrela[-160:])

# E O APARELHO RECEBE A LINHA COMO RECEBE A DE QUALQUER OUTRO: pelo
# aplicarItemOnline, a descida do Supabase.
depois = node("""
const linha = %s;
const d = aparelho("celular", {"cron:aparelho":JSON.stringify("celular")}, null);
const renders = d.aplicarItemOnline(linha);
const ps = d.getProjs("pipeline"), pr = ps.filter(x=>x.id==="a00")[0];
const sx = pr.subs.filter(x=>x.id==="a00-4")[0];
console.log(JSON.stringify({fechada: sx.st, renders: renders.length,
                            fila: (d.LS("cron:sync-fila", []) || []).length,
                            estagio: (d.estagioDoTrilho("pipeline","a00")||{}).subId}));
""" % json.dumps(linha), RAIZ)
ok(depois["fechada"] == 2 and depois["renders"] > 0, "e o aparelho recebe a etapa fechada", depois)
ok(depois["estagio"] != "a00-4", "e ja aponta para a seguinte", depois["estagio"])
ok(depois["fila"] == 0, "sem escrever de volta (sem eco)", depois["fila"])
shutil.rmtree(TMP2, ignore_errors=True)

print("\n" + "=" * 62)
print("FALHAS: %d" % len(falhas))
for f in falhas:
    print("  - " + f)
sys.exit(1 if falhas else 0)
