/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Printer, X, ShieldAlert, CheckCircle2, History } from 'lucide-react';
import { Invoice, InvoiceItem, Driver, Official, DriverAccountMovement } from '../types';

interface A5PrintPreviewProps {
  id?: string;
  type: 'invoice' | 'deduction' | 'statement' | 'custody_statement';
  invoiceData?: {
    invoice: Invoice;
    items: InvoiceItem[];
    officialName: string;
    carsMap: Record<string, string>; // ID to plate number
  };
  deductionData?: {
    driver: Driver;
    amount: number;
    description: string;
    date: string;
  };
  statementData?: {
    driver: Driver;
    movements: DriverAccountMovement[];
    month?: string;
    year?: string;
  };
  custodyData?: {
    official: Official;
    accountName: string;
    balance: number;
    movements: any[];
  };
  onClose: () => void;
}

export const A5PrintPreview: React.FC<A5PrintPreviewProps> = ({
  type,
  invoiceData,
  deductionData,
  statementData,
  custodyData,
  onClose
}) => {
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const getTodayDateString = () => {
    return new Date().toLocaleDateString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto no-print" id="a5_print_preview_modal">
      <div className="bg-white text-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden">
        {/* Modal Controls toolbar */}
        <div className="bg-slate-900 text-slate-100 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm md:text-base">معاينة المستند قبل الطباعة (قياس A5 المعتمد)</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              type="button"
              className="bg-emerald-600 hover:bg-emerald-500 font-semibold text-xs text-white px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 shadow"
            >
              <Printer className="w-4 h-4" />
              طباعة الآن (PDF / Printer)
            </button>
            <button
              onClick={onClose}
              type="button"
              className="p-1 px-2 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Card Area */}
        <div className="p-8 bg-slate-100 max-h-[70vh] overflow-y-auto flex justify-center">
          
          <div 
            ref={contentRef}
            className="bg-white p-6 shadow-md border border-slate-300 w-[148mm] min-h-[210mm] relative text-right text-xs leading-relaxed font-sans"
            style={{ direction: 'rtl' }}
            id="a5_print_document"
          >
            {/* العلامة المائية مخفية - تم الإلغاء بطلب الإدارة */}

            {/* Document Header Branding */}
            <div className="border-b-2 border-slate-800 pb-3 mb-4 flex items-center justify-between">
              <div>
                <h1 className="font-extrabold text-slate-900 text-sm flex items-center gap-1.5">
                  <span className="text-emerald-600 text-lg">■</span> شركة البنا جروب
                </h1>
              </div>
              <div className="text-left font-mono text-[9px] text-slate-400">
                <p>تاريخ الطباعة: {getTodayDateString()}</p>
                <p>رقم المستند: {type === 'invoice' ? invoiceData?.invoice.invoice_number : `DOC-${Date.now().toString().slice(-6)}`}</p>
                <p className="text-emerald-600 font-bold">الحالة: معتمد سحابيًا ✔</p>
              </div>
            </div>

            {/* Title */}
            <div className="text-center my-4 bg-slate-100 py-1.5 rounded border border-slate-200">
              <h2 className="font-bold text-slate-800 text-sm">
                {type === 'invoice' && 'فاتورة مصروفات ترخيص مركبة'}
                {type === 'deduction' && 'كشف مالي - إشعار خصم سائق مستقطع'}
                {type === 'statement' && `كشف حساب حركة الخصومات والمستحقات بالسائق`}
                {type === 'custody_statement' && `كشف حساب فرعي وحركات عهدة`}
              </h2>
            </div>

            {/* Content Specific elements */}

            {/* 1. INVOICE RENDERING */}
            {type === 'invoice' && invoiceData && (
              <div className="space-y-4">
                {/* Specific A5 Header Layout requested by User */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-slate-50 p-3 rounded text-[11px] border border-slate-200">
                  <div>
                    <span className="text-slate-500 font-medium">تاريخ الطباعة بالتذكرة:</span>{' '}
                    <span className="font-bold text-slate-950">{getTodayDateString()}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium font-sans">رقم السيارة المسجلة بالفاتورة:</span>{' '}
                    <span className="font-mono font-black text-indigo-700 text-xs text-right">
                      {invoiceData.invoice.car_id ? (invoiceData.carsMap[invoiceData.invoice.car_id] || "سيارة غير محددة") : "سيارة غير محددة"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">بيان الترخيص:</span>{' '}
                    <span className="font-bold text-slate-950">{invoiceData.invoice.license_details || 'تجديد فحص وتأمين دوري من العهدة'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-medium">مكان الترخيص:</span>{' '}
                    <span className="font-bold text-emerald-700">{invoiceData.invoice.license_location || 'رئاسة مرور القاهرة والجيزة'}</span>
                  </div>
                  <div className="col-span-2 border-t border-slate-200 pt-2 flex justify-between">
                    <span><span className="text-slate-500">مسئول التراخيص:</span> <span className="font-extrabold text-slate-800">{invoiceData.officialName}</span></span>
                    <span><span className="text-slate-500">رقم الفاتورة:</span> <span className="font-mono font-bold text-slate-800">{invoiceData.invoice.invoice_number}</span></span>
                    <span><span className="text-slate-500">تاريخ الفاتورة:</span> <span className="font-mono font-bold text-slate-800">{invoiceData.invoice.invoice_date}</span></span>
                  </div>
                </div>

                {/* Middle of invoice: newly added items table */}
                <div className="mt-4">
                  <div className="font-bold text-[10px] text-slate-705 mb-2">وسط الفاتورة - بنود ومكونات الصرف التفصيلية:</div>
                  <table className="w-full text-right border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-slate-800 text-white font-semibold">
                        <th className="py-2 px-2 border border-slate-700 text-center w-6">م</th>
                        <th className="py-2 px-2 border border-slate-700">البيان</th>
                        <th className="py-2 px-2 border border-slate-700 text-left w-24">المبلغ (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceData.items.map((item, idx) => (
                        <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="py-2 px-2 border border-slate-200 font-mono text-center">{idx + 1}</td>
                          <td className="py-2 px-2 border border-slate-200 font-medium">{item.description}</td>
                          <td className="py-2 px-2 border border-slate-200 text-left font-mono font-bold text-slate-900">{item.amount.toLocaleString()} ج.م</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-black bg-slate-100 text-slate-950 text-[11px]">
                        <td colSpan={2} className="py-2 px-2 border border-slate-300 text-right">الإجمالي الكامل المطلوب تسويته:</td>
                        <td className="py-2 px-2 border border-slate-300 text-left font-mono text-emerald-700">
                          {invoiceData.items.reduce((sum, i) => sum + i.amount, 0).toLocaleString()} ج.م
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Specific Footer Signatures requested by user */}
                <div className="mt-8 grid grid-cols-2 gap-4 border-t border-slate-200 pt-5 text-[10px] text-slate-700 text-center">
                  <div>
                    <p className="font-black text-slate-900 mb-9 leading-none">توقيع مسئول التراخيص</p>
                    <div className="border-b border-dashed border-slate-300 mx-3"></div>
                  </div>
                  <div>
                    <p className="font-black text-slate-900 mb-9 leading-none">توقيع مدير الحركة</p>
                    <div className="border-b border-dashed border-slate-300 mx-3"></div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. DEDUCTION INDIVIDUAL/GROUP RECEIPT */}
            {type === 'deduction' && deductionData && (
              <div className="space-y-4">
                <div className="border border-slate-200 p-4 rounded-xl bg-slate-50 space-y-2.5">
                  <div className="text-xs text-slate-600">
                    بموجب هذا الإشعار الإلكتروني المعتمد من محاسب النقليات بشركة البنا جروب، نقر بأنه تم خصم القيمة الموضحة أدناه من كشف رصيد السائق المستحق:
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-[10px] bg-white p-3 rounded border border-slate-150 mt-2">
                    <div>
                      <span className="text-slate-400">كود السائق:</span> <span className="font-mono font-bold text-slate-800">{deductionData.driver.driver_code}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">اسم السائق:</span> <span className="font-bold text-slate-800">{deductionData.driver.name}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">رقم الهاتف:</span> <span className="font-bold text-slate-800 font-mono">{deductionData.driver.phone}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">الرقم القومي:</span> <span className="font-semibold text-slate-800 font-mono">{deductionData.driver.national_id}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">التاريخ:</span> <span className="font-semibold text-slate-800 font-mono">{deductionData.date}</span>
                    </div>
                    <div>
                      <span className="text-slate-400">الرصيد المالي المتبقي:</span> <span className="font-bold text-rose-600 font-mono">{deductionData.driver.balance.toLocaleString()} ج.م</span>
                    </div>
                  </div>

                  <div className="bg-red-50 border border-red-500/10 p-3 rounded-lg flex items-center justify-between text-xs mt-3">
                    <div>
                      <span className="text-red-700 font-semibold">المبلغ المخصوم محاسبيًا:</span>
                      <p className="text-[10px] text-slate-500 mt-1">السبب: {deductionData.description}</p>
                    </div>
                    <span className="font-mono text-rose-700 font-extrabold text-base">-{deductionData.amount.toLocaleString()} ج.م</span>
                  </div>
                </div>

                {/* standard footer signatures */}
                <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-300 pt-4 text-[9px] text-slate-600 text-center">
                  <div>
                    <p className="font-bold text-slate-800">توقيع المستعلم/المسؤول</p>
                    <div className="h-10 border-b border-dashed border-slate-300"></div>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">توقيع السائق المقر</p>
                    <div className="h-10 border-b border-dashed border-slate-300"></div>
                  </div>
                  <div className="flex flex-col justify-between items-center bg-slate-50 p-1 rounded border border-slate-200">
                    <span className="font-bold text-[8px] text-emerald-800">اعتماد الإدارة والختم</span>
                    <div className="w-8 h-8 rounded-full border border-emerald-600/30 flex items-center justify-center font-bold text-[7px] text-emerald-600 leading-none">
                      البنا
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. STATEMENT LEDGER LOGS */}
            {type === 'statement' && statementData && (
              <div className="space-y-3">
                <div className="bg-slate-50 p-2 rounded border border-slate-200 grid grid-cols-2 gap-2 text-[10px]">
                  <div><span className="text-slate-500">اسم السائق المدقق:</span> <span className="font-bold text-slate-800">{statementData.driver.name}</span></div>
                  <div><span className="text-slate-500">كود السائق:</span> <span className="font-bold text-slate-800 font-mono">{statementData.driver.driver_code}</span></div>
                  <div><span className="text-slate-500">الفلترة:</span> <span className="font-bold text-emerald-600">
                    {statementData.month ? `${statementData.month} / ${statementData.year}` : 'كافة الحركات التاريخية'}
                  </span></div>
                  <div><span className="text-slate-500">المديونية المستحقة حالياً:</span> <span className="font-bold text-red-600 font-mono">{statementData.driver.balance.toLocaleString()} ج.م</span></div>
                </div>

                <div className="mt-3">
                  <div className="text-[9px] text-slate-500 mb-1.5 font-bold">الحركات القييدية للخصومات والمخالفات بالتفصيل:</div>
                  <table className="w-full text-right border-collapse text-[9px]">
                    <thead>
                      <tr className="bg-slate-800 text-white">
                        <th className="py-1 px-1.5 border border-slate-700">التاريخ</th>
                        <th className="py-1 px-1.5 border border-slate-700">البيان والحركة</th>
                        <th className="py-1 px-1.5 border border-slate-700 text-center">النوع</th>
                        <th className="py-1 px-1.5 border border-slate-700 text-left">التغيير (ج.م)</th>
                        <th className="py-1 px-1.5 border border-slate-700 text-left">الرصيد المركم</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statementData.movements.length > 0 ? statementData.movements.map((mov, idx) => (
                        <tr key={idx} className="border-b border-slate-200 odd:bg-slate-50 text-slate-700">
                          <td className="py-1 px-1.5 border border-slate-200 font-mono">{mov.date}</td>
                          <td className="py-1 px-1.5 border border-slate-200 font-medium truncate max-w-[150px]">{mov.description}</td>
                          <td className="py-1 px-1.5 border border-slate-200 text-center text-[8px]">
                            {mov.type === 'violation' && <span className="text-amber-700 font-bold bg-amber-50 px-1 rounded">مخالفة</span>}
                            {mov.type === 'deduction' && <span className="text-red-700 font-bold bg-red-50 px-1 rounded">خصم</span>}
                            {mov.type === 'payment' && <span className="text-emerald-700 font-bold bg-emerald-50 px-1 rounded">سداد</span>}
                            {mov.type === 'reversal' && <span className="text-blue-700 font-bold bg-blue-50 px-1 rounded">مرتد</span>}
                          </td>
                          <td className="py-1 px-1.5 border border-slate-200 text-left font-mono font-semibold">
                            {mov.amount_change > 0 ? `+${mov.amount_change}` : mov.amount_change}
                          </td>
                          <td className="py-1 px-1.5 border border-slate-200 text-left font-mono text-slate-900">{mov.new_balance}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} className="py-4 text-center text-slate-400">لا توجد حركات قييدية مطابقة للبحث في السجلات.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. CUSTODY STATEMENTS AND BANK CARD MOVEMENT LEDGER */}
            {type === 'custody_statement' && custodyData && (
              <div className="space-y-4">
                <div className="bg-slate-50 p-3 rounded border border-slate-200 text-[11px] space-y-1">
                  <div><span className="text-slate-500">منفذ عهدة الترخيص:</span> <span className="font-extrabold text-slate-800">{custodyData.official.name}</span></div>
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200">
                    <div><span className="text-slate-500">اسم الخزينة الفرعية:</span> <span className="font-bold text-indigo-700">{custodyData.accountName || 'بطاقة بنكية'}</span></div>
                    <div><span className="text-slate-500">الرصيد المحقق حالياً:</span> <span className="font-black text-emerald-700">{custodyData.balance?.toLocaleString()} ج.م</span></div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-[10px] text-slate-700 font-bold mb-2">حركات الخزينة الفرعية والتحويلات المسجلة:</div>
                  <table className="w-full text-right border-collapse text-[9px]">
                    <thead>
                      <tr className="bg-slate-800 text-white font-medium">
                        <th className="py-1.5 px-2 border border-slate-700">التاريخ</th>
                        <th className="py-1.5 px-2 border border-slate-700">البيان والحركة</th>
                        <th className="py-1.5 px-2 border border-slate-700 text-center">النوع</th>
                        <th className="py-1.5 px-2 border border-slate-700 text-left">التأثير (ج.م)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {custodyData.movements.length > 0 ? custodyData.movements.map((m, idx) => (
                        <tr key={idx} className="border-b border-slate-200 hover:bg-slate-50">
                          <td className="py-1.5 px-2 border border-slate-200 font-mono text-slate-500">{m.date}</td>
                          <td className="py-1.5 px-2 border border-slate-200 font-medium">{m.description}</td>
                          <td className="py-1.5 px-2 border border-slate-200 text-center">
                            {m.type === 'deposit' && <span className="text-emerald-700 font-bold bg-emerald-50 px-1 rounded text-[8px]">إيداع وتغذية</span>}
                            {m.type === 'withdrawal' && <span className="text-red-700 font-bold bg-red-50 px-1 rounded text-[8px]">سحب ومصروف</span>}
                            {m.type === 'transfer' && <span className="text-blue-700 font-bold bg-blue-50 px-1 rounded text-[8px]">تحويل نقود</span>}
                            {m.type === 'settlement' && <span className="text-amber-700 font-bold bg-amber-50 px-1 rounded text-[8px]">تسويات</span>}
                            {m.type === 'invoice_charge' && <span className="text-indigo-700 font-bold bg-indigo-50 px-1 rounded text-[8px]">خصم فاتورة</span>}
                          </td>
                          <td className={`py-1.5 px-2 border border-slate-200 text-left font-mono font-bold ${m.to_account_id === custodyData.movements[0]?.from_account_id ? 'text-red-600' : 'text-emerald-600'}`}>
                            {m.amount.toLocaleString()} ج.م
                          </td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={4} className="py-4 text-center text-slate-400">لا توجد حركات صادرة أو واردة مسجلة على هذه العهدة بعد.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-8 grid grid-cols-2 gap-4 border-t border-slate-300 pt-4 text-[9px] text-slate-600 text-center">
                  <div>
                    <p className="font-bold text-slate-800">مسؤول التراخيص والعهد</p>
                    <div className="h-10 border-b border-dashed border-slate-300"></div>
                  </div>
                  <div>
                    <p className="font-bold text-slate-800">اعتماد إدارة الحسابات والتشغيل</p>
                    <div className="h-10 border-b border-dashed border-slate-300"></div>
                  </div>
                </div>
              </div>
            )}

            {/* Terms Footer */}
            {type !== 'invoice' && (
              <div className="mt-6 pt-2 border-t border-slate-100 text-center text-[8px] text-slate-400">
                * تم توليد هذه الاستمارات محاسبيًا على أنظمة البنا جروب اللوجستية السحابية لعام 2026.
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
