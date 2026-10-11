// rls_public_read.js — AUTO-CURA (restauro 10/10): reafirma as regras a cada boot
// (onBootstrap roda APÓS as migrações — deploy do Skip re-executa migrações e reverte estado).
// - reprogramming_events: leitura PÚBLICA (restauro do card "Programação firme" — Dante 10/10);
// - faturamento_nfs: PÚBLICO de leitura (aba Faturamento ao vivo);
// - andon_hh: PÚBLICO de leitura (aba Andon hora a hora — TV da fábrica sem login; Dante 07/10);
// - ESCRITA continua admin-only (0008/0012) — nada é tocado aqui.
onBootstrap((e) => {
  e.next()
  try {
    const ev = $app.findCollectionByNameOrId('reprogramming_events')
    if (ev.listRule !== '' || ev.viewRule !== '') {
      ev.listRule = ''
      ev.viewRule = ''
      $app.save(ev)
    }
  } catch (_) {}
  try {
    const nfs = $app.findCollectionByNameOrId('faturamento_nfs')
    if (nfs.listRule !== '' || nfs.viewRule !== '') {
      nfs.listRule = ''
      nfs.viewRule = ''
      $app.save(nfs)
    }
  } catch (_) {}
  try {
    const hh = $app.findCollectionByNameOrId('andon_hh')
    if (hh.listRule !== '' || hh.viewRule !== '') {
      hh.listRule = ''
      hh.viewRule = ''
      $app.save(hh)
    }
  } catch (_) {}
})
