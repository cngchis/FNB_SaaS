import { useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { calculateDiscount, type DiscountMode } from '../../utils/discount'
import { formatCurrency } from '../../services/mockData'

export function DiscountDialog({ subtotal, discount, paidBefore, onApply, onClose }: { subtotal:number; discount:number; paidBefore:number; onApply:(amount:number)=>void; onClose:()=>void }) {
  const [mode,setMode] = useState<DiscountMode>('vnd')
  const [value,setValue] = useState(String(discount))
  const [error,setError] = useState('')
  let preview: number | null = null
  try { preview=calculateDiscount(subtotal,value,mode,paidBefore) } catch { /* Validate again on submit and display a helpful error. */ }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    try { onApply(calculateDiscount(subtotal,value,mode,paidBefore)); onClose() }
    catch (error) { setError(error instanceof Error ? error.message : 'Giảm giá chưa hợp lệ.') }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {if(event.target===event.currentTarget)onClose()}}><section className="modal-card discount-dialog" role="dialog" aria-modal="true" aria-labelledby="discount-title" onKeyDown={(event)=>{if(event.key==='Escape')onClose()}}>
    <button className="modal-close" type="button" aria-label="Đóng" onClick={onClose}><X size={18}/></button>
    <h2 id="discount-title">Giảm giá đơn hàng</h2><p>Tạm tính: {formatCurrency(subtotal)}</p>
    <form onSubmit={submit}><div className="discount-input-group"><label className="form-label">Giá trị giảm giá<input autoFocus aria-label="Giá trị giảm giá" type="number" min="0" max={mode==='percent'?100:subtotal} step={mode==='percent'?'0.01':'1'} value={value} onChange={(event)=>{setValue(event.target.value);setError('')}} required /></label><div className="discount-mode-buttons"><button type="button" className={`button ${mode==='percent'?'button-primary':'button-secondary'}`} aria-pressed={mode==='percent'} onClick={()=>{setMode('percent');setValue('');setError('')}}>%</button><button type="button" className={`button ${mode==='vnd'?'button-primary':'button-secondary'}`} aria-pressed={mode==='vnd'} onClick={()=>{setMode('vnd');setValue('');setError('')}}>VND</button></div></div>
    <div className="shift-reconciliation"><span>Giảm giá</span><strong>{preview==null?'—':formatCurrency(preview)}</strong></div>
    {error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button className="button button-secondary" type="button" onClick={onClose}>Hủy</button><button className="button button-primary" type="submit">Áp dụng</button></div></form>
  </section></div>
}
