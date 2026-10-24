// ─────────────────────────────────────────────────────────────────────────────
// Atualização manual do painel (v0.0.504, pedido Dante 24/10)
// Rota: GET /backend/v1/compass2/atualizar-agora (pública; nginx do Skip bloqueia POST externo)
// O botão "⟳ Atualizar agora" do painel chama esta rota. Ela NÃO roda o publish
// (isso acontece no Maestro, onde os scripts vivem): grava um pedido de
// atualização com timestamp e o Maestro o consome no seu polling horário.
// O Maestro faz polling deste endpoint a cada 60s quando há pedido pendente —
// latência típica do botão: ~1-2 min (vs. até 60 min da rodada automática).
// Nada é escrito no MaxiProd.
// ─────────────────────────────────────────────────────────────────────────────
routerAdd('GET', '/backend/v1/compass2/atualizar-agora', (e) => {
  var out = (function () {
    try {
      var col = $app.findCollectionByNameOrId('atualizar_pedidos')
      var rec = new Record(col)
      rec.set('pedido_em', new Date().toISOString())
      rec.set('origem', 'botao_painel')
      rec.set('atendido_em', '')
      $app.save(rec)
      return { ok: true, message: 'Pedido registrado — o painel sera atualizado em ~1-2 min.' }
    } catch (err) {
      return { ok: false, error: String(err).slice(0, 300) }
    }
  })()
  return e.json(out.ok ? 200 : 500, out)
})

// Leitura pública dos pedidos pendentes — consumida pelo Maestro (polling).
// ?consumir=1 marca os pendentes como atendidos (o Maestro assume o publish).
routerAdd('GET', '/backend/v1/compass2/atualizar-pendentes', (e) => {
  var consumir = String(e.request.url.query.get('consumir') || '') === '1'
  var recs = $app.findRecordsByFilter('atualizar_pedidos', '', '-created', 50, 0)
  var pendentes = []
  for (var i = 0; i < recs.length; i++) {
    var r = recs[i]
    if (r.getString('atendido_em') !== '') continue
    pendentes.push({ pedido_em: r.getString('pedido_em'), origem: r.getString('origem') })
    if (consumir) {
      r.set('atendido_em', new Date().toISOString())
      $app.save(r)
    }
  }
  return e.json(200, { ok: true, pendentes: pendentes, total: pendentes.length })
})
