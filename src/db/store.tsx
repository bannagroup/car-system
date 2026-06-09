/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { 
  Driver, 
  Official, 
  Car, 
  Violation, 
  Invoice, 
  InvoiceItem, 
  InvoiceAuditLog, 
  DriverAccountMovement, 
  CustodyAccount, 
  CustodyMovement 
} from '../types';
import { getSupabaseClient } from './supabaseClient';
import {
  INITIAL_OFFICIALS,
  INITIAL_DRIVERS,
  INITIAL_CARS,
  INITIAL_VIOLATIONS,
  INITIAL_INVOICES,
  INITIAL_INVOICE_ITEMS,
  INITIAL_AUDIT_LOGS,
  INITIAL_ACCOUNT_MOVEMENTS
} from './mockData';

interface DbContextType {
  drivers: Driver[];
  officials: Official[];
  cars: Car[];
  violations: Violation[];
  invoices: Invoice[];
  invoiceItems: InvoiceItem[];
  auditLogs: InvoiceAuditLog[];
  movements: DriverAccountMovement[];
  custodyAccounts: CustodyAccount[];
  custodyMovements: CustodyMovement[];
  
  // Real-time status simulation / State settings
  isRealtimeActive: boolean;
  setRealtimeActive: (val: boolean) => void;
  latencyMs: number;

  // Supabase cloud states & triggers
  isCloudConnected: boolean;
  isCloudSyncing: boolean;
  cloudError: string | null;
  setCloudError: (val: string | null) => void;
  testCloudConnection: () => Promise<{ success: boolean; message: string }>;
  uploadLocalDataToCloud: () => Promise<{ success: boolean; message: string }>;
  downloadCloudDataToLocal: (isManual?: boolean) => Promise<{ success: boolean; message: string }>;

  // Driver Actions
  addDriver: (driver: Omit<Driver, 'id' | 'balance'>) => Driver;
  updateDriver: (id: string, driver: Partial<Driver>) => void;
  deleteDriver: (id: string) => void;

  // Car Actions
  addCar: (car: Omit<Car, 'id'>) => Car;
  updateCar: (id: string, car: Partial<Car>) => void;
  deleteCar: (id: string) => void;

  // Official (Custody) Actions
  addOfficial: (official: Omit<Official, 'id'>) => Official;
  updateCustody: (id: string, cashDelta: number, visaDelta: number) => void;

  // Custody Accounts Actions
  addCustodyAccount: (account: Omit<CustodyAccount, 'id'>) => CustodyAccount;
  updateCustodyAccount: (id: string, account: Partial<CustodyAccount>) => void;
  deleteCustodyAccount: (id: string) => void;
  transferCustody: (fromAccountId: string, toAccountId: string, amount: number, description: string) => { success: boolean; error?: string };

  // Violation Actions
  addViolation: (violation: Omit<Violation, 'id'>, forceBypass?: boolean) => { success: boolean; error?: string; duplicateViolation?: Violation };
  deleteViolation: (id: string) => void;

  // Deduction Actions
  applyIndividualDeduction: (driverId: string, amount: number, description: string, date?: string) => void;
  applyGroupDeductionRpc: (amount: number, description: string) => Promise<boolean>;

  // Invoice & Custody Transactions (Crucial database logic)
  createInvoice: (invoiceData: Omit<Invoice, 'id' | 'invoice_number' | 'version' | 'is_modified' | 'is_deleted'>, items: Omit<InvoiceItem, 'id' | 'invoice_id' | 'car_id'>[]) => { success: boolean; error?: string; invoice?: Invoice };
  updateInvoice: (invoiceId: string, supervisorName: string, items: Omit<InvoiceItem, 'id' | 'invoice_id' | 'car_id'>[]) => { success: boolean; error?: string };
  deleteInvoice: (invoiceId: string, supervisorName: string) => { success: boolean; error?: string };
  saveDraftVouchers: (drafts: any[]) => Promise<void>;
  loadDraftVouchers: () => Promise<any[] | null>;
  importOldInvoice: (data: {
    external_invoice_number: string;
    invoice_date: string;
    car_number: string;
    license_location: string;
    license_details: string;
    items: { description: string; amount: number }[];
    total_amount: number;
  }) => { success: boolean; error?: string; invoice?: Invoice };

  // Reset database helper
  resetToInitial: () => void;

  // Local offline backup and restore features
  exportLocalBackup: () => string;
  importLocalBackup: (jsonData: string) => { success: boolean; message: string };
  exportCloudBackup: () => Promise<{ success: boolean; data?: string; message: string }>;
}

const DbContext = createContext<DbContextType | undefined>(undefined);

export const DbProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const loadSavedArray = <T,>(key: string, defaultValue: T[]): T[] => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn(`Error parsing localStorage key "${key}":`, e);
    }
    return defaultValue;
  };

  const [drivers, setDrivers] = useState<Driver[]>(() => 
    loadSavedArray('elbanna_drivers', INITIAL_DRIVERS)
  );

  const [officials, setOfficials] = useState<Official[]>(() => 
    loadSavedArray('elbanna_officials', INITIAL_OFFICIALS)
  );

  const [cars, setCars] = useState<Car[]>(() => 
    loadSavedArray('elbanna_cars', INITIAL_CARS)
  );

  const [violations, setViolations] = useState<Violation[]>(() => 
    loadSavedArray('elbanna_violations', INITIAL_VIOLATIONS)
  );

  const [invoices, setInvoices] = useState<Invoice[]>(() => 
    loadSavedArray('elbanna_invoices', INITIAL_INVOICES)
  );

  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>(() => 
    loadSavedArray('elbanna_invoice_items', INITIAL_INVOICE_ITEMS)
  );

  const [auditLogs, setAuditLogs] = useState<InvoiceAuditLog[]>(() => 
    loadSavedArray('elbanna_audit_logs', INITIAL_AUDIT_LOGS)
  );

  const [movements, setMovements] = useState<DriverAccountMovement[]>(() => 
    loadSavedArray('elbanna_movements', INITIAL_ACCOUNT_MOVEMENTS)
  );

  const [custodyAccounts, setCustodyAccounts] = useState<CustodyAccount[]>(() => {
    try {
      const saved = localStorage.getItem('elbanna_custody_accounts');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Error parsing custody accounts:', e);
    }
    return [
      { id: "ca_1_1", official_id: "1", name: "نقدي كاش رئيسي", type: 'cash', balance: 50000 },
      { id: "ca_1_2", official_id: "1", name: "فيزا بنك مصر (025)", type: 'visa', balance: 40000 },
      { id: "ca_1_3", official_id: "1", name: "فيزا الائتمان الرئيسي (114)", type: 'other_visa', balance: 60000 },
      { id: "ca_2_1", official_id: "2", name: "نقدي كاش فرعي", type: 'cash', balance: 25000 },
      { id: "ca_2_2", official_id: "2", name: "فيزا البريد المصري", type: 'visa', balance: 40000 },
      { id: "ca_3_1", official_id: "3", name: "نقدي كاش يدوي", type: 'cash', balance: 15000 },
      { id: "ca_3_2", official_id: "3", name: "فيزا البنك الأهلي تراخيص", type: 'visa', balance: 20000 }
    ];
  });

  const [custodyMovements, setCustodyMovements] = useState<CustodyMovement[]>(() => 
    loadSavedArray('elbanna_custody_movements', [])
  );

  const [isRealtimeActive, setRealtimeActive] = useState(true);
  const [latencyMs, setLatencyMs] = useState(50);

  // Cloud management state
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const isDownloadingRef = useRef(false);
  const isFirstMountRef = useRef(true);

  // Persist store state in local storage (local backup)
  useEffect(() => {
    localStorage.setItem('elbanna_drivers', JSON.stringify(drivers));
  }, [drivers]);

  useEffect(() => {
    localStorage.setItem('elbanna_officials', JSON.stringify(officials));
  }, [officials]);

  useEffect(() => {
    localStorage.setItem('elbanna_cars', JSON.stringify(cars));
  }, [cars]);

  useEffect(() => {
    localStorage.setItem('elbanna_violations', JSON.stringify(violations));
  }, [violations]);

  useEffect(() => {
    localStorage.setItem('elbanna_invoices', JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem('elbanna_invoice_items', JSON.stringify(invoiceItems));
  }, [invoiceItems]);

  useEffect(() => {
    localStorage.setItem('elbanna_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem('elbanna_movements', JSON.stringify(movements));
  }, [movements]);

  useEffect(() => {
    localStorage.setItem('elbanna_custody_accounts', JSON.stringify(custodyAccounts));
  }, [custodyAccounts]);

  useEffect(() => {
    localStorage.setItem('elbanna_custody_movements', JSON.stringify(custodyMovements));
  }, [custodyMovements]);

  // Automatic background silent upload whenever state changes locally (without manual triggers)
  useEffect(() => {
    // Skip the very first run on mount to prevent uploading stale local storage data before downloading fresh cloud data
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }

    const client = getSupabaseClient();
    if (!client) return;

    if (isDownloadingRef.current) {
      console.log("Auto-upload bypassed because downloading is active.");
      return;
    }

    const delayDebounce = setTimeout(async () => {
      console.log("Triggering silent auto-upload of updated local data to Supabase...");
      try {
        const res = await uploadLocalDataToCloud();
        if (!res.success) {
          console.warn("Silent auto-upload failed:", res.message);
          setCloudError(res.message);
        } else {
          setCloudError(null);
        }
      } catch (err: any) {
        console.error("Auto-upload background error:", err);
        setCloudError(err.message || "حدث خطأ غير متوقع أثناء المزامنة التلقائية بالخلفية.");
      }
    }, 1500); // 1.5 seconds debounce to batch fast inputs (like imports or multiple rapid entries)

    return () => clearTimeout(delayDebounce);
  }, [drivers, officials, cars, violations, invoices, invoiceItems, auditLogs, movements, custodyAccounts, custodyMovements]);

  // Network jitter simulation
  useEffect(() => {
    const interval = setInterval(() => {
      if (isRealtimeActive) {
        setLatencyMs(Math.floor(Math.random() * 80) + 30);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [isRealtimeActive]);

  // Download Cloud Data to Local (Replaces currently loaded state with database content)
  const downloadCloudDataToLocal = async (isManual: boolean = false): Promise<{ success: boolean; message: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsCloudConnected(false);
      return { success: false, message: "مفاتيح ربط Supabase السحابية غير مهيأة بعد." };
    }

    setIsCloudSyncing(true);
    setCloudError(null);
    isDownloadingRef.current = true;

    try {
      const [
        resDrivers,
        resOfficials,
        resCars,
        resViolations,
        resInvoices,
        resItems,
        resLogs,
        resMovements,
        resCustodyAccs,
        resCustodyMovs
      ] = await Promise.all([
        supabase.from('drivers').select('*'),
        supabase.from('officials').select('*'),
        supabase.from('cars').select('*'),
        supabase.from('violations').select('*').order('violation_date', { ascending: false }),
        supabase.from('invoices').select('*').order('invoice_number', { ascending: false }),
        supabase.from('invoice_items').select('*'),
        supabase.from('invoice_audit_logs').select('*').order('timestamp', { ascending: false }),
        supabase.from('driver_account_movements').select('*').order('date', { ascending: false }),
        supabase.from('custody_accounts').select('*'),
        supabase.from('custody_movements').select('*').order('date', { ascending: false })
      ]);

      let errorOccurred = false;
      const detailedErrors: string[] = [];

      if (resDrivers.error) {
        errorOccurred = true;
        detailedErrors.push(`drivers: ${resDrivers.error.message} (code: ${resDrivers.error.code})`);
      }
      if (resOfficials.error) {
        errorOccurred = true;
        detailedErrors.push(`officials: ${resOfficials.error.message} (code: ${resOfficials.error.code})`);
      }
      if (resCars.error) {
        errorOccurred = true;
        detailedErrors.push(`cars: ${resCars.error.message} (code: ${resCars.error.code})`);
      }
      if (resViolations.error) {
        errorOccurred = true;
        detailedErrors.push(`violations: ${resViolations.error.message} (code: ${resViolations.error.code})`);
      }
      if (resInvoices.error) {
        errorOccurred = true;
        detailedErrors.push(`invoices: ${resInvoices.error.message} (code: ${resInvoices.error.code})`);
      }
      if (resItems.error) {
        errorOccurred = true;
        detailedErrors.push(`invoice_items: ${resItems.error.message} (code: ${resItems.error.code})`);
      }
      if (resLogs.error) {
        errorOccurred = true;
        detailedErrors.push(`invoice_audit_logs: ${resLogs.error.message} (code: ${resLogs.error.code})`);
      }
      if (resMovements.error) {
        errorOccurred = true;
        detailedErrors.push(`driver_account_movements: ${resMovements.error.message} (code: ${resMovements.error.code})`);
      }
      if (resCustodyAccs.error) {
        errorOccurred = true;
        detailedErrors.push(`custody_accounts: ${resCustodyAccs.error.message} (code: ${resCustodyAccs.error.code})`);
      }
      if (resCustodyMovs.error) {
        errorOccurred = true;
        detailedErrors.push(`custody_movements: ${resCustodyMovs.error.message} (code: ${resCustodyMovs.error.code})`);
      }

      if (errorOccurred) {
        console.warn("Supabase download tables errors:", detailedErrors);
        const mainErrorMsg = detailedErrors.join(" | ");

        // 1. Check for missing columns (error code 42703 or "column ... does not exist" message)
        const isColumnMissing = detailedErrors.some(errMsg => errMsg.includes("42703") || (errMsg.includes("column") && errMsg.includes("does not exist")));
        if (isColumnMissing) {
          setIsCloudConnected(true);
          const customMsg = "تنبيه قاعدة البيانات السحابية: هناك حقل مفقود بجدول السيارات (traffic_office) في مشروع Supabase الخاص بك. لحل هذه المشكلة فورًا لتبسيط الاتصال وعرض جميع بيانات الجداول، يرجى التوجه إلى SQL Editor في Supabase وتشغيل الكود التالي:\n\nALTER TABLE cars ADD COLUMN IF NOT EXISTS traffic_office VARCHAR(100);";
          setCloudError(customMsg);
          return { success: false, message: customMsg };
        }

        // 2. Check for missing tables (relation does not exist)
        const isRelationMissing = detailedErrors.some(errMsg => errMsg.includes("42P01") || (errMsg.includes("relation") && errMsg.includes("does not exist")) || errMsg.includes("schema cache"));
        if (isRelationMissing) {
          const missingTables: string[] = [];
          if (resDrivers.error?.message?.includes("does not exist")) missingTables.push("drivers");
          if (resOfficials.error?.message?.includes("does not exist")) missingTables.push("officials");
          if (resCars.error?.message?.includes("does not exist")) missingTables.push("cars");
          if (resViolations.error?.message?.includes("does not exist")) missingTables.push("violations");
          if (resInvoices.error?.message?.includes("does not exist")) missingTables.push("invoices");
          if (resItems.error?.message?.includes("does not exist")) missingTables.push("invoice_items");
          if (resLogs.error?.message?.includes("does not exist")) missingTables.push("invoice_audit_logs");
          if (resMovements.error?.message?.includes("does not exist")) missingTables.push("driver_account_movements");
          if (resCustodyAccs.error?.message?.includes("does not exist")) missingTables.push("custody_accounts");
          if (resCustodyMovs.error?.message?.includes("does not exist")) missingTables.push("custody_movements");

          setIsCloudConnected(true);
          const msg = `جداول قاعدة البيانات التالية غير منشأة بالخادم السحابي بعد: [ ${missingTables.join(", ")} ]. يرجى فتح نافذة الـ SQL Editor لتهيئتها لتجربة المزامنة الكاملة وحفظ البيانات فوريًا.`;
          setCloudError(msg);
          return { success: false, message: msg };
        }

        setIsCloudConnected(false);
        setCloudError(mainErrorMsg);
        return { success: false, message: `فشل جلب بعض الجداول السحابية: ${mainErrorMsg}` };
      }

      // Check if all cloud tables fetched successfully and are empty
      const isDownloadedEmpty = 
        (!resDrivers.data || resDrivers.data.length === 0) &&
        (!resOfficials.data || resOfficials.data.length === 0) &&
        (!resCars.data || resCars.data.length === 0) &&
        (!resViolations.data || resViolations.data.length === 0) &&
        (!resInvoices.data || resInvoices.data.length === 0) &&
        (!resItems.data || resItems.data.length === 0) &&
        (!resLogs.data || resLogs.data.length === 0) &&
        (!resMovements.data || resMovements.data.length === 0) &&
        (!resCustodyAccs.data || resCustodyAccs.data.length === 0) &&
        (!resCustodyMovs.data || resCustodyMovs.data.length === 0);

      if (isDownloadedEmpty) {
        // If the database is completely empty (newly created project)
        // Check if there is local data to protect
        const hasLocalData = drivers.length > 5 || cars.length > 3 || invoices.length > 1;
        if (hasLocalData && !isManual) {
          console.log("Empty Cloud database detected. Proactively auto-uploading local state to seed Cloud DB...");
          // Clean the loading refs shortly so client context is allowed to write
          isDownloadingRef.current = false;
          setIsCloudSyncing(false);
          const uploadRes = await uploadLocalDataToCloud();
          if (uploadRes.success) {
            setIsCloudConnected(true);
            setCloudError(null);
            return {
              success: true,
              message: "تم الاتصال بقاعدة بياناتك السحابية الجديدة الفارغة بنجاح! ⚡\n\nولحماية بياناتك المحلية المتاحة على هذا الجهاز من الضياع، قمنا برفعها تلقائياً بالكامل وتسكينها بمشروع السحابة الجديد لضمان مزامنة سلسة ومستمرة!"
            };
          }
        }
      }

      // Populating tables individually
      if (resDrivers.data) setDrivers(resDrivers.data);
      if (resOfficials.data) setOfficials(resOfficials.data);
      if (resCars.data) setCars(resCars.data);
      if (resViolations.data) setViolations(resViolations.data);
      if (resInvoices.data) setInvoices(resInvoices.data);
      if (resItems.data) setInvoiceItems(resItems.data);
      if (resLogs.data) setAuditLogs(resLogs.data);
      if (resMovements.data) setMovements(resMovements.data);
      if (resCustodyAccs.data) setCustodyAccounts(resCustodyAccs.data);
      if (resCustodyMovs.data) setCustodyMovements(resCustodyMovs.data);

      setIsCloudConnected(true);
      setCloudError(null);
      
      const countsSummary = [
        `• السائقين: ${resDrivers.data?.length || 0} سائق`,
        `• السيارات: ${resCars.data?.length || 0} سيارة`,
        `• المسؤولين: ${resOfficials.data?.length || 0} مسؤول`,
        `• المخالفات: ${resViolations.data?.length || 0} مخالفة`,
        `• الفواتير والمصروفات: ${resInvoices.data?.length || 0} فاتورة`,
        `• حركات العهد النقدية: ${resCustodyMovs.data?.length || 0} حركة`
      ].join("\n");

      return { 
        success: true, 
        message: `تمت مزامنة واستيراد كافة البيانات بنجاح من قاعدة البيانات السحابية!\n\nتفاصيل البيانات المستوردة:\n${countsSummary}` 
      };
    } catch (e: any) {
      console.error("Supabase download exception:", e);
      setIsCloudConnected(false);
      setCloudError(e.message || "حدث خطأ غير متوقع أثناء الاتصال بالخادم سحابيًا.");
      return { success: false, message: `حدث خطأ بالاتصال: ${e.message}` };
    } finally {
      setIsCloudSyncing(false);
      setTimeout(() => {
        isDownloadingRef.current = false;
      }, 1000);
    }
  };

  // Upload Current Local State to Cloud (Dumping / Syncing)
  const uploadLocalDataToCloud = async (): Promise<{ success: boolean; message: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, message: "قاعدة البيانات السحابية Supabase غير مجهزة أو المفاتيح غير صالحة." };
    }

    const sanitizeDateStr = (d: any, defaultFallback: string): string => {
      if (!d || typeof d !== "string" || d.trim() === "0" || d.trim() === "") {
        return defaultFallback;
      }
      const trimmed = d.trim();
      const valParsed = Date.parse(trimmed);
      if (isNaN(valParsed)) {
        return defaultFallback;
      }
      try {
        const dateObj = new Date(trimmed);
        const yr = dateObj.getFullYear();
        if (yr < 1900 || yr > 2100) {
          return defaultFallback;
        }
        return dateObj.toISOString().split('T')[0];
      } catch (e) {
        return defaultFallback;
      }
    };

    const sanitizeTimestampStr = (t: any): string => {
      if (!t || typeof t !== "string" || t.trim() === "0" || t.trim() === "") {
        return new Date().toISOString();
      }
      const valParsed = Date.parse(t.trim());
      if (isNaN(valParsed)) {
        return new Date().toISOString();
      }
      try {
        const dateObj = new Date(t.trim());
        const yr = dateObj.getFullYear();
        if (yr < 1900 || yr > 2100) {
          return new Date().toISOString();
        }
        return dateObj.toISOString();
      } catch (e) {
        return new Date().toISOString();
      }
    };

    setIsCloudSyncing(true);
    setCloudError(null);

    try {
      const processedNatIds = new Set<string>();
      const processedCodes = new Set<string>();
      const sanitizedDrivers = drivers.map((d, index) => {
        let natId = (d.national_id || "").trim();
        let code = (d.driver_code || "").trim();

        const isPlaceholder = natId === "" || natId === "0" || natId.includes("لا") || natId.includes("بدون") || natId.includes("00") || natId.length < 6;
        if (isPlaceholder || processedNatIds.has(natId)) {
          // Generate a safe unique 14-character national ID
          const cleanId = d.id.replace(/[^0-9]/g, '');
          const safeDigits = (cleanId + "123456789").slice(0, 7);
          natId = `900${index}${safeDigits}`.slice(0, 14);
        }
        processedNatIds.add(natId);

        const isCodeInvalid = code === "" || code === "0" || processedCodes.has(code);
        if (isCodeInvalid) {
          const suffix = d.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4);
          code = `DRV-${index}-${suffix}`.slice(0, 20);
        }
        processedCodes.add(code);

        return {
          ...d,
          driver_code: code,
          national_id: natId,
          license_end_date: sanitizeDateStr(d.license_end_date, "2026-12-31")
        };
      });

      const processedCarNumbers = new Set<string>();
      const processedChassisNumbers = new Set<string>();
      const sanitizedCars = cars.map((c, index) => {
        let carNum = (c.car_number || "").trim();
        let chassis = (c.chassis_number || "").trim();

        const isCarNumInvalid = carNum === "" || processedCarNumbers.has(carNum);
        if (isCarNumInvalid) {
          carNum = `CAR-GEN-${index}`.slice(0, 20);
        }
        processedCarNumbers.add(carNum);

        const isChassisInvalid = chassis === "" || chassis === "0" || chassis.includes("لا") || processedChassisNumbers.has(chassis);
        if (isChassisInvalid) {
          const suffix = c.id.replace(/[^a-zA-Z0-9]/g, '').slice(-6);
          chassis = `CH-${index}-${suffix}`.slice(0, 50);
        }
        processedChassisNumbers.add(chassis);

        return {
          ...c,
          car_number: carNum,
          chassis_number: chassis,
          license_end_date: sanitizeDateStr(c.license_end_date, "2026-12-31")
        };
      });

      const sanitizedViolations = violations.map(v => ({
        ...v,
        violation_date: sanitizeDateStr(v.violation_date, "2026-06-07")
      }));

      const processedInvoiceNumbers = new Set<string>();
      const sanitizedInvoices = invoices.map((inv, index) => {
        let invNum = (inv.invoice_number || "").trim();
        if (invNum === "" || processedInvoiceNumbers.has(invNum)) {
          invNum = `INV-GEN-${Date.now()}-${index}`.slice(0, 30);
        }
        processedInvoiceNumbers.add(invNum);

        return {
          ...inv,
          invoice_number: invNum,
          invoice_date: sanitizeDateStr(inv.invoice_date, "2026-06-07")
        };
      });

      const sanitizedAuditLogs = auditLogs.map(l => ({
        ...l,
        timestamp: sanitizeTimestampStr(l.timestamp)
      }));

      const sanitizedMovements = movements.map(cm => ({
        ...cm,
        date: sanitizeDateStr(cm.date, "2026-06-07")
      }));

      const sanitizedCustodyMovements = custodyMovements.map(m => ({
        ...m,
        date: sanitizeDateStr(m.date, "2026-06-07")
      }));

      const uploadTasks = [
        sanitizedDrivers.length > 0 ? supabase.from('drivers').upsert(sanitizedDrivers) : Promise.resolve({ error: null }),
        officials.length > 0 ? supabase.from('officials').upsert(officials) : Promise.resolve({ error: null }),
        sanitizedCars.length > 0 ? supabase.from('cars').upsert(sanitizedCars) : Promise.resolve({ error: null }),
        sanitizedViolations.length > 0 ? supabase.from('violations').upsert(sanitizedViolations) : Promise.resolve({ error: null }),
        sanitizedInvoices.length > 0 ? supabase.from('invoices').upsert(sanitizedInvoices) : Promise.resolve({ error: null }),
        invoiceItems.length > 0 ? supabase.from('invoice_items').upsert(invoiceItems) : Promise.resolve({ error: null }),
        sanitizedAuditLogs.length > 0 ? supabase.from('invoice_audit_logs').upsert(sanitizedAuditLogs) : Promise.resolve({ error: null }),
        sanitizedMovements.length > 0 ? supabase.from('driver_account_movements').upsert(sanitizedMovements) : Promise.resolve({ error: null }),
        custodyAccounts.length > 0 ? supabase.from('custody_accounts').upsert(custodyAccounts) : Promise.resolve({ error: null }),
        sanitizedCustodyMovements.length > 0 ? supabase.from('custody_movements').upsert(sanitizedCustodyMovements) : Promise.resolve({ error: null })
      ];

      const results = await Promise.all(uploadTasks);
      const errors = results.filter(r => r && r.error).map(r => r.error);

      if (errors.length > 0) {
        console.error("Supabase upload error:", errors);
        const err = errors[0]!;
        const uploadErrMsg = err.message || "";
        
        if (
          err.message?.includes("unique_violation_date_car") ||
          err.message?.toLowerCase().includes("violates unique constraint")
        ) {
          return {
            success: false,
            message: "فشل الرفع السحابي بسبب قيد منع التكرار للمخالفات (unique_violation_date_car) على قاعدة بيانات Supabase. لحل هذه المشكلة فورًا، يُرجى فتح شاشة 'محرر ومراقب Supabase' وضغط زر 'نسخ كود الإصلاح السريع' للصقه وتشغيله في الـ SQL Editor بـ Supabase لإسقاط هذا القيد وتسهيل المزامنة التامة."
          };
        }
        
        // Check for missing columns (error code 42703 or "column ... does not exist" message)
        if (err.code === "42703" || (uploadErrMsg.includes("column") && uploadErrMsg.includes("does not exist"))) {
          const customMsg = "تنبيه قاعدة البيانات السحابية: يوجد حقل مفقود بجدول السيارات (traffic_office) في مشروع Supabase الخاص بك. لحل هذه المشكلة فورًا لتبسيط الاتصال وعرض جميع بيانات الجداول، يرجى التوجه إلى SQL Editor في Supabase وتشغيل الكود التالي:\n\nALTER TABLE cars ADD COLUMN IF NOT EXISTS traffic_office VARCHAR(100);";
          return { success: false, message: customMsg };
        }
        
        if (
          (uploadErrMsg.includes("relation") && uploadErrMsg.includes("does not exist")) || 
          uploadErrMsg.includes("Could not find the table") || 
          uploadErrMsg.includes("schema cache") ||
          err.code === "P0001" || 
          err.code === "42P01"
        ) {
          return { 
            success: false, 
            message: "الخادم السحابي متصل بنجاح، ولكن الجداول غير منشأة بالخلفية بعد! يرجى الضغط على زر 'محرر ومراقب Supabase' ونسخ كود الـ SQL الموحد ولصقه في الـ SQL Editor بـ Supabase لتهيئة الجداول." 
          };
        }
        return { success: false, message: `فشل الرفع السحابي: ${err.message}` };
      }

      setIsCloudConnected(true);
      return { success: true, message: "تم رفع وتصدير كافة البيانات من هذا الجهاز إلى قاعدة البيانات السحابية بنجاح 100%!" };
    } catch (e: any) {
      console.error("Supabase bulk upload exception:", e);
      return { success: false, message: `حدث خطأ استثنائي أثناء الرفع: ${e.message}` };
    } finally {
      setIsCloudSyncing(false);
    }
  };

  // Quick Connection Tester
  const testCloudConnection = async (): Promise<{ success: boolean; message: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setIsCloudConnected(false);
      return { success: false, message: "مفاتيح الربط السحابية غير مهيأة. يرجى إدخالها أولاً!" };
    }

    try {
      const { error } = await supabase.from('drivers').select('id', { count: 'exact', head: true });
      if (error) {
        if (
          error.message?.includes("does not exist") || 
          error.message?.includes("Could not find the table") || 
          error.message?.includes("schema cache") ||
          error.code === "P0001" || 
          error.code === "42P01"
        ) {
          setIsCloudConnected(true);
          return { success: true, message: "مؤهل سحابيًا! تم الاتصال بالخادم السحابي لـ Supabase بنجاح، ولكن الجداول لم تسجل بالخلفية بعد. يرجى تهيئتها بنسخ كود الـ SQL الموحد." };
        }
        setIsCloudConnected(false);
        return { success: false, message: `فشل التحقق من الاتصال: ${error.message}` };
      }
      setIsCloudConnected(true);
      setCloudError(null);
      return { success: true, message: "الخادم السحابي متقن وجاهز للتشغيل المشترك!" };
    } catch (e: any) {
      setIsCloudConnected(false);
      return { success: false, message: `خطأ اتصال: ${e.message}` };
    }
  };

  // Attempt auto-download on mount if Supabase is already configured
  useEffect(() => {
    const client = getSupabaseClient();
    if (client) {
      downloadCloudDataToLocal();
    }
  }, []);

  // RESET STORE TO INITIAL
  const resetToInitial = () => {
    setDrivers(INITIAL_DRIVERS);
    setOfficials(INITIAL_OFFICIALS);
    setCars(INITIAL_CARS);
    setViolations(INITIAL_VIOLATIONS);
    setInvoices(INITIAL_INVOICES);
    setInvoiceItems(INITIAL_INVOICE_ITEMS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setMovements(INITIAL_ACCOUNT_MOVEMENTS);
    setCustodyAccounts([
      { id: "ca_1_1", official_id: "1", name: "نقدي كاش رئيسي", type: 'cash', balance: 50000 },
      { id: "ca_1_2", official_id: "1", name: "فيزا بنك مصر (025)", type: 'visa', balance: 40000 },
      { id: "ca_1_3", official_id: "1", name: "فيزا الائتمان الرئيسي (114)", type: 'other_visa', balance: 60000 },
      { id: "ca_2_1", official_id: "2", name: "نقدي كاش فرعي", type: 'cash', balance: 25000 },
      { id: "ca_2_2", official_id: "2", name: "فيزا البريد المصري", type: 'visa', balance: 40000 },
      { id: "ca_3_1", official_id: "3", name: "نقدي كاش يدوي", type: 'cash', balance: 15000 },
      { id: "ca_3_2", official_id: "3", name: "فيزا البنك الأهلي تراخيص", type: 'visa', balance: 20000 }
    ]);
    setCustodyMovements([]);
    localStorage.removeItem('elbanna_drivers');
    localStorage.removeItem('elbanna_officials');
    localStorage.removeItem('elbanna_cars');
    localStorage.removeItem('elbanna_violations');
    localStorage.removeItem('elbanna_invoices');
    localStorage.removeItem('elbanna_invoice_items');
    localStorage.removeItem('elbanna_audit_logs');
    localStorage.removeItem('elbanna_movements');
    localStorage.removeItem('elbanna_custody_accounts');
    localStorage.removeItem('elbanna_custody_movements');

    // Wipe Supabase too if desired
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('drivers').delete().neq('id', 'WIPE_ALL'),
        supabase.from('officials').delete().neq('id', 'WIPE_ALL'),
        supabase.from('cars').delete().neq('id', 'WIPE_ALL'),
        supabase.from('violations').delete().neq('id', 'WIPE_ALL'),
        supabase.from('invoices').delete().neq('id', 'WIPE_ALL'),
        supabase.from('invoice_items').delete().neq('id', 'WIPE_ALL'),
        supabase.from('invoice_audit_logs').delete().neq('id', 'WIPE_ALL'),
        supabase.from('driver_account_movements').delete().neq('id', 'WIPE_ALL'),
        supabase.from('custody_accounts').delete().neq('id', 'WIPE_ALL'),
        supabase.from('custody_movements').delete().neq('id', 'WIPE_ALL')
      ]).catch(e => console.error("Wiped supabase on reset table error:", e));
    }
  };

  // Generators compliant with UUID constraints
  const generateId = (prefix: string) => {
    if (self.crypto?.randomUUID) {
      return self.crypto.randomUUID();
    }
    return prefix + "_" + Math.floor(Math.random() * 100000) + "_" + Date.now();
  };

  // Drivers action definitions
  const addDriver = (driver: Omit<Driver, 'id' | 'balance'>) => {
    const newId = generateId("dr");
    const newDriver: Driver = {
      ...driver,
      id: newId,
      balance: 0
    };
    setDrivers(prev => [...prev, newDriver]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('drivers').insert([newDriver]).then(({ error }) => {
        if (error) console.error("Supabase insert driver error:", error);
      });
    }
    return newDriver;
  };

  const updateDriver = (id: string, updatedFields: Partial<Driver>) => {
    setDrivers(prev => prev.map(d => d.id === id ? { ...d, ...updatedFields } : d));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('drivers').update(updatedFields).eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase update driver error:", error);
      });
    }
  };

  const deleteDriver = (id: string) => {
    setDrivers(prev => prev.filter(d => d.id !== id));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('drivers').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase delete driver error:", error);
      });
    }
  };

  // Cars action definitions
  const addCar = (car: Omit<Car, 'id'>) => {
    const newId = generateId("car");
    const newCar: Car = {
      ...car,
      id: newId
    };
    setCars(prev => [...prev, newCar]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('cars').insert([newCar]).then(({ error }) => {
        if (error) console.error("Supabase insert car error:", error);
      });
    }
    return newCar;
  };

  const updateCar = (id: string, updatedFields: Partial<Car>) => {
    setCars(prev => prev.map(c => c.id === id ? { ...c, ...updatedFields } : c));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('cars').update(updatedFields).eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase update car error:", error);
      });
    }
  };

  const deleteCar = (id: string) => {
    setCars(prev => prev.filter(c => c.id !== id));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      supabase.from('cars').delete().eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase delete car error:", error);
      });
    }
  };

  // Add Officials
  const addOfficial = (official: Omit<Official, 'id'>) => {
    const officialId = generateId("off");
    const newOfficial: Official = {
      ...official,
      id: officialId
    };
    setOfficials(prev => [...prev, newOfficial]);

    // Create defaults
    const cashAcc: CustodyAccount = {
      id: generateId("ca_cash"),
      official_id: officialId,
      name: "نقدي افتراضي",
      type: 'cash',
      balance: official.cash_custody
    };
    const visaAcc: CustodyAccount = {
      id: generateId("ca_visa"),
      official_id: officialId,
      name: "فيزا رئيسية افتراضية",
      type: 'visa',
      balance: official.visa_custody
    };
    setCustodyAccounts(prev => [...prev, cashAcc, visaAcc]);

    // Log movements
    const mov1: CustodyMovement = {
      id: generateId("cm"),
      official_id: officialId,
      to_account_id: cashAcc.id,
      date: new Date().toISOString().split('T')[0],
      description: `تأسيس حساب نقدي افتراضي للمسؤول ${official.name}`,
      amount: official.cash_custody,
      type: 'deposit'
    };
    const mov2: CustodyMovement = {
      id: generateId("cm"),
      official_id: officialId,
      to_account_id: visaAcc.id,
      date: new Date().toISOString().split('T')[0],
      description: `تأسيس حساب فيزا افتراضي للمسؤول ${official.name}`,
      amount: official.visa_custody,
      type: 'deposit'
    };
    setCustodyMovements(prev => [mov1, mov2, ...prev]);

    // Supabase
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('officials').insert([newOfficial]),
        supabase.from('custody_accounts').insert([cashAcc, visaAcc]),
        supabase.from('custody_movements').insert([mov1, mov2])
      ]).catch(e => console.error("Supabase write officials batch error:", e));
    }

    return newOfficial;
  };

  const updateCustody = (id: string, cashDelta: number, visaDelta: number) => {
    let updatedParent: Official | undefined;
    setOfficials(prev => prev.map(o => {
      if (o.id === id) {
        updatedParent = {
          ...o,
          cash_custody: o.cash_custody + cashDelta,
          visa_custody: o.visa_custody + visaDelta
        };
        return updatedParent;
      }
      return o;
    }));

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected && updatedParent) {
      supabase.from('officials').update({
        cash_custody: (updatedParent as Official).cash_custody,
        visa_custody: (updatedParent as Official).visa_custody
      }).eq('id', id).then(({ error }) => {
        if (error) console.error("Supabase update custody sum error:", error);
      });
    }
  };

  // Sub custody actions
  const addCustodyAccount = (accountData: Omit<CustodyAccount, 'id'>) => {
    const newId = generateId("ca");
    const newAcc: CustodyAccount = {
      ...accountData,
      id: newId
    };
    setCustodyAccounts(prev => [...prev, newAcc]);

    // Sync official balance
    let updatedParent: Official | undefined;
    setOfficials(prev => prev.map(o => {
      if (o.id === accountData.official_id) {
        updatedParent = {
          ...o,
          cash_custody: accountData.type === 'cash' ? o.cash_custody + accountData.balance : o.cash_custody,
          visa_custody: accountData.type !== 'cash' ? o.visa_custody + accountData.balance : o.visa_custody
        };
        return updatedParent;
      }
      return o;
    }));

    // Log movement
    const newMov: CustodyMovement = {
      id: generateId("cm"),
      official_id: accountData.official_id,
      to_account_id: newId,
      date: new Date().toISOString().split('T')[0],
      description: `إنشاء وتخصيص حساب فرعي جديد: ${accountData.name} برصيد مالي ${accountData.balance.toLocaleString()} ج.م`,
      amount: accountData.balance,
      type: 'deposit'
    };
    setCustodyMovements(prev => [newMov, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('custody_accounts').insert([newAcc]),
        updatedParent ? supabase.from('officials').update(updatedParent).eq('id', accountData.official_id) : Promise.resolve(),
        supabase.from('custody_movements').insert([newMov])
      ]).catch(e => console.error("Supabase create custody account batch fail:", e));
    }

    return newAcc;
  };

  const updateCustodyAccount = (id: string, updatedFields: Partial<CustodyAccount>) => {
    let updatedAcc: CustodyAccount | undefined;
    let updatedParent: Official | undefined;
    let newMov: CustodyMovement | undefined;

    setCustodyAccounts(prev => prev.map(acc => {
      if (acc.id === id) {
        const oldBalance = acc.balance;
        const newBalance = updatedFields.balance !== undefined ? updatedFields.balance : oldBalance;
        const balanceDiff = newBalance - oldBalance;

        updatedAcc = { ...acc, ...updatedFields };

        if (balanceDiff !== 0) {
          // Sync official balance
          setOfficials(ops => ops.map(o => {
            if (o.id === acc.official_id) {
              updatedParent = {
                ...o,
                cash_custody: acc.type === 'cash' ? Math.max(0, o.cash_custody + balanceDiff) : o.cash_custody,
                visa_custody: acc.type !== 'cash' ? Math.max(0, o.visa_custody + balanceDiff) : o.visa_custody
              };
              return updatedParent;
            }
            return o;
          }));

          // Log movement
          newMov = {
            id: generateId("cm"),
            official_id: acc.official_id,
            to_account_id: acc.id,
            date: new Date().toISOString().split('T')[0],
            description: `تسوية وتعديل رصيد الحساب الفرعي ${updatedFields.name || acc.name} يدويًا (فارق القيمة: ${balanceDiff.toLocaleString()} ج.م)`,
            amount: Math.abs(balanceDiff),
            type: 'settlement'
          };
          setCustodyMovements(prev => [newMov!, ...prev]);
        }

        return updatedAcc;
      }
      return acc;
    }));

    // Sync Supabase
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      const q = [];
      if (updatedAcc) q.push(supabase.from('custody_accounts').update(updatedFields).eq('id', id));
      if (updatedParent && updatedAcc) q.push(supabase.from('officials').update(updatedParent).eq('id', (updatedAcc as CustodyAccount).official_id));
      if (newMov) q.push(supabase.from('custody_movements').insert([newMov]));
      Promise.all(q).catch(e => console.error("Supabase updateCustodyAccount error:", e));
    }
  };

  const deleteCustodyAccount = (id: string) => {
    const acc = custodyAccounts.find(a => a.id === id);
    if (!acc) return;

    let updatedParent: Official | undefined;
    setOfficials(prev => prev.map(o => {
      if (o.id === acc.official_id) {
        updatedParent = {
          ...o,
          cash_custody: acc.type === 'cash' ? Math.max(0, o.cash_custody - acc.balance) : o.cash_custody,
          visa_custody: acc.type !== 'cash' ? Math.max(0, o.visa_custody - acc.balance) : o.visa_custody
        };
        return updatedParent;
      }
      return o;
    }));

    setCustodyAccounts(prev => prev.filter(a => a.id !== id));

    const newMov: CustodyMovement = {
      id: generateId("cm"),
      official_id: acc.official_id,
      from_account_id: id,
      date: new Date().toISOString().split('T')[0],
      description: `إلغاء وحذف الحساب الفرعي ${acc.name}، وتصفير ميزانيته المستردة`,
      amount: acc.balance,
      type: 'withdrawal'
    };
    setCustodyMovements(prev => [newMov, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('custody_accounts').delete().eq('id', id),
        updatedParent ? supabase.from('officials').update(updatedParent).eq('id', acc.official_id) : Promise.resolve(),
        supabase.from('custody_movements').insert([newMov])
      ]).catch(e => console.error("Supabase delete custody account failure:", e));
    }
  };

  const transferCustody = (fromAccountId: string, toAccountId: string, amount: number, description: string) => {
    const fromAcc = custodyAccounts.find(a => a.id === fromAccountId);
    const toAcc = custodyAccounts.find(a => a.id === toAccountId);
    if (!fromAcc || !toAcc) {
      return { success: false, error: 'أحد الحسابات أو كلاهما غير متوفر في قواعد البيانات!' };
    }
    if (fromAcc.balance < amount) {
      return { success: false, error: `رصيد حساب المرسل غير كافٍ! متاح: ${fromAcc.balance} ج.م، ومطلوب تحويل: ${amount} ج.م.` };
    }

    let updatedFromAcc: CustodyAccount | undefined;
    let updatedToAcc: CustodyAccount | undefined;

    setCustodyAccounts(prev => prev.map(a => {
      if (a.id === fromAccountId) {
        updatedFromAcc = { ...a, balance: a.balance - amount };
        return updatedFromAcc;
      }
      if (a.id === toAccountId) {
        updatedToAcc = { ...a, balance: a.balance + amount };
        return updatedToAcc;
      }
      return a;
    }));

    const parentUpdates: Record<string, Official> = {};
    setOfficials(prev => prev.map(o => {
      let patch = { ...o };
      let changed = false;
      if (o.id === fromAcc.official_id) {
        patch.cash_custody = fromAcc.type === 'cash' ? Math.max(0, patch.cash_custody - amount) : patch.cash_custody;
        patch.visa_custody = fromAcc.type !== 'cash' ? Math.max(0, patch.visa_custody - amount) : patch.visa_custody;
        changed = true;
      }
      if (o.id === toAcc.official_id) {
        patch.cash_custody = toAcc.type === 'cash' ? patch.cash_custody + amount : patch.cash_custody;
        patch.visa_custody = toAcc.type !== 'cash' ? patch.visa_custody + amount : patch.visa_custody;
        changed = true;
      }
      if (changed) {
        parentUpdates[o.id] = patch;
      }
      return patch;
    }));

    const newMov: CustodyMovement = {
      id: generateId("cm"),
      official_id: fromAcc.official_id,
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      date: new Date().toISOString().split('T')[0],
      description: `تحويل مالي بين الخزائن: ${description} (من حساب: [${fromAcc.name}] إلى حساب: [${toAcc.name}])`,
      amount: amount,
      type: 'transfer'
    };
    setCustodyMovements(prev => [newMov, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      const q = [
        updatedFromAcc ? supabase.from('custody_accounts').update({ balance: updatedFromAcc.balance }).eq('id', fromAccountId) : Promise.resolve(),
        updatedToAcc ? supabase.from('custody_accounts').update({ balance: updatedToAcc.balance }).eq('id', toAccountId) : Promise.resolve(),
        supabase.from('custody_movements').insert([newMov])
      ];
      for (const [pId, pVal] of Object.entries(parentUpdates)) {
        q.push(supabase.from('officials').update(pVal).eq('id', pId));
      }
      Promise.all(q).catch(e => console.error("Supabase live transfer custody write fail:", e));
    }

    return { success: true };
  };

  // Add violation
  const addViolation = (violationData: Omit<Violation, 'id'>, forceBypass: boolean = false) => {
    const duplicate = violations.find(v => 
      v.violation_date === violationData.violation_date && 
      v.car_number.trim() === violationData.car_number.trim()
    );

    if (duplicate && !forceBypass) {
      return { 
        success: false, 
        error: `تنبيه: توجد مخالفة مسجلة بالفعل لهذه السيارة (${violationData.car_number}) في نفس هذا التاريخ (${violationData.violation_date}). يوجد قيد منع تكرار (Unique Constraint) نشط.`,
        duplicateViolation: duplicate 
      };
    }

    const newId = generateId("viol");
    const newViolation: Violation = {
      ...violationData,
      id: newId
    };

    setViolations(prev => [newViolation, ...prev]);

    let updatedDriver: Driver | undefined;
    let newMovement: DriverAccountMovement | undefined;

    setDrivers(prev => prev.map(drv => {
      if (drv.id === violationData.driver_id) {
        const nextBalance = drv.balance + violationData.amount;
        newMovement = {
          id: generateId("mov"),
          driver_id: drv.id,
          date: violationData.violation_date,
          description: `تسجيل مخالفة: ${violationData.description} (سيارة رقم: ${violationData.car_number})${forceBypass ? ' [إدخال استثنائي]' : ''}`,
          amount_change: violationData.amount,
          new_balance: nextBalance,
          type: 'violation'
        };

        updatedDriver = {
          ...drv,
          balance: nextBalance
        };
        return updatedDriver;
      }
      return drv;
    }));

    if (newMovement) {
      setMovements(prevMovs => [newMovement!, ...prevMovs]);
    }

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('violations').insert([newViolation]),
        updatedDriver ? supabase.from('drivers').update(updatedDriver).eq('id', violationData.driver_id) : Promise.resolve(),
        newMovement ? supabase.from('driver_account_movements').insert([newMovement]) : Promise.resolve()
      ]).catch(e => console.error("Supabase insert violation transaction fail:", e));
    }

    return { success: true };
  };

  const deleteViolation = (id: string) => {
    const target = violations.find(v => v.id === id);
    if (!target) return;

    setViolations(prev => prev.filter(v => v.id !== id));

    let updatedDriver: Driver | undefined;
    let newMovement: DriverAccountMovement | undefined;

    setDrivers(prev => prev.map(drv => {
      if (drv.id === target.driver_id) {
        const nextBalance = Math.max(0, drv.balance - target.amount);
        newMovement = {
          id: generateId("mov"),
          driver_id: drv.id,
          date: new Date().toISOString().split('T')[0],
          description: `حذف غرامة مخالفة مُلغاة: ${target.description} للسيارة ${target.car_number}`,
          amount_change: -target.amount,
          new_balance: nextBalance,
          type: 'reversal'
        };

        updatedDriver = {
          ...drv,
          balance: nextBalance
        };
        return updatedDriver;
      }
      return drv;
    }));

    if (newMovement) {
      setMovements(prevMov => [newMovement!, ...prevMov]);
    }

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('violations').delete().eq('id', id),
        updatedDriver ? supabase.from('drivers').update(updatedDriver).eq('id', target.driver_id) : Promise.resolve(),
        newMovement ? supabase.from('driver_account_movements').insert([newMovement]) : Promise.resolve()
      ]).catch(e => console.error("Supabase delete violation trigger fail:", e));
    }
  };

  // Deductions Actions
  const applyIndividualDeduction = (driverId: string, amount: number, description: string, date?: string) => {
    let updatedDriver: Driver | undefined;
    let newMovement: DriverAccountMovement | undefined;

    const resolvedDate = date && date.trim() !== "" ? date.trim() : new Date().toISOString().split('T')[0];

    setDrivers(prev => prev.map(drv => {
      if (drv.id === driverId) {
        const nextBalance = Math.max(0, drv.balance - amount);
        newMovement = {
          id: generateId("mov"),
          driver_id: driverId,
          date: resolvedDate,
          description: `خصم مستقطع فردي: ${description}`,
          amount_change: -amount,
          new_balance: nextBalance,
          type: 'deduction'
        };

        updatedDriver = {
          ...drv,
          balance: nextBalance
        };
        return updatedDriver;
      }
      return drv;
    }));

    if (newMovement) {
      setMovements(prevMovs => [newMovement!, ...prevMovs]);
    }

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        updatedDriver ? supabase.from('drivers').update(updatedDriver).eq('id', driverId) : Promise.resolve(),
        newMovement ? supabase.from('driver_account_movements').insert([newMovement]) : Promise.resolve()
      ]).catch(e => console.error("Supabase apply individual deduction error:", e));
    }
  };

  // Group deduction action
  const applyGroupDeductionRpc = async (amount: number, description: string): Promise<boolean> => {
    let updatedDriversList: Driver[] = [];
    let newMovementsList: DriverAccountMovement[] = [];

    setDrivers(prev => {
      const nextList = prev.map(drv => {
        const nextBalance = Math.max(0, drv.balance - amount);
        const movement: DriverAccountMovement = {
          id: generateId("mov"),
          driver_id: drv.id,
          date: new Date().toISOString().split('T')[0],
          description: `خصم جماعي موحد (بروتوكول RPC استثنائي): ${description}`,
          amount_change: -amount,
          new_balance: nextBalance,
          type: 'deduction'
        };
        newMovementsList.push(movement);
        
        const updated = { ...drv, balance: nextBalance };
        updatedDriversList.push(updated);
        return updated;
      });
      return nextList;
    });

    setMovements(prevMovs => [...newMovementsList, ...prevMovs]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      try {
        await Promise.all([
          supabase.from('drivers').upsert(updatedDriversList),
          supabase.from('driver_account_movements').insert(newMovementsList)
        ]);
      } catch (e) {
        console.error("Supabase RPC fallback failed:", e);
      }
    }

    return true;
  };

  // Create Invoice Transaction
  const createInvoice = (
    invoiceData: Omit<Invoice, 'id' | 'invoice_number' | 'version' | 'is_modified' | 'is_deleted'>,
    items: Omit<InvoiceItem, 'id' | 'invoice_id' | 'car_id'>[]
  ) => {
    const official = officials.find(o => o.id === invoiceData.official_id);
    if (!official) {
      return { success: false, error: 'لم يتم العثور على المشرف المسؤول!' };
    }

    const accountTotals: Record<string, number> = {};
    const itemsWithAcc = items.map((itm) => {
      let accId = itm.account_id;
      if (!accId) {
        const found = custodyAccounts.find(a => a.official_id === invoiceData.official_id && a.type === itm.payment_method);
        accId = found ? found.id : '';
      }
      if (!accId) {
        const found = custodyAccounts.find(a => a.official_id === invoiceData.official_id);
        accId = found ? found.id : '';
      }

      accountTotals[accId] = (accountTotals[accId] || 0) + itm.amount;

      return {
        ...itm,
        account_id: accId
      };
    });

    for (const [accId, requiredAmount] of Object.entries(accountTotals)) {
      if (!accId) {
        return { success: false, error: 'عذرًا، لم يتم تحديد أو العثور على حساب الصرف المرتبط!' };
      }
      const acc = custodyAccounts.find(a => a.id === accId);
      if (!acc) {
        return { success: false, error: 'لم يتم العثور على حساب الصرف المختار!' };
      }
      if (acc.balance < requiredAmount) {
        return { success: false, error: `عذرًا، رصيد الحساب الفرعي (${acc.name}) غير كافٍ! المتوفر: ${acc.balance} ج.م، المطلوب: ${requiredAmount} ج.م.` };
      }
    }

    let updatedCustodyAccounts: CustodyAccount[] = [];
    setCustodyAccounts(prev => prev.map(acc => {
      const needed = accountTotals[acc.id];
      if (needed) {
        const upd = { ...acc, balance: acc.balance - needed };
        updatedCustodyAccounts.push(upd);
        return upd;
      }
      return acc;
    }));

    const totalCashCharged = itemsWithAcc.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type === 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    const totalVisaCharged = itemsWithAcc.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type !== 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    let updatedOfficial: Official | undefined;
    setOfficials(prev => prev.map(o => {
      if (o.id === invoiceData.official_id) {
        updatedOfficial = {
          ...o,
          cash_custody: o.cash_custody - totalCashCharged,
          visa_custody: o.visa_custody - totalVisaCharged
        };
        return updatedOfficial;
      }
      return o;
    }));

    const invoiceNum = `INV-2026-${String(invoices.length + 1).padStart(4, '0')}`;
    const newInvoiceId = generateId("inv");
    const newInvoice: Invoice = {
      ...invoiceData,
      id: newInvoiceId,
      invoice_number: invoiceNum,
      version: 1,
      is_modified: false,
      is_deleted: false,
      total_amount: totalCashCharged + totalVisaCharged
    };

    const newItems: InvoiceItem[] = itemsWithAcc.map((itm, idx) => ({
      ...itm,
      id: generateId("item"),
      invoice_id: newInvoiceId,
      car_id: invoiceData.car_id || ''
    }));

    setInvoices(prev => [newInvoice, ...prev]);
    setInvoiceItems(prev => [...prev, ...newItems]);

    // تسجيل إجمالي مصروف الترخيص على السيارة
    if (invoiceData.car_id) {
      const invoiceTotalAmount = totalCashCharged + totalVisaCharged;
      setCars(prev => prev.map(car => {
        if (car.id === invoiceData.car_id) {
          return {
            ...car,
            license_total_cost: (car.license_total_cost || 0) + invoiceTotalAmount
          };
        }
        return car;
      }));
    }

    const targetCarNumber = cars.find(c => c.id === invoiceData.car_id)?.car_number || "غير محدد";
    const segmentMovements = Object.entries(accountTotals).map(([accId, amt]) => {
      const acc = custodyAccounts.find(a => a.id === accId);
      return {
        id: generateId("cm"),
        official_id: invoiceData.official_id,
        from_account_id: accId,
        date: invoiceData.invoice_date,
        description: `صرف مصروفات سيارة ${targetCarNumber} بموجب فاتورة ${invoiceNum} (من حساب ${acc?.name})`,
        amount: amt,
        type: 'invoice_charge' as const
      };
    });
    setCustodyMovements(prev => [...segmentMovements, ...prev]);

    const auditRecord: InvoiceAuditLog = {
      id: generateId("log"),
      invoice_id: newInvoiceId,
      invoice_number: invoiceNum,
      timestamp: new Date().toISOString(),
      supervisor_name: official.name,
      operation_type: "create",
      old_value: "لا يوجد (جديد)",
      new_value: `توليد فاتورة سيارة ${targetCarNumber} بمبلغ ${newInvoice.total_amount} ج.م (بيان الترخيص: ${invoiceData.license_details || 'بدون'}).`
    };
    setAuditLogs(prev => [auditRecord, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('invoices').insert([newInvoice]),
        supabase.from('invoice_items').insert(newItems),
        supabase.from('invoice_audit_logs').insert([auditRecord]),
        supabase.from('custody_movements').insert(segmentMovements),
        updatedOfficial ? supabase.from('officials').update(updatedOfficial).eq('id', invoiceData.official_id) : Promise.resolve(),
        updatedCustodyAccounts.length > 0 ? supabase.from('custody_accounts').upsert(updatedCustodyAccounts) : Promise.resolve()
      ]).catch(e => console.error("Supabase createInvoice error:", e));
    }

    return { success: true, invoice: newInvoice };
  };

  // Update Invoice logic
  const updateInvoice = (
    invoiceId: string,
    supervisorName: string,
    newItems: Omit<InvoiceItem, 'id' | 'invoice_id' | 'car_id'>[]
  ) => {
    const oldInvoice = invoices.find(inv => inv.id === invoiceId);
    if (!oldInvoice || oldInvoice.is_deleted) {
      return { success: false, error: "الفاتورة غير موجودة أو تم حذفها بالفعل!" };
    }

    const official = officials.find(o => o.id === oldInvoice.official_id);
    if (!official) {
      return { success: false, error: "المسؤول عن الفاتورة لم يعد متاحًا!" };
    }

    // Existing old items
    const oldItems = invoiceItems.filter(itm => itm.invoice_id === invoiceId);

    // Dynamic refunds computation
    const accountRefunds: Record<string, number> = {};
    for (const item of oldItems) {
      let accId = item.account_id || '';
      if (!accId) {
        const match = custodyAccounts.find(a => a.official_id === oldInvoice.official_id && a.type === item.payment_method);
        accId = match ? match.id : '';
      }
      if (accId) {
        accountRefunds[accId] = (accountRefunds[accId] || 0) + item.amount;
      }
    }

    const accountDemands: Record<string, number> = {};
    const itemsWithAcc = newItems.map((itm) => {
      let accId = itm.account_id;
      if (!accId) {
        const found = custodyAccounts.find(a => a.official_id === oldInvoice.official_id && a.type === itm.payment_method);
        found ? (accId = found.id) : (accId = '');
      }
      if (!accId) {
        const found = custodyAccounts.find(a => a.official_id === oldInvoice.official_id);
        found ? (accId = found.id) : (accId = '');
      }

      accountDemands[accId] = (accountDemands[accId] || 0) + itm.amount;

      return {
        ...itm,
        account_id: accId
      };
    });

    // Check budget limit boundary checks
    const deltaPerAccount: Record<string, number> = {};
    for (const [accId, amt] of Object.entries(accountRefunds)) {
      deltaPerAccount[accId] = (deltaPerAccount[accId] || 0) + amt;
    }
    for (const [accId, amt] of Object.entries(accountDemands)) {
      deltaPerAccount[accId] = (deltaPerAccount[accId] || 0) - amt;
    }

    for (const [accId, delta] of Object.entries(deltaPerAccount)) {
      if (delta < 0) {
        const acc = custodyAccounts.find(a => a.id === accId);
        const currentBalance = acc ? acc.balance : 0;
        if (currentBalance + delta < 0) {
          return { success: false, error: `عجز مالي في تعديل الحساب الفرعي (${acc?.name || 'بدون'})! المتوفر: ${currentBalance} ج.م ويمتد سحب إضافي قدره ${Math.abs(delta)} ج.م لتمام المراجعة.` };
        }
      }
    }

    let updatedCustodyAccounts: CustodyAccount[] = [];
    setCustodyAccounts(prev => prev.map(a => {
      const delta = deltaPerAccount[a.id];
      if (delta !== undefined && delta !== 0) {
        const upd = { ...a, balance: a.balance + delta };
        updatedCustodyAccounts.push(upd);
        return upd;
      }
      return a;
    }));

    const oldCashPaid = oldItems.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type === 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    const oldVisaPaid = oldItems.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type !== 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    const newCashRequired = itemsWithAcc.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type === 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    const newVisaRequired = itemsWithAcc.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type !== 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    const cashDelta = oldCashPaid - newCashRequired;
    const visaDelta = oldVisaPaid - newVisaRequired;

    updateCustody(oldInvoice.official_id, cashDelta, visaDelta);

    const updatedVersion = oldInvoice.version + 1;
    const totalNewAmount = newCashRequired + newVisaRequired;

    const modifiedInvoice = {
      ...oldInvoice,
      version: updatedVersion,
      is_modified: true,
      total_amount: totalNewAmount
    };

    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? modifiedInvoice : inv));

    let freshlyMappedItems: InvoiceItem[] = [];
    setInvoiceItems(prev => {
      const filtered = prev.filter(itm => itm.invoice_id !== invoiceId);
      freshlyMappedItems = itemsWithAcc.map((itm, index) => ({
        ...itm,
        id: generateId("item_mod"),
        invoice_id: invoiceId,
        car_id: oldInvoice.car_id || ''
      }));
      return [...filtered, ...freshlyMappedItems];
    });

    const targetCarNumber = cars.find(c => c.id === oldInvoice.car_id)?.car_number || "غير محدد";
    const adjMovements = Object.entries(deltaPerAccount)
      .filter(([_, delta]) => delta !== 0)
      .map(([accId, delta]) => {
        const acc = custodyAccounts.find(a => a.id === accId);
        return {
          id: generateId("cm"),
          official_id: oldInvoice.official_id,
          to_account_id: delta > 0 ? accId : undefined,
          from_account_id: delta < 0 ? accId : undefined,
          date: new Date().toISOString().split('T')[0],
          description: `تعديل بند ترخيص الفاتورة ${oldInvoice.invoice_number} لمركبة ${targetCarNumber} (${delta > 0 ? 'استرداد مالي قدره' : 'سحب مالي إضافي قدره'} ${Math.abs(delta).toLocaleString()} ج.م من حساب ${acc?.name || 'غير محدد'})`,
          amount: Math.abs(delta),
          type: (delta > 0 ? 'deposit' : 'invoice_charge') as any
        };
      });
    setCustodyMovements(prev => [...adjMovements, ...prev]);

    const auditRecord: InvoiceAuditLog = {
      id: generateId("log"),
      invoice_id: invoiceId,
      invoice_number: oldInvoice.invoice_number,
      timestamp: new Date().toISOString(),
      supervisor_name: supervisorName,
      operation_type: "edit",
      old_value: `القيمة القديمة: ${oldInvoice.total_amount} ج.م (نسخة رقم ${oldInvoice.version})`,
      new_value: `تعديل القيمة إلى: ${totalNewAmount} ج.م (توليد كشّف نسخة معدلة ماليًا رقم ${updatedVersion})`
    };
    setAuditLogs(prev => [auditRecord, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('invoices').update(modifiedInvoice).eq('id', invoiceId),
        supabase.from('invoice_items').delete().eq('invoice_id', invoiceId).then(() => {
          return supabase.from('invoice_items').insert(freshlyMappedItems);
        }),
        supabase.from('invoice_audit_logs').insert([auditRecord]),
        supabase.from('custody_movements').insert(adjMovements),
        updatedCustodyAccounts.length > 0 ? supabase.from('custody_accounts').upsert(updatedCustodyAccounts) : Promise.resolve()
      ]).catch(e => console.error("Supabase updateInvoice operations error:", e));
    }

    return { success: true };
  };

  // Delete invoice
  const deleteInvoice = (invoiceId: string, supervisorName: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice || invoice.is_deleted) {
      return { success: false, error: "الفاتورة غير موجودة أو تم حذفها مسبقًا!" };
    }

    const items = invoiceItems.filter(itm => itm.invoice_id === invoiceId);

    const refunds: Record<string, number> = {};
    for (const item of items) {
      let accId = item.account_id || '';
      if (!accId) {
        const match = custodyAccounts.find(a => a.official_id === invoice.official_id && a.type === item.payment_method);
        accId = match ? match.id : '';
      }
      if (accId) {
        refunds[accId] = (refunds[accId] || 0) + item.amount;
      }
    }

    let updatedCustodyAccounts: CustodyAccount[] = [];
    setCustodyAccounts(prev => prev.map(a => {
      const refAmt = refunds[a.id];
      if (refAmt) {
        const upd = { ...a, balance: a.balance + refAmt };
        updatedCustodyAccounts.push(upd);
        return upd;
      }
      return a;
    }));

    const cashRefundSum = items.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type === 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    const visaRefundSum = items.filter(i => {
      const match = custodyAccounts.find(ca => ca.id === i.account_id);
      return match?.type !== 'cash';
    }).reduce((sum, item) => sum + item.amount, 0);

    updateCustody(invoice.official_id, cashRefundSum, visaRefundSum);

    setInvoices(prev => prev.map(inv => inv.id === invoiceId ? { ...inv, is_deleted: true } : inv));

    const targetCarNumber = cars.find(c => c.id === invoice.car_id)?.car_number || "غير محدد";
    const refundMovements = Object.entries(refunds).map(([accId, amt]) => {
      const acc = custodyAccounts.find(a => a.id === accId);
      return {
        id: generateId("cm"),
        official_id: invoice.official_id,
        to_account_id: accId,
        date: new Date().toISOString().split('T')[0],
        description: `استرداد مستحقات مالية كاملة عقب إلغاء وحذف الفاتورة ${invoice.invoice_number} لمركبة ${targetCarNumber} (إلى حساب ${acc?.name || 'غير محدد'})`,
        amount: amt,
        type: 'deposit' as const
      };
    });
    setCustodyMovements(prev => [...refundMovements, ...prev]);

    const auditRecord: InvoiceAuditLog = {
      id: generateId("log"),
      invoice_id: invoiceId,
      invoice_number: invoice.invoice_number,
      timestamp: new Date().toISOString(),
      supervisor_name: supervisorName,
      operation_type: "delete",
      old_value: `إجمالي الفاتورة الملغاة: ${invoice.total_amount} ج.م`,
      new_value: `تم الحذف مرسلًا كافة المبالغ المستردة للعهد المالية الفرعية التابعة للمسؤول.`
    };
    setAuditLogs(prev => [auditRecord, ...prev]);

    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('invoices').update({ is_deleted: true }).eq('id', invoiceId),
        supabase.from('invoice_audit_logs').insert([auditRecord]),
        supabase.from('custody_movements').insert(refundMovements),
        updatedCustodyAccounts.length > 0 ? supabase.from('custody_accounts').upsert(updatedCustodyAccounts) : Promise.resolve()
      ]).catch(e => console.error("Supabase deleteInvoice trigger error:", e));
    }

    return { success: true };
  };

  const exportLocalBackup = (): string => {
    const backupObj = {
      app: "elbanna_fleet_management",
      version: "1.0",
      timestamp: new Date().toISOString(),
      data: {
        drivers,
        officials,
        cars,
        violations,
        invoices,
        invoiceItems,
        auditLogs,
        movements,
        custodyAccounts,
        custodyMovements
      }
    };
    return JSON.stringify(backupObj, null, 2);
  };

  const importLocalBackup = (jsonData: string): { success: boolean; message: string } => {
    try {
      const parsed = JSON.parse(jsonData);
      if (!parsed || parsed.app !== "elbanna_fleet_management" || !parsed.data) {
        return { success: false, message: "صيغة ملف النسخة الاحتياطية غير صالحة أو غير متوافقة." };
      }

      const {
        drivers: importedDrivers,
        officials: importedOfficials,
        cars: importedCars,
        violations: importedViolations,
        invoices: importedInvoices,
        invoiceItems: importedInvoiceItems,
        auditLogs: importedAuditLogs,
        movements: importedMovements,
        custodyAccounts: importedCustodyAccounts,
        custodyMovements: importedCustodyMovements
      } = parsed.data;

      if (
        !Array.isArray(importedDrivers) ||
        !Array.isArray(importedOfficials) ||
        !Array.isArray(importedCars) ||
        !Array.isArray(importedViolations) ||
        !Array.isArray(importedInvoices)
      ) {
        return { success: false, message: "البيانات داخل ملف النسخة الاحتياطية تالفة أو ناقصة." };
      }

      setDrivers(importedDrivers);
      setOfficials(importedOfficials);
      setCars(importedCars);
      setViolations(importedViolations);
      setInvoices(importedInvoices);
      if (Array.isArray(importedInvoiceItems)) setInvoiceItems(importedInvoiceItems);
      if (Array.isArray(importedAuditLogs)) setAuditLogs(importedAuditLogs);
      if (Array.isArray(importedMovements)) setMovements(importedMovements);
      if (Array.isArray(importedCustodyAccounts)) setCustodyAccounts(importedCustodyAccounts);
      if (Array.isArray(importedCustodyMovements)) setCustodyMovements(importedCustodyMovements);

      localStorage.setItem('elbanna_drivers', JSON.stringify(importedDrivers));
      localStorage.setItem('elbanna_officials', JSON.stringify(importedOfficials));
      localStorage.setItem('elbanna_cars', JSON.stringify(importedCars));
      localStorage.setItem('elbanna_violations', JSON.stringify(importedViolations));
      localStorage.setItem('elbanna_invoices', JSON.stringify(importedInvoices));
      if (Array.isArray(importedInvoiceItems)) localStorage.setItem('elbanna_invoice_items', JSON.stringify(importedInvoiceItems));
      if (Array.isArray(importedAuditLogs)) localStorage.setItem('elbanna_audit_logs', JSON.stringify(importedAuditLogs));
      if (Array.isArray(importedMovements)) localStorage.setItem('elbanna_movements', JSON.stringify(importedMovements));
      if (Array.isArray(importedCustodyAccounts)) localStorage.setItem('elbanna_custody_accounts', JSON.stringify(importedCustodyAccounts));
      if (Array.isArray(importedCustodyMovements)) localStorage.setItem('elbanna_custody_movements', JSON.stringify(importedCustodyMovements));

      return { success: true, message: "تم تحميل واستيراد النسخة الاحتياطية بنجاح وتحديث كافة السجلات محلياً!" };
    } catch (e: any) {
      console.error("Backup import error:", e);
      return { success: false, message: `فشل استيراد النسخة الاحتياطية: ${e.message || e}` };
    }
  };

  // استيراد فاتورة قديمة (PDF) بدون خصم من العهدة
  const importOldInvoice = (data: {
    external_invoice_number: string;
    invoice_date: string;
    car_number: string;
    license_location: string;
    license_details: string;
    items: { description: string; amount: number }[];
    total_amount: number;
  }): { success: boolean; error?: string; invoice?: Invoice } => {
    // إيجاد السيارة من رقمها
    const car = cars.find(c => c.car_number.includes(data.car_number) || c.car_number === data.car_number);
    if (!car) {
      return { success: false, error: `لم يتم العثور على سيارة برقم "${data.car_number}"` };
    }

    // إيجاد المسؤول من السيارة
    const official = officials.find(o => o.id === car.license_official_id);
    const officialId = official?.id || (officials[0]?.id || '');

    const invoiceNum = `OLD-${data.external_invoice_number}`;
    // تحقق من عدم التكرار
    if (invoices.find(inv => inv.invoice_number === invoiceNum)) {
      return { success: false, error: `الفاتورة رقم ${data.external_invoice_number} مستوردة مسبقاً` };
    }

    const newInvoiceId = generateId('inv');
    const newInvoice: Invoice = {
      id: newInvoiceId,
      invoice_number: invoiceNum,
      invoice_date: data.invoice_date,
      official_id: officialId,
      total_amount: data.total_amount,
      version: 1,
      is_modified: false,
      is_deleted: false,
      car_id: car.id,
      license_details: data.license_details,
      license_location: data.license_location
    };

    const newItems: InvoiceItem[] = data.items.map((itm, idx) => ({
      id: generateId('item'),
      invoice_id: newInvoiceId,
      car_id: car.id,
      description: itm.description,
      amount: itm.amount,
      payment_method: 'cash' as const,
      account_id: ''
    }));

    setInvoices(prev => [newInvoice, ...prev]);
    setInvoiceItems(prev => [...prev, ...newItems]);

    // تحديث إجمالي مصروف الترخيص على السيارة
    setCars(prev => prev.map(c => {
      if (c.id === car.id) {
        return { ...c, license_total_cost: (c.license_total_cost || 0) + data.total_amount };
      }
      return c;
    }));

    // رفع للسحابة
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      Promise.all([
        supabase.from('invoices').insert([newInvoice]),
        supabase.from('invoice_items').insert(newItems)
      ]).catch(e => console.error('importOldInvoice cloud error:', e));
    }

    return { success: true, invoice: newInvoice };
  };

  // حفظ مسودات الفواتير في Supabase (key-value بسيط في جدول مخصص)
  const saveDraftVouchers = async (drafts: any[]): Promise<void> => {
    // حفظ محلياً دائماً
    localStorage.setItem('elbanna_invoice_drafts', JSON.stringify(drafts));
    // حفظ سحابي لو متصل
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      try {
        // نستخدم جدول invoice_audit_logs كمخزن مؤقت بـ operation_type = 'draft'
        // أو نحفظ في localStorage فقط لأن Supabase ما عندوش جدول drafts
        // الحل: نحفظ كـ JSON في حقل new_value في سجل خاص
        await supabase.from('invoice_audit_logs').upsert([{
          id: 'draft_autosave_singleton',
          invoice_id: 'drafts',
          invoice_number: 'DRAFTS',
          timestamp: new Date().toISOString(),
          supervisor_name: 'system',
          operation_type: 'create',
          old_value: 'auto_draft',
          new_value: JSON.stringify(drafts)
        }]);
      } catch (e) {
        console.warn('Draft cloud save failed, kept locally:', e);
      }
    }
  };

  const loadDraftVouchers = async (): Promise<any[] | null> => {
    // حاول السحابة أولاً
    const supabase = getSupabaseClient();
    if (supabase && isCloudConnected) {
      try {
        const { data } = await supabase
          .from('invoice_audit_logs')
          .select('new_value')
          .eq('id', 'draft_autosave_singleton')
          .single();
        if (data?.new_value) {
          const parsed = JSON.parse(data.new_value);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {
        // fall through to local
      }
    }
    // جرب المحلي
    const local = localStorage.getItem('elbanna_invoice_drafts');
    if (local) {
      try { return JSON.parse(local); } catch { return null; }
    }
    return null;
  };

  const exportCloudBackup = async (): Promise<{ success: boolean; data?: string; message: string }> => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, message: "مفاتيح ربط Supabase السحابية غير مهيأة بعد." };
    }

    try {
      const [
        resDrivers,
        resOfficials,
        resCars,
        resViolations,
        resInvoices,
        resItems,
        resLogs,
        resMovements,
        resCustodyAccs,
        resCustodyMovs
      ] = await Promise.all([
        supabase.from('drivers').select('*'),
        supabase.from('officials').select('*'),
        supabase.from('cars').select('*'),
        supabase.from('violations').select('*').order('violation_date', { ascending: false }),
        supabase.from('invoices').select('*').order('invoice_number', { ascending: false }),
        supabase.from('invoice_items').select('*'),
        supabase.from('invoice_audit_logs').select('*').order('timestamp', { ascending: false }),
        supabase.from('driver_account_movements').select('*').order('date', { ascending: false }),
        supabase.from('custody_accounts').select('*'),
        supabase.from('custody_movements').select('*').order('date', { ascending: false })
      ]);

      const errors = [
        resDrivers.error, resOfficials.error, resCars.error, resViolations.error,
        resInvoices.error, resItems.error, resLogs.error, resMovements.error,
        resCustodyAccs.error, resCustodyMovs.error
      ].filter(Boolean);

      if (errors.length > 0) {
        return { success: false, message: `فشل جلب البيانات السحابية للتصدير: ${errors[0]!.message}` };
      }

      const backupObj = {
        app: "elbanna_fleet_management",
        version: "1.0",
        source: "supabase_cloud",
        timestamp: new Date().toISOString(),
        data: {
          drivers: resDrivers.data || [],
          officials: resOfficials.data || [],
          cars: resCars.data || [],
          violations: resViolations.data || [],
          invoices: resInvoices.data || [],
          invoiceItems: resItems.data || [],
          auditLogs: resLogs.data || [],
          movements: resMovements.data || [],
          custodyAccounts: resCustodyAccs.data || [],
          custodyMovements: resCustodyMovs.data || []
        }
      };

      return {
        success: true,
        data: JSON.stringify(backupObj, null, 2),
        message: "تم تصدير نسخة احتياطية سحابية كاملة بنجاح!"
      };
    } catch (e: any) {
      console.error("Cloud backup exception:", e);
      return { success: false, message: `فشل الاتصال بالسحابة: ${e.message || e}` };
    }
  };

  return (
    <DbContext.Provider
      value={{
        drivers: drivers || [],
        officials: officials || [],
        cars: cars || [],
        violations: violations || [],
        invoices: invoices || [],
        invoiceItems: invoiceItems || [],
        auditLogs: auditLogs || [],
        movements: movements || [],
        custodyAccounts: custodyAccounts || [],
        custodyMovements: custodyMovements || [],
        isRealtimeActive,
        setRealtimeActive,
        latencyMs,
        isCloudConnected,
        isCloudSyncing,
        cloudError,
        setCloudError,
        testCloudConnection,
        uploadLocalDataToCloud,
        downloadCloudDataToLocal,
        addDriver,
        updateDriver,
        deleteDriver,
        addCar,
        updateCar,
        deleteCar,
        addOfficial,
        updateCustody,
        addCustodyAccount,
        updateCustodyAccount,
        deleteCustodyAccount,
        transferCustody,
        addViolation,
        deleteViolation,
        applyIndividualDeduction,
        applyGroupDeductionRpc,
        createInvoice,
        updateInvoice,
        deleteInvoice,
        importOldInvoice,
        saveDraftVouchers,
        loadDraftVouchers,
        resetToInitial,
        exportLocalBackup,
        importLocalBackup,
        exportCloudBackup
      }}
    >
      {children}
    </DbContext.Provider>
  );
};

export const useDb = () => {
  const context = useContext(DbContext);
  if (!context) {
    throw new Error('useDb must be used within a DbProvider');
  }
  return context;
};
