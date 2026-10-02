import { useEffect, useMemo, useState, type FormEvent } from 'react'
import pb from '@/lib/pocketbase/client'
import {
  createPlanningCycle,
  createPlanningItem,
  createProductionDeclaration,
  listPlanningCycles,
  listPlanningItems,
  listProductionDeclarations,
  listReprogrammingEvents,
  listSmktAllocations,
  listSmktEntradas,
  listSyncRuns,
  listFaturamentoNfs,
  createSmktAllocation,
  createSmktEntrada,
  recordReprogrammingEvent,
  syncMaxiProd,
  type FaturamentoNf,
  type PlanningCycle,
  type PlanningItem,
  type ProductionDeclaration,
  type ReprogrammingEvent,
  type SmktAllocation,
  type SmktEntrada,
  type SyncRun,
} from '@/services/compass2'

const emptyCycle = { name: '', start_date: '', end_date: '', notes: '' }
const emptyDeclaration = {
  production_date: '',
  product_code: '',
  product_name: '',
  quantity: '1',
  notes: '',
}
const emptyItem = {
  external_key: '',
  product_code: '',
  product_name: '',
  pv_number: '',
  client_name: '',
  company_name: '',
  delivery_date: '',
  planned_week: '',
  quantity: '1',
  unit_value: '0',
  notes: '',
}
const emptyEvent = { external_key: '', reason: '', field: 'delivery_date', before: '', after: '' }

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}

// Fretes NÃO são produtos: não aparecem como opção de baixa do Supermercado.
// Mesma regra dos relatórios: 00043, 501-506, palavras de veículo (exceto carrinho/cart/carro).
function isFreightRow(row: PlanningItem) {
  const code = (row.product_code || '').trim()
  const desc = `${row.product_name || ''}`.toLowerCase()
  if (row.is_freight) return true
  if (code === '00043') return true
  if (/^50[1-6]-/.test(code)) return true
  const pal = ['frete', 'caminhao', 'caminhão', 'vuc', 'carreta', 'toco', 'truck']
  const exc = ['carrinho', 'cart', 'carro']
  const hasPal = pal.some((p) => desc.includes(p))
  const hasExc = exc.some((e) => desc.includes(e))
  return hasPal && !hasExc
}

function dateLabel(value?: string) {
  if (!value) return '—'
  const [year, month, day] = value.slice(0, 10).split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function money(value = 0) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// ── Trânsito Curitiba/Vinhedo → cliente (mesma metodologia do Andon) ──
const TRANSITO: Record<string, [number, number]> = {
  GUARAPUAVA: [1, 254],
  MARINGA: [1, 425],
  ITAQUERA: [1, 441],
  MAUA: [1, 445],
  GRU: [1, 429],
  GUARULHOS: [1, 429],
  'NOVO MUNDO': [1, 420],
  'SAO PAULO': [1, 420],
  CACAPAVA: [1, 520],
  'SAO CARLOS': [2, 615],
  JALES: [2, 773],
  BARRETOS: [2, 804],
  'NOVA SANTA RITA': [2, 751],
  'FLORES DA CUNHA': [2, 553],
  ITABORAI: [2, 880],
  GOIANIA: [3, 1282],
  MACAIBA: [4, 3275],
  RECIFE: [4, 3074],
  'JOAO PESSOA': [4, 3188],
  ATIBAIA: [1, 570],
  ESTRELA: [2, 690],
  BRASILIA: [3, 1360],
  SBC: [1, 400],
  SP35: [1, 420],
  ITAPEVA: [1, 470],
  CONTAGEM: [3, 981],
  HIDROLANDIA: [3, 1248],
  CARIACICA: [3, 1348],
}
const TRANSITO_VINHEDO: Record<string, [number, number]> = {
  GUARULHOS: [1, 92],
  SOROCABA: [1, 93],
  SOC: [1, 93],
  'FRANCO DA ROCHA': [1, 464],
  'F DA ROCHA': [1, 464],
  SP09: [1, 464],
  SP22: [1, 92],
  CONTAGEM: [2, 572],
  XMG1: [2, 572],
  CASCAVEL: [3, 905],
  CURITIBA: [1, 458],
  TECUMSEH: [1, 458],
  ITAQUERA: [1, 100],
  'SAO PAULO': [1, 100],
  GRU: [1, 92],
  SP35: [1, 100],
  SBC: [1, 110],
  MAUA: [1, 110],
  'NOVO MUNDO': [1, 100],
  CACAPAVA: [1, 150],
  ATIBAIA: [1, 80],
  ITAPEVA: [1, 120],
}

function normS(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
}

function isoD(d: Date) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  )
}

function addDU(iso: string, n: number) {
  const x = new Date(iso + 'T12:00:00')
  let i = 0
  while (i < n) {
    x.setDate(x.getDate() + 1)
    const w = x.getDay()
    if (w > 0 && w < 6) i++
  }
  return isoD(x)
}

function subDU(iso: string, n: number) {
  const x = new Date(iso + 'T12:00:00')
  let i = 0
  while (i < n) {
    x.setDate(x.getDate() - 1)
    const w = x.getDay()
    if (w > 0 && w < 6) i++
  }
  return isoD(x)
}

function mondayOf(d: Date) {
  const x = new Date(d)
  const w = x.getDay()
  x.setDate(x.getDate() + (w === 0 ? -6 : 1 - w))
  return x
}

function isoMonday(year: number, week: number) {
  const j4 = new Date(Date.UTC(year, 0, 4))
  const dow = j4.getUTCDay() || 7
  const ms = Date.UTC(year, 0, 4 - dow + 1) + (week - 1) * 7 * 86400000
  return new Date(ms).toISOString().slice(0, 10)
}

function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - y.getTime()) / 86400000 + 1) / 7)
}

function brD(iso: string) {
  return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '—'
}

interface TransitoInfo {
  cid: string
  tdu: number
  km: number
  coleta: string
  fim: string
  cheg: string
}

function transitoDe(row: PlanningItem): TransitoInfo | null {
  const origV = /VINHEDO/i.test(row.company_name || '')
  const tab = origV ? TRANSITO_VINHEDO : TRANSITO
  const c = normS(row.client_name || '')
  let cid: string | null = null
  for (const k of Object.keys(tab)) {
    if (c.indexOf(k) >= 0) {
      cid = k
      break
    }
  }
  const ent = (row.delivery_date || '').slice(0, 10)
  if (!ent || ent.length !== 10) return null
  if (!cid) {
    // Cidade fora da tabela (como no Andon): estimativa padrão 2 dias úteis — marcar com ~ e "consultar transportadora"
    const tdu = 2
    const coleta = subDU(ent, tdu)
    const fim = addDU(coleta, 1)
    const cheg = addDU(fim, tdu)
    return { cid: '~', tdu, km: 0, coleta, fim, cheg }
  }
  const [tdu, km] = tab[cid]
  const coleta = subDU(ent, tdu)
  const fim = addDU(coleta, 1)
  const cheg = addDU(fim, tdu)
  return { cid, tdu, km, coleta, fim, cheg }
}

export default function Compass2() {
  const [authenticated, setAuthenticated] = useState(pb.authStore.isValid)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cycles, setCycles] = useState<PlanningCycle[]>([])
  const [cycleId, setCycleId] = useState('')
  const [items, setItems] = useState<PlanningItem[]>([])
  const [declarations, setDeclarations] = useState<ProductionDeclaration[]>([])
  const [events, setEvents] = useState<ReprogrammingEvent[]>([])
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([])
  const [smktAllocs, setSmktAllocs] = useState<SmktAllocation[]>([])
  const [nfs, setNfs] = useState<FaturamentoNf[]>([])
  const [weekTab, setWeekTab] = useState('')
  const [view, setView] = useState<'prog' | 'smkt' | 'fat' | 'gestao'>('prog')
  const [smktForm, setSmktForm] = useState({
    product_code: '',
    pv_number: '',
    quantity: '1',
    nf_number: '',
    notes: '',
  })
  const [smktEntradas, setSmktEntradas] = useState<SmktEntrada[]>([])
  const [smktEntradaOpen, setSmktEntradaOpen] = useState('')
  const [weekProdOpen, setWeekProdOpen] = useState('')
  const [progDay, setProgDay] = useState('')
  const [progDraft, setProgDraft] = useState<
    Array<{
      dia: string
      data: string
      cod: string
      qtd: number
      local: string
      pv: string
      obs: string
      status?: string
    }>
  >([])
  const [progExec, setProgExec] = useState<
    Record<string, { ok: boolean; qtd: number; rl?: string; pvNovo?: string }>
  >({})
  const [addPv, setAddPv] = useState('')
  const [addQtd, setAddQtd] = useState('0')
  const [addLocal, setAddLocal] = useState('C')
  const [addInfo, setAddInfo] = useState('')
  const [undoStack, setUndoStack] = useState<Array<() => void>>([])
  const [clipboard, setClipboard] = useState<{
    cod: string
    qtd: number
    from: string
    cut: boolean
  } | null>(null)
  const [pvDig, setPvDig] = useState('')
  const [weekDayTab, setWeekDayTab] = useState('')
  const [weekDayProdOpen, setWeekDayProdOpen] = useState('')
  const [smktEntradaForm, setSmktEntradaForm] = useState({
    product_code: '',
    product_name: '',
    quantity: '1',
    unit_value: '0',
    data: '',
    notes: '',
  })
  const [pvQuery, setPvQuery] = useState('')
  const [cycleForm, setCycleForm] = useState(emptyCycle)
  const [declarationForm, setDeclarationForm] = useState(emptyDeclaration)
  const [itemForm, setItemForm] = useState(emptyItem)
  const [eventForm, setEventForm] = useState(emptyEvent)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const selectedCycle = cycles.find((cycle) => cycle.id === cycleId)
  const pendingQuantity = useMemo(
    () => items.reduce((total, item) => total + item.quantity - (item.produced_quantity || 0), 0),
    [items],
  )
  const pendingValue = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total +
          Math.max(
            0,
            (item.total_value || 0) - (item.produced_quantity || 0) * (item.unit_value || 0),
          ),
        0,
      ),
    [items],
  )
  const declaredQuantity = declarations.reduce((total, row) => total + row.quantity, 0)

  // ── SMKT — entradas manuais agrupadas por produto ──
  const smktEntradaGroups = useMemo(() => {
    const groups = new Map<
      string,
      {
        code: string
        name: string
        qty: number
        valor: number
        registros: number
        rows: SmktEntrada[]
      }
    >()
    for (const entrada of smktEntradas) {
      const key = entrada.product_code || '—'
      const cur = groups.get(key) || {
        code: key,
        name: entrada.product_name || '',
        qty: 0,
        valor: 0,
        registros: 0,
        rows: [],
      }
      cur.qty += entrada.quantity
      cur.valor += entrada.quantity * (entrada.unit_value || 0)
      cur.registros += 1
      cur.rows.push(entrada)
      groups.set(key, cur)
    }
    return Array.from(groups.values()).sort((a, b) => b.valor - a.valor)
  }, [smktEntradas])

  const smktEntradaTotal = useMemo(
    () => smktEntradaGroups.reduce((sum, g) => sum + g.valor, 0),
    [smktEntradaGroups],
  )

  const hojeIso = useMemo(() => {
    const brt = new Date(Date.now() - 3 * 3600 * 1000)
    return brt.toISOString().slice(0, 10)
  }, [])

  // ── Itens por produto (para PVs alocáveis na batelada) ──
  const itemsByCode = useMemo(() => {
    const map = new Map<string, PlanningItem[]>()
    for (const row of items) {
      if (row.is_freight || isFreightRow(row)) continue
      const key = row.product_code || '—'
      const list = map.get(key) || []
      list.push(row)
      map.set(key, list)
    }
    return map
  }, [items])

  const weekGroups = useMemo(() => {
    const groups = new Map<string, PlanningItem[]>()
    for (const row of items) {
      const key = row.planned_week || '—'
      const list = groups.get(key) || []
      list.push(row)
      groups.set(key, list)
    }
    const order = (week: string) => (week === 'ATRASADO' ? '0' : week)
    return Array.from(groups.entries())
      .sort((a, b) => order(a[0]).localeCompare(order(b[0])))
      .map(([week, rows]) => {
        const total = rows.reduce((sum, row) => sum + (row.total_value || 0), 0)
        const qty = rows.reduce((sum, row) => sum + row.quantity, 0)
        const pvs = new Set(rows.map((row) => `${row.pv_number}|${row.company_name}`)).size
        return { week, rows, total, qty, pvs }
      })
  }, [items])

  // ── Agenda editável (modelo Andon): rascunho → linhas por dia com PVs da carteira ──
  const carteiraByPv = useMemo(() => {
    const map = new Map<string, PlanningItem[]>()
    for (const row of items) {
      if (row.is_freight || isFreightRow(row)) continue
      const key = String(row.pv_number || '').trim()
      if (!key) continue
      const list = map.get(key) || []
      list.push(row)
      map.set(key, list)
    }
    return map
  }, [items])

  const progWeek = useMemo(() => {
    const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
    const avail = new Map<string, number>()
    for (const row of items) {
      const k = `${row.product_code}|${row.pv_number}|${row.company_name}`
      avail.set(k, (avail.get(k) || 0) + row.quantity)
    }
    const fosseis: string[] = []
    const out: Array<{
      dia: string
      data: string
      cod: string
      desc: string
      qtd: number
      pv: string
      cli: string
      emp: string
      vtot: number
      sit: string
      cheg: string
      local: string
    }> = []
    for (const d of progDraft) {
      if (!d.cod || !d.data || !(d.qtd > 0)) continue
      const dt = new Date(d.data + 'T12:00:00')
      const day = DIAS[dt.getDay()]
      const date = d.data.slice(8, 10) + '/' + d.data.slice(5, 7)
      let left = d.qtd
      const cand = items
        .filter((r) => r.product_code === d.cod && (!d.pv || String(r.pv_number) === String(d.pv)))
        .sort((a, b) => (a.delivery_date || '').localeCompare(b.delivery_date || ''))
      if (!cand.length) {
        fosseis.push(
          `${d.cod} ×${d.qtd}${d.pv ? ' · PV ' + d.pv + ' faturado/sem saldo' : ' · código sem saldo na carteira'}`,
        )
        continue
      }
      const prodIso = d.data
      for (const r of cand) {
        const k = `${r.product_code}|${r.pv_number}|${r.company_name}`
        const q = Math.min(left, avail.get(k) || 0)
        if (q <= 0) continue
        let atrasado = r.planned_week === 'ATRASADO'
        let chegTxt: string
        const t = transitoDe(r)
        const tdu =
          d.local === 'V'
            ? (TRANSITO_VINHEDO as Record<string, [number, number]>)
            : (TRANSITO as Record<string, [number, number]>)
        const cid = t && t.cid !== '~' ? t.cid : null
        if (cid) {
          const coleta = addDU(prodIso, 1)
          const cheg = addDU(coleta, tdu[cid][0])
          chegTxt = brD(cheg)
          if (cheg > (r.delivery_date || '')) atrasado = true
        } else if (d.local === 'V') {
          chegTxt = 'Vinhedo · cidade fora da tabela'
        } else {
          chegTxt = 'entrega ' + brD(r.delivery_date || '') + ' · cidade fora da tabela'
        }
        out.push({
          dia: day,
          data: date,
          cod: d.cod,
          desc: r.product_name || '',
          qtd: q,
          pv: String(r.pv_number || ''),
          cli: r.client_name || '',
          emp: r.company_name || '',
          vtot: r.quantity ? ((r.total_value || 0) * q) / r.quantity : 0,
          sit: atrasado ? 'ATRASADO' : 'em dia',
          cheg: chegTxt,
          local: d.local === 'V' ? 'Vinhedo' : 'Curitiba',
        })
        avail.set(k, (avail.get(k) || 0) - q)
        left -= q
      }
      if (left > 0)
        out.push({
          dia: day,
          data: date,
          cod: d.cod,
          desc: d.cod,
          qtd: left,
          pv: d.pv || '—',
          cli: '',
          emp: '',
          vtot: 0,
          sit: 'Sem PV associado',
          cheg: '—',
          local: d.local === 'V' ? 'Vinhedo' : 'Curitiba',
        })
    }
    const dias = [...new Map(out.map((a) => [a.data + '|' + a.dia, a])).keys()].sort()
    return { dias: Array.from(new Set(out.map((a) => a.data))).sort(), out, fosseis }
  }, [progDraft, items])

  const progHoje = useMemo(() => {
    const hjBR = hojeIso.slice(8, 10) + '/' + hojeIso.slice(5, 7)
    const dias = progWeek.out.filter((a) => a.data === hjBR)
    const prog = dias.reduce((s, a) => s + a.qtd, 0)
    const vistos = new Set<string>()
    let done = 0
    for (const a of dias) {
      if (vistos.has(a.cod)) continue
      vistos.add(a.cod)
      const ex = progExec[a.cod + '|' + hjBR]
      done += (ex && ex.qtd) || 0
    }
    const pct = prog > 0 ? Math.round((done / prog) * 100) : done > 0 ? 100 : 0
    return { prog: Math.round(prog), done: Math.round(done), pct }
  }, [progWeek, progExec, hojeIso])

  // ── Batelada por produto nas semanas (agregado, com PVs ao expandir) ──
  const weekBatches = useMemo(() => {
    const groups = new Map<
      string,
      {
        week: string
        rows: Array<{ row: PlanningItem; t: TransitoInfo | null }>
        qty: number
        valor: number
      }
    >()
    for (const row of items) {
      if (row.is_freight || isFreightRow(row)) continue
      const wk = row.planned_week || '—'
      const cur = groups.get(wk) || { week: wk, rows: [], qty: 0, valor: 0 }
      const t = transitoDe(row)
      cur.rows.push({ row, t })
      cur.qty += row.quantity
      cur.valor += row.total_value || 0
      groups.set(wk, cur)
    }
    const order = (w: string) => (w === 'ATRASADO' ? '0' : w)
    return Array.from(groups.values()).sort((a, b) => order(a.week).localeCompare(order(b.week)))
  }, [items])

  // ── Programação diária por semana (metodologia Andon): coleta = entrega − trânsito ──
  const allDayPlans = useMemo(() => {
    const out = new Map<
      string,
      {
        seg: string
        sex: string
        days: string[]
        byDay: Map<
          string,
          Array<{ row: PlanningItem; t: TransitoInfo; early: boolean; late: boolean }>
        >
      }
    >()
    for (const g of weekGroups) {
      let seg: string
      if (g.week === 'ATRASADO') {
        seg = isoD(mondayOf(new Date(hojeIso + 'T12:00:00')))
      } else {
        const m = /^(\d{4})-W(\d{1,2})$/.exec(g.week)
        seg = m
          ? isoMonday(Number(m[1]), Number(m[2]))
          : isoD(mondayOf(new Date(hojeIso + 'T12:00:00')))
      }
      const sex = addDU(seg, 4)
      const byDay = new Map<
        string,
        Array<{ row: PlanningItem; t: TransitoInfo; early: boolean; late: boolean }>
      >()
      for (const row of g.rows) {
        if (row.is_freight || isFreightRow(row)) continue
        const t = transitoDe(row)
        if (!t) continue
        let day = t.coleta
        let early = false
        let late = false
        if (day < seg) {
          day = seg
          early = true
        } else if (day > sex) {
          day = sex
          late = true
        }
        const list = byDay.get(day) || []
        list.push({ row, t, early, late })
        byDay.set(day, list)
      }
      const days = Array.from(byDay.keys()).sort()
      out.set(g.week, { seg, sex, days, byDay })
    }
    return out
  }, [weekGroups, hojeIso])
  const weekDayPlans = useMemo(() => {
    const out: typeof allDayPlans = new Map()
    if (weekTab && allDayPlans.has(weekTab)) out.set(weekTab, allDayPlans.get(weekTab)!)
    return out
  }, [allDayPlans, weekTab])

  // ── Semanas (visão de reagendamento) ──

  // ── Faturamento (NFs emitidas, sync a cada 15 min) ──
  const fatMetrics = useMemo(() => {
    const brt = new Date(Date.now() - 3 * 3600 * 1000)
    const curY = brt.getUTCFullYear()
    const curM = brt.getUTCMonth() + 1
    const mesPrefix = `${curY}-${String(curM).padStart(2, '0')}`
    const mesNfs = nfs.filter((row) => row.issue_day.startsWith(mesPrefix))
    const mesValor = mesNfs.reduce((sum, row) => sum + (row.total_value || 0), 0)
    const anoValor = nfs.reduce((sum, row) => sum + (row.total_value || 0), 0)
    const byDay = new Map<string, { qtd: number; valor: number }>()
    for (const row of mesNfs) {
      const day = row.issue_day
      const cur = byDay.get(day) || { qtd: 0, valor: 0 }
      cur.qtd += 1
      cur.valor += row.total_value || 0
      byDay.set(day, cur)
    }
    const daily = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, v]) => ({ day, ...v }))
    const byMonth = new Map<string, { qtd: number; valor: number }>()
    for (const row of nfs) {
      const mk = row.issue_day.slice(0, 7)
      const cur = byMonth.get(mk) || { qtd: 0, valor: 0 }
      cur.qtd += 1
      cur.valor += row.total_value || 0
      byMonth.set(mk, cur)
    }
    const monthly = Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, v]) => ({ month, ...v }))
    const diasUteis = (ini: string, fim: string) => {
      let n = 0
      const d = new Date(`${ini}T00:00:00Z`)
      const e = new Date(`${fim}T00:00:00Z`)
      while (d <= e) {
        const wd = d.getUTCDay()
        if (wd > 0 && wd < 6) n += 1
        d.setUTCDate(d.getUTCDate() + 1)
      }
      return n
    }
    const hoje = brt.toISOString().slice(0, 10)
    const mesDu = diasUteis(`${mesPrefix}-01`, hoje)
    const anoDu = diasUteis(`${curY}-01-01`, hoje)
    return {
      mesLabel: `${String(curM).padStart(2, '0')}/${curY}`,
      mesQtd: mesNfs.length,
      mesValor,
      anoQtd: nfs.length,
      anoValor,
      daily,
      monthly,
      mediaDiaUtilMes: mesDu ? Math.round(mesValor / mesDu) : 0,
      mediaDiaUtilAno: anoDu ? Math.round(anoValor / anoDu) : 0,
    }
  }, [nfs])

  async function loadAndonDraft(cycleId: string) {
    try {
      const f = `cycle_id = '${cycleId}' && event_type = 'system' && source = 'andon-draft'`
      const rows = await pb.collection('reprogramming_events').getFullList<ReprogrammingEvent>({
        filter: pb.filter(f),
        sort: '-created',
        batch: 200,
      })
      const ev = rows[0]
      const draft = (
        ev?.changes as {
          draft?: Array<{
            cod: string
            data: string
            qtd: number
            local?: string
            pv?: string
            obs?: string
            status?: string
            dia?: string
          }>
        }
      )?.draft
      if (Array.isArray(draft) && draft.length) {
        setProgDraft(
          draft.map((d) => ({
            dia: d.dia || '',
            data: d.data,
            cod: d.cod,
            qtd: Number(d.qtd) || 0,
            local: d.local === 'V' ? 'V' : 'C',
            pv: d.pv || '',
            obs: d.obs || '',
            status: d.status || 'Planejado',
          })),
        )
      }
    } catch (e) {
      console.warn('loadAndonDraft falhou', e)
    }
  }

  async function loadCycle(nextCycleId: string) {
    if (!nextCycleId) {
      setItems([])
      setDeclarations([])
      setEvents([])
      setSyncRuns([])
      setSmktAllocs([])
      setNfs([])
      setSmktEntradas([])
      return
    }
    const [
      nextItems,
      nextDeclarations,
      nextEvents,
      nextSyncRuns,
      nextAllocs,
      nextNfs,
      nextEntradas,
    ] = await Promise.all([
      listPlanningItems(nextCycleId),
      listProductionDeclarations(nextCycleId),
      listReprogrammingEvents(nextCycleId),
      listSyncRuns(nextCycleId),
      listSmktAllocations(nextCycleId),
      listFaturamentoNfs().catch(() => [] as FaturamentoNf[]),
      listSmktEntradas(nextCycleId),
    ])
    setItems(nextItems)
    setDeclarations(nextDeclarations)
    setEvents(nextEvents)
    setSyncRuns(nextSyncRuns)
    setSmktAllocs(nextAllocs)
    setNfs(nextNfs)
    setSmktEntradas(nextEntradas)
    await loadAndonDraft(nextCycleId)
  }

  async function loadWorkspace(preferredCycleId?: string) {
    const nextCycles = await listPlanningCycles()
    setCycles(nextCycles)
    // Default: ciclo operacional aberto mais recente (nao o de homologacao/draft)
    const openCycle = nextCycles
      .filter((cycle) => cycle.status === 'open')
      .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0]
    const nextCycleId = preferredCycleId || cycleId || openCycle?.id || nextCycles[0]?.id || ''
    setCycleId(nextCycleId)
    await loadCycle(nextCycleId)
  }

  useEffect(() => {
    if (pb.authStore.isValid)
      void loadWorkspace().catch((loadError) => setError(errorMessage(loadError)))
  }, [])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await pb.collection('users').authWithPassword(email, password)
      setAuthenticated(true)
      await loadWorkspace()
      setNotice('Backend conectado. Esta tela ainda não escreve no MaxiProd.')
    } catch (loginError) {
      setError(errorMessage(loginError))
    } finally {
      setBusy(false)
    }
  }

  function logout() {
    pb.authStore.clear()
    setAuthenticated(false)
    setCycles([])
    setCycleId('')
    setItems([])
    setDeclarations([])
    setEvents([])
    setSyncRuns([])
    setSmktAllocs([])
    setNfs([])
    setSmktEntradas([])
  }

  async function createCycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const created = await createPlanningCycle(cycleForm)
      setCycleForm(emptyCycle)
      setNotice('Ciclo persistido no backend.')
      await loadWorkspace(created.id)
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }

  async function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cycleId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createPlanningItem({
        cycle_id: cycleId,
        external_key: itemForm.external_key,
        product_code: itemForm.product_code,
        product_name: itemForm.product_name,
        pv_number: itemForm.pv_number,
        client_name: itemForm.client_name,
        company_name: itemForm.company_name,
        delivery_date: itemForm.delivery_date,
        planned_week: itemForm.planned_week,
        quantity: Number(itemForm.quantity),
        unit_value: Number(itemForm.unit_value),
        notes: itemForm.notes,
      })
      setItemForm(emptyItem)
      setNotice('Item de planejamento persistido no ciclo.')
      await loadCycle(cycleId)
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }

  async function createEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cycleId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await recordReprogrammingEvent({
        cycle_id: cycleId,
        event_type: 'scenario',
        occurred_at: new Date().toISOString(),
        reason: eventForm.reason,
        changes: {
          external_key: eventForm.external_key,
          field: eventForm.field,
          before: eventForm.before,
          after: eventForm.after,
        },
        before_snapshot: {
          external_key: eventForm.external_key,
          field: eventForm.field,
          value: eventForm.before,
        },
      })
      setEventForm(emptyEvent)
      setNotice(
        'Reprogramação registrada no histórico auditável. Nenhuma data foi alterada no MaxiProd.',
      )
      await loadCycle(cycleId)
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }

  async function syncCycle() {
    if (!cycleId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await syncMaxiProd(cycleId)
      if (!result.ok) {
        setNotice(result.message || 'Sincronização não executada.')
      } else {
        setNotice(
          `Sincronização somente leitura concluída: ${result.rows_created || 0} novos, ${result.rows_updated || 0} atualizados.`,
        )
      }
      await loadCycle(cycleId)
    } catch (syncError) {
      setError(errorMessage(syncError))
      await loadCycle(cycleId).catch(() => undefined)
    } finally {
      setBusy(false)
    }
  }

  async function createDeclaration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cycleId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createProductionDeclaration({
        cycle_id: cycleId,
        production_date: declarationForm.production_date,
        product_code: declarationForm.product_code,
        product_name: declarationForm.product_name,
        quantity: Number(declarationForm.quantity),
        notes: declarationForm.notes,
      })
      setDeclarationForm(emptyDeclaration)
      setNotice('Produção declarada persistida como cenário operacional.')
      await loadCycle(cycleId)
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setBusy(false)
    }
  }

  async function createAlloc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cycleId) return
    const item = items.find((row) => row.product_code === smktForm.product_code)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createSmktAllocation({
        cycle_id: cycleId,
        product_code: smktForm.product_code,
        product_name: item?.product_name || smktForm.product_code,
        pv_number: smktForm.pv_number,
        client_name: item?.client_name || '',
        quantity: Number(smktForm.quantity),
        nf_number: smktForm.nf_number,
        notes: smktForm.notes,
      })
      setSmktForm({ product_code: '', pv_number: '', quantity: '1', nf_number: '', notes: '' })
      setNotice('Baixa do Supermercado persistida: PV + NF registrados no histórico auditável.')
      await loadCycle(cycleId)
    } catch (allocError) {
      setError(errorMessage(allocError))
    } finally {
      setBusy(false)
    }
  }

  async function createEntrada(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!cycleId) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createSmktEntrada({
        cycle_id: cycleId,
        product_code: smktEntradaForm.product_code,
        product_name: smktEntradaForm.product_name,
        quantity: Number(smktEntradaForm.quantity),
        data: smktEntradaForm.data,
        notes: smktEntradaForm.notes,
      })
      setSmktEntradaForm({
        product_code: '',
        product_name: '',
        quantity: '1',
        unit_value: '0',
        data: '',
        notes: '',
      })
      setNotice('Entrada manual no Supermercado persistida no histórico auditável.')
      await loadCycle(cycleId)
    } catch (entradaError) {
      setError(errorMessage(entradaError))
    } finally {
      setBusy(false)
    }
  }

  // ── Ações da agenda editável (modelo Andon) ──
  function pushUndo(fn: () => void) {
    setUndoStack((s) => [...s.slice(-9), fn])
  }

  function addProgLine() {
    const pv = addPv.trim()
    const rows = carteiraByPv.get(pv)
    if (!rows || !rows.length) {
      setAddInfo(`PV ${pv || '—'} não encontrado na carteira`)
      return
    }
    const q = Number(addQtd) || 0
    if (q <= 0) {
      setAddInfo('Informe a quantidade.')
      return
    }
    const data = progDay || new Date().toISOString().slice(0, 10)
    const cod = rows[0].product_code
    const prev = progDraft
    pushUndo(() => setProgDraft(prev))
    setProgDraft([
      ...progDraft,
      { dia: '', data, cod, qtd: q, local: addLocal, pv, obs: `incluído via PV ${pv}` },
    ])
    setAddInfo(`✔ Incluído em ${brD(data)} — nada gravado no MaxiProd`)
    setAddPv('')
    setAddQtd('0')
  }

  function delProgLine(cod: string, data: string) {
    const prev = progDraft
    pushUndo(() => setProgDraft(prev))
    setProgDraft(progDraft.filter((d) => !(d.cod === cod && d.data === data)))
  }

  function setExec(
    cod: string,
    data: string,
    patch: { ok?: boolean; qtd?: number; rl?: string; pvNovo?: string },
  ) {
    const key = cod + '|' + data
    const prev = progExec
    pushUndo(() => setProgExec(prev))
    setProgExec((m) => {
      const cur = { ...(m[key] || { ok: false, qtd: 0 }), ...patch }
      const next = { ...m }
      if (cur.ok || cur.qtd || cur.rl || cur.pvNovo) next[key] = cur
      else delete next[key]
      return next
    })
  }

  function realocar(cod: string, data: string, qtdTotal: number) {
    const key = cod + '|' + data
    const ex = progExec[key] || { ok: false, qtd: 0 }
    const saldo = qtdTotal - (ex.qtd || 0)
    if (saldo <= 0) {
      setAddInfo('Nada para realocar — qtd realizada cobre o programado.')
      return
    }
    const prox = addDU(data, 1)
    setExec(cod, data, { rl: brD(prox), qtd: qtdTotal })
    setAddInfo(`→ ${brD(prox)} (${saldo} un realocadas)`)
  }

  function trocarPv(cod: string, data: string, novoPv: string) {
    if (!novoPv) return
    const prev = progDraft
    pushUndo(() => setProgDraft(prev))
    setProgDraft(
      progDraft.map((d) =>
        d.cod === cod && d.data === data
          ? { ...d, pv: novoPv, obs: `PV trocado para ${novoPv}` }
          : d,
      ),
    )
  }

  function undoLast() {
    const fn = undoStack[undoStack.length - 1]
    if (!fn) {
      setAddInfo('Nada para desfazer.')
      return
    }
    fn()
    setUndoStack((s) => s.slice(0, -1))
    setAddInfo('↩ Última ação desfeita')
  }

  function copiarLinha(cod: string, data: string, qtd: number) {
    setClipboard({ cod, qtd, from: data, cut: false })
    setAddInfo(`Copiado: ${cod} (${qtd} un) — clique num dia para colar`)
  }

  function recortarLinha(cod: string, data: string, qtd: number) {
    const ex = progExec[cod + '|' + data] || { ok: false, qtd: 0 }
    const saldo = qtd - (ex.qtd || 0)
    if (saldo <= 0) {
      setAddInfo('Nada para recortar — qtd realizada cobre o programado.')
      return
    }
    setClipboard({ cod, qtd: saldo, from: data, cut: true })
    setAddInfo(`Recortado: ${cod} (${saldo} un) — clique num dia para colar`)
  }

  function colarNoDia(data: string) {
    if (!clipboard) {
      setAddInfo('Nada copiado/recortado — use Copiar ou Recortar primeiro.')
      return
    }
    const prev = progDraft
    pushUndo(() => setProgDraft(prev))
    if (clipboard.cut) {
      // mover: reduzir a origem e criar no destino
      const restante = Math.max(0, clipboard.qtd - 0)
      setProgDraft([
        ...progDraft.filter((d) => !(d.cod === clipboard.cod && d.data === clipboard.from)),
        {
          dia: '',
          data,
          cod: clipboard.cod,
          qtd: restante,
          local: addLocal,
          pv: '',
          obs: `movido de ${clipboard.from}`,
        },
      ])
      setAddInfo(`✔ Movido ${clipboard.cod} (${restante} un) para ${brD(data)}`)
    } else {
      setProgDraft([
        ...progDraft,
        {
          dia: '',
          data,
          cod: clipboard.cod,
          qtd: clipboard.qtd,
          local: addLocal,
          pv: '',
          obs: `copiado de ${clipboard.from}`,
        },
      ])
      setAddInfo(`✔ Colado ${clipboard.cod} (${clipboard.qtd} un) em ${brD(data)}`)
    }
    setClipboard(null)
  }

  function editarQtd(cod: string, data: string, novaQtd: number) {
    const prev = progDraft
    pushUndo(() => setProgDraft(prev))
    const linhas = progDraft.filter((d) => d.cod === cod && d.data === data)
    if (!linhas.length) {
      setProgDraft([
        ...progDraft,
        { dia: '', data, cod, qtd: novaQtd, local: addLocal, pv: '', obs: 'qtd editada' },
      ])
      return
    }
    const primeira = linhas[0]
    const resto = linhas.slice(1)
    setProgDraft([
      ...progDraft.filter((d) => !(d.cod === cod && d.data === data)),
      { ...primeira, qtd: novaQtd },
      ...resto,
    ])
  }

  function incluirPvDigitado(cod: string, data: string) {
    const pv = pvDig.trim()
    if (!pv) return
    const rows = carteiraByPv.get(pv)
    if (!rows || !rows.length) {
      setAddInfo(`PV ${pv} não encontrado na carteira`)
      return
    }
    trocarPv(cod, data, pv)
    setPvDig('')
  }

  function removerInvalidas() {
    const cods = new Set(progWeek.fosseis.map((f) => f.split(' ')[0]))
    const prev = progDraft
    pushUndo(() => setProgDraft(prev))
    setProgDraft(progDraft.filter((d) => !cods.has(d.cod)))
    setAddInfo(`${progWeek.fosseis.length} declaração(ões) inválida(s) removida(s)`)
  }

  function baixarProgramacao() {
    const cols = ['Dia', 'Data', 'Codigo', 'Qtd', 'Local', 'PV', 'Observacao']
    const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
    const rows = progDraft.map((d) => {
      const dt = new Date(d.data + 'T12:00:00')
      return [
        DIAS[dt.getDay()],
        d.data,
        d.cod,
        d.qtd,
        d.local === 'V' ? 'V' : 'C',
        d.pv || '',
        d.obs || '',
      ]
    })
    const csv = [cols, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download =
      'DEVOLUTIVA_PROGRAMACAO_' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '.csv'
    a.click()
  }

  if (!authenticated) {
    return (
      <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
        <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">
            Dlean · Compass 2.1
          </p>
          <h1 className="mt-3 text-3xl font-bold">Entrar no workspace</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            O Andon (painel provisório) continua no link original. Esta rota é o workspace
            definitivo de planejamento.
          </p>
          <form className="mt-8 space-y-4" onSubmit={login}>
            <label className="block text-sm text-slate-300">
              E-mail
              <input
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-400"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="block text-sm text-slate-300">
              Senha
              <input
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-3 text-slate-100 outline-none focus:ring-2 focus:ring-cyan-400"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error && (
              <p className="rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
                {error}
              </p>
            )}
            <button
              className="w-full rounded-lg bg-cyan-400 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-60"
              disabled={busy}
              type="submit"
            >
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">
              Dlean · Compass 2.1
            </p>
            <h1 className="mt-1 text-2xl font-bold">Planejamento operacional</h1>
            <p className="mt-1 text-sm text-slate-400">
              Produto · batelada · semana · realizado · exceções
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full border border-emerald-800 bg-emerald-950/50 px-3 py-1 text-xs text-emerald-300 sm:inline-flex">
              ● Backend conectado
            </span>
            <button
              className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
              onClick={logout}
            >
              Sair
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {notice}
          </div>
        )}
        <nav className="flex flex-wrap gap-1 rounded-xl bg-slate-900 p-1 shadow-sm">
          <button
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              view === 'prog' ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
            }}`}
            onClick={() => setView('prog')}
            type="button"
          >
            📅 Programação
          </button>
          <button
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              view === 'smkt' ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
            }}`}
            onClick={() => setView('smkt')}
            type="button"
          >
            🛒 Supermercado
          </button>
          <button
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              view === 'fat' ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
            }}`}
            onClick={() => setView('fat')}
            type="button"
          >
            💸 Faturamento
          </button>
          <button
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              view === 'gestao' ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
            }}`}
            onClick={() => setView('gestao')}
            type="button"
          >
            ⚙️ Gestão
          </button>
        </nav>
        {view === 'prog' && (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <Metric
                label="Ciclos persistidos"
                value={cycles.length}
                note="janelas operacionais"
              />
              <Metric
                label="Itens no ciclo"
                value={items.length}
                note={`${pendingQuantity} unidades pendentes · ${money(pendingValue)}`}
              />
              <Metric
                label="Produção declarada"
                value={declaredQuantity}
                note={`${declarations.length} declarações no ciclo`}
              />
            </section>
            <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-white shadow-sm">
              <div className="flex flex-wrap items-center gap-4">
                <span className="rounded-lg bg-blue-900 px-3 py-1.5 text-sm font-extrabold">
                  S{String(isoWeek(new Date(hojeIso + 'T12:00:00'))).padStart(2, '0')} ·{' '}
                  {brD(hojeIso)}
                </span>
                <span className="text-sm font-bold">
                  {
                    ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][
                      new Date(hojeIso + 'T12:00:00').getDay()
                    ]
                  }
                </span>
                <span className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-extrabold">
                  Hoje: {progHoje.prog} un programadas · {progHoje.done} un realizadas ·{' '}
                  {progHoje.pct}%
                </span>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-base font-bold text-slate-900">Programação de produção</h3>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                  AGENDA EDITÁVEL
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-6 text-slate-500">
                Agenda por dia × PVs atendidos (atrasados priorizados). Marque ✓{' '}
                <strong>Executado</strong>, ajuste a <strong>qtd realizada</strong>,{' '}
                <strong>Realocar</strong> o saldo para o próximo dia útil ou troque o{' '}
                <strong>PV de destino</strong>. Nada é gravado no MaxiProd.
              </p>
              {progWeek.fosseis.length > 0 && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-800">
                  ▲ {progWeek.fosseis.length} declaração(ões) sem cobertura (PV faturado?) — não
                  entraram no card
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {progWeek.dias.length === 0 && (
                  <span className="text-sm text-slate-500">
                    Nenhuma programação declarada — inclua um PV abaixo.
                  </span>
                )}
                {progWeek.dias.map((data) => {
                  const rows = progWeek.out.filter((a) => a.data === data)
                  const dt = new Date(data + 'T12:00:00')
                  const dow = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dt.getDay()]
                  const tq = rows.reduce((s, r) => s + r.qtd, 0)
                  return (
                    <button
                      className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                        progDay === data
                          ? 'border-blue-900 bg-blue-900 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                      key={data}
                      onClick={() => (clipboard ? colarNoDia(data) : setProgDay(data))}
                      type="button"
                    >
                      {
                        ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][
                          dt.getDay()
                        ]
                      }{' '}
                      · {brD(data)} · {tq} un
                      {clipboard && (
                        <span className="ml-1 text-[10px] font-bold text-amber-700">⇩ colar</span>
                      )}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3">
                <strong className="text-xs">+ Incluir item:</strong>
                <input
                  className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-bold"
                  inputMode="numeric"
                  onChange={(event) => {
                    setAddPv(event.target.value)
                    const rows = carteiraByPv.get(event.target.value.trim())
                    setAddInfo(
                      rows && rows.length
                        ? `PV ${rows[0].pv_number} · ${rows[0].client_name} · ${rows[0].company_name} — ${rows
                            .map((r) => r.product_code)
                            .join(' · ')} · saldo ${rows.reduce((s, r) => s + r.quantity, 0)} un`
                        : '',
                    )
                    if (rows && rows.length && addQtd === '0')
                      setAddQtd(String(rows.reduce((s, r) => s + r.quantity, 0)))
                  }}
                  placeholder="Nº do PV"
                  value={addPv}
                />
                <input
                  className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  min="0"
                  onChange={(event) => setAddQtd(event.target.value)}
                  type="number"
                  value={addQtd}
                />
                <select
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  onChange={(event) => setAddLocal(event.target.value)}
                  value={addLocal}
                >
                  <option value="C">Curitiba</option>
                  <option value="V">Vinhedo</option>
                </select>
                <button
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                  disabled={busy}
                  onClick={addProgLine}
                  type="button"
                >
                  + Incluir no dia selecionado
                </button>
                <button
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  onClick={undoLast}
                  type="button"
                >
                  ↩ Desfazer
                </button>
                {progWeek.fosseis.length > 0 && (
                  <button
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-800 hover:bg-red-100"
                    onClick={removerInvalidas}
                    type="button"
                  >
                    🧹 Remover inválidas ({progWeek.fosseis.length})
                  </button>
                )}
                <button
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  onClick={baixarProgramacao}
                  type="button"
                >
                  ⬇ Baixar (.csv)
                </button>
                {addInfo && <span className="text-xs font-semibold text-blue-800">{addInfo}</span>}
              </div>
              {progDay && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-xs">
                    <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Código / Produto</th>
                        <th className="px-2 py-2">Qtd</th>
                        <th className="px-2 py-2">Valor</th>
                        <th className="px-2 py-2">PVs</th>
                        <th className="px-2 py-2">Chegada no cliente</th>
                        <th className="px-2 py-2">Situação</th>
                        <th className="px-2 py-2">Executado</th>
                        <th className="px-2 py-2">Qtd realizada</th>
                        <th className="px-2 py-2">Realocar / PV destino</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const rs = progWeek.out.filter((a) => a.data === progDay && a.qtd > 0)
                        const map = new Map<
                          string,
                          {
                            cod: string
                            desc: string
                            qtd: number
                            vtot: number
                            pvs: Map<
                              string,
                              {
                                pv: string
                                cli: string
                                qtd: number
                                vtot: number
                                atr: boolean
                                cheg: string
                                local: string
                              }
                            >
                            atrasado: boolean
                          }
                        >()
                        for (const a of rs) {
                          let p = map.get(a.cod)
                          if (!p) {
                            p = {
                              cod: a.cod,
                              desc: a.desc,
                              qtd: 0,
                              vtot: 0,
                              pvs: new Map(),
                              atrasado: false,
                            }
                            map.set(a.cod, p)
                          }
                          p.qtd += a.qtd
                          p.vtot += a.vtot
                          if (a.sit === 'ATRASADO') p.atrasado = true
                          const kpv = a.pv + '|' + a.cli
                          let v = p.pvs.get(kpv)
                          if (!v) {
                            v = {
                              pv: a.pv,
                              cli: a.cli,
                              qtd: 0,
                              vtot: 0,
                              atr: false,
                              cheg: a.cheg,
                              local: a.local,
                            }
                            p.pvs.set(kpv, v)
                          }
                          v.qtd += a.qtd
                          v.vtot += a.vtot
                          if (a.sit === 'ATRASADO') v.atr = true
                        }
                        const prods = Array.from(map.values()).sort((x, y) => y.vtot - x.vtot)
                        let tq = 0
                        let tv = 0
                        return (
                          <>
                            {prods.map((p) => {
                              const key = p.cod + '|' + progDay
                              const ex = progExec[key] || { ok: false, qtd: 0 }
                              tq += p.qtd
                              tv += p.vtot
                              const pvList = Array.from(p.pvs.values()).sort(
                                (x, y) => Number(x.pv) - Number(y.pv),
                              )
                              const outros = (itemsByCode.get(p.cod) || []).filter(
                                (r) =>
                                  !p.pvs.has(String(r.pv_number) + '|' + (r.client_name || '')),
                              )
                              const chegs = [...new Set(pvList.map((v) => v.cheg).filter(Boolean))]
                              const chegTxt = chegs.length
                                ? chegs.length === 1
                                  ? chegs[0]
                                  : chegs[0] + ' … ' + chegs[chegs.length - 1]
                                : '—'
                              return (
                                <tr
                                  className={
                                    'border-b border-slate-100' + (ex.ok ? ' bg-emerald-50' : '')
                                  }
                                  key={p.cod}
                                >
                                  <td className="px-2 py-2">
                                    <div className="font-mono font-bold">{p.cod}</div>
                                    <div className="text-slate-500">{p.desc}</div>
                                    <button
                                      className="mt-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-800 hover:bg-red-100"
                                      onClick={() => delProgLine(p.cod, progDay)}
                                      type="button"
                                    >
                                      🗑 Excluir linha
                                    </button>
                                  </td>
                                  <td className="px-2 py-2 text-right">
                                    <input
                                      className="w-16 rounded-md border border-slate-300 px-1.5 py-1 text-right font-bold"
                                      min="0"
                                      onChange={(event) =>
                                        editarQtd(p.cod, progDay, Number(event.target.value) || 0)
                                      }
                                      title="Editar qtd a fabricar — ajusta as linhas deste produto no dia"
                                      type="number"
                                      value={Math.round(p.qtd)}
                                    />
                                  </td>
                                  <td className="px-2 py-2 text-right">{money(p.vtot)}</td>
                                  <td className="px-2 py-2 text-center">
                                    {pvList.length} PV{pvList.length > 1 ? 's' : ''}
                                  </td>
                                  <td className="px-2 py-2">{chegTxt}</td>
                                  <td className="px-2 py-2">
                                    {p.atrasado ? (
                                      <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-800">
                                        ATRASADO
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                                        em dia
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-2 text-center">
                                    <input
                                      checked={ex.ok}
                                      onChange={(event) =>
                                        setExec(p.cod, progDay, { ok: event.target.checked })
                                      }
                                      type="checkbox"
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <input
                                      className="w-16 rounded-md border border-slate-300 px-1.5 py-1 text-right"
                                      max={p.qtd}
                                      min="0"
                                      onChange={(event) =>
                                        setExec(p.cod, progDay, {
                                          qtd: Number(event.target.value) || 0,
                                        })
                                      }
                                      placeholder="0"
                                      type="number"
                                      value={ex.qtd || ''}
                                    />
                                  </td>
                                  <td className="px-2 py-2">
                                    <div className="flex flex-wrap gap-1">
                                      <button
                                        className="rounded-md border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                                        onClick={() => realocar(p.cod, progDay, p.qtd)}
                                        type="button"
                                      >
                                        Realocar ↦
                                      </button>
                                      <button
                                        className="rounded-md border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                                        onClick={() => copiarLinha(p.cod, progDay, p.qtd)}
                                        title="Copiar linha (clique num dia para colar)"
                                        type="button"
                                      >
                                        Copiar
                                      </button>
                                      <button
                                        className="rounded-md border border-slate-300 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                                        onClick={() => recortarLinha(p.cod, progDay, p.qtd)}
                                        title="Recortar: move a qtd deste dia para onde colar. Se houver executado, transfere só o saldo"
                                        type="button"
                                      >
                                        Recortar
                                      </button>
                                    </div>
                                    {ex.rl && (
                                      <div className="mt-0.5 text-[10px] font-bold text-amber-700">
                                        → {ex.rl} ({p.qtd - (ex.qtd || 0)} un)
                                      </div>
                                    )}
                                    <input
                                      className="mt-1 w-40 rounded-md border border-slate-300 px-1.5 py-1 text-[11px]"
                                      inputMode="numeric"
                                      onChange={(event) => setPvDig(event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === 'Enter') incluirPvDigitado(p.cod, progDay)
                                      }}
                                      placeholder="ou digite o nº do PV…"
                                      title="Digite o nº do PV e Enter — troca o destino"
                                      value={pvDig}
                                    />
                                    <select
                                      className="mt-1 w-40 rounded-md border border-slate-300 px-1.5 py-1 text-[11px]"
                                      onChange={(event) =>
                                        trocarPv(p.cod, progDay, event.target.value)
                                      }
                                      value=""
                                    >
                                      <option value="">
                                        PV atual ({pvList.map((v) => v.pv).join('/')})
                                      </option>
                                      <option value="__SMKT__">
                                        🛒 Supermercado (produto pronto)
                                      </option>
                                      {outros.slice(0, 40).map((r) => (
                                        <option key={r.id} value={String(r.pv_number)}>
                                          {r.pv_number} · {(r.client_name || '').slice(0, 22)} (
                                          {r.quantity} un)
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                </tr>
                              )
                            })}
                            <tr className="bg-slate-50 font-bold">
                              <td className="px-2 py-2">
                                TOTAL {progDay ? brD(progDay) : ''} — {prods.length} produtos
                              </td>
                              <td className="px-2 py-2 text-right">{Math.round(tq)}</td>
                              <td className="px-2 py-2 text-right">{money(tv)}</td>
                              <td className="px-2 py-2" colSpan={6} />
                            </tr>
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                eyebrow="Programação"
                title="Programação em batelada — por produto e semana"
                tag="alvo principal · PVs alocáveis ao clicar"
              />
              <p className="mt-2 text-sm leading-6 text-slate-500">
                <strong>Batelada por produto</strong> nas semanas (Atrasado, S40, S41…): quantidade
                total e valor por produto. Ao clicar no produto, abrem os{' '}
                <strong>PVs alocáveis</strong> — todos os PVs da carteira que usam o produto. Ao
                selecionar a semana, a <strong>programação diária</strong> aparece no card abaixo,
                com seleção de dia.
              </p>
              {weekBatches.length === 0 && (
                <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  Nenhum item no ciclo.
                </p>
              )}
              <div className="mt-4 space-y-3">
                {weekBatches.map((batch) => {
                  const prods = new Map<
                    string,
                    {
                      code: string
                      name: string
                      qty: number
                      valor: number
                      rows: typeof batch.rows
                    }
                  >()
                  for (const r of batch.rows) {
                    const key = r.row.product_code || '—'
                    const cur = prods.get(key) || {
                      code: key,
                      name: r.row.product_name || '',
                      qty: 0,
                      valor: 0,
                      rows: [],
                    }
                    cur.qty += r.row.quantity
                    cur.valor += r.row.total_value || 0
                    cur.rows.push(r)
                    prods.set(key, cur)
                  }
                  const list = Array.from(prods.values()).sort((a, b) => b.valor - a.valor)
                  return (
                    <div key={batch.week} className="rounded-2xl border border-slate-200 p-4">
                      <button
                        className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                        onClick={() => setWeekTab(weekTab === batch.week ? '' : batch.week)}
                        type="button"
                      >
                        <span className="flex flex-wrap items-center gap-3">
                          <span className="text-slate-400">
                            {weekTab === batch.week ? '▾' : '▸'}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-sm font-bold ${
                              weekTab === batch.week
                                ? 'bg-blue-900 text-white'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {batch.week === 'ATRASADO'
                              ? 'Atrasado'
                              : batch.week.replace('2026-W', 'S')}
                          </span>
                          <span className="text-sm text-slate-500">
                            {batch.rows.length} item(ns) · {batch.qty} un
                          </span>
                        </span>
                        <span className="text-base font-bold text-slate-900">
                          {money(batch.valor)}
                        </span>
                      </button>
                      {weekTab === batch.week && weekDayPlans.get(batch.week) && (
                        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                          <p className="text-xs font-bold uppercase tracking-wide text-blue-800">
                            Programação diária — coletas da semana (clique no dia)
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {weekDayPlans.get(batch.week).days.map((day: string) => {
                              const rows = weekDayPlans.get(batch.week)!.byDay.get(day) || []
                              const valor = rows.reduce((s, r) => s + (r.row.total_value || 0), 0)
                              const dt = new Date(day + 'T12:00:00')
                              const dow = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][
                                dt.getDay()
                              ]
                              return (
                                <button
                                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${
                                    weekDayTab === day
                                      ? 'border-blue-900 bg-blue-900 text-white'
                                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                  }`}
                                  key={day}
                                  onClick={() => setWeekDayTab(weekDayTab === day ? '' : day)}
                                  type="button"
                                >
                                  {dow} {brD(day)} · {rows.length} coleta(s) · {money(valor)}
                                </button>
                              )
                            })}
                          </div>
                          {weekDayTab && weekDayPlans.get(batch.week)!.byDay.get(weekDayTab) && (
                            <div className="mt-3 space-y-1.5">
                              {(() => {
                                const rows =
                                  weekDayPlans.get(batch.week)!.byDay.get(weekDayTab) || []
                                const prodsDia = new Map<
                                  string,
                                  {
                                    code: string
                                    name: string
                                    qty: number
                                    valor: number
                                    rows: typeof rows
                                  }
                                >()
                                for (const r of rows) {
                                  const key = r.row.product_code || '—'
                                  const cur = prodsDia.get(key) || {
                                    code: key,
                                    name: r.row.product_name || '',
                                    qty: 0,
                                    valor: 0,
                                    rows: [],
                                  }
                                  cur.qty += r.row.quantity
                                  cur.valor += r.row.total_value || 0
                                  cur.rows.push(r)
                                  prodsDia.set(key, cur)
                                }
                                return Array.from(prodsDia.values())
                                  .sort((a, b) => b.valor - a.valor)
                                  .map((p) => {
                                    const open = weekDayProdOpen === p.code
                                    return (
                                      <div
                                        key={p.code}
                                        className="rounded-xl border border-slate-200 bg-white"
                                      >
                                        <button
                                          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-slate-50"
                                          onClick={() => setWeekDayProdOpen(open ? '' : p.code)}
                                          type="button"
                                        >
                                          <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                                          <strong className="font-mono text-sm">{p.code}</strong>
                                          <span className="text-sm text-slate-500">{p.name}</span>
                                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sm font-bold text-sky-900">
                                            {p.qty} un
                                          </span>
                                          <span className="text-sm font-semibold text-slate-900">
                                            {money(p.valor)}
                                          </span>
                                        </button>
                                        {open && (
                                          <table className="w-full min-w-[640px] text-left text-xs">
                                            <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                                              <tr>
                                                <th className="px-4 py-1.5">PV</th>
                                                <th className="px-4 py-1.5">Cliente</th>
                                                <th className="px-4 py-1.5">Empresa</th>
                                                <th className="px-4 py-1.5">Entrega</th>
                                                <th className="px-4 py-1.5">Coleta</th>
                                                <th className="px-4 py-1.5">Chegada</th>
                                                <th className="px-4 py-1.5">Qtd.</th>
                                                <th className="px-4 py-1.5">Valor</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {p.rows.map(({ row, t }) => (
                                                <tr
                                                  className="border-b border-slate-100"
                                                  key={row.id}
                                                >
                                                  <td className="px-4 py-1.5 font-semibold">
                                                    {row.pv_number || '—'}
                                                  </td>
                                                  <td className="px-4 py-1.5">
                                                    {row.client_name || '—'}
                                                  </td>
                                                  <td className="px-4 py-1.5">
                                                    {row.company_name}
                                                  </td>
                                                  <td className="px-4 py-1.5">
                                                    {dateLabel(row.delivery_date)}
                                                  </td>
                                                  <td className="px-4 py-1.5">
                                                    {t
                                                      ? t.cid === '~'
                                                        ? '~' + brD(t.coleta)
                                                        : brD(t.coleta)
                                                      : '—'}
                                                  </td>
                                                  <td className="px-4 py-1.5">
                                                    {t
                                                      ? t.cid === '~'
                                                        ? '~' + brD(t.cheg)
                                                        : brD(t.cheg)
                                                      : '—'}
                                                  </td>
                                                  <td className="px-4 py-1.5 font-semibold">
                                                    {row.quantity}
                                                  </td>
                                                  <td className="px-4 py-1.5">
                                                    {money(row.total_value || 0)}
                                                  </td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        )}
                                      </div>
                                    )
                                  })
                              })()}
                            </div>
                          )}
                        </div>
                      )}
                      {weekTab === batch.week && (
                        <div className="mt-2.5 space-y-1.5">
                          {list.map((p) => {
                            const open = weekProdOpen === batch.week + '|' + p.code
                            const alocaveis = (itemsByCode.get(p.code) || []).filter(
                              (row) =>
                                !weekBatches.some((b) => b.rows.some((r) => r.row.id === row.id)),
                            )
                            return (
                              <div key={p.code} className="rounded-xl border border-slate-200">
                                <button
                                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-slate-50"
                                  onClick={() =>
                                    setWeekProdOpen(open ? '' : batch.week + '|' + p.code)
                                  }
                                  type="button"
                                >
                                  <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                                  <strong className="font-mono text-sm">{p.code}</strong>
                                  <span className="text-sm text-slate-500">{p.name}</span>
                                  <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sm font-bold text-sky-900">
                                    {p.qty} un
                                  </span>
                                  <span className="text-sm font-semibold text-slate-900">
                                    {money(p.valor)}
                                  </span>
                                  {alocaveis.length > 0 && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                      +{alocaveis.length} PV(s) alocável(is) fora da semana
                                    </span>
                                  )}
                                </button>
                                {open && (
                                  <div className="border-t border-slate-100 px-4 py-3">
                                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                                      PVs desta semana ({p.rows.length})
                                    </p>
                                    <table className="mt-1.5 w-full min-w-[640px] text-left text-xs">
                                      <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                                        <tr>
                                          <th className="px-2 py-1.5">PV</th>
                                          <th className="px-2 py-1.5">Cliente</th>
                                          <th className="px-2 py-1.5">Empresa</th>
                                          <th className="px-2 py-1.5">Entrega</th>
                                          <th className="px-2 py-1.5">Coleta</th>
                                          <th className="px-2 py-1.5">Chegada</th>
                                          <th className="px-2 py-1.5">Qtd.</th>
                                          <th className="px-2 py-1.5">Valor</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {p.rows.map(({ row, t }) => (
                                          <tr className="border-b border-slate-100" key={row.id}>
                                            <td className="px-2 py-1.5 font-semibold">
                                              {row.pv_number || '—'}
                                            </td>
                                            <td className="px-2 py-1.5">
                                              {row.client_name || '—'}
                                            </td>
                                            <td className="px-2 py-1.5">{row.company_name}</td>
                                            <td className="px-2 py-1.5">
                                              {dateLabel(row.delivery_date)}
                                            </td>
                                            <td className="px-2 py-1.5">
                                              {t
                                                ? t.cid === '~'
                                                  ? '~' + brD(t.coleta)
                                                  : brD(t.coleta)
                                                : '—'}
                                            </td>
                                            <td className="px-2 py-1.5">
                                              {t
                                                ? t.cid === '~'
                                                  ? '~' + brD(t.cheg)
                                                  : brD(t.cheg)
                                                : '—'}
                                            </td>
                                            <td className="px-2 py-1.5 font-semibold">
                                              {row.quantity}
                                            </td>
                                            <td className="px-2 py-1.5">
                                              {money(row.total_value || 0)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                    {alocaveis.length > 0 && (
                                      <>
                                        <p className="mt-3 text-xs font-bold uppercase tracking-wide text-amber-700">
                                          Outros PVs alocáveis com este produto ({alocaveis.length})
                                        </p>
                                        <table className="mt-1.5 w-full min-w-[640px] text-left text-xs">
                                          <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                                            <tr>
                                              <th className="px-2 py-1.5">PV</th>
                                              <th className="px-2 py-1.5">Cliente</th>
                                              <th className="px-2 py-1.5">Empresa</th>
                                              <th className="px-2 py-1.5">Semana</th>
                                              <th className="px-2 py-1.5">Entrega</th>
                                              <th className="px-2 py-1.5">Coleta</th>
                                              <th className="px-2 py-1.5">Qtd.</th>
                                              <th className="px-2 py-1.5">Valor</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {alocaveis.map((row) => {
                                              const t = transitoDe(row)
                                              return (
                                                <tr
                                                  className="border-b border-slate-100"
                                                  key={row.id}
                                                >
                                                  <td className="px-2 py-1.5 font-semibold">
                                                    {row.pv_number || '—'}
                                                  </td>
                                                  <td className="px-2 py-1.5">
                                                    {row.client_name || '—'}
                                                  </td>
                                                  <td className="px-2 py-1.5">
                                                    {row.company_name}
                                                  </td>
                                                  <td className="px-2 py-1.5">
                                                    {row.planned_week === 'ATRASADO'
                                                      ? 'Atrasado'
                                                      : (row.planned_week || '—').replace(
                                                          '2026-W',
                                                          'S',
                                                        )}
                                                  </td>
                                                  <td className="px-2 py-1.5">
                                                    {dateLabel(row.delivery_date)}
                                                  </td>
                                                  <td className="px-2 py-1.5">
                                                    {t
                                                      ? t.cid === '~'
                                                        ? '~' + brD(t.coleta)
                                                        : brD(t.coleta)
                                                      : '—'}
                                                  </td>
                                                  <td className="px-2 py-1.5 font-semibold">
                                                    {row.quantity}
                                                  </td>
                                                  <td className="px-2 py-1.5">
                                                    {money(row.total_value || 0)}
                                                  </td>
                                                </tr>
                                              )
                                            })}
                                          </tbody>
                                        </table>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          </>
        )}
        {view === 'smkt' && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <SectionTitle
                  eyebrow="Camada 2.1"
                  title="Supermercado — entrada manual de estoque"
                  tag="histórico auditável"
                />
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    Valor total em estoque
                  </p>
                  <p className="text-lg font-bold text-emerald-900">{money(smktEntradaTotal)}</p>
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Registra a entrada de produto pronto no Supermercado (produção alocada direto ou
                ajuste manual). Fica no histórico auditável — não movimenta o MaxiProd.
              </p>
              {!cycleId ? (
                <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  Selecione um ciclo para registrar a entrada.
                </p>
              ) : (
                <form
                  className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2.2fr)_90px_130px_150px_minmax(0,1.8fr)]"
                  onSubmit={createEntrada}
                >
                  <label className="col-span-2 text-xs font-medium text-slate-600 sm:col-span-1">
                    Produto
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
                      value={smktEntradaForm.product_code}
                      onChange={(event) => {
                        const code = event.target.value
                        const sample = items.find((row) => row.product_code === code)
                        setSmktEntradaForm({
                          ...smktEntradaForm,
                          product_code: code,
                          product_name: sample?.product_name || '',
                          unit_value:
                            sample?.unit_value != null
                              ? String(sample.unit_value)
                              : smktEntradaForm.unit_value,
                        })
                      }}
                      required
                    >
                      <option value="">— escolha o produto —</option>
                      {Array.from(
                        new Set(
                          items.filter((row) => !isFreightRow(row)).map((row) => row.product_code),
                        ),
                      )
                        .sort()
                        .map((code) => {
                          const sample = items.find((row) => row.product_code === code)
                          return (
                            <option key={code} value={code}>
                              {code} · {(sample?.product_name || '').slice(0, 40)}
                            </option>
                          )
                        })}
                    </select>
                  </label>
                  <NumberInput
                    label="Qtd"
                    value={smktEntradaForm.quantity}
                    onChange={(value) =>
                      setSmktEntradaForm({ ...smktEntradaForm, quantity: value })
                    }
                  />
                  <NumberInput
                    label="V. unit. R$"
                    value={smktEntradaForm.unit_value}
                    onChange={(value) =>
                      setSmktEntradaForm({ ...smktEntradaForm, unit_value: value })
                    }
                  />
                  <label className="text-xs font-medium text-slate-600">
                    Data
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                      type="date"
                      value={smktEntradaForm.data}
                      onChange={(event) =>
                        setSmktEntradaForm({ ...smktEntradaForm, data: event.target.value })
                      }
                    />
                  </label>
                  <label className="col-span-2 text-xs font-medium text-slate-600 sm:col-span-2">
                    Obs.
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm"
                      value={smktEntradaForm.notes}
                      placeholder="ex.: produção de terça não declarada"
                      onChange={(event) =>
                        setSmktEntradaForm({ ...smktEntradaForm, notes: event.target.value })
                      }
                    />
                  </label>
                  <button
                    className="col-span-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
                    disabled={busy}
                    type="submit"
                  >
                    Registrar entrada no Supermercado
                  </button>
                </form>
              )}
              <div className="mt-6 space-y-2">
                {smktEntradaGroups.map((group) => {
                  const open = smktEntradaOpen === group.code
                  return (
                    <div key={group.code} className="rounded-xl border border-slate-200">
                      <button
                        className="flex w-full flex-wrap items-center justify-start gap-x-3 gap-y-1 px-4 py-3 text-left hover:bg-slate-50"
                        onClick={() => setSmktEntradaOpen(open ? '' : group.code)}
                        type="button"
                      >
                        <span className="flex items-center gap-2 text-sm">
                          <span className="text-slate-400">{open ? '▾' : '▸'}</span>
                          <strong className="font-mono">{group.code}</strong>
                          <span className="text-slate-500">{group.name}</span>
                        </span>
                        <span className="flex items-center gap-3 text-xs">
                          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-sm font-bold text-sky-900">
                            {group.qty} un
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                            {group.registros} entrada(s)
                          </span>
                          <span className="text-sm font-semibold text-slate-900">
                            {money(group.valor)}
                          </span>
                        </span>
                      </button>
                      {open && (
                        <table className="w-full min-w-[640px] text-left text-xs">
                          <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-4 py-2">Data da entrada</th>
                              <th className="px-4 py-2">Qtd.</th>
                              <th className="px-4 py-2">V. unitário</th>
                              <th className="px-4 py-2">V. total</th>
                              <th className="px-4 py-2">Observação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.rows.map((entrada) => (
                              <tr className="border-b border-slate-100" key={entrada.id}>
                                <td className="px-4 py-2">
                                  {dateLabel(entrada.data || undefined)}
                                </td>
                                <td className="px-4 py-2 font-semibold">{entrada.quantity}</td>
                                <td className="px-4 py-2">{money(entrada.unit_value)}</td>
                                <td className="px-4 py-2">
                                  {money(entrada.quantity * entrada.unit_value)}
                                </td>
                                <td className="px-4 py-2 text-slate-500">
                                  {entrada.reason || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
                {smktEntradas.length === 0 && (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    Nenhuma entrada manual registrada neste ciclo.
                  </p>
                )}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                eyebrow="Camada 2.1.1"
                title="Supermercado — baixa de produto pronto"
                tag="PV + NF registrados"
              />
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Registra a saída do produto pronto do Supermercado para um PV. A baixa fica no
                histórico auditável com o nº da NF — a baixa no MaxiProd continua sendo o fluxo
                próprio de NF.
              </p>
              {!cycleId ? (
                <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                  Selecione um ciclo para registrar a baixa.
                </p>
              ) : (
                <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={createAlloc}>
                  <label className="text-xs font-medium text-slate-600">
                    Produto (catálogo do ciclo)
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      value={smktForm.product_code}
                      onChange={(event) =>
                        setSmktForm({ ...smktForm, product_code: event.target.value })
                      }
                      required
                    >
                      <option value="">— escolha o produto —</option>
                      {Array.from(
                        new Set(
                          items.filter((row) => !isFreightRow(row)).map((row) => row.product_code),
                        ),
                      )
                        .sort()
                        .map((code) => {
                          const sample = items.find((row) => row.product_code === code)
                          return (
                            <option key={code} value={code}>
                              {code} · {(sample?.product_name || '').slice(0, 40)}
                            </option>
                          )
                        })}
                    </select>
                  </label>
                  <TextInput
                    label="PV de destino"
                    value={smktForm.pv_number}
                    placeholder="ex.: 549"
                    onChange={(value) => setSmktForm({ ...smktForm, pv_number: value })}
                    required
                  />
                  <NumberInput
                    label="Quantidade"
                    value={smktForm.quantity}
                    onChange={(value) => setSmktForm({ ...smktForm, quantity: value })}
                  />
                  <TextInput
                    label="Nº da NF (opcional)"
                    value={smktForm.nf_number}
                    placeholder="ex.: 2451"
                    onChange={(value) => setSmktForm({ ...smktForm, nf_number: value })}
                  />
                  <textarea
                    className="min-h-16 rounded-lg border border-slate-300 px-3 py-2.5 text-sm sm:col-span-2"
                    placeholder="Observação (opcional)"
                    value={smktForm.notes}
                    onChange={(event) => setSmktForm({ ...smktForm, notes: event.target.value })}
                  />
                  <button
                    className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 sm:col-span-2"
                    disabled={busy}
                    type="submit"
                  >
                    Registrar baixa do Supermercado
                  </button>
                </form>
              )}
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Quando</th>
                      <th className="px-2 py-2">Produto</th>
                      <th className="px-2 py-2">PV</th>
                      <th className="px-2 py-2">Qtd.</th>
                      <th className="px-2 py-2">NF</th>
                      <th className="px-2 py-2">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {smktAllocs.map((alloc) => (
                      <tr className="border-b border-slate-100" key={alloc.id}>
                        <td className="px-2 py-2">{dateLabel(alloc.allocated_at)}</td>
                        <td className="px-2 py-2">
                          <strong className="font-mono">{alloc.product_code}</strong>
                          <br />
                          <span className="text-slate-500">{alloc.product_name}</span>
                        </td>
                        <td className="px-2 py-2 font-semibold">{alloc.pv_number || '—'}</td>
                        <td className="px-2 py-2">{alloc.quantity}</td>
                        <td className="px-2 py-2">
                          {alloc.nf_number ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">
                              NF {alloc.nf_number}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="max-w-[220px] truncate px-2 py-2 text-slate-500">
                          {alloc.reason}
                        </td>
                      </tr>
                    ))}
                    {smktAllocs.length === 0 && (
                      <tr>
                        <td className="px-2 py-5 text-center text-slate-500" colSpan={6}>
                          Nenhuma baixa do Supermercado registrada neste ciclo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                eyebrow="Registro auditável"
                title="Produção declarada no ciclo"
                tag="manual → Pulso depois"
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-xs">
                  <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Data</th>
                      <th className="px-3 py-2">Produto</th>
                      <th className="px-3 py-2">Qtd.</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Observação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {declarations.map((row) => (
                      <tr className="border-b border-slate-100" key={row.id}>
                        <td className="px-3 py-3">{dateLabel(row.production_date)}</td>
                        <td className="px-3 py-3 font-mono text-xs">{row.product_code}</td>
                        <td className="px-3 py-3">{row.quantity}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs">
                            {row.status}
                          </span>
                        </td>
                        <td className="max-w-xs truncate px-3 py-3 text-slate-500">
                          {row.notes || '—'}
                        </td>
                      </tr>
                    ))}
                    {declarations.length === 0 && (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-500" colSpan={6}>
                          Nenhuma produção declarada neste ciclo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        {view === 'fat' && (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                eyebrow="Faturamento"
                title="NFs emitidas — atualização a cada 15 min"
                tag="somente leitura · MaxiProd"
              />
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <Metric
                  label={`Mês ${fatMetrics.mesLabel}`}
                  value={fatMetrics.mesValor}
                  note={`${fatMetrics.mesQtd} NFs · média ${money(fatMetrics.mediaDiaUtilMes)}/dia útil`}
                />
                <Metric
                  label={`Acumulado ${fatMetrics.mesLabel.slice(3)}`}
                  value={fatMetrics.anoValor}
                  note={`${fatMetrics.anoQtd} NFs · média ${money(fatMetrics.mediaDiaUtilAno)}/dia útil`}
                />
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
                  <p className="text-sm text-slate-500">
                    Faturamento por mês — {fatMetrics.mesLabel.slice(3)}
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {fatMetrics.monthly.map((month) => {
                      const max = Math.max(...fatMetrics.monthly.map((m) => m.valor), 1)
                      return (
                        <div className="flex items-center gap-2 text-xs" key={month.month}>
                          <span className="w-12 shrink-0 text-slate-500">
                            {month.month.slice(5)}/{month.month.slice(0, 4)}
                          </span>
                          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-3 rounded-full bg-blue-600"
                              style={{ width: `${Math.max(2, (100 * month.valor) / max)}%` }}
                            />
                          </div>
                          <span className="w-24 shrink-0 text-right font-semibold">
                            {money(month.valor)}
                          </span>
                          <span className="w-12 shrink-0 text-right text-slate-500">
                            {month.qtd} NF
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">NF</th>
                      <th className="px-2 py-2">Data</th>
                      <th className="px-2 py-2">Empresa</th>
                      <th className="px-2 py-2">Cliente</th>
                      <th className="px-2 py-2">Destino</th>
                      <th className="px-2 py-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nfs.slice(0, 25).map((row) => (
                      <tr
                        className="border-b border-slate-100"
                        key={`${row.company_cnpj}-${row.nf_number}`}
                      >
                        <td className="px-2 py-2 font-semibold">{row.nf_number}</td>
                        <td className="px-2 py-2">{dateLabel(row.issue_day)}</td>
                        <td className="px-2 py-2">{row.company_name}</td>
                        <td className="px-2 py-2">{row.client_name || '—'}</td>
                        <td className="px-2 py-2">
                          {row.city ? `${row.city}${row.uf ? `/${row.uf}` : ''}` : '—'}
                        </td>
                        <td className="px-2 py-2 font-semibold">{money(row.total_value || 0)}</td>
                      </tr>
                    ))}
                    {nfs.length === 0 && (
                      <tr>
                        <td className="px-2 py-5 text-center text-slate-500" colSpan={6}>
                          Nenhuma NF carregada ainda — o sync a cada 15 min popula esta lista.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                eyebrow="Camada 2.2"
                title="Produtos a Faturar — pesquisa por PV"
                tag="somente leitura"
              />
              <div className="mt-4">
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                  placeholder="Digite o nº do PV (ou parte do cliente/produto)… ex.: 549, SHOPEE, BERENICE"
                  value={pvQuery}
                  onChange={(event) => setPvQuery(event.target.value)}
                />
              </div>
              {pvQuery.trim() && (
                <div className="mt-4 space-y-3">
                  {(() => {
                    const q = pvQuery.trim().toUpperCase()
                    const hits = items.filter((row) =>
                      `${row.pv_number} ${row.client_name} ${row.product_code} ${row.product_name} ${row.company_name}`
                        .toUpperCase()
                        .includes(q),
                    )
                    if (!hits.length)
                      return (
                        <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                          Nenhum item encontrado para “{pvQuery}”.
                        </p>
                      )
                    const byPv = new Map<string, typeof hits>()
                    for (const row of hits) {
                      const key = `${row.pv_number}|${row.company_name}`
                      const list = byPv.get(key) || []
                      list.push(row)
                      byPv.set(key, list)
                    }
                    return Array.from(byPv.values()).map((rows) => {
                      const total = rows.reduce((sum, row) => sum + (row.total_value || 0), 0)
                      const qty = rows.reduce((sum, row) => sum + row.quantity, 0)
                      return (
                        <div key={rows[0].id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div>
                              <strong className="text-sm">PV {rows[0].pv_number || '—'}</strong>{' '}
                              <span className="text-xs text-slate-500">
                                · {rows[0].client_name} · {rows[0].company_name}
                              </span>
                            </div>
                            <div className="text-sm">
                              <strong>{money(total)}</strong>{' '}
                              <span className="text-xs text-slate-500">
                                · {qty} un · {rows.length} item(ns)
                              </span>
                            </div>
                          </div>
                          <table className="mt-3 w-full text-left text-xs">
                            <thead className="border-b border-slate-100 uppercase tracking-wide text-slate-500">
                              <tr>
                                <th className="py-1.5">Produto</th>
                                <th className="py-1.5">Entrega</th>
                                <th className="py-1.5">Semana</th>
                                <th className="py-1.5">Qtd.</th>
                                <th className="py-1.5">Valor</th>
                                <th className="py-1.5">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row) => (
                                <tr className="border-b border-slate-50" key={row.id}>
                                  <td className="py-1.5">
                                    <strong className="font-mono">{row.product_code}</strong>{' '}
                                    <span className="text-slate-500">{row.product_name}</span>
                                  </td>
                                  <td className="py-1.5">{dateLabel(row.delivery_date)}</td>
                                  <td className="py-1.5">{row.planned_week}</td>
                                  <td className="py-1.5">{row.quantity}</td>
                                  <td className="py-1.5">{money(row.total_value || 0)}</td>
                                  <td className="py-1.5">
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5">
                                      {row.status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </section>
          </>
        )}
        {view === 'gestao' && (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle eyebrow="Camada 1" title="Ciclo de planejamento" tag="persistido" />
                <form className="mt-5 space-y-3" onSubmit={createCycle}>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                    placeholder="Nome — ex.: Semana 40 / WARD"
                    value={cycleForm.name}
                    onChange={(event) => setCycleForm({ ...cycleForm, name: event.target.value })}
                    required
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <DateInput
                      label="Início"
                      value={cycleForm.start_date}
                      onChange={(value) => setCycleForm({ ...cycleForm, start_date: value })}
                    />
                    <DateInput
                      label="Fim"
                      value={cycleForm.end_date}
                      onChange={(value) => setCycleForm({ ...cycleForm, end_date: value })}
                    />
                  </div>
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                    placeholder="Premissas e observações"
                    value={cycleForm.notes}
                    onChange={(event) => setCycleForm({ ...cycleForm, notes: event.target.value })}
                  />
                  <button
                    className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                    disabled={busy}
                    type="submit"
                  >
                    Criar ciclo
                  </button>
                </form>
                <label className="mt-6 block border-t border-slate-200 pt-5 text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">
                  Ciclo ativo
                  <select
                    className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900"
                    value={cycleId}
                    onChange={(event) => {
                      setCycleId(event.target.value)
                      void loadCycle(event.target.value).catch((loadError) =>
                        setError(errorMessage(loadError)),
                      )
                    }}
                  >
                    <option value="">Selecione um ciclo</option>
                    {cycles.map((cycle) => (
                      <option key={cycle.id} value={cycle.id}>
                        {cycle.name} · {dateLabel(cycle.start_date)}–{dateLabel(cycle.end_date)}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedCycle && (
                  <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                    <div className="flex justify-between">
                      <span>Status</span>
                      <strong className="text-slate-900">{selectedCycle.status}</strong>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span>Origem</span>
                      <strong className="text-slate-900">{selectedCycle.source}</strong>
                    </div>
                    <button
                      className="mt-4 w-full rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-60"
                      disabled={busy}
                      onClick={() => void syncCycle()}
                      type="button"
                    >
                      {busy ? 'Sincronizando…' : 'Sincronizar MaxiProd — somente leitura'}
                    </button>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      Lê PVs aprovados e saldo por item. Não altera datas, OPs, estoque ou
                      faturamento.
                    </p>
                  </div>
                )}
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle
                  eyebrow="Camada 2"
                  title="Produção declarada"
                  tag="sem efeito no ERP"
                />
                {!cycleId ? (
                  <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    Crie ou selecione um ciclo para registrar produção.
                  </p>
                ) : (
                  <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={createDeclaration}>
                    <DateInput
                      label="Data de produção"
                      value={declarationForm.production_date}
                      onChange={(value) =>
                        setDeclarationForm({ ...declarationForm, production_date: value })
                      }
                    />
                    <NumberInput
                      label="Quantidade"
                      value={declarationForm.quantity}
                      onChange={(value) =>
                        setDeclarationForm({ ...declarationForm, quantity: value })
                      }
                    />
                    <TextInput
                      label="Código do produto"
                      value={declarationForm.product_code}
                      placeholder="ex.: 404-0001"
                      onChange={(value) =>
                        setDeclarationForm({ ...declarationForm, product_code: value })
                      }
                      required
                    />
                    <TextInput
                      label="Produto"
                      value={declarationForm.product_name}
                      placeholder="ex.: Berenice"
                      onChange={(value) =>
                        setDeclarationForm({ ...declarationForm, product_name: value })
                      }
                    />
                    <textarea
                      className="min-h-20 rounded-lg border border-slate-300 px-3 py-2.5 text-sm sm:col-span-2"
                      placeholder="Motivo ou observação"
                      value={declarationForm.notes}
                      onChange={(event) =>
                        setDeclarationForm({ ...declarationForm, notes: event.target.value })
                      }
                    />
                    <button
                      className="rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60 sm:col-span-2"
                      disabled={busy}
                      type="submit"
                    >
                      Registrar produção declarada
                    </button>
                  </form>
                )}
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Metric
                    label="Saldo pendente importado"
                    value={pendingQuantity}
                    note={money(pendingValue)}
                  />
                  <Metric
                    label="Declarações no ciclo"
                    value={declarations.length}
                    note="cenário operacional"
                  />
                </div>
              </div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle
                  eyebrow="Camada 3"
                  title="Itens do ciclo"
                  tag="manual / importação futura"
                />
                {!cycleId ? (
                  <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    Selecione um ciclo para cadastrar um item.
                  </p>
                ) : (
                  <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={createItem}>
                    <TextInput
                      label="Chave externa"
                      value={itemForm.external_key}
                      placeholder="ex.: PV554|404-0001|DLEAN"
                      onChange={(value) => setItemForm({ ...itemForm, external_key: value })}
                      required
                    />
                    <TextInput
                      label="Código"
                      value={itemForm.product_code}
                      placeholder="ex.: 404-0001"
                      onChange={(value) => setItemForm({ ...itemForm, product_code: value })}
                      required
                    />
                    <TextInput
                      label="Produto"
                      value={itemForm.product_name}
                      placeholder="Nome do produto"
                      onChange={(value) => setItemForm({ ...itemForm, product_name: value })}
                      required
                    />
                    <TextInput
                      label="PV"
                      value={itemForm.pv_number}
                      placeholder="ex.: 554"
                      onChange={(value) => setItemForm({ ...itemForm, pv_number: value })}
                    />
                    <TextInput
                      label="Cliente"
                      value={itemForm.client_name}
                      placeholder="Cliente / destino"
                      onChange={(value) => setItemForm({ ...itemForm, client_name: value })}
                    />
                    <TextInput
                      label="Empresa"
                      value={itemForm.company_name}
                      placeholder="DLEAN / VINHEDO / ..."
                      onChange={(value) => setItemForm({ ...itemForm, company_name: value })}
                    />
                    <DateInput
                      label="Entrega"
                      value={itemForm.delivery_date}
                      onChange={(value) => setItemForm({ ...itemForm, delivery_date: value })}
                    />
                    <TextInput
                      label="Semana planejada"
                      value={itemForm.planned_week}
                      placeholder="ex.: 2026-W39"
                      onChange={(value) => setItemForm({ ...itemForm, planned_week: value })}
                      required
                    />
                    <NumberInput
                      label="Quantidade"
                      value={itemForm.quantity}
                      onChange={(value) => setItemForm({ ...itemForm, quantity: value })}
                    />
                    <label className="text-xs font-medium text-slate-600">
                      Valor unitário
                      <input
                        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                        type="number"
                        min="0"
                        step="0.01"
                        value={itemForm.unit_value}
                        onChange={(event) =>
                          setItemForm({ ...itemForm, unit_value: event.target.value })
                        }
                      />
                    </label>
                    <textarea
                      className="min-h-16 rounded-lg border border-slate-300 px-3 py-2.5 text-sm sm:col-span-2"
                      placeholder="Observação / origem do dado"
                      value={itemForm.notes}
                      onChange={(event) => setItemForm({ ...itemForm, notes: event.target.value })}
                    />
                    <button
                      className="rounded-lg bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-60 sm:col-span-2"
                      disabled={busy}
                      type="submit"
                    >
                      Adicionar item ao ciclo
                    </button>
                  </form>
                )}
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Produto</th>
                        <th className="px-2 py-2">PV</th>
                        <th className="px-2 py-2">Entrega</th>
                        <th className="px-2 py-2">Semana</th>
                        <th className="px-2 py-2">Qtd.</th>
                        <th className="px-2 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr className="border-b border-slate-100" key={item.id}>
                          <td className="px-2 py-2">
                            <strong>{item.product_code}</strong>
                            <br />
                            <span className="text-slate-500">{item.product_name}</span>
                          </td>
                          <td className="px-2 py-2">{item.pv_number || '—'}</td>
                          <td className="px-2 py-2">{dateLabel(item.delivery_date)}</td>
                          <td className="px-2 py-2">{item.planned_week}</td>
                          <td className="px-2 py-2">{item.quantity}</td>
                          <td className="px-2 py-2">{item.status}</td>
                        </tr>
                      ))}
                      {items.length === 0 && (
                        <tr>
                          <td className="px-2 py-5 text-center text-slate-500" colSpan={6}>
                            Nenhum item persistido neste ciclo.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <SectionTitle
                  eyebrow="Camada 4"
                  title="Reprogramação auditável"
                  tag="cenário · sem ERP"
                />
                {!cycleId ? (
                  <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    Selecione um ciclo para registrar um cenário.
                  </p>
                ) : (
                  <form className="mt-5 space-y-3" onSubmit={createEvent}>
                    <TextInput
                      label="Chave do item"
                      value={eventForm.external_key}
                      placeholder="ex.: PV554|404-0001|DLEAN"
                      onChange={(value) => setEventForm({ ...eventForm, external_key: value })}
                      required
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-medium text-slate-600">
                        Campo alterado
                        <select
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          value={eventForm.field}
                          onChange={(event) =>
                            setEventForm({ ...eventForm, field: event.target.value })
                          }
                        >
                          <option value="delivery_date">Data de entrega</option>
                          <option value="planned_week">Semana planejada</option>
                          <option value="quantity">Quantidade</option>
                          <option value="status">Status</option>
                        </select>
                      </label>
                      <TextInput
                        label="Valor anterior"
                        value={eventForm.before}
                        placeholder="Valor atual"
                        onChange={(value) => setEventForm({ ...eventForm, before: value })}
                        required
                      />
                    </div>
                    <TextInput
                      label="Novo valor"
                      value={eventForm.after}
                      placeholder="Valor do cenário"
                      onChange={(value) => setEventForm({ ...eventForm, after: value })}
                      required
                    />
                    <textarea
                      className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                      placeholder="Motivo da reprogramação"
                      value={eventForm.reason}
                      onChange={(event) =>
                        setEventForm({ ...eventForm, reason: event.target.value })
                      }
                      required
                    />
                    <button
                      className="w-full rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                      disabled={busy}
                      type="submit"
                    >
                      Registrar cenário de reprogramação
                    </button>
                  </form>
                )}
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-2 py-2">Quando</th>
                        <th className="px-2 py-2">Item</th>
                        <th className="px-2 py-2">Alteração</th>
                        <th className="px-2 py-2">Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => {
                        const change = event.changes as {
                          external_key?: string
                          field?: string
                          before?: string
                          after?: string
                        }
                        return (
                          <tr className="border-b border-slate-100" key={event.id}>
                            <td className="px-2 py-2">{dateLabel(event.occurred_at)}</td>
                            <td className="px-2 py-2 font-mono">{change.external_key || '—'}</td>
                            <td className="px-2 py-2">
                              {change.field}: {change.before || '—'} → {change.after || '—'}
                            </td>
                            <td className="max-w-[220px] truncate px-2 py-2 text-slate-500">
                              {event.reason}
                            </td>
                          </tr>
                        )
                      })}
                      {events.length === 0 && (
                        <tr>
                          <td className="px-2 py-5 text-center text-slate-500" colSpan={4}>
                            Nenhum evento registrado neste ciclo.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <SectionTitle
                eyebrow="Integração"
                title="Execuções de sincronização"
                tag="somente leitura"
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="border-b border-slate-200 uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Início</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Lidas</th>
                      <th className="px-2 py-2">Novas</th>
                      <th className="px-2 py-2">Atualizadas</th>
                      <th className="px-2 py-2">Erro / parâmetros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {syncRuns.map((run) => (
                      <tr className="border-b border-slate-100" key={run.id}>
                        <td className="px-2 py-2">{dateLabel(run.started_at)}</td>
                        <td className="px-2 py-2">
                          <span className="rounded-full bg-slate-100 px-2 py-1">{run.status}</span>
                        </td>
                        <td className="px-2 py-2">{run.rows_read || 0}</td>
                        <td className="px-2 py-2">{run.rows_created || 0}</td>
                        <td className="px-2 py-2">{run.rows_updated || 0}</td>
                        <td className="max-w-[360px] truncate px-2 py-2 text-slate-500">
                          {run.error_message || (run.parameters ? 'leitura registrada' : '—')}
                        </td>
                      </tr>
                    ))}
                    {syncRuns.length === 0 && (
                      <tr>
                        <td className="px-2 py-5 text-center text-slate-500" colSpan={6}>
                          Nenhuma sincronização executada neste ciclo.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  )
}

function SectionTitle({ eyebrow, title, tag }: { eyebrow: string; title: string; tag: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-700">{eyebrow}</p>
        <h2 className="mt-1 text-xl font-bold">{title}</h2>
      </div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{tag}</span>
    </div>
  )
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  )
}

function TextInput({
  label,
  value,
  placeholder,
  onChange,
  required = false,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  )
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        type="number"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </label>
  )
}
