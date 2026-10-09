// ─────────────────────────────────────────────────────────────────────────────
// nf_tasks_metrics.js — KPIs "Planejado x Executado" das tasks "Gerar NF" (Dante 08/10)
// Replica o Painel do Portfólio do Compass 1.0 (46983) na aba Faturamento do Andon:
//   - Esta semana / Este mês: NFs geradas / planejadas + % cumprimento + pendentes
//   - Total de projetos com NF (ativos com Gerar NF done)
// MÉTODO (idêntico ao Index.tsx do Compass 1.0):
//   planejado = tasks Gerar NF de projetos ATIVOS com data-alvo no período
//               (due_date da task, fallback end_date do projeto) — BRT
//   executado = tasks done com updated no período (conclusão real do marco)
//   pendentes = não-done com data-alvo no período
//   % = executado ÷ planejado
// Fonte: Compass 1.0 (46983) via API PocketBase interna — auth de serviço (secret COMPASS1_AUTH).
// Somente LEITURA no Compass 1.0 — nada é alterado lá.
// Rota pública GET /backend/v1/compass2/nf-tasks-metrics (sem auth — dados operacionais).
// NOTA: lógica toda DENTRO do callback (scoping goja).
// ─────────────────────────────────────────────────────────────────────────────
routerAdd('GET', '/backend/v1/compass2/nf-tasks-metrics', (e) => {
  var out = (function () {
    try {
      var auth = String($secrets.get('COMPASS1_AUTH') || '')
      if (!auth) throw new Error('Secret COMPASS1_AUTH não configurado')
      var parts = auth.split(':')
      var C1 = 'https://c-project-e75ab.shrd00.internal.goskip.dev/api/collections'

      // 1) login de serviço no Compass 1.0
      var lr = $http.send({
        url: C1 + '/users/auth-with-password',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: parts[0], password: parts[1] }),
        timeout: 30,
      })
      if (lr.statusCode < 200 || lr.statusCode >= 300)
        throw new Error('login Compass1 HTTP ' + String(lr.statusCode))
      var tok = (lr.json || {}).token || ''

      // 2) projetos ativos (status=active && active=true)
      var projs = {}
      var pg = 1
      while (pg < 30) {
        var pr = $http.send({
          url:
            C1 +
            '/projects/records?filter=' +
            encodeURIComponent("(status='active' && active=true)") +
            '&perPage=200&page=' +
            pg,
          method: 'GET',
          headers: { Authorization: tok },
          timeout: 30,
        })
        if (pr.statusCode < 200 || pr.statusCode >= 300) break
        var pj = pr.json || {}
        var items = pj.items || []
        for (var i = 0; i < items.length; i++) projs[items[i].id] = items[i]
        if (items.length < 200) break
        pg++
      }

      // 3) tasks "Gerar NF" (todas; filtro por projeto ativo depois)
      var tasks = []
      pg = 1
      while (pg < 30) {
        var tr = $http.send({
          url:
            C1 +
            '/tasks/records?filter=' +
            encodeURIComponent("(title~'Gerar NF')") +
            '&perPage=200&page=' +
            pg,
          method: 'GET',
          headers: { Authorization: tok },
          timeout: 30,
        })
        if (tr.statusCode < 200 || tr.statusCode >= 300) break
        var tj = tr.json || {}
        var titems = tj.items || []
        for (var j = 0; j < titems.length; j++) tasks.push(titems[j])
        if (titems.length < 200) break
        pg++
      }

      // 4) cálculo — BRT (UTC-3), mesma janela do Compass
      var brt = new Date(Date.now() - 10800000)
      function pad(n) {
        return (n < 10 ? '0' : '') + n
      }
      function toBrtDate(s) {
        if (!s) return ''
        return String(s).slice(0, 10) // datas de task são meia-noite UTC → mesma data em BRT
      }
      var y = brt.getUTCFullYear()
      var mo = brt.getUTCMonth() // 0-11
      var d = brt.getUTCDate()
      var dow = brt.getUTCDay()
      var diffMon = dow === 0 ? 6 : dow - 1
      var wkIni = y + '-' + pad(mo + 1) + '-' + pad(d - diffMon)
      var wkFim = y + '-' + pad(mo + 1) + '-' + pad(d - diffMon + 6)
      var moIni = y + '-' + pad(mo + 1) + '-01'
      var lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()
      var moFim = y + '-' + pad(mo + 1) + '-' + pad(lastDay)

      function alvo(t) {
        if (t.due_date) return toBrtDate(t.due_date)
        var p = projs[t.project]
        if (p && p.end_date) return toBrtDate(p.end_date)
        return ''
      }

      var nf = []
      for (var k = 0; k < tasks.length; k++) {
        var t = tasks[k]
        if (
          t.project &&
          projs[t.project] &&
          String(t.title || '')
            .toLowerCase()
            .indexOf('gerar nf') >= 0
        )
          nf.push(t)
      }
      function inP(x, a, b) {
        return x && x >= a && x <= b
      }
      var execWeek = 0,
        execMonth = 0,
        planWeek = 0,
        planMonth = 0,
        pendWeek = 0,
        pendMonth = 0
      var projWithNf = {}
      for (var m = 0; m < nf.length; m++) {
        var t2 = nf[m]
        var al = alvo(t2)
        var up = toBrtDate(t2.updated)
        var done = t2.status === 'done'
        if (done) projWithNf[t2.project] = true
        if (inP(al, wkIni, wkFim)) {
          planWeek++
          if (!done) pendWeek++
        }
        if (inP(al, moIni, moFim)) {
          planMonth++
          if (!done) pendMonth++
        }
        if (done && inP(up, wkIni, wkFim)) execWeek++
        if (done && inP(up, moIni, moFim)) execMonth++
      }
      function rate(ex, pl) {
        if (pl > 0) return Math.round((100 * ex) / pl)
        return ex > 0 ? 100 : 0
      }
      return {
        ok: true,
        gerado_em: new Date().toISOString(),
        semana: {
          inicio: wkIni,
          fim: wkFim,
          planejadas: planWeek,
          executadas: execWeek,
          pendentes: pendWeek,
          cumprimento: rate(execWeek, planWeek),
        },
        mes: {
          ref: pad(mo + 1) + '/' + y,
          planejadas: planMonth,
          executadas: execMonth,
          pendentes: pendMonth,
          cumprimento: rate(execMonth, planMonth),
        },
        projetos_com_nf: Object.keys(projWithNf).length,
        projetos_ativos: Object.keys(projs).length,
        tasks_nf_ativos: nf.length,
      }
    } catch (err) {
      return { ok: false, error: String(err).slice(0, 500) }
    }
  })()
  return e.json(out.ok ? 200 : 500, out)
})
