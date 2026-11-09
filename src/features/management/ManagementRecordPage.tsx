import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Search, X } from 'lucide-react'
import { formatCurrency } from '../../services/mockData'
import { managementModules, type ManagementModule, type ManagementRow, type ManagementValue } from './moduleConfig'

const pageSize = 6
const storageKey = (moduleId: string) => `fnb-management:${moduleId}`

function loadRows(module: ManagementModule): ManagementRow[] {
  try {
    const saved = localStorage.getItem(storageKey(module.id))
    if (saved) return JSON.parse(saved) as ManagementRow[]
  } catch {
    return module.rows
  }
  return module.rows
}

function displayValue(value: ManagementValue, type?: string) {
  if (type === 'currency' && typeof value === 'number') return formatCurrency(value)
  return String(value)
}

export function ManagementRecordPage({ moduleId }: { moduleId: string }) {
  const module = managementModules.find((item) => item.id === moduleId)
  if (!module) return null
  return <RecordWorkspace key={module.id} module={module} />
}

function RecordWorkspace({ module }: { module: ManagementModule }) {
  const [rows, setRows] = useState(() => loadRows(module))
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Tất cả')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [ascending, setAscending] = useState(true)
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ManagementRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ManagementRow | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    try { localStorage.setItem(storageKey(module.id), JSON.stringify(rows)) } catch { setNotice('Không thể lưu dữ liệu demo trên thiết bị.') }
  }, [module.id, rows])

  const filteredRows = useMemo(() => {
    const result = rows.filter((row) => {
      const matchesText = Object.values(row).some((value) => String(value).toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))
      const matchesFilter = filter === 'Tất cả' || Object.values(row).some((value) => String(value) === filter)
      return matchesText && matchesFilter
    })
    if (sortKey) result.sort((left, right) => {
      const a = left[sortKey] ?? ''
      const b = right[sortKey] ?? ''
      const comparison = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'vi')
      return ascending ? comparison : -comparison
    })
    return result
  }, [filter, query, rows, sortKey, ascending])

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize)
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])
  const toggleSort = (key: string) => {
    setAscending(sortKey === key ? !ascending : true)
    setSortKey(key)
  }
  const exportCsv = () => {
    const content = [module.columns.map((column) => column.label), ...filteredRows.map((row) => module.columns.map((column) => String(row[column.key] ?? '')))]
      .map((line) => line.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff', content], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${module.id}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  const saveRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const values = Object.fromEntries(module.fields.map((field) => {
      const value = String(formData.get(field.key) ?? '').trim()
      return [field.key, field.type === 'number' && value ? Number(value) : value]
    })) as ManagementRow
    const record: ManagementRow = editing
      ? { ...values, ...(editing.__id ? { __id: editing.__id } : {}) }
      : { ...values, __id: crypto.randomUUID() }
    setRows((current) => editing ? current.map((row) => row === editing ? record : row) : [record, ...current])
    setFormOpen(false)
    setEditing(null)
    setPage(1)
    setNotice(editing ? `Đã cập nhật ${module.entity}.` : `Đã thêm ${module.entity} mới.`)
    window.setTimeout(() => setNotice(''), 2600)
  }
  const removeRecord = () => {
    if (!deleteTarget) return
    setRows((current) => current.filter((row) => row !== deleteTarget))
    setDeleteTarget(null)
    setNotice(`Đã xóa ${module.entity}.`)
    window.setTimeout(() => setNotice(''), 2600)
  }

  return <section className="record-page">
    <div className="page-title-row"><div><div className="record-breadcrumb">Quản lý cửa hàng <span>/</span> {module.title}</div><h1>{module.title}</h1><p>{module.description}</p></div><div className="record-actions"><button className="button button-secondary" type="button" onClick={exportCsv}><Download size={15} /> Xuất file</button><button className="button button-primary" type="button" onClick={() => { setEditing(null); setFormOpen(true) }}><Plus size={16} /> Thêm {module.entity}</button></div></div>

    <div className="record-metrics">{module.metrics.map((metric) => <article className="record-metric" key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.hint}</small></article>)}</div>

    <section className="panel record-table-panel">
      <div className="record-toolbar"><label className="search-field"><Search size={16} /><input aria-label={module.searchPlaceholder} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder={module.searchPlaceholder} /><kbd>⌘ K</kbd></label><div className="record-filters"><button type="button" className={filter === 'Tất cả' ? 'active' : ''} onClick={() => { setFilter('Tất cả'); setPage(1) }}>Tất cả</button>{module.filters?.map((item) => <button type="button" key={item} className={filter === item ? 'active' : ''} onClick={() => { setFilter(item); setPage(1) }}>{item}</button>)}</div></div>
      <div className="table-scroll"><table className="data-table record-table"><thead><tr>{module.columns.map((column) => <th key={column.key}><button type="button" onClick={() => toggleSort(column.key)}>{column.label}<span aria-hidden="true">{sortKey === column.key ? ascending ? ' ↑' : ' ↓' : ' ↕'}</span></button></th>)}<th aria-label="Thao tác" /></tr></thead><tbody>
        {visibleRows.map((row, rowIndex) => <tr key={`${module.id}-${row.__id ?? row.code ?? row.name ?? row.employee ?? rowIndex}-${rowIndex}`}>
          {module.columns.map((column, columnIndex) => <td key={column.key} data-label={column.label} className={`${column.type === 'status' ? 'record-status-cell' : ''} ${columnIndex === 0 ? 'record-primary-cell' : ''}`}>
            {column.type === 'status' ? <span className={`status-badge ${/đã|đang|hoàn tất|xác nhận/i.test(String(row[column.key])) ? 'in-stock' : 'low'}`}><i />{displayValue(row[column.key] ?? '', column.type)}</span> : displayValue(row[column.key] ?? '', column.type)}
          </td>)}
          <td className="record-row-actions"><button type="button" className="row-menu" aria-label={`Sửa ${String(row[module.columns[0].key] ?? '')}`} onClick={() => { setEditing(row); setFormOpen(true) }}><Pencil size={15} /></button><button type="button" className="record-delete" aria-label={`Xóa ${String(row[module.columns[0].key] ?? '')}`} onClick={() => setDeleteTarget(row)}><X size={15} /></button></td>
        </tr>)}
      </tbody></table></div>
      {filteredRows.length === 0 && <div className="empty-state"><Search size={23} /><strong>Không tìm thấy dữ liệu</strong><span>Thử thay đổi từ khóa hoặc bộ lọc.</span></div>}
      <div className="table-footer"><span>Hiển thị <strong>{filteredRows.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredRows.length)}</strong> trong <strong>{filteredRows.length}</strong> {module.entity}</span><div className="pagination"><button type="button" aria-label="Trang trước" disabled={page === 1} onClick={() => setPage((current) => current - 1)}><ChevronLeft size={16} /></button><button className="current-page" type="button">{page} / {pageCount}</button><button type="button" aria-label="Trang sau" disabled={page === pageCount} onClick={() => setPage((current) => current + 1)}><ChevronRight size={16} /></button></div></div>
    </section>

    {notice && <div className="toast" role="status"><span className="toast-check">✓</span>{notice}</div>}
    {formOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFormOpen(false) }}><section className="modal-card record-dialog" role="dialog" aria-modal="true" aria-labelledby="record-dialog-title"><button className="modal-close" type="button" onClick={() => setFormOpen(false)} aria-label="Đóng"><X size={18} /></button><span className="modal-icon"><Plus size={18} /></span><h2 id="record-dialog-title">{editing ? `Cập nhật ${module.entity}` : `Thêm ${module.entity}`}</h2><p>Thông tin được lưu trong dữ liệu demo trên thiết bị.</p><form onSubmit={saveRecord}><div className="record-form-grid">{module.fields.map((field) => {
      const choices = field.key === 'type' ? module.filters : field.key === 'status' ? [...new Set(rows.map((row) => String(row.status ?? '')).filter(Boolean))] : undefined
      return <label className="form-label" key={field.key}>{field.label}{choices?.length ? <select name={field.key} defaultValue={String(editing?.[field.key] ?? choices[0])} required={field.required}>{choices.map((choice) => <option key={choice}>{choice}</option>)}</select> : <input name={field.key} type={field.type === 'number' || field.type === 'tel' ? field.type : 'text'} inputMode={field.type === 'date' ? 'numeric' : undefined} defaultValue={editing?.[field.key] == null ? '' : String(editing[field.key])} required={field.required} min={field.type === 'number' ? 0 : undefined} />}</label>
    })}</div><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setFormOpen(false)}>Hủy</button><button className="button button-primary" type="submit">{editing ? 'Lưu thay đổi' : `Thêm ${module.entity}`}</button></div></form></section></div>}
    {deleteTarget && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null) }}><section className="modal-card delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title"><button className="modal-close" type="button" onClick={() => setDeleteTarget(null)} aria-label="Đóng"><X size={18} /></button><h2 id="delete-dialog-title">Xóa {module.entity}?</h2><p>Bản ghi “{String(deleteTarget[module.columns[0].key] ?? '')}” sẽ bị xóa khỏi dữ liệu demo trên thiết bị.</p><div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setDeleteTarget(null)}>Hủy</button><button className="button button-danger" type="button" onClick={removeRecord}>Xóa bản ghi</button></div></section></div>}
  </section>
}
