// rls_public_read.js — AUTO-CURA (Dante 06/10): o deploy do Skip re-executa migrações
// e a leitura pública do rascunho/SMKT/NFs pode reverter a "só com login", quebrando o
// modo leitura do Andon (pullPublic). Este hook reafirma as regras a cada boot.
// Escrita NÃO é tocada aqui — continua admin-only (migration 0008).
if (typeof onServe === 'function') {
  onServe((e) => {
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
    e.next()
  })
}
