/**
 * شاشة استيراد فواتير PDF القديمة
 */
import React, { useState, useRef } from 'react';
import { useDb } from '../db/store';
import { Upload, FileText, CheckCircle2, AlertOctagon, Plus, Trash2, X, Save } from 'lucide-react';

interface ImportItem {
  id: string;
  description: string;
  amount: number;
}

interface ImportForm {
  external_invoice_number: string;
  invoice_date: string;
  car_number: string;
  license_location: string;
  license_details: string;
  items: ImportItem[];
  total_amount: number;
}

const emptyForm = (): ImportForm => ({
  external_invoice_number: '',
  invoice_date: new Date().toISOString().split('T')[0],
  car_number: '',
  license_location: '',
  license_details: 'تجديد سنوى',
  items: [{ id: 'r1', description: '', amount: 0 }],
  total_amount: 0
});

export const PdfInvoiceImport: React.FC = () => {
  const db = useDb();
  const [form, setForm] = useState<ImportForm>(emptyForm());
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; text: string }>({ type: null, text: '' });
  const [importedList, setImportedList] = useState<{ num: string; car: string; total: number }[]>([]);
  const [pdfText, setPdfText] = useState('');
  const [showParser, setShowParser] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const showMsg = (text: string, type: 'success' | 'error') => {
    setStatus({ type, text });
    setTimeout(() => setStatus({ type: null, text: '' }), 6000);
  };

  // حساب الإجمالي تلقائياً
  const calcTotal = (items: ImportItem[]) =>
    items.reduce((s, i) => s + (Number(i.amount) || 0), 0);

  const updateItem = (id: string, field: 'description' | 'amount', val: any) => {
    const updated = form.items.map(i =>
      i.id === id ? { ...i, [field]: field === 'amount' ? Number(val) : val } : i
    );
    setForm(prev => ({ ...prev, items: updated, total_amount: calcTotal(updated) }));
  };

  const addItem = () => {
    const updated = [...form.items, { id: 'r' + Date.now(), description: '', amount: 0 }];
    setForm(prev => ({ ...prev, items: updated }));
  };

  const removeItem = (id: string) => {
    if (form.items.length <= 1) return;
    const updated = form.items.filter(i => i.id !== id);
    setForm(prev => ({ ...prev, items: updated, total_amount: calcTotal(updated) }));
  };

  // تحليل نص PDF يدوياً
  const parsePdfText = () => {
    if (!pdfText.trim()) return;
    const lines = pdfText.split('\n').map(l => l.trim()).filter(Boolean);

    let invNum = '', date = '', carNum = '', location = '', details = '';
    const parsedItems: ImportItem[] = [];

    for (const line of lines) {
      if (line.includes('رقم الفاتورة')) {
        invNum = line.replace('رقم الفاتورة', '').replace(/[:–-]/g, '').trim();
      } else if (line.includes('التاريخ') || line.includes('التاریخ')) {
        const d = line.replace(/التاريخ|التاریخ/g, '').replace(/[:–-]/g, '').trim();
        // تحويل تنسيق DD-MM-YYYY إلى YYYY-MM-DD
        const parts = d.split('-');
        if (parts.length === 3 && parts[0].length <= 2) {
          date = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
        } else {
          date = d;
        }
      } else if (line.includes('رقم السيارة') || line.includes('رقم السیارة')) {
        carNum = line.replace(/رقم السيارة|رقم السیارة/g, '').replace(/[:–-]/g, '').trim();
      } else if (line.includes('مكان الخدمة') || line.includes('مكان الترخيص')) {
        location = line.replace(/مكان الخدمة|مكان الترخيص/g, '').replace(/[:–-]/g, '').trim();
      } else if (line.includes('الترخيص') && !line.includes('رقم') && !line.includes('مكان')) {
        details = line.replace('الترخيص', '').replace(/[:–-]/g, '').trim();
      } else if (line.includes('اجمالى') || line.includes('إجمالى') || line.includes('الإجمالي')) {
        // آخر سطر — إجمالي
      } else {
        // محاولة تحليل بنود: الرقم في البداية أو النهاية
        const amountMatch = line.match(/^(\d[\d,]+)\s+(.+)$/) || line.match(/^(.+)\s+(\d[\d,]+)$/);
        if (amountMatch) {
          const amount = parseInt(amountMatch[1].replace(/,/g, '')) || parseInt(amountMatch[2].replace(/,/g, ''));
          const desc = amountMatch[2] || amountMatch[1];
          if (amount > 0 && amount < 100000 && desc.length > 2) {
            parsedItems.push({ id: 'p' + Date.now() + Math.random(), description: desc.trim(), amount });
          }
        }
      }
    }

    if (invNum) setForm(prev => ({ ...prev, external_invoice_number: invNum }));
    if (date) setForm(prev => ({ ...prev, invoice_date: date }));
    if (carNum) setForm(prev => ({ ...prev, car_number: carNum }));
    if (location) setForm(prev => ({ ...prev, license_location: location }));
    if (details) setForm(prev => ({ ...prev, license_details: details }));
    if (parsedItems.length > 0) {
      setForm(prev => ({
        ...prev,
        items: parsedItems,
        total_amount: calcTotal(parsedItems)
      }));
    }
    setShowParser(false);
    showMsg('تم استخراج البيانات — راجعها وعدّل ما يلزم قبل الحفظ', 'success');
  };

  const handleSave = () => {
    if (!form.external_invoice_number) return showMsg('أدخل رقم الفاتورة', 'error');
    if (!form.car_number) return showMsg('أدخل رقم السيارة', 'error');
    if (!form.invoice_date) return showMsg('أدخل تاريخ الفاتورة', 'error');
    if (form.items.some(i => !i.description || i.amount <= 0)) return showMsg('أكمل جميع بنود الفاتورة', 'error');

    const res = db.importOldInvoice({
      external_invoice_number: form.external_invoice_number,
      invoice_date: form.invoice_date,
      car_number: form.car_number,
      license_location: form.license_location,
      license_details: form.license_details,
      items: form.items.map(i => ({ description: i.description, amount: i.amount })),
      total_amount: form.total_amount
    });

    if (res.success) {
      showMsg(`✅ تم استيراد الفاتورة OLD-${form.external_invoice_number} بنجاح`, 'success');
      setImportedList(prev => [{ num: form.external_invoice_number, car: form.car_number, total: form.total_amount }, ...prev]);
      setForm(emptyForm());
    } else {
      showMsg(res.error || 'حدث خطأ', 'error');
    }
  };

  return (
    <div className="space-y-5 text-right" style={{ direction: 'rtl' }}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-400" />
          <span className="font-bold text-slate-200">استيراد فواتير PDF القديمة إلى قاعدة البيانات</span>
        </div>
        <button
          onClick={() => setShowParser(!showParser)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-all"
        >
          <Upload className="w-4 h-4" />
          لصق نص PDF للتحليل التلقائي
        </button>
      </div>

      {/* رسائل الحالة */}
      {status.type && (
        <div className={`rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-2 ${
          status.type === 'success' ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/15 border border-red-500/30 text-red-400'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertOctagon className="w-4 h-4" />}
          {status.text}
        </div>
      )}

      {/* منطقة لصق نص PDF */}
      {showParser && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-4 space-y-3">
          <p className="text-xs text-slate-400">الصق محتوى الـ PDF كنص — سيتم استخراج البيانات تلقائياً:</p>
          <textarea
            rows={8}
            className="w-full rounded-lg px-3 py-2 text-xs font-mono text-left resize-y"
            placeholder={`رقم الفاتورة 3360\nالتاريخ 23-05-2026\nرقم السيارة 1215\nمكان الخدمة حملة منياالقمح\nالترخيص تجديد سنوى\n830 استمارة تجديد...\n8565 اجمالى`}
            value={pdfText}
            onChange={e => setPdfText(e.target.value)}
            style={{ direction: 'rtl' }}
          />
          <div className="flex gap-2">
            <button onClick={parsePdfText} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-all">
              استخراج البيانات
            </button>
            <button onClick={() => { setShowParser(false); setPdfText(''); }} className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-4 py-2 rounded-lg transition-all">
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* نموذج الاستيراد */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
        <p className="text-xs text-slate-400 font-bold border-b border-slate-800 pb-2">بيانات الفاتورة</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-slate-400 font-bold mb-1">رقم الفاتورة الأصلي *</label>
            <input
              type="text" placeholder="مثال: 3360"
              className="w-full rounded-lg px-3 py-2"
              value={form.external_invoice_number}
              onChange={e => setForm(p => ({ ...p, external_invoice_number: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1">تاريخ الفاتورة *</label>
            <input
              type="date"
              className="w-full rounded-lg px-3 py-2"
              value={form.invoice_date}
              onChange={e => setForm(p => ({ ...p, invoice_date: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1">رقم السيارة *</label>
            <input
              type="text" placeholder="مثال: 1215 أو ر ي ص 1215"
              list="cars-list"
              className="w-full rounded-lg px-3 py-2"
              value={form.car_number}
              onChange={e => setForm(p => ({ ...p, car_number: e.target.value }))}
            />
            <datalist id="cars-list">
              {db.cars.map(c => <option key={c.id} value={c.car_number} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-slate-400 font-bold mb-1">مكان الترخيص</label>
            <input
              type="text" placeholder="مثال: حملة منياالقمح"
              className="w-full rounded-lg px-3 py-2"
              value={form.license_location}
              onChange={e => setForm(p => ({ ...p, license_location: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-slate-400 font-bold mb-1">بيان الترخيص</label>
            <input
              type="text" placeholder="مثال: تجديد سنوى"
              className="w-full rounded-lg px-3 py-2"
              value={form.license_details}
              onChange={e => setForm(p => ({ ...p, license_details: e.target.value }))}
            />
          </div>
        </div>

        {/* بنود الفاتورة */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400 font-bold">بنود الفاتورة</p>
            <button onClick={addItem} className="text-emerald-400 hover:text-emerald-300 text-xs flex items-center gap-1 font-bold">
              <Plus className="w-3.5 h-3.5" /> إضافة بند
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-950 text-slate-400">
                  <th className="py-2 px-3 text-right">البيان</th>
                  <th className="py-2 px-3 text-left w-28">المبلغ (ج.م)</th>
                  <th className="py-2 px-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {form.items.map(item => (
                  <tr key={item.id} className="border-b border-slate-800">
                    <td className="py-1.5 px-2">
                      <input
                        type="text"
                        className="w-full rounded px-2 py-1 text-xs"
                        placeholder="وصف البند..."
                        value={item.description}
                        onChange={e => updateItem(item.id, 'description', e.target.value)}
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <input
                        type="number"
                        className="w-full rounded px-2 py-1 text-xs text-left font-mono"
                        value={item.amount || ''}
                        onChange={e => updateItem(item.id, 'amount', e.target.value)}
                      />
                    </td>
                    <td className="py-1.5 px-2">
                      <button onClick={() => removeItem(item.id)} className="text-slate-600 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-950 font-bold">
                  <td className="py-2 px-3 text-slate-300">الإجمالي</td>
                  <td className="py-2 px-3 text-left font-mono text-emerald-400 text-sm">{form.total_amount.toLocaleString()} ج.م</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <button
          onClick={handleSave}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-all"
        >
          <Save className="w-4 h-4" />
          حفظ الفاتورة في قاعدة البيانات
        </button>
      </div>

      {/* سجل المستوردة */}
      {importedList.length > 0 && (
        <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-4 space-y-2">
          <p className="text-xs text-emerald-400 font-bold">✅ الفواتير المستوردة في هذه الجلسة</p>
          <div className="space-y-1">
            {importedList.map((inv, i) => (
              <div key={i} className="flex items-center justify-between text-xs text-slate-300 bg-slate-800/50 rounded-lg px-3 py-2">
                <span className="font-mono text-indigo-400">OLD-{inv.num}</span>
                <span className="text-slate-400">سيارة: <span className="text-sky-400 font-bold">{inv.car}</span></span>
                <span className="font-mono font-bold text-emerald-400">{inv.total.toLocaleString()} ج.م</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
