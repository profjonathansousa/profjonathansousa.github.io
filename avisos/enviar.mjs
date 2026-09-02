/* Cronograma — avisos por Web Push (Fase 8).
   Roda no GitHub Actions, nunca no navegador. Entra com a service_role, que
   ignora a RLS de propósito: é o único papel que pode ler as inscrições.

   DUAS FONTES, E SÓ DUAS: vagas relevantes do lote novo, e eventos públicos
   que entraram na janela. Retomadas ficam de fora porque o servidor não tem o
   progresso dos subitens — quase todo ele é local por aparelho.

   NO MÁXIMO DOIS AVISOS POR EXECUÇÃO, cada um agregando o seu assunto. Nunca
   um por vaga ou por evento: quem recebe um aviso por item aprende a ignorar
   todos.

   Variáveis esperadas:
     SUPABASE_URL, SUPABASE_SERVICE_ROLE,
     VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
   Opcionais:
     HOJE=2026-09-10  força a data (para testar)
     SECO=1           calcula e mostra, mas não envia e não grava nada
*/
import fs from 'node:fs';
import path from 'node:path';

export const JANELA_DIAS = 14;   /* mesmo horizonte da revisão dominical */
export const TTL = 12 * 3600;

/* ---------- datas ---------- */
export function ymd(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
         '-' + String(d.getDate()).padStart(2, '0');
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
export function lerDados(raiz, hojeISO) {
  const j = (p, d) => { try { return JSON.parse(fs.readFileSync(path.join(raiz, p), 'utf8')); } catch (e) { return d; } };
  const vagasArq = j('dados/vagas.json', {});
  const itens = Array.isArray(vagasArq) ? vagasArq : (vagasArq.itens || []);
  let nomes = [];
  try { nomes = fs.readdirSync(path.join(raiz, 'eventos')); } catch (e) { nomes = []; }
  const estadoArq = j('Cronograma/estado.json', {});
  return { vagas: itens, lote: loteMaisRecente(nomes), eventos: estadoArq.eventos || {}, hoje: hojeISO };
}

async function principal() {
  const webpush = (await import('web-push')).default;
  const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const URL_BASE = process.env.SUPABASE_URL, CHAVE = process.env.SUPABASE_SERVICE_ROLE;
  const SECO = process.env.SECO === '1';
  const hojeISO = process.env.HOJE || ymd(new Date());
  if (!URL_BASE || !CHAVE) { console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE.'); process.exit(1); }
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
  const dados = lerDados(RAIZ, hojeISO);
  const inscricoes = await api('/cron_push_inscricao?select=id,endpoint,p256dh,auth,falhas');
  console.log('hoje: ' + hojeISO + ' | lote de vagas: ' + (dados.lote || 'nenhum') +
              ' | aparelhos inscritos: ' + inscricoes.length);
  const r = await rodar(dados, estado, inscricoes, hojeISO,
                        { webpush, api, log: (m) => console.log(m), seco: SECO });
  if (!r.avisos.length) console.log('nada a avisar.');
  if (!SECO) fs.writeFileSync(ARQ_ESTADO, JSON.stringify(r.estado, null, 2) + '\n');
  console.log('avisos: ' + r.avisos.length + ' | entregues: ' + r.entregues +
              ' | mortos removidos: ' + r.mortos + ' | falhas: ' + r.falhos);
  if (r.falhos > 0) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith('enviar.mjs')) await principal();
