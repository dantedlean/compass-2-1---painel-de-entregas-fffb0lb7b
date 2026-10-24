migrate(
  (app) => {
    const pedidos = new Collection({
      name: 'atualizar_pedidos',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: '',
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'pedido_em', type: 'date', required: true },
        { name: 'origem', type: 'text', max: 40 },
        { name: 'atendido_em', type: 'text', max: 40 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      ],
      indexes: ['CREATE INDEX idx_atped_em ON atualizar_pedidos (pedido_em)'],
    })
    app.save(pedidos)
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('atualizar_pedidos'))
  },
)
