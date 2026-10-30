// ===== REDESIGN MONITOR GERAL v3 (painel-monitorv3.js) =====
// Arquivo isolado para apresentação responsiva do Monitor Geral
// Não é sobrescrito por regeneração do Maestro
;(function () {
  'use strict'

  var CSS_MONITOR_V3 = [
    '/* ===== REGRAS RESPONSIVAS MONITOR GERAL v3 ===== */',
    '/* 1. Container e Grid dos Cards */',
    '.hhRgScreen {',
    '  background: #F1F5F9 !important;',
    '  color: #0F172A !important;',
    '  font-family: inherit !important;',
    '  min-height: auto !important;',
    '  max-height: none !important;',
    '  height: auto !important;',
    '  overflow: visible !important;',
    '}',
    '',
    '.hhRgTop {',
    '  display: flex !important;',
    '  align-items: center !important;',
    '  justify-content: space-between !important;',
    '  gap: 16px !important;',
    '  flex-wrap: wrap !important;',
    '  background: #fff !important;',
    '  border: 1px solid #E2E8F0 !important;',
    '  border-radius: 12px !important;',
    '  padding: 12px 18px !important;',
    '  margin-bottom: 14px !important;',
    '}',
    '',
    '.hhRgCards {',
    '  display: grid !important;',
    '  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;',
    '  grid-template-rows: auto !important;',
    '  gap: 14px !important;',
    '  align-items: stretch !important; /* vizinhos da mesma linha acompanham altura */',
    '  height: auto !important;',
    '  max-height: none !important;',
    '  min-height: 0 !important;',
    '  overflow: visible !important;',
    '  padding: 0 !important;',
    '}',
    '',
    '/* Breakpoints da grade ajustados para quadro interno com menu lateral (~320px) */',
    '@media (max-width: 1240px) {',
    '  .hhRgCards {',
    '    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;',
    '  }',
    '}',
    '@media (max-width: 780px) {',
    '  .hhRgCards {',
    '    grid-template-columns: 1fr !important;',
    '  }',
    '}',
    '',
    '/* 2. Card de Célula: altura liberada e contexto de container */',
    '.hhRgCard {',
    '  background: #fff !important;',
    '  border: 1px solid #E2E8F0 !important;',
    '  border-left: 5px solid #16A34A !important;',
    '  border-radius: 12px !important;',
    '  box-shadow: 0 1px 2px rgba(15, 23, 42, .05) !important;',
    '  height: auto !important;',
    '  min-height: auto !important;',
    '  max-height: none !important;',
    '  display: flex !important;',
    '  flex-direction: column !important;',
    '  container-type: inline-size !important;',
    '  container-name: hhcard !important;',
    '  overflow: hidden !important;',
    '}',
    '.hhRgCard.warn { border-left-color: #D97706 !important; }',
    '.hhRgCard.late, .hhRgCard.stop { border-left-color: #DC2626 !important; }',
    '.hhRgCard.wait { border-left-color: #94A3B8 !important; }',
    '',
    '.hhRgHead {',
    '  display: flex !important;',
    '  align-items: center !important;',
    '  justify-content: space-between !important;',
    '  gap: 10px !important;',
    '  padding: 10px 14px !important;',
    '  border-bottom: 1px solid #E2E8F0 !important;',
    '  background: #F8FAFC !important;',
    '  flex-shrink: 0 !important;',
    '}',
    '.hhRgName {',
    '  display: flex !important;',
    '  align-items: center !important;',
    '  gap: 8px !important;',
    '  font-size: clamp(14px, 3cqw, 19px) !important;',
    '  font-weight: 950 !important;',
    '  color: #0F172A !important;',
    '  min-width: 0 !important;',
    '}',
    '.hhRgNum {',
    '  font-size: clamp(8.5px, 1.8cqw, 10.5px) !important;',
    '  font-weight: 900 !important;',
    '  letter-spacing: .06em !important;',
    '  color: #fff !important;',
    '  background: #334155 !important;',
    '  border-radius: 5px !important;',
    '  padding: 3px 6px !important;',
    '  flex-shrink: 0 !important;',
    '}',
    '.hhRgStatus {',
    '  font-size: clamp(9.5px, 2cqw, 12px) !important;',
    '  font-weight: 900 !important;',
    '  letter-spacing: .04em !important;',
    '  text-transform: uppercase !important;',
    '  padding: 4px 9px !important;',
    '  border-radius: 99px !important;',
    '  background: #DCFCE7 !important;',
    '  color: #166534 !important;',
    '  white-space: nowrap !important;',
    '  flex-shrink: 0 !important;',
    '}',
    '.hhRgCard.warn .hhRgStatus { background: #FEF3C7 !important; color: #92400E !important; }',
    '.hhRgCard.late .hhRgStatus, .hhRgCard.stop .hhRgStatus { background: #FEE2E2 !important; color: #991B1B !important; }',
    '.hhRgCard.wait .hhRgStatus { background: #F1F5F9 !important; color: #475569 !important; }',
    '',
    '/* 3. Corpo do Card: proporções fluidas sem larguras mínimas fixas */',
    '.hhRgBody {',
    '  display: grid !important;',
    '  grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.55fr) minmax(0, 1.15fr) !important;',
    '  gap: 12px !important;',
    '  padding: 12px 14px !important;',
    '  align-items: start !important;',
    '  flex: 1 1 auto !important;',
    '  min-width: 0 !important;',
    '}',
    '',
    '.hhRgColLeft, .hhRgChartWrap, .hhRgColRight {',
    '  min-width: 0 !important;',
    '}',
    '.hhRgColLeft {',
    '  display: flex !important;',
    '  flex-direction: column !important;',
    '  gap: 8px !important;',
    '}',
    '',
    '/* 4. Tipografia responsiva das métricas */',
    '.hhRgMetric {',
    '  min-width: 0 !important;',
    '}',
    '.hhRgMetric .lbl {',
    '  font-size: clamp(8.5px, 1.8cqw, 10px) !important;',
    '  font-weight: 950 !important;',
    '  letter-spacing: .08em !important;',
    '  color: #64748B !important;',
    '  text-transform: uppercase !important;',
    '  margin-bottom: 2px !important;',
    '}',
    '.hhRgMetric .val {',
    '  font-size: clamp(16px, 4.2cqw, 24px) !important;',
    '  font-weight: 950 !important;',
    '  color: #0F172A !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '  white-space: nowrap !important;',
    '  line-height: 1.15 !important;',
    '}',
    '.hhRgMetric .val small {',
    '  font-size: clamp(10px, 2.2cqw, 13px) !important;',
    '  color: #64748B !important;',
    '  font-weight: 800 !important;',
    '}',
    '.hhRgMetric .delta {',
    '  font-size: clamp(16px, 4.2cqw, 24px) !important;',
    '  font-weight: 950 !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '  color: #16A34A !important;',
    '  line-height: 1.15 !important;',
    '}',
    '.hhRgMetric .delta.neg { color: #DC2626 !important; }',
    '.hhRgMetric .delta small { font-size: clamp(10px, 2.2cqw, 13px) !important; font-weight: 800 !important; }',
    '.hhRgMetric .hint {',
    '  font-size: clamp(8.5px, 1.8cqw, 11px) !important;',
    '  color: #64748B !important;',
    '  font-weight: 700 !important;',
    '  margin-top: 2px !important;',
    '  line-height: 1.25 !important;',
    '}',
    '.hhRgHora {',
    '  font-size: clamp(13px, 3.2cqw, 20px) !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '}',
    '.hhRgProgress {',
    '  height: 6px !important;',
    '  background: #E2E8F0 !important;',
    '  border-radius: 99px !important;',
    '  overflow: hidden !important;',
    '  margin-top: 4px !important;',
    '}',
    '.hhRgProgress i {',
    '  display: block !important;',
    '  height: 100% !important;',
    '  background: #16A34A !important;',
    '  border-radius: inherit !important;',
    '}',
    '.hhRgCard.warn .hhRgProgress i { background: #D97706 !important; }',
    '.hhRgCard.late .hhRgProgress i, .hhRgCard.stop .hhRgProgress i { background: #DC2626 !important; }',
    '',
    '/* 5. Gráfico de Produção: prioridade garantida sem colapso */',
    '.hhRgChartTitle {',
    '  display: flex !important;',
    '  justify-content: space-between !important;',
    '  gap: 6px !important;',
    '  font-size: clamp(8.5px, 1.8cqw, 10px) !important;',
    '  font-weight: 950 !important;',
    '  letter-spacing: .08em !important;',
    '  color: #64748B !important;',
    '  text-transform: uppercase !important;',
    '  margin-bottom: 6px !important;',
    '}',
    '.hhRgChart {',
    '  display: flex !important;',
    '  align-items: flex-end !important;',
    '  gap: 4px !important;',
    '  height: 114px !important;',
    '  padding-top: 4px !important;',
    '  width: 100% !important;',
    '  min-width: 0 !important;',
    '}',
    '.hhRgBarCol {',
    '  flex: 1 1 0 !important;',
    '  min-width: 0 !important;',
    '  display: flex !important;',
    '  flex-direction: column !important;',
    '  align-items: center !important;',
    '  gap: 3px !important;',
    '}',
    '.hhRgPlot {',
    '  position: relative !important;',
    '  width: 100% !important;',
    '  height: 84px !important;',
    '  background: #F8FAFC !important;',
    '  border-radius: 4px !important;',
    '  overflow: hidden !important;',
    '  border: 1px solid #F1F5F9 !important;',
    '}',
    '.hhRgBar {',
    '  position: absolute !important;',
    '  bottom: 0 !important;',
    '  left: 14% !important;',
    '  width: 72% !important;',
    '  background: #16A34A !important;',
    '  border-radius: 2px 2px 0 0 !important;',
    '  z-index: 1 !important;',
    '}',
    '.hhRgBar.warn { background: #D97706 !important; }',
    '.hhRgBar.late { background: #DC2626 !important; }',
    '.hhRgBar.future { background: #E2E8F0 !important; }',
    '.hhRgTarget {',
    '  position: absolute !important;',
    '  left: 0 !important;',
    '  right: 0 !important;',
    '  border-top: 2px dashed #475569 !important;',
    '  z-index: 2 !important;',
    '}',
    '.hhRgLbl {',
    '  display: block !important;',
    '  width: 100% !important;',
    '  text-align: center !important;',
    '  font-size: clamp(7.5px, 1.6cqw, 9.5px) !important;',
    '  font-weight: 800 !important;',
    '  color: #475569 !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '  white-space: nowrap !important;',
    '  overflow: hidden !important;',
    '  text-overflow: ellipsis !important;',
    '  line-height: 1.2 !important;',
    '}',
    '',
    '/* 6. Produtos do Dia — altura livre sem corte */',
    '.hhRgProdList {',
    '  display: flex !important;',
    '  flex-direction: column !important;',
    '  gap: 4px !important;',
    '  max-height: none !important; /* altura liberada para nada cortar */',
    '  overflow: visible !important;',
    '}',
    '.hhRgProdRow {',
    '  display: flex !important;',
    '  align-items: center !important;',
    '  gap: 5px !important;',
    '  padding: 3px 5px !important;',
    '  border-radius: 6px !important;',
    '  font-size: clamp(9.5px, 2cqw, 11.5px) !important;',
    '  min-height: 22px !important;',
    '}',
    '.hhRgProdRow.running { background: #EFF6FF !important; border: 1px solid #BFDBFE !important; }',
    '.hhRgSt {',
    '  font-size: clamp(7.5px, 1.5cqw, 9px) !important;',
    '  font-weight: 900 !important;',
    '  letter-spacing: .03em !important;',
    '  padding: 2px 4px !important;',
    '  border-radius: 4px !important;',
    '  flex-shrink: 0 !important;',
    '  white-space: nowrap !important;',
    '}',
    '.hhRgSt.pend { background: #FEF3C7 !important; color: #92400E !important; }',
    '.hhRgSt.done { background: #DCFCE7 !important; color: #166534 !important; }',
    '.hhRgSt.run { background: #DBEAFE !important; color: #1E40AF !important; }',
    '.hhRgSt.warn { background: #FEF3C7 !important; color: #92400E !important; }',
    '.hhRgSt.late { background: #FEE2E2 !important; color: #991B1B !important; }',
    '.hhRgProdName {',
    '  font-weight: 800 !important;',
    '  color: #0F172A !important;',
    '  white-space: nowrap !important;',
    '  overflow: hidden !important;',
    '  text-overflow: ellipsis !important;',
    '  flex: 1 1 auto !important;',
    '  min-width: 0 !important;',
    '}',
    '.hhRgBadge {',
    '  font-size: clamp(8px, 1.6cqw, 9.5px) !important;',
    '  font-weight: 800 !important;',
    '  padding: 1px 4px !important;',
    '  border-radius: 4px !important;',
    '  background: #E0E7FF !important;',
    '  color: #3730A3 !important;',
    '  flex-shrink: 0 !important;',
    '}',
    '.hhRgQty {',
    '  margin-left: auto !important;',
    '  font-weight: 900 !important;',
    '  color: #0F172A !important;',
    '  font-variant-numeric: tabular-nums !important;',
    '  flex-shrink: 0 !important;',
    '  font-size: clamp(9px, 1.9cqw, 11px) !important;',
    '}',
    '.hhRgProdEmpty {',
    '  font-size: 11px !important;',
    '  color: #64748B !important;',
    '  padding: 4px 0 !important;',
    '}',
    '',
    '.hhRgFoot {',
    '  display: flex !important;',
    '  justify-content: space-between !important;',
    '  gap: 10px !important;',
    '  padding: 8px 14px !important;',
    '  background: #F8FAFC !important;',
    '  border-top: 1px solid #E2E8F0 !important;',
    '  font-size: clamp(9px, 1.8cqw, 11px) !important;',
    '  font-weight: 800 !important;',
    '  color: #64748B !important;',
    '  flex-shrink: 0 !important;',
    '}',
    '.hhRgTurno { font-variant-numeric: tabular-nums !important; }',
    '',
    '/* 7. Adaptação do Quadro Interno (Container Queries por Card) */',
    '/* Card com espaço médio (<= 620px): Produtos passa para baixo; métricas e gráfico dividem a linha superior */',
    '@container hhcard (max-width: 620px) {',
    '  .hhRgBody {',
    '    grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr) !important;',
    '    gap: 10px !important;',
    '  }',
    '  .hhRgColRight {',
    '    grid-column: 1 / -1 !important;',
    '    border-top: 1px solid #F1F5F9 !important;',
    '    padding-top: 8px !important;',
    '    margin-top: 2px !important;',
    '  }',
    '}',
    '',
    '/* Card estreito (<= 380px): tudo empilhado verticalmente, gráfico sempre visível */',
    '@container hhcard (max-width: 380px) {',
    '  .hhRgBody {',
    '    grid-template-columns: 1fr !important;',
    '    gap: 10px !important;',
    '  }',
    '  .hhRgColRight {',
    '    grid-column: 1 / -1 !important;',
    '    border-top: 1px solid #F1F5F9 !important;',
    '    padding-top: 8px !important;',
    '  }',
    '  .hhRgChart {',
    '    height: 100px !important;',
    '  }',
    '  .hhRgPlot {',
    '    height: 72px !important;',
    '  }',
    '}',
    '',
    '/* 8. MODO TV: neutraliza regras antigas 2x2/100vh e amplia tipografia */',
    '/* Neutraliza travas antigas de altura e grid 2x2 */',
    'body.hhTv #hhMonitorFloor { display: block !important; }',
    'body.hhTv #hhFactoryScreen {',
    '  height: auto !important;',
    '  max-height: none !important;',
    '  min-height: calc(100vh - 24px) !important;',
    '  overflow: visible !important;',
    '}',
    'body.hhTv .hhFactoryScreen {',
    '  height: auto !important;',
    '  max-height: none !important;',
    '  min-height: 0 !important;',
    '  overflow: visible !important;',
    '}',
    'body.hhTv .hhFactoryCards {',
    '  display: none !important; /* grade escura antiga desativada */',
    '}',
    '',
    '/* Regras do Novo Monitor Geral no Modo TV */',
    'body.hhTv .hhRgScreen {',
    '  background: #F1F5F9 !important;',
    '  min-height: calc(100vh - 24px) !important;',
    '  max-height: none !important;',
    '  height: auto !important;',
    '  overflow: visible !important;',
    '  padding: 14px 18px !important;',
    '  box-sizing: border-box !important;',
    '}',
    'body.hhTv .hhRgCards {',
    '  display: grid !important;',
    '  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;',
    '  grid-template-rows: auto !important;',
    '  height: auto !important;',
    '  max-height: none !important;',
    '  min-height: 0 !important;',
    '  overflow: visible !important;',
    '  gap: 16px !important;',
    '  padding: 0 !important;',
    '}',
    'body.hhTv .hhRgCard {',
    '  break-inside: avoid !important;',
    '  height: auto !important;',
    '  max-height: none !important;',
    '  overflow: visible !important;',
    '}',
    '',
    '/* Tipografia ampliada no Modo TV */',
    'body.hhTv .hhRgTop { padding: 14px 20px !important; }',
    'body.hhTv .hhRgTopL .brand { font-size: 13px !important; }',
    'body.hhTv .hhRgTopL .big { font-size: 36px !important; }',
    'body.hhTv .hhRgTopL .big small { font-size: 18px !important; }',
    'body.hhTv .hhRgTopL .sub { font-size: 14px !important; }',
    'body.hhTv .hhRgCount b { font-size: 26px !important; }',
    'body.hhTv .hhRgClock .t { font-size: 26px !important; }',
    'body.hhTv .hhRgHead { padding: 12px 16px !important; }',
    'body.hhTv .hhRgName { font-size: 22px !important; }',
    'body.hhTv .hhRgNum { font-size: 11px !important; padding: 4px 8px !important; }',
    'body.hhTv .hhRgStatus { font-size: 13px !important; padding: 5px 12px !important; }',
    'body.hhTv .hhRgMetric .lbl { font-size: 11px !important; }',
    'body.hhTv .hhRgMetric .val, body.hhTv .hhRgMetric .delta { font-size: 30px !important; }',
    'body.hhTv .hhRgMetric .val small, body.hhTv .hhRgMetric .delta small { font-size: 15px !important; }',
    'body.hhTv .hhRgHora { font-size: 24px !important; }',
    'body.hhTv .hhRgMetric .hint { font-size: 12px !important; }',
    'body.hhTv .hhRgChartTitle { font-size: 11px !important; }',
    'body.hhTv .hhRgChart { height: 138px !important; }',
    'body.hhTv .hhRgPlot { height: 104px !important; }',
    'body.hhTv .hhRgLbl { font-size: 10.5px !important; }',
    'body.hhTv .hhRgProdRow { font-size: 13px !important; min-height: 26px !important; }',
    'body.hhTv .hhRgSt { font-size: 10px !important; }',
    'body.hhTv .hhRgBadge { font-size: 10.5px !important; }',
    'body.hhTv .hhRgQty { font-size: 13px !important; }',
    'body.hhTv .hhRgFoot { font-size: 12px !important; padding: 10px 16px !important; }'
  ].join('\n')

  function injectV3Styles() {
    var existing = document.getElementById('hhMonitorV3Style')
    if (existing) {
      existing.textContent = CSS_MONITOR_V3
      return
    }
    var style = document.createElement('style')
    style.id = 'hhMonitorV3Style'
    style.textContent = CSS_MONITOR_V3
    var target = document.head || document.documentElement
    if (target) {
      target.appendChild(style)
    }
  }

  // Aplica estilos imediatamente
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectV3Styles)
  } else {
    injectV3Styles()
  }
  // Reforço periódico para garantir precedência na cascata
  setInterval(injectV3Styles, 2000)

  // Injeção / Override seguro das funções de renderização do Monitor Geral
  function escH(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  function hhRgSlotLabelV3(slot, completo) {
    function hm(m) {
      m = Number(m) || 0
      var h = Math.floor(m / 60), mi = m % 60
      return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0')
    }
    if (!slot) return '—'
    var ini = hm(slot.start), fim = hm(slot.end)
    if (completo) return ini + ' - ' + fim
    return ini
  }

  function setupV3Renderer() {
    if (typeof window.hhMonV2State !== 'function' || !Array.isArray(window.hhLinhasCfg)) {
      return false
    }

    // hhRgChart com garantia de renderização fluida
    window.hhRgChart = function (c, iso, now, m) {
      if (typeof window.hhMonV2SlotRows !== 'function') return ''
      var rows = window.hhMonV2SlotRows(c, iso, now)
      var peak = 1
      rows.forEach(function (r) { peak = Math.max(peak, r.actual, r.goal) })
      var n = rows.length || 1
      var completo = n <= 14
      var NF = window.NF || { format: function (v) { return Number(v || 0).toLocaleString('pt-BR') } }

      var bars = rows.map(function (r) {
        var realPct = Math.min(100, (r.actual / peak) * 100)
        var targetPct = Math.min(100, (r.goal / peak) * 100)
        var st = r.future
          ? 'future'
          : (r.delta >= -0.5
            ? ''
            : ((r.delta / Math.max(1, r.expected)) >= -0.05 ? 'warn' : 'late'))
        var lbl = (typeof window.hhRgSlotLabel === 'function')
          ? window.hhRgSlotLabel(r.slot, completo)
          : hhRgSlotLabelV3(r.slot, completo)

        return '<div class="hhRgBarCol" title="' + escH(lbl) + ' · meta ' + NF.format(Math.round(r.goal)) + ' · real ' + NF.format(r.actual) + '">' +
          '<div class="hhRgPlot"><i class="hhRgBar ' + st + '" style="height:' + realPct + '%"></i><i class="hhRgTarget" style="bottom:' + targetPct + '%"></i></div>' +
          '<small class="hhRgLbl">' + escH(lbl) + '</small></div>'
      }).join('')

      return '<div class="hhRgChart' + (completo ? '' : ' compacto') + '">' + bars + '</div>'
    }

    // hhRgCellCard com tipografia responsiva e altura expansível
    window.hhRgCellCard = function (c, index, iso, now, stats) {
      var m = stats || window.hhMonV2State(c, iso, now)
      var pr = (typeof window.hhMonV2Products === 'function') ? window.hhMonV2Products(c, iso, now, m) : { all: [], queue: [] }
      var stop = m.stop, cls = stop ? 'stop' : m.state
      var foc = m.focus
      var progress = Math.min(100, m.progress || 0)
      var horaAtual = (typeof window.hhRgSlotLabel === 'function')
        ? window.hhRgSlotLabel(foc, true)
        : hhRgSlotLabelV3(foc, true)
      var NF = window.NF || { format: function (v) { return Number(v || 0).toLocaleString('pt-BR') } }

      var produtosHtml = (typeof window.hhRgProdutosDoDia === 'function')
        ? window.hhRgProdutosDoDia(c, iso, pr, m)
        : ''

      var turnoTxt = ''
      try {
        turnoTxt = window.hhTimeTxt(c.hIni, window.hhScheduleStart(c)) + '–' + window.hhTimeTxt(c.hFim, window.hhScheduleEnd(c))
      } catch (e) {
        turnoTxt = '07:30–17:00'
      }

      return '<article class="hhRgCard ' + cls + '">' +
        '<header class="hhRgHead">' +
          '<div class="hhRgName"><span class="hhRgNum">CÉL ' + String(index + 1).padStart(2, '0') + '</span>' + escH(c.nome) + '</div>' +
          '<span class="hhRgStatus">' + escH(m.label || '') + '</span>' +
        '</header>' +
        '<div class="hhRgBody">' +
          '<div class="hhRgColLeft">' +
            '<div class="hhRgMetric">' +
              '<div class="lbl">Realizado / Meta dia</div>' +
              '<div class="val">' + NF.format(m.actual) + ' <small>/ ' + NF.format(m.goal) + ' pc</small></div>' +
              '<div class="hhRgProgress"><i style="width:' + progress + '%"></i></div>' +
              '<div class="hint">' + m.progress + '% da meta · ' + NF.format(Math.max(0, m.goal - m.actual)) + ' pc faltantes</div>' +
            '</div>' +
            '<div class="hhRgMetric">' +
              '<div class="lbl">Vs. esperado</div>' +
              '<div class="delta ' + (m.delta < 0 ? 'neg' : '') + '">' + (m.delta > 0 ? '+' : '') + NF.format(Math.round(m.delta)) + ' <small>pc</small></div>' +
              '<div class="hint">' + (m.state === 'wait' ? 'esperado agora: ' + NF.format(Math.round(m.expected)) : (m.delta >= 0 ? 'adiantado do plano' : 'abaixo do esperado')) + '</div>' +
            '</div>' +
            '<div class="hhRgMetric">' +
              '<div class="lbl">Hora atual</div>' +
              '<div class="val hhRgHora">' + horaAtual + '</div>' +
              '<div class="hint">Meta hora · ' + NF.format(Math.round(m.slotGoal || 0)) + ' pc · feito ' + NF.format(m.slotActual || 0) + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="hhRgChartWrap">' +
            '<div class="hhRgChartTitle"><span>PRODUÇÃO POR HORA</span><span>meta · tracejada</span></div>' +
            window.hhRgChart(c, iso, now, m) +
          '</div>' +
          '<div class="hhRgColRight">' +
            '<div class="hhRgChartTitle"><span>PRODUTOS DO DIA</span><span>dia todo</span></div>' +
            '<div class="hhRgProdList">' + produtosHtml + '</div>' +
          '</div>' +
        '</div>' +
        '<footer class="hhRgFoot">' +
          '<span>' + (stop ? '⛔ PARADA REGISTRADA' : 'Sem paradas registradas') + ' · ' + NF.format(c.pessoas || 0) + ' oper. · ' + NF.format(c.postos || 0) + ' postos</span>' +
          '<span class="hhRgTurno">' + escH(turnoTxt) + '</span>' +
        '</footer>' +
      '</article>'
    }

    // Sobrescreve hhMonV2Factory431 garantindo o novo formato com .hhRgScreen
    window.hhMonV2Factory431 = function (iso, now) {
      var root = document.getElementById('hhFactoryScreen')
      if (!root) return
      var d = now || new Date()
      var cells = (window.hhLinhasCfg || []).slice()
      var rows = cells.map(function (c) { return { c: c, m: window.hhMonV2State(c, iso, d) } })
      var sums = rows.reduce(function (a, x) {
        a.actual += x.m.actual
        a.goal += x.m.goal
        a.expected += x.m.expected
        a.delta += x.m.delta
        a[x.m.state] = (a[x.m.state] || 0) + 1
        return a
      }, { actual: 0, goal: 0, expected: 0, delta: 0, ahead: 0, steady: 0, warn: 0, late: 0, stop: 0, wait: 0 })

      var NF = window.NF || { format: function (v) { return Number(v || 0).toLocaleString('pt-BR') } }
      var d0 = new Date(String(iso) + 'T12:00:00')
      var mo = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][d0.getMonth()]
      var dateShort = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][d0.getDay()] + ' - ' + String(d0.getDate()).padStart(2, '0') + ' ' + mo + ' ' + d0.getFullYear()
      var pctMeta = sums.goal ? Math.round((sums.actual / sums.goal) * 100) : 0

      var prevD = new Date(String(iso) + 'T12:00:00')
      prevD.setDate(prevD.getDate() - 1)
      var prevIso = prevD.getFullYear() + '-' + String(prevD.getMonth() + 1).padStart(2, '0') + '-' + String(prevD.getDate()).padStart(2, '0')
      var prevRows = (typeof window.hhApontValidos === 'function')
        ? window.hhApontValidos().filter(function (a) { return a.data === prevIso })
        : []
      var compare = 'Comparativo ' + (typeof window.hhMonV2DateLabel === 'function' ? window.hhMonV2DateLabel(prevIso) : prevIso) + ': sem apontamentos cadastrados'
      if (prevRows.length) {
        var prev = prevRows.reduce(function (n, a) { return n + (Number(a.qtd) || 0) }, 0)
        var diff = sums.actual - prev
        compare = 'vs. ' + (typeof window.hhMonV2DateLabel === 'function' ? window.hhMonV2DateLabel(prevIso) : prevIso) + ': ' + (diff > 0 ? '+' : '') + NF.format(diff) + ' pc'
      }

      var cards = rows.length
        ? rows.map(function (x, i) { return window.hhRgCellCard(x.c, i, iso, d, x.m) }).join('')
        : '<div class="hhEmpty">Sem células programadas para esta data.</div>'

      root.innerHTML = '<div class="hhRgScreen">' +
        '<div class="hhRgTop">' +
          '<div class="hhRgTopL">' +
            '<span class="brand">D-LEAN SOLUTIONS · ANDON DE PRODUÇÃO</span>' +
            '<span class="big">' + NF.format(sums.actual) + ' <small>/ ' + NF.format(sums.goal) + ' pc</small></span>' +
            '<span class="sub">' + pctMeta + '% da meta · VS. ESPERADO <b style="color:' + (sums.delta >= 0 ? '#16A34A' : '#DC2626') + '">' + (sums.delta > 0 ? '+' : '') + NF.format(Math.round(sums.delta)) + ' pc</b> · ' + escH(compare) + '</span>' +
          '</div>' +
          '<div class="hhRgTopR">' +
            '<div class="hhRgCount' + (sums.ahead + sums.steady ? '' : ' zero') + '"><i class="hhRgDot"></i><b>' + NF.format(sums.ahead + sums.steady) + '</b>no ritmo</div>' +
            '<div class="hhRgCount' + (sums.warn ? '' : ' zero') + '"><i class="hhRgDot warn"></i><b>' + NF.format(sums.warn || 0) + '</b>atenção</div>' +
            '<div class="hhRgCount' + (sums.late + sums.stop ? '' : ' zero') + '"><i class="hhRgDot late"></i><b>' + NF.format((sums.late || 0) + (sums.stop || 0)) + '</b>atrasadas/paradas</div>' +
            '<div class="hhRgClock"><span class="t">' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + '</span><span class="d">' + dateShort + '</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="hhRgCards">' + cards + '</div>' +
      '</div>'
    }

    return true
  }

  // Tenta conectar o renderer imediatamente e em intervalos
  if (!setupV3Renderer()) {
    var timer = setInterval(function () {
      if (setupV3Renderer()) {
        clearInterval(timer)
        try {
          if (typeof window.hhRender === 'function') window.hhRender()
        } catch (e) {}
      }
    }, 250)
  }
})()
