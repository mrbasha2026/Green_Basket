# خطة إصلاح وتطوير GreenBasket System
## مبنية على تحليل 10 أجينتات متخصصة

---

## الأولويات العامة

- 🔴 حرجة — خطر تلف بيانات أو ثغرة أمنية
- 🟠 مهمة — ناقصة وظيفياً أو قانونياً
- 🟡 تحسين — جودة الكود أو تجربة المستخدم

---

## Session 1: إصلاح أخطاء البيانات الحرجة
> **الهدف:** إصلاح الأخطاء التي تُفسد البيانات الآن
> **المدة المقدّرة:** 2-3 ساعات

- [x] 🔴 إصلاح `useInventory.ts:61` — `salesKg` لا يُفرّق بين بيع ومرتجع بيع (المرتجع يُطرح من المخزون بدل الإضافة)
- [x] 🔴 إصلاح `Purchases.tsx:170` — `waste_kg` يُرسَل دائماً بـ 0، الهدر عند الاستلام لا يرفع `cost_per_kg`
- [x] 🔴 توحيد منهجية WAC: الحساب اليومي في `useInventory.ts:66` يخصم الهالك، الشهري في `usePeriodManagement.ts:147` لا يخصمه — قرار واحد موثّق
- [x] 🟠 إزالة قيد `unique(product_id, date)` من جدول `purchases` — يمنع شراء نفس المنتج مرتين في يوم واحد (`schema.sql:66`)
- [x] 🟠 مراجعة قيد `unique(product_id, customer_id, date, source)` في `sales` — يمنع فاتورتين لنفس العميل يومياً

**مراجعة Session 1:**
- [ ] اختبار يدوي: إدخال مرتجع بيع والتحقق من تحديث المخزون صحيحاً
- [ ] اختبار يدوي: إدخال مشتريات بهدر عند الاستلام والتحقق من cost_per_kg
- [ ] تشغيل migration `fix_unique_constraints.sql` على Supabase

**ملاحظات Session 1 (مُنجز):**
- قرار WAC الموحّد: الهالك لا يُخصم من مقام WAC في الحساب اليومي ولا الشهري — تكلفته تُحمَّل في قائمة الدخل عبر useCalculateCostAllocation
- waste_kg في المشتريات يؤثر على cost_per_kg (التكلفة/كج) لكنه لا يؤثر على الكمية المستلمة في inventory_daily (total_weight يُستخدم كاملاً) — يمكن مراجعة هذا في Session 7
- migration جاهز لكنه يحتاج تشغيلاً يدوياً على Supabase Dashboard

---

## Session 2: الأمان والصلاحيات (RLS)
> **الهدف:** تحويل الحماية من frontend-only إلى defense-in-depth حقيقية
> **المدة المقدّرة:** 3-4 ساعات

- [x] 🔴 كتابة migration جديد `permissions_rls_v3.sql` — تشديد RLS على الجداول العملياتية:
  - `sales`: تقييد INSERT/UPDATE/DELETE بصلاحيات sales.add/edit/delete
  - `purchases`: تقييد INSERT/UPDATE/DELETE بصلاحيات purchases.add/edit/delete
  - `waste_log`: تقييد INSERT/UPDATE/DELETE بصلاحيات waste.add/edit/delete
  - `products`: تقييد INSERT/UPDATE/DELETE بصلاحيات inventory.add/edit/delete
- [x] 🟠 إصلاح فحص `is_active` في `usePermissions.ts` — يُعاد Map فارغة فوراً للمستخدم الموقوف
- [x] 🟠 إصلاح Bootstrap loophole في `usePermissions.ts` — استبدال `count > 1` بـ `count(role_id is not null) > 0`
- [x] 🟠 إصلاح `api/sync-sheets.ts:485` — مستخدم بلا `role_id` يُحجب إلا إذا كان Bootstrap admin + فحص is_active

**مراجعة Session 2:**
- [ ] اختبار: مستخدم "مشاهد" يحاول حذف فاتورة مباشرة عبر Supabase client — يجب رفضه

**ملاحظات Session 2 (مُنجز):**
- `user_has_permission()` SQL تم تحديثها لتفحص `is_active = true` — مستخدم موقوف محجوب على مستوى DB
- Bootstrap loophole: تغيير الشرط من "كم عدد المستخدمين؟" إلى "هل يوجد مستخدم بدور مُعيَّن؟" — أدق وأقل عُرضة للـ race conditions
- migration `permissions_rls_v3.sql` يحتاج تشغيلاً يدوياً على Supabase Dashboard (مثل `fix_unique_constraints.sql`)
- `inventory_daily` وجداول أخرى (cost_allocation, overhead_entries) تركت بـ "authenticated full access" عن قصد — تُعدَّل بواسطة hooks داخلية لا مستخدمين مباشرة

---

## Session 3: الامتثال القانوني + VAT
> **الهدف:** تجاوز متطلبات الفاتورة الضريبية السعودية
> **المدة المقدّرة:** 3-4 ساعات

- [x] 🔴 إضافة حقل `vat_amount` و`vat_applied` في جدول `sales` (migration جديد)
- [x] 🔴 إضافة حقل `vat_amount` و`vat_applied` في جدول `purchases`
- [x] 🔴 تحديث logic الحفظ في `Sales.tsx` و`Purchases.tsx` لتخزين قيمة الضريبة
- [x] 🟠 إضافة الرقم الضريبي في قالب طباعة فاتورة المبيعات
- [x] 🟠 إضافة العنوان ورقم الهاتف في قالب الطباعة (من `gb_site_settings`)
- [x] 🟠 جعل VAT إلزامية (غير toggle اختياري) إذا كان النظام في بيئة VAT-required

**مراجعة Session 3:**
- [ ] طباعة فاتورة والتحقق من ظهور: الرقم الضريبي، العنوان، الهاتف، مبلغ VAT

**ملاحظات Session 3 (مُنجز):**
- `vat_applied` و`vat_amount` أُضيفا كحقول اختيارية في النوع (optional) لتجنب كسر الكود القديم والبيانات الحالية — القيمة الافتراضية في DB: `false` و`0`
- `vat_amount` يُخزَّن موزّعاً على كل سطر بنسبة قيمته من إجمالي الفاتورة (proportional allocation) حتى يصح جمعها
- `vat_required` إعداد جديد في `gb_site_settings` + Settings.tsx — عند تفعيله يُخفي زر التبديل ويطبق الضريبة تلقائياً على كل فاتورة
- الرقم الضريبي (`tax_number`)، العنوان (`address`)، الهاتف (`phone`) مخزّنة مسبقاً في `gb_site_settings` — أُضيفت الآن لقوالب الطباعة فقط
- migration `vat_columns.sql` يحتاج تشغيلاً يدوياً على Supabase Dashboard

---

## Session 4: Audit Log وحماية البيانات
> **الهدف:** تتبع العمليات الحساسة + منع الفقدان الدائم للبيانات
> **المدة المقدّرة:** 4-5 ساعات

- [x] 🔴 إنشاء جدول `audit_log` عبر migration — يسجّل: جدول، نوع العملية، البيانات القديمة، المستخدم، الوقت
- [x] 🔴 إضافة PostgreSQL Trigger على `sales` لتسجيل INSERT/UPDATE/DELETE في `audit_log`
- [x] 🔴 إضافة Trigger على `purchases`
- [x] 🟠 تحويل حذف المبيعات إلى Soft Delete (`is_deleted=true`) في `useSales.ts:59-70`
- [x] 🟠 تحويل حذف المشتريات إلى Soft Delete في `usePurchases.ts:74-94`
- [x] 🟠 تحديث جميع queries لاستبعاد `is_deleted=true`
- [x] 🟡 صفحة Audit Log في Settings لعرض سجل العمليات

**مراجعة Session 4:**
- [ ] حذف فاتورة والتحقق من وجودها في `audit_log`
- [ ] التحقق من أن الفاتورة "المحذوفة" لا تظهر في القوائم لكنها موجودة في DB

**ملاحظات Session 4 (مُنجز):**
- migration `audit_log.sql` يحتاج تشغيلاً يدوياً على Supabase Dashboard (يضيف is_deleted + جدول audit_log + triggers)
- الحذف أصبح Soft Delete: `.update({ is_deleted: true })` بدل `.delete()` — الـ trigger يسجّله كـ UPDATE في audit_log مع new_data.is_deleted=true
- `fetchAllSales` و`fetchAllPurchases` أضيف لهما `.eq('is_deleted', false)` ليستبعدا المحذوفات
- تبويب "سجل العمليات" في Settings يعرض آخر 200 سجل من audit_log مع تمييز الحذف الناعم تلقائياً
- نوع `AuditLog` أُضيف إلى `src/types/index.ts`

---

## Session 5: أداء قاعدة البيانات — Indices
> **الهدف:** تسريع جميع استعلامات النطاق الزمني
> **المدة المقدّرة:** 1-2 ساعة

- [x] 🔴 كتابة migration `performance_indices.sql` يضيف:
  - `CREATE INDEX idx_sales_date ON sales(date)`
  - `CREATE INDEX idx_sales_product_date ON sales(product_id, date)`
  - `CREATE INDEX idx_purchases_date ON purchases(date)`
  - `CREATE INDEX idx_purchases_product_date ON purchases(product_id, date)`
  - `CREATE INDEX idx_inventory_daily_product_date ON inventory_daily(product_id, date)`
  - `CREATE INDEX idx_waste_log_date ON waste_log(date)`
  - `CREATE INDEX idx_waste_log_product_date ON waste_log(product_id, date)`
- [x] 🟠 تحويل `useEarliestInventory` من فلترة JS إلى `DISTINCT ON (product_id)` SQL
- [x] 🟠 تحويل `useInventoryUpTo` من فلترة JS إلى query محدودة في DB
- [x] 🟡 إضافة حد أقصى لعدد الصفحات في `fetchAllPages` (`src/lib/supabase.ts:9`)

**مراجعة Session 5:**
- [ ] قياس زمن تحميل صفحة Analytics قبل وبعد الـ Indices

**ملاحظات Session 5 (مُنجز):**
- migration `performance_indices.sql` يحتاج تشغيلاً يدوياً على Supabase Dashboard (يضيف 7 indices + دالتَي RPC)
- `useEarliestInventory` و`useInventoryUpTo` يستخدمان الآن `DISTINCT ON (product_id)` عبر RPC — بدل جلب كل الجدول وتصفيته في JS
- الدالتان `get_earliest_inventory` و`get_inventory_upto` تُرجعان الـ product كـ jsonb (مدمج في نفس الاستعلام) — لا حاجة لطلب ثانٍ
- `fetchAllPages` أُضيف لها `maxPages=100` (حد 100,000 صف) لحماية من loop لا نهاية في حالة خطأ في الـ API

---

## Session 6: أداء Frontend
> **الهدف:** تقليل حجم الـ bundle وتحسين تجربة التحميل
> **المدة المقدّرة:** 2-3 ساعات

- [x] 🟠 تحويل `App.tsx:9-24` إلى `React.lazy()` + `Suspense` لكل الصفحات الـ 12
- [x] 🟠 إصلاح `Profits.tsx:49` — استبدال `useWaste()` بـ `useWasteByRange(fromDate, toDate)`
- [x] 🟠 إصلاح `Analytics.tsx:57-60` — اشتقاق `salesRange` من `sales12` بدل طلبَين منفصلَين
- [x] 🟡 رفع `staleTime` للبيانات المرجعية (products/customers/suppliers) من 60 ثانية إلى 10 دقائق
- [x] 🟡 تحسين `invalidateQueries` في useSales/usePurchases ليكون محدد المفتاح لا عاماً

**مراجعة Session 6:**
- [ ] قياس bundle size قبل وبعد Lazy Loading (npm run build)
- [ ] التحقق من ظهور Suspense fallback عند التنقل

**ملاحظات Session 6 (مُنجز):**
- كل صفحات التطبيق الـ 16 أصبحت Lazy-loaded — الـ bundle الرئيسي يُحمَّل فوراً، باقي الصفحات تُجلب عند الزيارة الأولى فقط
- `Guard` يُغلّف lazy component بـ `<Suspense>` مباشرة — لا حاجة لـ Suspense منفصل لكل Route
- `Profits.tsx`: إزالة `useWaste()` التي تجلب كل الهدر + `useMemo` للتصفية — استُبدلا بـ `useWasteByRange` الذي يجلب النطاق مباشرة من DB
- `Analytics.tsx`: إلغاء طلبَين شبكيَّين (`salesRange` و`purchasesRange`) — الآن يُشتقان بـ `useMemo` من بيانات الـ 12 شهر الموجودة في الذاكرة
- `staleTime: 10 دقائق` أُضيف لـ `useProducts`, `useAllProducts`, `useCustomers`, `useAllCustomers`, `useSuppliers` — هذه بيانات شبه ثابتة لا تتغير كثيراً
- `invalidateQueries`: استُخرجت دالتان `invalidateSales(qc)` و`invalidatePurchases(qc)` — تُستخدمان في جميع mutations بدل تكرار نفس الكود 3 مرات في كل ملف

---

## Session 7: Atomic Operations وRace Conditions
> **الهدف:** منع تلف البيانات عند الاستخدام المتزامن
> **المدة المقدّرة:** 4-5 ساعات

- [x] 🔴 إنشاء Supabase RPC function `get_next_invoice_number(prefix text)` — يستخدم `INSERT ON CONFLICT DO UPDATE RETURNING` الذي هو ذري في PostgreSQL
- [x] 🔴 تحديث `nextSaleInvoiceNumber` في `useSales.ts:99` لاستخدام RPC بدل JS
- [x] 🔴 تحديث `nextPurchaseInvoiceNumber` في `usePurchases.ts:127` لاستخدام RPC
- [x] 🟠 تحويل احتساب WAC الشهري إلى RPC `save_period_wac` (upsert + batch updates + حالة الفترة + log في transaction واحدة)
- [x] 🟠 تحويل إغلاق الفترة إلى RPC `close_accounting_period`
- [x] 🟠 تحويل فتح الفترة إلى RPC `open_accounting_period`
- [~] 🟡 UNIQUE constraint على `invoice_number` — **مؤجّل:** النموذج الحالي يسمح لعدة سطور بمشاركة نفس رقم الفاتورة (منتجات مختلفة في فاتورة واحدة)، الحماية من التكرار تأتي من العداد الذري

**مراجعة Session 7:**
- [ ] تشغيل migration `atomic_operations.sql` على Supabase Dashboard
- [ ] اختبار: فتح فاتورتَين في نفس الوقت — التحقق من أرقام مختلفة
- [ ] اختبار: احتساب WAC مع قطع الشبكة في المنتصف — التحقق من consistency

**ملاحظات Session 7 (مُنجز):**
- `get_next_invoice_number` يستخدم `INSERT ON CONFLICT DO UPDATE RETURNING` — هذا ذري تلقائياً في PostgreSQL دون الحاجة لـ advisory locks
- جدول `invoice_counters` يُهيَّأ تلقائياً من الفواتير الموجودة عند تشغيل migration أول مرة
- `save_period_wac` تجمع 4 عمليات كانت متسلسلة (upsert period_close + batch sales update + upsert accounting_periods + insert log) في transaction واحدة — قطع الشبكة في أي خطوة لا يترك حالة جزئية
- `close_accounting_period` و`open_accounting_period` يضمنان أن تحديث الحالة وسجل الأحداث يحدثان معاً
- UNIQUE constraint على `invoice_number` غير مناسب: الفاتورة تتضمن عدة سطور (منتجات) بنفس الرقم — إضافة الـ constraint ستكسر البيانات الحالية والمنطق الحالي

---

## Session 8: النسخ الاحتياطي والتصدير
> **الهدف:** تصدير شامل للبيانات وحماية من فقدان الكل
> **المدة المقدّرة:** 3-4 ساعات

- [x] 🔴 توسيع تبويب Backup في `Settings.tsx:477` ليشمل: sales, purchases, waste_log, inventory_daily
- [x] 🟠 إضافة تصدير JSON شامل لكل قاعدة البيانات (جدول بجدول)
- [x] 🟠 إضافة تصدير Excel شامل (استخدام exceljs الموجود)
- [x] 🟠 إضافة تحذير واضح عند فتح فترة مغلقة بأن البيانات ستُحذف
- [x] 🟡 توثيق سياسة الاحتفاظ بالبيانات في صفحة Settings

**مراجعة Session 8:**
- [ ] اختبار التصدير الشامل والتحقق من اكتمال البيانات

**ملاحظات Session 8 (مُنجز):**
- `BackupTab` يصدّر الآن 8 جداول كاملة (مبيعات، مشتريات، أصناف، عملاء، موردون، هدر، مخزون يومي، فترات محاسبية) عبر `fetchAllPages` — يدعم قواعد بيانات كبيرة
- `exportMultiSheetExcel` أُضيفت إلى `src/lib/excel.ts` — تُنشئ ملف Excel بـ 8 أوراق، ورقة لكل جدول
- التصدير يستبعد الحذوف الناعمة (`.eq('is_deleted', false)`) في المبيعات والمشتريات تلقائياً
- `PeriodManagement.tsx`: زر "فتح" يعرض الآن `AlertDialog` يُحذّر بأن رصيد الإغلاق سيُحذف ويحتاج إعادة احتساب — المستخدم يؤكد صراحةً قبل التنفيذ
- سياسة الاحتفاظ بالبيانات موثّقة في تبويب Backup (Soft Delete، فتح الفترة، توصية التصدير الشهري)

---

## Session 9: الاختبارات (Tests)
> **الهدف:** تغطية المنطق المحاسبي الحرج من الاختبارات
> **المدة المقدّرة:** 4-6 ساعات

- [x] 🔴 تهيئة Vitest في `vite.config.ts` + إضافة scripts في `package.json`
- [x] 🔴 كتابة `src/lib/calculations.test.ts`:
  - `calcWeightedAvgCost` — مخزون صفري، تكلفة صفرية
  - `calcCostPerKg` — هالك أكبر من الوزن، قيم صفرية
  - `computeProductAllocation` — إيراد صفري
  - `computeMonthlyPL` — تصنيف التكاليف بالعربية
- [x] 🔴 كتابة `src/lib/sheetsParser.test.ts`:
  - Serial dates من Excel
  - أرقام عربية (٥٠٫٥)
  - تنسيق DD/MM/YYYY vs MM/DD/YYYY
  - صفوف فارغة وصفوف إجمالي
- [x] 🟠 كتابة `src/hooks/usePeriodManagement.test.ts` — منطق WAC الشهري
- [x] 🟡 إعداد GitHub Actions CI في `.github/workflows/test.yml`

**مراجعة Session 9:**
- [x] تشغيل `npm run test` — 44 اختبار تمر (3 ملفات)
- [x] تشغيل `npm run coverage` — calculations.ts: 100%، sheetsParser.ts: 84.82%، كلاهما فوق 60%

**ملاحظات Session 9 (مُنجز):**
- `vitest` و`@vitest/coverage-v8` أُضيفا كـ devDependencies، وتم استبدال `defineConfig` من 'vite' بـ 'vitest/config' في `vite.config.ts`
- `calculations.test.ts`: 18 اختبار — تغطية 100% للدوال الأربع مع حالات الحافة (صفري، سالب، هدر أكبر من الوزن)
- `sheetsParser.test.ts`: 14 اختبار — يغطي: serial dates، أرقام عربية، تنسيقات التاريخ المختلفة، صفوف الإجمالي، تواريخ متعددة
- `usePeriodManagement.test.ts`: 12 اختبار — يختبر خوارزمية WAC الشهري كدالة نقية بمعزل عن Supabase، وصافي المبيعات مع المرتجعات
- اكتشاف: `full_cost_per_kg` يعتمد على `qtySoldKg` لا على `revenue` — التوقع الأول في الاختبار كان خاطئاً وصُحِّح
- `GitHub Actions` يشغّل `npm test` و`npm run coverage` عند كل push/PR لـ main

---

## Session 10: UI/UX — إصلاحات الواجهة
> **الهدف:** تحسين التجربة اليومية للموظف
> **المدة المقدّرة:** 3-4 ساعات

- [x] 🟠 استبدال `window.confirm()` بـ `AlertDialog` من shadcn في `Sales.tsx:315` و`Sales.tsx:347` و`Purchases.tsx:384` و`Purchases.tsx:429`
- [x] 🟠 إصلاح عرض SaleDrawer: `min(680px, 100vw)` بدل `680px` ثابتة (`Sales.tsx:183`)
- [x] 🟠 إضافة validation مرئي على حقول الفاتورة (رسالة "مطلوب" تحت حقل العميل عند الحفظ بدون اختيار)
- [x] 🟡 إصلاح `CheckIcon` في `combobox.tsx:131` من `left-2` إلى `right-2`
- [x] 🟡 تغيير سهم `→` إلى `←` في `Dashboard.tsx:300`
- [x] 🟡 تغيير `text-left` إلى `text-right` في `DataTable.tsx:197`
- [x] 🟡 إضافة عناوين الصفحات الناقصة في `pageTitles` (analytics, account-statement, period-management, profile)
- [x] 🟡 تحسين رسالة الخطأ العامة في `Sales.tsx handleSubmit` — تفاصيل بدلاً من "حدث خطأ"

**PWA (مضاف في هذه الجلسة):**
- [x] إضافة `useInstallPrompt` hook في `src/hooks/useInstallPrompt.ts`
- [x] إضافة `InstallPromptNotifier` في `App.tsx` — يعرض toast مع زر "تثبيت" عند توفر الـ install prompt

**مراجعة Session 10:**
- [ ] اختبار على شاشة موبايل: فتح فاتورة مبيعات جديدة
- [ ] اختبار: حذف سطر من فاتورة — تأكيد بـ AlertDialog صحيح

**ملاحظات Session 10 (مُنجز):**
- `AlertDialog` من `@base-ui/react` — يستخدم `open` prop مُتحكّم به عبر state `confirmDelete` في كلٍّ من `SalesRecordsSection` و`PurchaseRecordsSection`، يحذف سجل واحد أو عدة سجلات بنفس الـ state
- `submitted` state في `SaleDrawer` — يُضبط على true عند النقر على حفظ ويُعاد إلى false عند إغلاق الـ Drawer، يُظهر رسالة "مطلوب" تحت حقل العميل إذا كان فارغاً
- `useInstallPrompt` hook يلتقط `beforeinstallprompt` event ويعرض toast مدته 15 ثانية مع زر تثبيت — يُفعَّل تلقائياً عندما يستوفي التطبيق معايير PWA في المتصفح

---

## Session 11: التقارير الناقصة
> **الهدف:** سد الفجوات في منظومة التقارير
> **المدة المقدّرة:** 5-6 ساعات

- [x] 🟠 إضافة تبويب "تقرير المشتريات" في صفحة Reports — جدول فواتير مع تحليل حسب مورد/صنف
- [x] 🟠 إضافة مخطط مقارنة الهدر عبر الأشهر في `Waste.tsx`
- [x] 🟡 إضافة تقرير دوران المخزون (Turnover Rate) في Inventory
- [x] 🟡 إضافة تقرير تقادم المخزون (Aging) للأصناف القديمة
- [x] 🟡 إضافة تصدير PDF لباقي التقارير (غير الأرباح فقط)
- [x] 🟡 تخصيص حد التنبيه لكل صنف على حدة (بدلاً من 10 كج للجميع)

**مراجعة Session 11:**
- [ ] التحقق من دقة أرقام تقرير المشتريات مقابل الفواتير الفعلية
- [ ] تشغيل migration `low_stock_threshold.sql` على Supabase Dashboard

**ملاحظات Session 11 (مُنجز):**
- تقرير المشتريات في `Reports.tsx` يعرض ملخصَين: حسب مورد (التكلفة + عدد الفواتير + النسبة) وحسب صنف (الكمية + الهدر + نسبة الهدر%) — كلاهما قابل للتصدير Excel
- مخطط الهدر الشهري في `Waste.tsx` — قسم جديد "الاتجاه الشهري" يعرض BarChart مزدوج (كمية + تكلفة) لآخر 12 شهر باستخدام `useWasteByRange` مع نطاق ثابت
- دوران المخزون في `Inventory.tsx` — يحسب Turnover Rate = COGS ÷ متوسط قيمة المخزون — التلوين: أخضر ≥ 4x، أصفر ≥ 2x، أحمر < 2x
- تقادم المخزون في `Inventory.tsx` — يعرض الأصناف برصيد حالي مرتبة حسب آخر نشاط (بيع أو شراء) — الأحمر: أكثر من 30 يوم بدون حركة
- تصدير PDF في `Reports.tsx` باستخدام `jspdf` + `jspdf-autotable` الموجودَين — دالة `exportToPDF` مشتركة — متاح لتقريرَي الأصناف والعملاء + الـ sidebar
- `low_stock_threshold` حقل اختياري جديد في `Product` (افتراضيه 10 كج) — يُعدَّل من نموذج الصنف في صفحة المخزون — `lowStock` و`ovLowStock` تستخدمانه بدل الثابت 10
- migration `low_stock_threshold.sql` يحتاج تشغيلاً يدوياً على Supabase Dashboard

---

## ترتيب التنفيذ المقترح

```
Session 1  →  Session 2  →  Session 3  →  Session 4
   ↓
Session 7  →  Session 5  →  Session 6
   ↓
Session 8  →  Session 9
   ↓
Session 10 →  Session 11
```

| الترتيب | السيشن | السبب |
|---------|--------|-------|
| 1 | إصلاح البيانات الحرجة | تأثير فوري على صحة البيانات الموجودة |
| 2 | الأمان (RLS) | حماية قبل إضافة أي بيانات جديدة |
| 3 | VAT والامتثال | متطلب قانوني عاجل |
| 4 | Audit Log | يجب أن يسبق Soft Delete |
| 5 | Atomic Operations | يُصلح Race Conditions |
| 6 | Database Indices | تسريع فوري بدون تغيير منطق |
| 7 | أداء Frontend | تحسين بعد استقرار البيانات |
| 8 | Backup | طبقة حماية إضافية |
| 9 | الاختبارات | يختبر كل الإصلاحات السابقة |
| 10 | UI/UX | تحسينات غير حرجة |
| 11 | التقارير | إضافات وظيفية |

---

## مراجعة نهائية (بعد كل السيشنات)
- [ ] تشغيل كامل للنظام والتحقق من عدم وجود regressions
- [ ] مراجعة الـ migrations بالترتيب الصحيح
- [ ] توثيق كل القرارات التصميمية الكبرى في CLAUDE.md
