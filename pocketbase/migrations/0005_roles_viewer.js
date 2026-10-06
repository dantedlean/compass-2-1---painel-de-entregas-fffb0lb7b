migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    if (!users.fields.getByName('role')) {
      users.fields.add(new SelectField({ name: 'role', values: ['admin', 'viewer'], maxSelect: 1 }))
      app.save(users)
    }

    // admin: quem pode conectar e gravar (Dante + PCP)
    const mkAdmin = (email, nome) => {
      let rec
      try {
        rec = app.findAuthRecordByEmail('_pb_users_auth_', email)
      } catch (_) {}
      if (!rec) return
      rec.set('role', 'admin')
      if (nome) rec.set('name', nome)
      app.save(rec)
    }
    mkAdmin('dante@dlean.com.br', 'Dante')
    mkAdmin('pcp@dlean.com.br', 'PCP')

    // viewer: somente visualização — o Andon NÃO guarda o token desses usuários
    const mkViewer = (email, nome) => {
      let rec
      try {
        rec = app.findAuthRecordByEmail('_pb_users_auth_', email)
      } catch (_) {}
      if (rec) {
        // idempotente: garante role/nome
        rec.set('role', 'viewer')
        rec.set('name', nome)
        app.save(rec)
        return
      }
      rec = new Record(users)
      rec.setEmail(email)
      rec.setPassword('Dlean@2026')
      rec.setVerified(true)
      rec.set('emailVisibility', true)
      rec.set('name', nome)
      rec.set('role', 'viewer')
      app.save(rec)
    }
    mkViewer('gestao.vinhedo@dlean.com.br', 'Gestão Vinhedo')
    mkViewer('erick@dlean.com.br', 'Erick')
    mkViewer('projetos@dlean.com.br', 'Projetos')
  },
  (app) => {
    const emails = ['gestao.vinhedo@dlean.com.br', 'erick@dlean.com.br', 'projetos@dlean.com.br']
    emails.forEach(function (e) {
      try {
        app.delete(app.findAuthRecordByEmail('_pb_users_auth_', e))
      } catch (_) {}
    })
    const col = app.findCollectionByNameOrId('_pb_users_auth_')
    try {
      col.fields.removeByName('role')
    } catch (_) {}
    app.save(col)
  },
)
