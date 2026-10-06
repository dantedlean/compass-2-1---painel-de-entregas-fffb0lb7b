migrate(
  (app) => {
    // RLS: somente-visualização NÃO escreve (regra Dante 06/10).
    // Escrita (create/update/delete) só para usuários NÃO-viewer; leitura liberada
    // para qualquer usuário autenticado (viewer vê todas as abas com dados ao vivo).
    const W_RULE = "@request.auth.id != '' && @request.auth.role != 'viewer'"
    const R_RULE = "@request.auth.id != ''"
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.createRule = W_RULE
    ev.updateRule = W_RULE
    ev.deleteRule = W_RULE
    ev.listRule = R_RULE
    ev.viewRule = R_RULE
    app.save(ev)
    const nfs = app.findCollectionByNameOrId('faturamento_nfs')
    nfs.createRule = W_RULE
    nfs.updateRule = W_RULE
    nfs.deleteRule = W_RULE
    app.save(nfs)
  },
  (app) => {
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.createRule = "@request.auth.id != ''"
    ev.updateRule = "@request.auth.id != ''"
    ev.deleteRule = "@request.auth.id != ''"
    app.save(ev)
    const nfs = app.findCollectionByNameOrId('faturamento_nfs')
    nfs.createRule = "@request.auth.id != ''"
    nfs.updateRule = "@request.auth.id != ''"
    nfs.deleteRule = "@request.auth.id != ''"
    app.save(nfs)
  },
)
