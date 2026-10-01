// ─────────────────────────────────────────────────────────────────────────────
// Faturamento MaxiProd → Compass 2.1 (Skip 60434)
// - cronAdd("faturamento_sync", "*/15 * * * *") — a cada 15 min (UTC)
// - rota manual: POST /backend/v1/compass2/faturamento-sync (auth)
// - leitura pública: GET /backend/v1/compass2/faturamento (sem auth)
// Regras idênticas à skill do e-mail matinal (faturamento_diario.py):
//   NFs de SAÍDA EMITIDAS no ano, operação venda/serviço/prestação.
//   Somente leitura no MaxiProd — nada é escrito no ERP.
// NOTA: toda a lógica vive DENTRO de cada callback (scoping do JSVM do goja).
// ─────────────────────────────────────────────────────────────────────────────

// Rota manual (autenticada) — para diagnóstico e primeira carga
routerAdd(
  'POST',
  '/backend/v1/compass2/faturamento-sync',
  (e) => {
    var out = (function () {
      var FAT_CNPJ_POR_APELIDO = {
        DLEAN: '33518000000137',
        'DLEAN FILIAL VINHEDO': '33518000000218',
        SLEAN: '51743790000136',
        DTEKT: '45758498000194',
      }
      var FAT_OPS = ['venda', 'serviço', 'servico', 'prestação']

      function classificarItem(it) {
        var icod = String((it.item || {}).codigo || '')
        var idesc = (
          String((it.item || {}).descricao || '') +
          ' ' +
          String(it.descricao || '')
        ).toLowerCase()
        if (icod === '00043') return 'FRETE'
        var prefs = ['501-', '502-', '503-', '504-', '505-', '506-']
        for (var p = 0; p < prefs.length; p++) {
          if (icod.indexOf(prefs[p]) === 0) return 'FRETE'
        }
        var temPal =
          idesc.indexOf('frete') >= 0 ||
          idesc.indexOf('caminhao') >= 0 ||
          idesc.indexOf('caminhão') >= 0 ||
          idesc.indexOf('vuc') >= 0 ||
          idesc.indexOf('carreta') >= 0 ||
          idesc.indexOf('toco') >= 0 ||
          idesc.indexOf('truck') >= 0
        var temProd =
          idesc.indexOf('carrinho') >= 0 ||
          idesc.indexOf('cart') >= 0 ||
          idesc.indexOf('carro') >= 0
        if (temPal && !temProd) return 'FRETE'
        if (
          idesc.indexOf('servi') >= 0 ||
          idesc.indexOf('presta') >= 0 ||
          String(it.tipo || '') === 'SERVICO'
        )
          return 'SERV'
        return 'PROD'
      }

      var state = $app.findRecordById('faturamento_sync_state', 'fatsyncstate001')
      state.set('last_sync_at', new Date().toISOString())
      state.set('last_status', 'running')
      state.set('last_error', '')
      $app.save(state)
      try {
        var token = $secrets.get('MAXIPROD_TOKEN') || ''
        if (!token) throw new Error('Secret MAXIPROD_TOKEN não cadastrado neste backend.')
        var brt = new Date(Date.now() - 10800000)
        var ano = brt.getUTCFullYear()
        var gte = ano + '-01-01T00:00:00.000Z'
        var lte = ano + '-12-31T23:59:59.999Z'

        var nfs = []
        var skip = 0
        while (true) {
          var query =
            '{notasFiscais(take:2000,skip:' +
            skip +
            ',where:{emitidaOuRecebida:{eq:NOTA_FISCAL},entradaOuSaida:{eq:SAIDA},estado:{eq:EMITIDA},' +
            'emissaoData:{gte:"' +
            gte +
            '",lte:"' +
            lte +
            '"}})' +
            '{items{numero,valorTotal,emissaoData,freteValor,my:minhaEmpresa{apelido},' +
            'dest:destinatarioOuRemetente{razaoSocial,apelido},' +
            'cid:freteDestinoMunicipio{descricao,uf{sigla}},' +
            'op:operacaoFiscal{descricao},' +
            'itensDaNotaFiscalEmitidaOuRecebida{tipo,quantidade,valorTotal,descricao,item{codigo,descricao}}}}}'
          var res = $http.send({
            url: 'https://api.maxiprod.com.br/graphql/',
            method: 'POST',
            headers: { Authorization: 'basic ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query }),
            timeout: 120,
          })
          if (res.statusCode < 200 || res.statusCode >= 300)
            throw new Error('MaxiProd HTTP ' + String(res.statusCode))
          var payload = res.json || JSON.parse(new TextDecoder().decode(res.body))
          if (payload.errors && payload.errors.length)
            throw new Error('MaxiProd GraphQL erro: ' + String(payload.errors[0].message || ''))
          var page =
            (payload.data && payload.data.notasFiscais && payload.data.notasFiscais.items) || []
          for (var i = 0; i < page.length; i++) nfs.push(page[i])
          if (page.length < 2000) break
          skip += 2000
        }

        var limpos = []
        for (var j = 0; j < nfs.length; j++) {
          var n = nfs[j]
          var opDesc = String((n.op || {}).descricao || '')
          var opLow = opDesc.toLowerCase()
          var ehVenda = false
          for (var k = 0; k < FAT_OPS.length; k++) {
            if (opLow.indexOf(FAT_OPS[k]) >= 0) {
              ehVenda = true
              break
            }
          }
          if (opDesc && !ehVenda) continue
          var my = n.my || {}
          var em = String(n.emissaoData || '')
          var day = em.slice(0, 10)
          if (!day) continue
          var itens = []
          for (var m = 0; m < (n.itensDaNotaFiscalEmitidaOuRecebida || []).length; m++) {
            var it = n.itensDaNotaFiscalEmitidaOuRecebida[m]
            var item = it.item || {}
            itens.push({
              cod: String(item.codigo || ''),
              desc: String(it.descricao || item.descricao || ''),
              qtd: Number(it.quantidade || 0),
              valor: Math.round(Number(it.valorTotal || 0) * 100) / 100,
              classe: classificarItem(it),
            })
          }
          var dest = n.dest || {}
          var cid = n.cid || {}
          var uf = cid.uf || {}
          var cnpj = FAT_CNPJ_POR_APELIDO[String(my.apelido || '')] || ''
          limpos.push({
            nf_number: String(n.numero || ''),
            company_cnpj: cnpj,
            company_name: String(my.apelido || ''),
            issue_date: day + ' 12:00:00.000Z',
            issue_day: day,
            total_value: Math.round(Number(n.valorTotal || 0) * 100) / 100,
            freight_value: Math.round(Number(n.freteValor || 0) * 100) / 100,
            client_name: String(dest.apelido || dest.razaoSocial || ''),
            city: String(cid.descricao || ''),
            uf: String(uf.sigla || ''),
            fiscal_op: opDesc,
            items: itens,
          })
        }

        var col = $app.findCollectionByNameOrId('faturamento_nfs')
        var existing = $app.findRecordsByFilter('faturamento_nfs', '', '', 10000, 0)
        var byKey = {}
        for (var a = 0; a < existing.length; a++) {
          var r = existing[a]
          byKey[r.getString('company_cnpj') + '|' + r.getString('nf_number')] = r
        }
        var created = 0
        var updated = 0
        var seen = {}
        for (var b = 0; b < limpos.length; b++) {
          var nf = limpos[b]
          var key = nf.company_cnpj + '|' + nf.nf_number
          seen[key] = true
          var rec = byKey[key]
          if (!rec) {
            rec = new Record(col)
            created++
          } else {
            updated++
          }
          rec.set('nf_number', nf.nf_number)
          rec.set('company_cnpj', nf.company_cnpj)
          rec.set('company_name', nf.company_name)
          rec.set('issue_date', nf.issue_date)
          rec.set('issue_day', nf.issue_day)
          rec.set('total_value', nf.total_value)
          rec.set('freight_value', nf.freight_value)
          rec.set('client_name', nf.client_name)
          rec.set('city', nf.city)
          rec.set('uf', nf.uf)
          rec.set('fiscal_op', nf.fiscal_op)
          rec.set('items', nf.items)
          $app.save(rec)
        }
        var removed = 0
        for (var c = 0; c < existing.length; c++) {
          var r2 = existing[c]
          var k2 = r2.getString('company_cnpj') + '|' + r2.getString('nf_number')
          if (!seen[k2]) {
            $app.delete(r2)
            removed++
          }
        }

        state.set('last_status', 'succeeded')
        state.set('finished_at', new Date().toISOString())
        state.set('nfs_count', limpos.length)
        state.set('last_error', '')
        $app.save(state)
        $app.logger().info('faturamento sync ok (manual)', 'nfs', limpos.length)
        return {
          ok: true,
          nfs: limpos.length,
          created: created,
          updated: updated,
          removed: removed,
        }
      } catch (err) {
        state.set('last_status', 'failed')
        state.set('finished_at', new Date().toISOString())
        state.set('last_error', String(err).slice(0, 1900))
        $app.save(state)
        $app.logger().error('faturamento sync falhou (manual)', 'error', String(err))
        return { ok: false, error: String(err) }
      }
    })()
    return e.json(out.ok ? 200 : 500, out)
  },
  $apis.requireAuth(),
)

// Leitura pública (sem auth) — consumida pelo Andon e pelo app
routerAdd('GET', '/backend/v1/compass2/faturamento', (e) => {
  var state = $app.findRecordById('faturamento_sync_state', 'fatsyncstate001')
  var recs = $app.findRecordsByFilter('faturamento_nfs', '', '-issue_date', 10000, 0)
  var nfs = []
  for (var i = 0; i < recs.length; i++) {
    var r = recs[i]
    nfs.push({
      nf: r.getString('nf_number'),
      data: r.getString('issue_day'),
      emp: r.getString('company_name'),
      cliente: r.getString('client_name'),
      cidade: r.getString('city'),
      uf: r.getString('uf'),
      op: r.getString('fiscal_op'),
      valor: r.getFloat('total_value'),
      frete: r.getFloat('freight_value'),
      itens: r.get('items') || [],
    })
  }
  return e.json(200, {
    ok: true,
    last_sync_at: state.getString('last_sync_at'),
    finished_at: state.getString('finished_at'),
    status: state.getString('last_status'),
    nfs_count: state.getInt('nfs_count'),
    last_error: state.getString('last_error'),
    nfs: nfs,
  })
})

// Cron a cada 15 minutos (UTC) — atualiza os dados financeiros sozinho
cronAdd('faturamento_sync', '*/15 * * * *', () => {
  var FAT_CNPJ_POR_APELIDO = {
    DLEAN: '33518000000137',
    'DLEAN FILIAL VINHEDO': '33518000000218',
    SLEAN: '51743790000136',
    DTEKT: '45758498000194',
  }
  var FAT_OPS = ['venda', 'serviço', 'servico', 'prestação']

  function classificarItem(it) {
    var icod = String((it.item || {}).codigo || '')
    var idesc = (
      String((it.item || {}).descricao || '') +
      ' ' +
      String(it.descricao || '')
    ).toLowerCase()
    if (icod === '00043') return 'FRETE'
    var prefs = ['501-', '502-', '503-', '504-', '505-', '506-']
    for (var p = 0; p < prefs.length; p++) {
      if (icod.indexOf(prefs[p]) === 0) return 'FRETE'
    }
    var temPal =
      idesc.indexOf('frete') >= 0 ||
      idesc.indexOf('caminhao') >= 0 ||
      idesc.indexOf('caminhão') >= 0 ||
      idesc.indexOf('vuc') >= 0 ||
      idesc.indexOf('carreta') >= 0 ||
      idesc.indexOf('toco') >= 0 ||
      idesc.indexOf('truck') >= 0
    var temProd =
      idesc.indexOf('carrinho') >= 0 || idesc.indexOf('cart') >= 0 || idesc.indexOf('carro') >= 0
    if (temPal && !temProd) return 'FRETE'
    if (
      idesc.indexOf('servi') >= 0 ||
      idesc.indexOf('presta') >= 0 ||
      String(it.tipo || '') === 'SERVICO'
    )
      return 'SERV'
    return 'PROD'
  }

  var state = $app.findRecordById('faturamento_sync_state', 'fatsyncstate001')
  state.set('last_sync_at', new Date().toISOString())
  state.set('last_status', 'running')
  state.set('last_error', '')
  $app.save(state)
  try {
    var token = $secrets.get('MAXIPROD_TOKEN') || ''
    if (!token) throw new Error('Secret MAXIPROD_TOKEN não cadastrado neste backend.')
    var brt = new Date(Date.now() - 10800000)
    var ano = brt.getUTCFullYear()
    var gte = ano + '-01-01T00:00:00.000Z'
    var lte = ano + '-12-31T23:59:59.999Z'

    var nfs = []
    var skip = 0
    while (true) {
      var query =
        '{notasFiscais(take:2000,skip:' +
        skip +
        ',where:{emitidaOuRecebida:{eq:NOTA_FISCAL},entradaOuSaida:{eq:SAIDA},estado:{eq:EMITIDA},' +
        'emissaoData:{gte:"' +
        gte +
        '",lte:"' +
        lte +
        '"}})' +
        '{items{numero,valorTotal,emissaoData,freteValor,my:minhaEmpresa{apelido},' +
        'dest:destinatarioOuRemetente{razaoSocial,apelido},' +
        'cid:freteDestinoMunicipio{descricao,uf{sigla}},' +
        'op:operacaoFiscal{descricao},' +
        'itensDaNotaFiscalEmitidaOuRecebida{tipo,quantidade,valorTotal,descricao,item{codigo,descricao}}}}}'
      var res = $http.send({
        url: 'https://api.maxiprod.com.br/graphql/',
        method: 'POST',
        headers: { Authorization: 'basic ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query }),
        timeout: 120,
      })
      if (res.statusCode < 200 || res.statusCode >= 300)
        throw new Error('MaxiProd HTTP ' + String(res.statusCode))
      var payload = res.json || JSON.parse(new TextDecoder().decode(res.body))
      if (payload.errors && payload.errors.length)
        throw new Error('MaxiProd GraphQL erro: ' + String(payload.errors[0].message || ''))
      var page =
        (payload.data && payload.data.notasFiscais && payload.data.notasFiscais.items) || []
      for (var i = 0; i < page.length; i++) nfs.push(page[i])
      if (page.length < 2000) break
      skip += 2000
    }

    var limpos = []
    for (var j = 0; j < nfs.length; j++) {
      var n = nfs[j]
      var opDesc = String((n.op || {}).descricao || '')
      var opLow = opDesc.toLowerCase()
      var ehVenda = false
      for (var k = 0; k < FAT_OPS.length; k++) {
        if (opLow.indexOf(FAT_OPS[k]) >= 0) {
          ehVenda = true
          break
        }
      }
      if (opDesc && !ehVenda) continue
      var my = n.my || {}
      var em = String(n.emissaoData || '')
      var day = em.slice(0, 10)
      if (!day) continue
      var itens = []
      for (var m = 0; m < (n.itensDaNotaFiscalEmitidaOuRecebida || []).length; m++) {
        var it = n.itensDaNotaFiscalEmitidaOuRecebida[m]
        var item = it.item || {}
        itens.push({
          cod: String(item.codigo || ''),
          desc: String(it.descricao || item.descricao || ''),
          qtd: Number(it.quantidade || 0),
          valor: Math.round(Number(it.valorTotal || 0) * 100) / 100,
          classe: classificarItem(it),
        })
      }
      var dest = n.dest || {}
      var cid = n.cid || {}
      var uf = cid.uf || {}
      var cnpj = FAT_CNPJ_POR_APELIDO[String(my.apelido || '')] || ''
      limpos.push({
        nf_number: String(n.numero || ''),
        company_cnpj: cnpj,
        company_name: String(my.apelido || ''),
        issue_date: day + ' 12:00:00.000Z',
        issue_day: day,
        total_value: Math.round(Number(n.valorTotal || 0) * 100) / 100,
        freight_value: Math.round(Number(n.freteValor || 0) * 100) / 100,
        client_name: String(dest.apelido || dest.razaoSocial || ''),
        city: String(cid.descricao || ''),
        uf: String(uf.sigla || ''),
        fiscal_op: opDesc,
        items: itens,
      })
    }

    var col = $app.findCollectionByNameOrId('faturamento_nfs')
    var existing = $app.findRecordsByFilter('faturamento_nfs', '', '', 10000, 0)
    var byKey = {}
    for (var a = 0; a < existing.length; a++) {
      var r = existing[a]
      byKey[r.getString('company_cnpj') + '|' + r.getString('nf_number')] = r
    }
    var created = 0
    var updated = 0
    var seen = {}
    for (var b = 0; b < limpos.length; b++) {
      var nf = limpos[b]
      var key = nf.company_cnpj + '|' + nf.nf_number
      seen[key] = true
      var rec = byKey[key]
      if (!rec) {
        rec = new Record(col)
        created++
      } else {
        updated++
      }
      rec.set('nf_number', nf.nf_number)
      rec.set('company_cnpj', nf.company_cnpj)
      rec.set('company_name', nf.company_name)
      rec.set('issue_date', nf.issue_date)
      rec.set('issue_day', nf.issue_day)
      rec.set('total_value', nf.total_value)
      rec.set('freight_value', nf.freight_value)
      rec.set('client_name', nf.client_name)
      rec.set('city', nf.city)
      rec.set('uf', nf.uf)
      rec.set('fiscal_op', nf.fiscal_op)
      rec.set('items', nf.items)
      $app.save(rec)
    }
    var removed = 0
    for (var c = 0; c < existing.length; c++) {
      var r2 = existing[c]
      var k2 = r2.getString('company_cnpj') + '|' + r2.getString('nf_number')
      if (!seen[k2]) {
        $app.delete(r2)
        removed++
      }
    }

    state.set('last_status', 'succeeded')
    state.set('finished_at', new Date().toISOString())
    state.set('nfs_count', limpos.length)
    state.set('last_error', '')
    $app.save(state)
    $app.logger().info('faturamento sync ok (cron)', 'nfs', limpos.length)
  } catch (err) {
    state.set('last_status', 'failed')
    state.set('finished_at', new Date().toISOString())
    state.set('last_error', String(err).slice(0, 1900))
    $app.save(state)
    $app.logger().error('faturamento sync falhou (cron)', 'error', String(err))
  }
})
