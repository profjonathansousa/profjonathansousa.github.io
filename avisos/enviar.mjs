/* Cronograma — avisos por Web Push (Fase 8).
   Roda no GitHub Actions, nunca no navegador. Entra com a chave SECRET, que
   resolve para o papel service_role e ignora a RLS de propósito: é o único que
   pode ler as inscrições.

   DUAS FONTES, E SÓ DUAS: vagas relevantes do lote novo, e eventos públicos
   que entraram na janela. Retomadas ficam de fora porque o servidor não tem o
   progresso dos subitens — quase todo ele é local por aparelho.

   NO MÁXIMO DOIS AVISOS POR EXECUÇÃO, cada um agregando o seu assunto. Nunca
   um por vaga ou por evento: quem recebe um aviso por item aprende a ignorar
   todos.

   Variáveis esperadas:
     SUPABASE_URL, SUPABASE_SECRET_KEY,
     VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
   Opcionais:
     HOJE=2026-09-10  força a data (para testar)
     SECO=1           calcula e mostra, mas não envia e não grava nada
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const JANELA_DIAS = 14;   /* mesmo horizonte da revisão dominical */
export const TTL = 12 * 3600;
/* O FUSO DE QUEM RECEBE, e não o do runner (Fase 9E). O Actions roda em UTC, e
   até aqui isso não errava porque o único disparo era 13:00 UTC = 10:00 em
   Brasília — mesma data dos dois lados. O lembrete da noite quebra isso:
   21:30 em Brasília é 00:30 UTC DO DIA SEGUINTE, e "houve contato hoje?" seria
   perguntado sobre amanhã, cuja resposta é sempre não. Todo dia, para sempre.

   Zona nomeada, e não offset fixo: o Brasil não tem horário de verão desde
   2019, mas apostar nisso é gratuito quando o ICU já sabe a resposta. */
export const TZ = 'America/Sao_Paulo';
export const PODA_DIAS = 30;

/* ---------- datas ---------- */
export function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
}
/* "en-CA" dá AAAA-MM-DD, que é a forma que o resto do repositório usa. */
export function ymdEm(d, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || TZ,
    year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export function horaEm(d, tz) {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz || TZ,
    hour: '2-digit', hour12: false }).format(d));
}
/* Meio-dia UTC: nenhum fuso do mundo empurra o meio-dia para o dia vizinho, e
   assim o dia da semana sai da DATA, e não do instante. */
export function diaDaSemanaISO(iso) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  return isFinite(d.getTime()) ? d.getUTCDay() : NaN;
}
export function menosDias(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
export function diasAte(dataISO, hojeISO) {
  const a = new Date(hojeISO + 'T00:00:00Z').getTime();
  const b = new Date(String(dataISO).slice(0, 10) + 'T00:00:00Z').getTime();
  if (!isFinite(a) || !isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/* ---------- o lote de vagas ----------
   O lote é o arquivo mais recente que a coleta escreveu em eventos/. É ele que
   dá a identidade `vagas:<data>` e é ele que define o que é "novo": item cujo
   `visto_em` é o dia do lote. */
export function loteMaisRecente(nomes) {
  const datas = (nomes || [])
    .map((n) => (n.match(/^vagas_(\d{4}-\d{2}-\d{2})\.json$/) || [])[1])
    .filter(Boolean).sort();
  return datas.length ? datas[datas.length - 1] : null;
}

/* VEREDICTO AUSENTE NÃO É "NOTIFICAR TUDO". O campo só passou a existir com a
   Vagas 2; um dado coletado antes dela não tem veredicto nenhum, e tratar a
   ausência como relevante encheria o telefone de uma vez só. */
export function vagasDoLote(itens, lote) {
  if (!lote) return [];
  return (itens || []).filter((i) =>
    i && i.veredicto === 'relevante' && String(i.visto_em || '').slice(0, 10) === lote);
}

export function montarAvisoVagas(vagas, lote) {
  const n = vagas.length;
  if (n === 0) return null;
  const titulo = n === 1 ? '1 vaga relevante' : n + ' vagas relevantes';
  const nomes = vagas.slice(0, 3).map((v) => v.titulo || v.instituicao || v.id).filter(Boolean);
  const resto = n - nomes.length;
  const corpo = nomes.join(' · ') + (resto > 0 ? ' e mais ' + resto : '');
  return { titulo, corpo, tag: 'vagas', url: './index.html#vagas', id: 'vagas:' + lote };
}

/* ---------- eventos ----------
   EVENTO PRIVADO SAI POR INTEIRO. Não entra na contagem, não empresta a data e
   não vira "1 compromisso" — a existência dele também é informação. Por isso o
   filtro é o primeiro de todos, e não um cuidado na hora de escrever o texto. */
export function eventosNaJanela(eventos, hojeISO, janela) {
  const dias = (typeof janela === 'number') ? janela : JANELA_DIAS;
  const out = [];
  Object.keys(eventos || {}).forEach((eid) => {
    const e = eventos[eid];
    if (!e || e.del) return;
    if (e.priv) return;                       /* privado: fora, sem exceção */
    if (!e.data) return;
    const d = diasAte(e.data, hojeISO);
    if (d === null || d < 0 || d > dias) return;
    out.push({ id: eid, t: e.t || '', data: String(e.data).slice(0, 10), dias: d });
  });
  out.sort((a, b) => (a.dias - b.dias) || (a.id < b.id ? -1 : 1));
  return out;
}

export function montarAvisoEventos(eventos) {
  const n = eventos.length;
  if (n === 0) return null;
  const titulo = n === 1 ? '1 data se aproximando' : n + ' datas se aproximando';
  const corpo = eventos.slice(0, 3).map((e) =>
    (e.t || 'sem título') + ' · ' + (e.dias === 0 ? 'hoje' : e.dias === 1 ? 'amanhã' : 'em ' + e.dias + ' dias')
  ).join(' — ') + (n > 3 ? ' e mais ' + (n - 3) : '');
  return { titulo, corpo, tag: 'eventos', url: './index.html', ids: eventos.map((e) => 'evento:' + e.id + ':' + e.data) };
}

/* ---------- TOEFL: existe contato pendente hoje? (Fase 9E) ----------
   A FASE 8 TRANSPORTA; O TOEFL SÓ DIZ QUANDO. Nada aqui manda notificação:
   este bloco responde uma pergunta, e o mecanismo que já existia decide o
   resto — agregação, dedup, envio, limpeza de endereço morto.

   O PLANO É LIDO DA SUA ÚNICA FONTE, e não copiado para cá. `js/00-config.js`
   é avaliado num contexto isolado e dele saem três coisas: a data de estreia,
   quais dias da semana o plano pede, e o piso do contato. Repetir "o plano vai
   de segunda a sexta" aqui criaria um segundo lugar para essa verdade, e no dia
   em que um mudasse o outro passaria a mentir em silêncio.

   FALHA FECHADA: se o arquivo não puder ser lido ou avaliado, `lerPlano`
   devolve null e nenhum aviso de TOEFL sai. Silêncio é melhor do que cobrar
   sem saber se havia o que cobrar. */
export function lerPlano(raiz) {
  try {
    const src = fs.readFileSync(path.join(raiz, 'Cronograma', 'js', '00-config.js'), 'utf8');
    const ctx = vm.createContext({});
    vm.runInContext(src + '\n;globalThis.__p = {TOEFL_D0, TOEFL_SEMANA, TOEFL_CONTATO_MIN};', ctx);
    const p = ctx.__p;
    if (!p || !p.TOEFL_D0 || !p.TOEFL_SEMANA) return null;
    const dias = Object.keys(p.TOEFL_SEMANA)
      .filter((k) => p.TOEFL_SEMANA[k]).map(Number);
    if (!dias.length) return null;
    return { d0: p.TOEFL_D0, dias, piso: p.TOEFL_CONTATO_MIN || 10 };
  } catch (e) { return null; }
}

/* A FAIXA VEM DA HORA REAL, e não de qual cron disparou. O agendador do GitHub
   entra numa fila e atrasa de dez a sessenta minutos; amarrar o texto ao
   horário previsto faria o lembrete das 21h30 chegar às 22h20 dizendo "bom
   dia". As bordas são largas o bastante para absorver esse atraso. */
export function faixaDoDia(hora) {
  if (hora < 13) return 'manha';
  if (hora < 19) return 'tarde';
  return 'noite';
}

/* O contato é do DIA, e não de um registro: dez minutos de manhã e dez à tarde
   somam um contato cumprido. Lápide não conta. */
export function minutosDoDia(estudo, hojeISO) {
  let soma = 0;
  Object.keys(estudo || {}).forEach((rid) => {
    const r = estudo[rid];
    if (!r || r.del || r.d !== hojeISO) return;
    soma += Number(r.min) || 0;
  });
  return soma;
}
export function contatoPendente(estudo, hojeISO, plano) {
  if (!plano) return false;                        /* falha fechada */
  if (hojeISO < plano.d0) return false;            /* antes da estreia */
  if (plano.dias.indexOf(diaDaSemanaISO(hojeISO)) < 0) return false;  /* descanso */
  return minutosDoDia(estudo, hojeISO) < plano.piso;
}

/* O TEXTO REDUZ A BARREIRA, E NÃO COBRA. A intensidade sobe com o dia, mas o
   que sobe é a lembrança de que o mínimo basta — nunca a culpa. A notificação
   nunca diz "você não estudou"; ela diz o que ainda dá para fazer.

   NÃO NOMEIA A HABILIDADE, por decisão: o Cronograma é que diz qual é a
   atividade quando abre. (O plano está carregado aqui e nomeá-la seria de duas
   linhas, caso um dia se queira.) */
const TOEFL_TEXTO = {
  manha: { titulo: 'TOEFL · contato de hoje',
           corpo: 'Seu contato de inglês de hoje ainda está pendente. 10 minutos já contam.' },
  tarde: { titulo: 'TOEFL · contato de hoje',
           corpo: 'Ainda dá tempo de manter o contato de hoje. Faça 10–15 min.' },
  noite: { titulo: 'TOEFL · contato de hoje',
           corpo: 'Ainda dá para fazer só 10 minutos hoje — e o dia conta.' }
};
export function montarAvisoToefl(faixa, hojeISO) {
  const t = TOEFL_TEXTO[faixa];
  if (!t) return null;
  return { titulo: t.titulo, corpo: t.corpo, tag: 'toefl', url: './index.html',
           id: 'toefl:' + hojeISO + ':' + faixa };
}

/* ---------- a dedup não cresce para sempre (Fase 9E) ----------
   O mapa `enviados` nunca era podado, e com um aviso por dia isso era pequeno.
   Com três já não é: são ~1.100 identidades e ~1.100 commits por ano. Mesma
   razão do podarDispensados() da página — o que existe para ser esquecido não
   pode crescer para sempre.

   PODAR É SEGURO PORQUE NADA RESSUSCITA: um lote de vagas antigo não volta a
   ser "novo" (o novo é sempre o arquivo mais recente), um evento a mais de 30
   dias não está na janela de 14, e um dia de TOEFL passado não é mais hoje. */
export function podar(enviados, hojeISO, dias) {
  const limite = menosDias(hojeISO, dias || PODA_DIAS);
  const out = {};
  Object.keys(enviados || {}).forEach((k) => {
    if (String(enviados[k] || '') >= limite) out[k] = enviados[k];
  });
  return out;
}

/* ---------- o que sobra depois da dedup ---------- */
export function jaEnviado(estado, id) {
  return !!(estado && estado.enviados && estado.enviados[id]);
}
export function decidir(dados, estado, hojeISO) {
  const avisos = [];
  const av = montarAvisoVagas(vagasDoLote(dados.vagas, dados.lote), dados.lote);
  if (av && !jaEnviado(estado, av.id)) avisos.push({ ...av, ids: [av.id] });
  const nosPrazos = eventosNaJanela(dados.eventos, hojeISO).filter(
    (e) => !jaEnviado(estado, 'evento:' + e.id + ':' + e.data));
  const ae = montarAvisoEventos(nosPrazos);
  if (ae) avisos.push(ae);
  /* O TERCEIRO ASSUNTO (Fase 9E). Continua UM aviso por assunto, e nunca um por
     item: a regra de agregação não mudou, só ganhou mais um assunto.

     `dados.faixa` ausente = sem TOEFL. É o que mantém os testes antigos e
     qualquer chamada que não passe hora nenhuma exatamente como eram.

     A DEDUP É POR DIA E POR FAIXA: cumprido o contato, as faixas seguintes nem
     chegam aqui, porque contatoPendente() passa a ser falso. É assim que os
     lembretes cessam sem precisar de um estado "já avisei hoje". */
  if (dados.faixa && contatoPendente(dados.estudo, hojeISO, dados.plano)) {
    const at = montarAvisoToefl(dados.faixa, hojeISO);
    if (at && !jaEnviado(estado, at.id)) avisos.push({ ...at, ids: [at.id] });
  }
  return avisos;
}

/* ---------- envio ----------
   404 e 410 querem dizer "esse aparelho não existe mais": apaga, não insiste.
   Qualquer outro erro fica registrado e a inscrição continua.

   A IDENTIDADE SÓ É GRAVADA SE ALGO CHEGOU. Envio que falhou em todos os
   aparelhos não conta como enviado, e a execução seguinte tenta de novo — é a
   diferença entre "já avisei" e "tentei avisar". */
export async function enviarAviso(aviso, inscricoes, dep) {
  const carga = JSON.stringify({ titulo: aviso.titulo, corpo: aviso.corpo, tag: aviso.tag, url: aviso.url });
  let entregues = 0, mortos = 0, falhos = 0;
  for (const i of inscricoes) {
    const alvo = { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } };
    try {
      await dep.webpush.sendNotification(alvo, carga, { TTL });
      entregues++;
      await dep.api('/cron_push_inscricao?id=eq.' + i.id, { method: 'PATCH',
        body: JSON.stringify({ ultimo_envio: new Date().toISOString(), falhas: 0, ultimo_erro: null }) });
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await dep.api('/cron_push_inscricao?id=eq.' + i.id, { method: 'DELETE' });
        mortos++;
        dep.log('  inscricao morta, removida');
      } else {
        falhos++;
        dep.log('  falhou: ' + (e.statusCode || '') + ' ' + String(e.message || '').slice(0, 120));
        await dep.api('/cron_push_inscricao?id=eq.' + i.id, { method: 'PATCH',
          body: JSON.stringify({ falhas: (i.falhas || 0) + 1,
                                 ultimo_erro: String(e.statusCode || e.message).slice(0, 200) }) });
      }
    }
  }
  return { entregues, mortos, falhos };
}

export async function rodar(dados, estado, inscricoes, hojeISO, dep) {
  const avisos = decidir(dados, estado, hojeISO);
  const novo = { enviados: { ...((estado && estado.enviados) || {}) } };
  let total = { entregues: 0, mortos: 0, falhos: 0 };
  for (const aviso of avisos) {
    dep.log(aviso.titulo + ' — ' + aviso.corpo);
    if (dep.seco) continue;
    const r = await enviarAviso(aviso, inscricoes, dep);
    total = { entregues: total.entregues + r.entregues, mortos: total.mortos + r.mortos,
              falhos: total.falhos + r.falhos };
    if (r.entregues > 0) aviso.ids.forEach((id) => { novo.enviados[id] = hojeISO; });
  }
  return { avisos, estado: novo, ...total };
}

/* ---------- leitura do repositório e execução ---------- */
export function lerDados(raiz, hojeISO, faixa) {
  const j = (p, d) => { try { return JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8')); } catch (e) { return d; } };
  const vagasArq = j('dados/vagas.json', {});
  const itens = Array.isArray(vagasArq) ? vagasArq : (vagasArq.itens || []);
  let nomes = [];
  try { nomes = fs.readdirSync(path.join(raiz, 'eventos')); } catch (e) { nomes = []; }
  const estadoArq = j('Cronograma/estado.json', {});
  return { vagas: itens, lote: loteMaisRecente(nomes), eventos: estadoArq.eventos || {},
           estudo: estadoArq.estudo || {}, plano: lerPlano(raiz), faixa: faixa || null,
           hoje: hojeISO };
}

async function principal() {
  const webpush = (await import('web-push')).default;
  const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const URL_BASE = process.env.SUPABASE_URL, CHAVE = process.env.SUPABASE_SECRET_KEY;
  const SECO = process.env.SECO === '1';
  const agora = new Date();
  /* A DATA É A DE QUEM RECEBE. Ver o comentário do TZ, lá em cima: às 21h30 em
     Brasília o runner já está no dia seguinte. */
  const hojeISO = process.env.HOJE || ymdEm(agora, TZ);
  const faixa = process.env.FAIXA || faixaDoDia(horaEm(agora, TZ));
  if (!URL_BASE || !CHAVE) { console.error('Faltam SUPABASE_URL / SUPABASE_SECRET_KEY.'); process.exit(1); }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:ninguem@exemplo.com',
                          process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const cabecalho = { apikey: CHAVE, Authorization: 'Bearer ' + CHAVE, 'Content-Type': 'application/json' };
  const api = async (caminho, opcoes = {}) => {
    const r = await fetch(URL_BASE + '/rest/v1' + caminho, { ...opcoes, headers: cabecalho });
    if (!r.ok) throw new Error(caminho + ' -> ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return r.status === 204 ? null : r.json();
  };
  const ARQ_ESTADO = path.join(RAIZ, 'scripts', 'estado_notificador.json');
  let estado = { enviados: {} };
  try { estado = JSON.parse(fs.readFileSync(ARQ_ESTADO, 'utf8')); } catch (e) {}
  const dados = lerDados(RAIZ, hojeISO, faixa);
  const inscricoes = await api('/cron_push_inscricao?select=id,endpoint,p256dh,auth,falhas');
  console.log('hoje: ' + hojeISO + ' (' + TZ + ', faixa ' + faixa + ')' +
              ' | lote de vagas: ' + (dados.lote || 'nenhum') +
              ' | plano do TOEFL: ' + (dados.plano ? 'lido' : 'NAO LIDO — sem aviso de TOEFL') +
              ' | aparelhos inscritos: ' + inscricoes.length);
  const r = await rodar(dados, estado, inscricoes, hojeISO,
                        { webpush, api, log: (m) => console.log(m), seco: SECO });
  if (!r.avisos.length) console.log('nada a avisar.');
  if (!SECO) fs.writeFileSync(ARQ_ESTADO,
    JSON.stringify({ enviados: podar(r.estado.enviados, hojeISO) }, null, 2) + '\n');
  console.log('avisos: ' + r.avisos.length + ' | entregues: ' + r.entregues +
              ' | mortos removidos: ' + r.mortos + ' | falhas: ' + r.falhos);
  if (r.falhos > 0) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith('enviar.mjs')) await principal();
