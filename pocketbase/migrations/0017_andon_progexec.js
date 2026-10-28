// 0017 - Programação firme: sincronização da execução (Exec./Realizada) com o servidor
// Coleção andon_progexec guarda os apontamentos diários de execução da programação firme
// Chave única lógica: (dia, codigo)
// Regras de acesso:
// - Leitura pública (list/view = ''): chão de fábrica e viewers veem o andon sincronizado em qualquer tela
// - Escrita autenticada admin (@request.auth.id != '' && @request.auth.role = 'admin')
migrate(
  (app) => {
    // Idempotência: não recriar se já existir
    try {
      app.findCollectionByNameOrId('andon_progexec')
      return
    } catch (_) {}

    const W_RULE = "@request.auth.id != '' && @request.auth.role = 'admin'"
    const col = new Collection({
      name: 'andon_progexec',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: W_RULE,
      updateRule: W_RULE,
      deleteRule: W_RULE,
      fields: [
        { name: 'dia', type: 'text', required: true, max: 20 },
        { name: 'codigo', type: 'text', required: true, max: 60 },
        { name: 'valor', type: 'number' },
        { name: 'exec_ok', type: 'bool' },
        { name: 'dados', type: 'json', maxSize: 50000 },
        { name: 'revisao', type: 'number' },
        { name: 'atualizado_em', type: 'text', max: 40 },
        { name: 'criado_por', type: 'text', max: 100 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_andon_progexec_dia_cod ON andon_progexec (dia, codigo)',
        'CREATE INDEX idx_andon_progexec_dia ON andon_progexec (dia)',
      ],
    })
    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('andon_progexec')
      app.delete(col)
    } catch (_) {}
  },
)
