import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'

export type PlanningCycleStatus = 'draft' | 'open' | 'closed' | 'archived'
export type PlanningSource = 'manual' | 'maxiprod' | 'import' | 'pulso'
export type PlanningItemStatus = 'pending' | 'producing' | 'produced' | 'fulfilled' | 'cancelled'
export type ProductionDeclarationStatus = 'draft' | 'confirmed' | 'cancelled'

export interface PlanningCycle extends RecordModel {
  name: string
  status: PlanningCycleStatus
  start_date: string
  end_date: string
  source: PlanningSource
  source_version: string
  notes: string
  created_by?: string
}

export interface PlanningItem extends RecordModel {
  cycle_id: string
  external_key: string
  product_code: string
  product_name: string
  pv_number: string
  client_name: string
  company_name: string
  delivery_date: string
  planned_week: string
  quantity: number
  produced_quantity?: number
  unit_value?: number
  total_value?: number
  status: PlanningItemStatus
  source_system: PlanningSource
  source_record_id?: string
  is_freight?: boolean
  rigid_date?: string
  notes?: string
}

export interface ProductionDeclaration extends RecordModel {
  cycle_id: string
  production_date: string
  product_code: string
  product_name?: string
  quantity: number
  allocation?: Record<string, unknown>
  source: PlanningSource
  status: ProductionDeclarationStatus
  declared_by?: string
  notes?: string
}

export interface ReprogrammingEvent extends RecordModel {
  cycle_id: string
  event_type: 'scenario' | 'actual' | 'import' | 'system'
  occurred_at: string
  reason: string
  source?: string
  changes: Record<string, unknown>
  before_snapshot?: Record<string, unknown>
  created_by?: string
}

export interface CreateCycleInput {
  name: string
  status?: PlanningCycleStatus
  start_date: string
  end_date: string
  source?: PlanningSource
  source_version?: string
  notes?: string
}

export interface CreateProductionDeclarationInput {
  cycle_id: string
  production_date: string
  product_code: string
  product_name?: string
  quantity: number
  allocation?: Record<string, unknown>
  source?: PlanningSource
  status?: ProductionDeclarationStatus
  notes?: string
}

export interface CreatePlanningItemInput {
  cycle_id: string
  external_key: string
  product_code: string
  product_name: string
  pv_number?: string
  client_name?: string
  company_name?: string
  delivery_date: string
  planned_week: string
  quantity: number
  produced_quantity?: number
  unit_value?: number
  total_value?: number
  status?: PlanningItemStatus
  source_system?: PlanningSource
  source_record_id?: string
  is_freight?: boolean
  rigid_date?: string
  notes?: string
}

function requireAuth() {
  if (!pb.authStore.isValid) {
    throw new Error('É necessário entrar no Compass 2.0 para acessar os dados.')
  }
}

export async function listPlanningCycles(): Promise<PlanningCycle[]> {
  requireAuth()
  return pb
    .collection('planning_cycles')
    .getFullList<PlanningCycle>({ sort: '-start_date,-created' })
}

export async function createPlanningCycle(input: CreateCycleInput): Promise<PlanningCycle> {
  requireAuth()
  return pb.collection('planning_cycles').create<PlanningCycle>({
    ...input,
    status: input.status ?? 'draft',
    source: input.source ?? 'manual',
    source_version: input.source_version ?? '',
    notes: input.notes ?? '',
    created_by: pb.authStore.record?.id,
  })
}

export async function listPlanningItems(cycleId: string): Promise<PlanningItem[]> {
  requireAuth()
  return pb.collection('planning_items').getFullList<PlanningItem>({
    filter: pb.filter('cycle_id = {:cycleId}', { cycleId }),
    sort: 'delivery_date,product_name,pv_number',
  })
}

export async function createPlanningItem(input: CreatePlanningItemInput): Promise<PlanningItem> {
  requireAuth()
  const unitValue = input.unit_value ?? 0
  return pb.collection('planning_items').create<PlanningItem>({
    ...input,
    pv_number: input.pv_number ?? '',
    client_name: input.client_name ?? '',
    company_name: input.company_name ?? '',
    produced_quantity: input.produced_quantity ?? 0,
    unit_value: unitValue,
    total_value: input.total_value ?? input.quantity * unitValue,
    status: input.status ?? 'pending',
    source_system: input.source_system ?? 'manual',
    source_record_id: input.source_record_id ?? '',
    is_freight: input.is_freight ?? false,
    rigid_date: input.rigid_date ?? '',
    notes: input.notes ?? '',
  })
}

export async function listProductionDeclarations(
  cycleId: string,
): Promise<ProductionDeclaration[]> {
  requireAuth()
  return pb.collection('production_declarations').getFullList<ProductionDeclaration>({
    filter: pb.filter('cycle_id = {:cycleId}', { cycleId }),
    sort: 'production_date,product_code',
  })
}

export async function createProductionDeclaration(
  input: CreateProductionDeclarationInput,
): Promise<ProductionDeclaration> {
  requireAuth()
  return pb.collection('production_declarations').create<ProductionDeclaration>({
    ...input,
    allocation: input.allocation ?? {},
    source: input.source ?? 'manual',
    status: input.status ?? 'draft',
    notes: input.notes ?? '',
    declared_by: pb.authStore.record?.id,
  })
}

export async function recordReprogrammingEvent(input: {
  cycle_id: string
  event_type: ReprogrammingEvent['event_type']
  occurred_at: string
  reason: string
  source?: string
  changes: Record<string, unknown>
  before_snapshot?: Record<string, unknown>
}): Promise<ReprogrammingEvent> {
  requireAuth()
  return pb.collection('reprogramming_events').create<ReprogrammingEvent>({
    ...input,
    source: input.source ?? 'compass-2.0',
    created_by: pb.authStore.record?.id,
  })
}

export async function listReprogrammingEvents(cycleId: string): Promise<ReprogrammingEvent[]> {
  requireAuth()
  return pb.collection('reprogramming_events').getFullList<ReprogrammingEvent>({
    filter: pb.filter('cycle_id = {:cycleId}', { cycleId }),
    sort: '-occurred_at,-created',
  })
}
