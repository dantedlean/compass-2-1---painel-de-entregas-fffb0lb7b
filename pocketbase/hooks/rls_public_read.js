// rls_public_read.js — AUTO-CURA (Dante 06/10, Opção B): o deploy do Skip re-executa
// migrações e o estado das regras pode reverter. Este hook reafirma as regras a cada boot
// (onBootstrap roda APÓS as migrações — onServe não existe no jsvm do Skip):
// - LEITURA da agenda/SMKT (reprogramming_events) exige LOGIN (Opção B — Dante 06/10 15h41);
// - faturamento_nfs continua PÚBLICO de leitura (aba Faturamento ao vivo);
// - ESCRITA continua admin-only (migration 0008) — nada é tocado aqui.
onBootstrap((e) => {
  e.next()
  const R_AUTH = "@request.auth.id != ''"
  try {
    const ev = $app.findCollectionByNameOrId('reprogramming_events')
    if (ev.listRule !== R_AUTH || ev.viewRule !== R_AUTH) {
      ev.listRule = R_AUTH
      ev.viewRule = R_AUTH
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
})
