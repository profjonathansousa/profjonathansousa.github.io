/* Cronograma — service worker (Fase 8).

   ELE EXISTE PARA DUAS COISAS, E NÃO FAZ MAIS NADA: receber o push e abrir o
   app quando você toca no aviso.

   NÃO HÁ addEventListener("fetch") AQUI, E A AUSÊNCIA É O PONTO. Um service
   worker sem ouvinte de fetch não intercepta requisição nenhuma — estado.json,
   entrada.json e api.github.com passam direto, e a sincronização continua
   exatamente como era. O Contas-Casa, de onde vem o padrão de push abaixo, tem
   um fetch com cache; lá é inofensivo porque os dados dele vêm de outra origem.
   Aqui não: estado.json é MESMA ORIGEM, e um cache o pegaria — a página passaria
   a desenhar estado velho e a dobra pareceria não ter chegado. Por isso o cache
   ficou de fora, e com ele o funcionamento offline, que esta fase não promete.

   Não guarde nada em cache aqui sem antes resolver esse problema. */

self.addEventListener('push', function (ev) {
  var d = {};
  try { d = ev.data ? ev.data.json() : {}; }
  catch (e) { d = { corpo: ev.data ? ev.data.text() : '' }; }
  ev.waitUntil(self.registration.showNotification(d.titulo || 'Cronograma', {
    body:  d.corpo || '',
    icon:  './icones/icone-192.png',
    badge: './icones/icone-192.png',
    lang:  'pt-BR',
    /* A `tag` faz o aviso novo SUBSTITUIR o anterior do mesmo assunto, em vez
       de empilhar. Vagas e eventos têm tags diferentes para não se apagarem. */
    tag:   d.tag || 'cronograma',
    renotify: true,
    data:  { url: d.url || './index.html' }
  }));
});

self.addEventListener('notificationclick', function (ev) {
  ev.notification.close();
  var destino = (ev.notification.data && ev.notification.data.url) || './index.html';
  ev.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (abas) {
      for (var i = 0; i < abas.length; i++) {
        if (abas[i].url.indexOf(self.registration.scope) === 0 && 'focus' in abas[i]) {
          return abas[i].focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(new URL(destino, self.location.href).href);
      }
    })
  );
});
