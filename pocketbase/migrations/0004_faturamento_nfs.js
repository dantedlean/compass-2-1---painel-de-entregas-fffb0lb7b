migrate(
  (app) => {
    const faturamentoNfs = new Collection({
      name: 'faturamento_nfs',
      type: 'base',
      listRule: '',
      viewRule: '',
      fields: [
        { name: 'nf_number', type: 'text', required: true, max: 20 },
        { name: 'company_cnpj', type: 'text', required: true, max: 20 },
        { name: 'company_name', type: 'text', max: 60 },
        { name: 'issue_date', type: 'date', required: true },
        { name: 'issue_day', type: 'text', required: true, max: 10 },
        { name: 'total_value', type: 'number', min: 0 },
        { name: 'freight_value', type: 'number', min: 0 },
        { name: 'client_name', type: 'text', max: 240 },
        { name: 'city', type: 'text', max: 120 },
        { name: 'uf', type: 'text', max: 4 },
        { name: 'fiscal_op', type: 'text', max: 200 },
        { name: 'items', type: 'json', maxSize: 300000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_fat_nfs_company_number ON faturamento_nfs (company_cnpj, nf_number)',
        'CREATE INDEX idx_fat_nfs_issue ON faturamento_nfs (issue_date)',
        'CREATE INDEX idx_fat_nfs_day ON faturamento_nfs (issue_day)',
      ],
    })
    app.save(faturamentoNfs)

    const syncState = new Collection({
      name: 'faturamento_sync_state',
      type: 'base',
      listRule: '',
      viewRule: '',
      fields: [
        { name: 'last_sync_at', type: 'date' },
        { name: 'finished_at', type: 'date' },
        {
          name: 'last_status',
          type: 'select',
          required: true,
          values: ['running', 'succeeded', 'failed'],
          maxSelect: 1,
        },
        { name: 'nfs_count', type: 'number', min: 0, onlyInt: true },
        { name: 'last_error', type: 'text', max: 2000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    })
    app.save(syncState)

    const state = new Record(syncState)
    state.set('id', 'fatsyncstate001')
    state.set('last_status', 'running')
    app.save(state)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('faturamento_sync_state'))
    app.delete(app.findCollectionByNameOrId('faturamento_nfs'))
  },
)
