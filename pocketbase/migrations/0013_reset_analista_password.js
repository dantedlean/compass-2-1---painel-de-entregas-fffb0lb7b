migrate(
  (app) => {
    try {
      const user = app.findAuthRecordByEmail('_pb_users_auth_', 'analista.projetos@painel.local')
      user.setPassword('Dlean@2019')
      user.setVerified(true)
      app.save(user)
    } catch (_) {
      try {
        const userById = app.findFirstRecordByData('_pb_users_auth_', 'id', 'zd8gug4cescxa91')
        userById.setPassword('Dlean@2019')
        userById.setVerified(true)
        app.save(userById)
      } catch (err) {
        console.log('Erro ao resetar senha analista.projetos:', err)
      }
    }
  },
  (app) => {
    // Reversão não altera senha
  },
)
