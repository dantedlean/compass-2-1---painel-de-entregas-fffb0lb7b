migrate(
  (app) => {
    // RLS modo somente-visualização (Dante 06/10):
    // - LEITURA pública (viewer lê rascunho/SMKT sem token; a carteira já é pública no HTML)
    // - ESCRITA só para usuário autenticado NÃO-viewer (RLS garante: viewer e anônimo não escrevem)
    // - dante@ e pcp@ = admin (podem editar); demais usuários = somente visualização
    const W_RULE = "@request.auth.id != '' && @request.auth.role != 'viewer'"
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.listRule = ''
    ev.viewRule = ''
    ev.createRule = W_RULE
    ev.updateRule = W_RULE
    ev.deleteRule = W_RULE
    app.save(ev)
    const nfs = app.findCollectionByNameOrId('faturamento_nfs')
    nfs.listRule = ''
    nfs.viewRule = ''
    nfs.createRule = W_RULE
    nfs.updateRule = W_RULE
    nfs.deleteRule = W_RULE
    app.save(nfs)
    const emailsAdmin = ['dante@dlean.com.br', 'pcp@dlean.com.br']
    emailsAdmin.forEach(function (em) {
      try {
        const u = app.findAuthRecordByEmail('_pb_users_auth_', em)
        if (u && u.get('role') !== 'admin') {
          u.set('role', 'admin')
          app.save(u)
        }
      } catch (_) {}
    })
  },
  (app) => {
    const ev = app.findCollectionByNameOrId('reprogramming_events')
    ev.listRule = "@request.auth.id != ''"
    ev.viewRule = "@request.auth.id != ''"
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
