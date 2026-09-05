/* Testes do notificador (Fase 8). Não tocam a rede e não tocam o repositório.
 *
 *     node scripts/teste_avisos.mjs
 *
 * O `enviar.mjs` separa o que decide do que envia justamente para isto: a
 * decisão é pura e se testa com dado na mão, e o envio recebe o webpush e a api
 * por parâmetro, então dá para provar o tratamento de 404/410 sem servidor.
 */
import * as N from '../avisos/enviar.mjs';
import fs from 'node:fs';
import path from 'node:path';

let falhas = [];
function ok(cond, nome, detalhe) {
  console.log((cond ? '  PASSA  ' : '  FALHA  ') + nome +
    (!cond && detalhe !== undefined ? '  <- ' + JSON.stringify(detalhe) : ''));
  if (!cond) falhas.push(nome);
}
const HOJE = '2026-09-02';
const LOTE = '2026-08-31';
const vaga = (id, veredicto, visto, titulo) => ({ id, veredicto, visto_em: visto, titulo });
const INSCR = [{ id: 'i1', endpoint: 'https://push.exemplo/abc', p256dh: 'p', auth: 'a', falhas: 0 }];

function espiao(resultados) {
  const chamadas = [];
  let n = 0;
  return {
    chamadas,
    webpush: { sendNotification: async () => {
      const r = resultados[n++];
      if (r && r.erro) { const e = new Error(r.msg || 'falhou'); e.statusCode = r.erro; throw e; }
      return {};
    } },
    api: async (caminho, opcoes) => { chamadas.push((opcoes && opcoes.method || 'GET') + ' ' + caminho +
      ' ' + ((opcoes && opcoes.body) || '')); return null; },
    log: () => {},
    seco: false
  };
}

console.log('\n=== 1. Vagas ===');
const semRelevante = { vagas: [vaga('a', 'revisar', LOTE, 'X'), vaga('b', 'rejeitado', LOTE, 'Y')],
                       lote: LOTE, eventos: {} };
ok(N.decidir(semRelevante, { enviados: {} }, HOJE).length === 0,
   '(1) nenhuma vaga relevante nova -> zero notificacoes');

const semVeredicto = { vagas: [vaga('a', undefined, LOTE, 'X'), vaga('b', null, LOTE, 'Y')],
                       lote: LOTE, eventos: {} };
ok(N.decidir(semVeredicto, { enviados: {} }, HOJE).length === 0,
   '(2) veredicto ausente -> zero notificacoes (nunca "notifica tudo")');

const loteNovo = { vagas: [vaga('a', 'relevante', LOTE, 'Chamada A'),
                           vaga('b', 'relevante', LOTE, 'Chamada B'),
                           vaga('c', 'relevante', '2026-01-01', 'Velha')],
                   lote: LOTE, eventos: {} };
const d3 = N.decidir(loteNovo, { enviados: {} }, HOJE);
ok(d3.length === 1, '(3) lote novo com relevantes -> UMA notificacao agregada', d3.length);
ok(/2 vagas relevantes/.test(d3[0].titulo), '    e o titulo agrega as duas', d3[0].titulo);
ok(d3[0].id === 'vagas:' + LOTE, '    com identidade vagas:<data-do-lote>', d3[0].id);
ok(!/Velha/.test(d3[0].corpo), '    e a vaga de outro lote nao entra', d3[0].corpo);

ok(N.decidir(loteNovo, { enviados: { ['vagas:' + LOTE]: HOJE } }, HOJE).length === 0,
   '(4) mesmo lote de novo -> zero');

const muitas = { vagas: Array.from({ length: 9 }, (_, k) => vaga('v' + k, 'relevante', LOTE, 'T' + k)),
                 lote: LOTE, eventos: {} };
const d10 = N.decidir(muitas, { enviados: {} }, HOJE);
ok(d10.length === 1 && /9 vagas relevantes/.test(d10[0].titulo),
   '(10) nove vagas -> UMA notificacao agregada', [d10.length, d10[0] && d10[0].titulo]);

console.log('\n=== 2. Eventos ===');
const EV = {
  dentro:  { data: '2026-09-10', t: 'Prazo do edital', priv: false },
  hoje:    { data: HOJE,         t: 'Entrega',         priv: false },
  fora:    { data: '2026-12-01', t: 'Distante',        priv: false },
  passado: { data: '2026-08-01', t: 'Ja foi',          priv: false },
  privado: { data: '2026-09-05', t: 'Consulta medica', priv: true  },
  morto:   { data: '2026-09-06', t: 'Apagado', priv: false, del: true }
};
const naJanela = N.eventosNaJanela(EV, HOJE);
const ids = naJanela.map((e) => e.id);
ok(ids.indexOf('dentro') > -1 && ids.indexOf('hoje') > -1, '(7) evento dentro da janela entra', ids);
ok(ids.indexOf('fora') < 0 && ids.indexOf('passado') < 0, '(8) fora da janela nao entra', ids);
ok(ids.indexOf('privado') < 0, '(9) priv:true fica de fora');
ok(ids.indexOf('morto') < 0, '    e evento com lapide tambem');
const dEv = N.decidir({ vagas: [], lote: null, eventos: EV }, { enviados: {} }, HOJE);
const textoEv = JSON.stringify(dEv);
ok(!/Consulta medica/.test(textoEv), '(9) o titulo do privado NAO vaza');
ok(!/2026-09-05/.test(textoEv), '    a data do privado tambem nao');
ok(!/privado/.test(textoEv), '    nem a existencia dele');
ok(dEv.length === 1 && /2 datas se aproximando/.test(dEv[0].titulo),
   '(11) dois eventos -> UMA notificacao agregada', dEv[0] && dEv[0].titulo);
ok(dEv[0].ids.length === 2 && dEv[0].ids.every((i) => /^evento:[^:]+:\d{4}-\d{2}-\d{2}$/.test(i)),
   '    com identidade evento:<id>:<data>', dEv[0].ids);
ok(N.decidir({ vagas: [], lote: null, eventos: EV },
   { enviados: { 'evento:dentro:2026-09-10': HOJE, ['evento:hoje:' + HOJE]: HOJE } }, HOJE).length === 0,
   '    e evento ja avisado nao repete');

console.log('\n=== 3. Envio, dedup e endpoints mortos ===');
const dados = { vagas: [vaga('a', 'relevante', LOTE, 'Chamada A')], lote: LOTE, eventos: {} };
const bom = espiao([{}]);
const r1 = await N.rodar(dados, { enviados: {} }, INSCR, HOJE, bom);
ok(r1.entregues === 1 && r1.estado.enviados['vagas:' + LOTE] === HOJE,
   '    envio bem-sucedido grava a identidade', r1.estado.enviados);
ok(bom.chamadas.some((c) => c.startsWith('PATCH') && /ultimo_envio/.test(c)),
   '    e registra o sucesso na inscricao');

const ruim = espiao([{ erro: 500, msg: 'servidor fora' }]);
const r2 = await N.rodar(dados, { enviados: {} }, INSCR, HOJE, ruim);
ok(r2.falhos === 1 && !r2.estado.enviados['vagas:' + LOTE],
   '(5) falha de envio -> identidade NAO gravada', r2.estado.enviados);
ok(ruim.chamadas.some((c) => c.startsWith('PATCH') && /ultimo_erro/.test(c)),
   '(13) outro erro -> registro de falha na inscricao');

const retry = espiao([{}]);
const r3 = await N.rodar(dados, r2.estado, INSCR, HOJE, retry);
ok(r3.entregues === 1 && r3.estado.enviados['vagas:' + LOTE] === HOJE,
   '(6) execucao posterior tenta de novo e agora grava');

for (const codigo of [404, 410]) {
  const morto = espiao([{ erro: codigo }]);
  const rm = await N.rodar(dados, { enviados: {} }, INSCR, HOJE, morto);
  ok(rm.mortos === 1 && morto.chamadas.some((c) => c.startsWith('DELETE /cron_push_inscricao')),
     '(12) endpoint ' + codigo + ' -> inscricao removida', morto.chamadas);
  ok(!rm.estado.enviados['vagas:' + LOTE],
     '     e sem entrega nenhuma a identidade nao e gravada');
}

console.log('\n=== 4. Nenhum segredo no repositorio ===');
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
function versionados(dir, acc = []) {
  for (const n of fs.readdirSync(dir)) {
    if (n === '.git' || n === 'node_modules') continue;
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) versionados(p, acc);
    else if (/\.(js|mjs|json|html|css|yml|sql|md|webmanifest)$/.test(n)) acc.push(p);
  }
  return acc;
}
const arquivos = versionados(RAIZ);
const suspeitos = [];
for (const p of arquivos) {
  const t = fs.readFileSync(p, 'utf8');
  /* endpoints reais dos serviços de push, e a forma de uma chave privada */
  if (/fcm\.googleapis\.com\/fcm\/send\/|web\.push\.apple\.com\/|updates\.push\.services\.mozilla\.com\/|wns\d*\.notify\.windows\.com\//.test(t)) suspeitos.push(p + ' (endpoint de push)');
  if (/BEGIN (RSA |EC )?PRIVATE KEY/.test(t)) suspeitos.push(p + ' (chave privada)');
  /* CREDENCIAL SE RECONHECE PELO CONTEUDO, NAO PELA VIZINHANCA. A versao
     anterior acusava "contem a palavra service_role E contem um JWT", e isso e
     proximidade: a chave publishable/anon tambem e credencial de leitura
     publica, e um comentario em prosa que mencione service_role bastava para
     um falso positivo.

     Agora o payload do JWT e decodificado e o veredicto sai do claim `role`.
     Fica MAIS estrito, e nao menos: pega uma chave service_role em qualquer
     arquivo, com ou sem palavra nenhuma por perto. */
  for (const m of t.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    let carga = null;
    try { carga = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8")); } catch (e) { carga = null; }
    if (carga && carga.role && carga.role !== "anon") suspeitos.push(p + ' (JWT role=' + carga.role + ')');
  }
  /* O modelo atual de chaves do Supabase nao usa JWT: a secreta e um literal
     sb_secret_..., e nenhum decodificador a pegaria. */
  if (/\bsb_secret_[A-Za-z0-9_-]+/.test(t)) suspeitos.push(p + ' (sb_secret)');
}
ok(suspeitos.length === 0, '(14) nenhum endpoint ou credencial em arquivo versionado', suspeitos);
const estadoNot = JSON.parse(fs.readFileSync(path.join(RAIZ, 'scripts', 'estado_notificador.json'), 'utf8'));
ok(Object.keys(estadoNot).join(',') === 'enviados',
   '     estado_notificador.json guarda so `enviados`', Object.keys(estadoNot));
ok(!/endpoint|p256dh|"auth"/.test(JSON.stringify(estadoNot)),
   '     e nenhum endpoint entra nele');

console.log('\n' + '='.repeat(62));
console.log('FALHAS: ' + falhas.length);
falhas.forEach((f) => console.log('  - ' + f));
process.exit(falhas.length ? 1 : 0);
