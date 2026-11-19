#!/usr/bin/env node
/* gerar_entrada_esteira.js — monta a estrutura da esteira a publicar.

    node scripts/gerar_entrada_esteira.js /caminho/entrada-nova.json
    python3 scripts/dobrar_toques.py --publicar-estrutura /caminho/entrada-nova.json

POR QUE EXISTE (19/11/2026). A esteira passou a seguir o cronograma do PROFIX:
o mes de cada artigo e o da sua meta, contado do PROFIX_INICIO, que e
PROVISORIO ate o deposito da primeira parcela. Quando o deposito sair, troca-se
so o PROFIX_INICIO no js/00-config.js, e este script regera a estrutura com os
meses novos, para publicar. Sem ele, cada mudanca de calendario seria uma
reescrita a mao do entrada.json — que o proprio arquivo diz para nao fazer.

DE ONDE VEM CADA CAMPO:
  · titulo, nota e mes das pecas VIVAS: da semente (PIPELINE_DEFAULT), que e a
    fonte unica e ja calcula o mes pelo mesDoProfix();
  · as etapas (subs) e o slug: do entrada.json publicado, que e onde o pipeline
    as declara (nomes, onde, prova, a 4b). A semente nao tem essa informacao;
  · peca nova, que o entrada.json ainda nao tem: as etapas da a13, a convencao
    de hoje, com o id trocado;
  · peca ARQUIVADA na semente (a02, a07): fica no arquivo exatamente como esta.
    Arquivar e decisao sua, que a estrutura nao carrega; o que a entrada nao
    menciona nao sai de aparelho nenhum.

NAO PUBLICA NADA: so escreve o arquivo pedido. Publicar e o --publicar-estrutura
(arquivo e cron_estrutura_base no mesmo ato), que exige as credenciais. */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.dirname(__dirname);
const saida = process.argv[2];
if (!saida) {
  console.error("uso: node scripts/gerar_entrada_esteira.js /caminho/entrada-nova.json [--gerado-em ISO]");
  process.exit(1);
}
const iGer = process.argv.indexOf("--gerado-em");
const geradoEm = iGer > 0 ? process.argv[iGer + 1]
                          : new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const cfg = fs.readFileSync(path.join(RAIZ, "Cronograma", "js", "00-config.js"), "utf8");
const ctx = {console, Date, Math, JSON, String, Number, Object, Array};
vm.createContext(ctx);
const SEMENTE = vm.runInContext(cfg + "\n;PIPELINE_DEFAULT", ctx);

const arqEntrada = path.join(RAIZ, "Cronograma", "entrada.json");
const atual = JSON.parse(fs.readFileSync(arqEntrada, "utf8"));
const publicadas = {};
(atual.paineis.pipeline || []).forEach(p => { publicadas[p.id] = p; });

const modelo = publicadas.a13;
if (!modelo) throw new Error("o entrada.json nao tem a a13, que e o modelo das etapas");
const etapasNovas = (id) => modelo.subs.map(s => Object.assign({}, s, {id: s.id.replace(/^a13/, id)}));

const pipeline = [];
SEMENTE.forEach(p => {
  const pub = publicadas[p.id];
  if (p.vida === "arquivado") {
    if (pub) pipeline.push(pub);
    return;
  }
  const peca = {id: p.id, t: p.t, n: p.n, mes: p.mes};
  if (pub && pub.slug) peca.slug = pub.slug;
  peca.subs = pub ? pub.subs : etapasNovas(p.id);
  pipeline.push(peca);
});
const naSemente = new Set(SEMENTE.map(p => p.id));
Object.keys(publicadas).forEach(id => {
  if (naSemente.has(id)) return;
  console.warn("aviso: " + id + " esta no entrada.json e nao na semente; fica como esta");
  pipeline.push(publicadas[id]);
});

const nova = Object.assign({}, atual, {
  _gerado_em: geradoEm,
  _escritor: "Cowork, ou scripts/gerar_entrada_esteira.js a partir da semente. Não editar à mão.",
  paineis: Object.assign({}, atual.paineis, {pipeline: pipeline})
});
fs.writeFileSync(saida, JSON.stringify(nova, null, 1) + "\n");
console.log("Estrutura da esteira escrita em " + saida);
pipeline.forEach(p => console.log("  " + p.id + "  " + (p.mes || "    ") + "  " + (p.t || "(so etapas)")));
