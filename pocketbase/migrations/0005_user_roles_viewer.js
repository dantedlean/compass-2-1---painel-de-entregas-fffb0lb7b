migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('role')) {
      users.fields.add(
        new SelectField({ name: 'role', values: ['admin', 'viewer'], maxSelect: 1 }),
      )
      app.save(users)
    }
    // Dante = admin (pode editar) — idempotente
    try {
      const dante = app.findAuthRecordByEmail('_pb_users_auth_', 'dante@dlean.com.br')
      if (dante && dante.get('role') !== 'admin') {
        dante.set('role', 'admin')
        app.save(dante)
      }
    } catch (_) {}
    // usuário somente-visualização (vê todas as abas, sem editar)
    const email = 'consultas@dlean.com.br'
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', email)
      return
    } catch (_) {}
    const record = new Record(users)
    record.setEmail(email)
    record.setVerified(true)
    record.set('emailVisibility', true)
    record.set('name', 'Consultas (somente visualização)')
    record.setPassword('Dlean@2019')
    record.set('role', 'viewer')
    app.save(record)
  },
  (app) => {
    try {
      app.delete(app.findAuthRecordByEmail('_pb_users_auth_', 'consultas@dlean.com.br'))
    } catch (_) {}
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (users.fields.getByName('role')) {
      users.fields.removeByName('role')
      app.save(users)
    }
  },
)

// v0.0.241 — RLS: somente-visualização NÃO escreve (regra Dante).
// Escrita (create/update/delete) só para usuários NÃO-viewer; leitura segue liberada
// para qualquer usuário autenticado (viewer vê todas as abas com dados ao vivo).
const W_RULE = "@request.auth.id != '' && @request.auth.role != 'viewer'"
const R_RULE = "@request.auth.id != ''"
migrate(
  (app) => {
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
    ev.createRule = R_RULE
    ev.updateRule = R_RULE
    ev.deleteRule = R_RULE
    app.save(ev)
    const nfs = app.findCollectionByNameOrId('faturamento_nfs')
    nfs.createRule = R_RULE
    nfs.updateRule = R_RULE
    nfs.deleteRule = R_RULE
    app.save(nfs)
  },
)
