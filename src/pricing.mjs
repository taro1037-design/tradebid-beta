/** TradeBid Workbench — deterministic local cost & quote math. No external APIs. */
export const MAX_AMOUNT = 1_000_000_000;
export class InputError extends Error {}

export function money(n) {
  if (!Number.isFinite(n)) throw new InputError("Amount is not finite");
  return Number(Math.round(Number(n + 'e2')) + 'e-2');
}
export function amount(value, label = "amount") {
  if (value === "" || value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) throw new InputError(`Invalid non-negative ${label}`);
  return n;
}
function percent(n, label, max = 100) {
  const v = amount(n, label);
  if (v > max) throw new InputError(`${label} cannot exceed ${max}%`);
  return v;
}
export function pricing(input = {}) {
  const crew = amount(input.crew ?? 1, "crew size");
  const hours = amount(input.hours, "hours");
  const hourly = amount(input.hourly, "labor cost per worker hour");
  const laborBurden = percent(input.laborBurden, "labor burden");
  const materials = amount(input.materials, "materials");
  const supplies = amount(input.supplies, "supplies");
  const travel = amount(input.travel, "travel");
  const tools = amount(input.tools, "equipment");
  const subcontract = amount(input.subcontract, "subcontract");
  const risk = percent(input.contingency, "contingency");
  const overheadRate = percent(input.overhead, "overhead");
  const targetMargin = percent(input.targetMargin ?? 30, "target margin", 89);
  const minMargin = percent(input.minMargin ?? 15, "minimum margin", 89);
  const discount = percent(input.discount, "discount");
  const taxRate = percent(input.taxRate, "tax");
  const labor = money(crew * hours * hourly * (1 + laborBurden / 100));
  const direct = money(labor + materials + supplies + travel + tools + subcontract);
  const contingency = money(direct * risk / 100);
  const overhead = money((direct + contingency) * overheadRate / 100);
  const cost = money(direct + contingency + overhead);
  if (!Number.isFinite(cost) || cost > MAX_AMOUNT) throw new InputError("Total cost is too large");
  const floor = money(Math.ceil(cost / (1 - targetMargin / 100) * 100) / 100);
  const suggested = floor;
  const quote = input.quote === undefined || input.quote === "" ? suggested : money(amount(input.quote, "quote amount"));
  const afterDiscount = money(quote * (1 - discount / 100));
  const tax = money(afterDiscount * taxRate / 100);
  const customerTotal = money(afterDiscount + tax);
  const grossProfit = money(afterDiscount - cost);
  const margin = afterDiscount > 0 ? money(100 * grossProfit / afterDiscount) : (cost === 0 ? 0 : -100);
  const markup = cost > 0 ? money(100 * grossProfit / cost) : null;
  const minimumPrice = money(Math.ceil(cost / (1 - minMargin / 100) * 100) / 100);
  const redFlag = cost > 0 && (grossProfit < 0 || margin + 0.001 < minMargin);
  const stressedHours = hours * 1.15;
  const stressed = pricingScenario({labor,multiplier:hours > 0 ? stressedHours / hours : 1,remaining:money(direct - labor),risk,overheadRate,afterDiscount});
  return {crew,hours,hourly,laborBurden,materials,supplies,travel,tools,subcontract,risk,overheadRate,targetMargin,minMargin,discount,taxRate,
    labor,direct,contingency,overhead,cost,floor,suggested,quote,afterDiscount,tax,customerTotal,
    grossProfit,margin,markup,minimumPrice,redFlag,stressed};
}
function pricingScenario({labor,multiplier,remaining,risk,overheadRate,afterDiscount}) {
  const direct = money(labor * multiplier + remaining);
  const contingency = money(direct * risk / 100);
  const overhead = money((direct + contingency) * overheadRate / 100);
  const cost = money(direct + contingency + overhead);
  const profit = money(afterDiscount - cost);
  return {label:"+15% labor hours",cost,profit,margin:afterDiscount > 0 ? money(profit / afterDiscount * 100) : 0};
}
export function actualResult(quote, actual = {}) {
  const hours = amount(actual.hours, "actual worker-hours");
  const crew = amount(actual.crew ?? quote.crew, "actual crew");
  const hourly = amount(actual.hourly ?? quote.hourly, "actual hourly rate");
  const labor = money(hours * crew * hourly * (1 + quote.laborBurden / 100));
  const materials = amount(actual.materials, "actual materials");
  const supplies = amount(actual.supplies, "actual supplies");
  const travel = amount(actual.travel, "actual travel");
  const tools = amount(actual.tools, "actual equipment");
  const subcontract = amount(actual.subcontract, "actual subcontract");
  const direct = money(labor + materials + supplies + travel + tools + subcontract);
  // Actuals are recorded expenses. Do not add estimated contingency back as if spent.
  const overhead = money(direct * quote.overheadRate / 100);
  const cost = money(direct + overhead);
  const profit = money(quote.afterDiscount - cost);
  return {cost,profit,margin:quote.afterDiscount > 0 ? money(100 * profit / quote.afterDiscount) : 0,
    variance:money(cost - quote.cost),lostProfit:money(quote.grossProfit - profit)};
}
export function clientQuote({business = "",customer = "",job = "",scope = "",excluded = "",terms = "",contact = "",validUntil = "",currency = "USD",reference = ""}, results) {
  const sanitize = (v,len=600) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, " ").slice(0,len).trim();
  return {business:sanitize(business,90),customer:sanitize(customer,90),job:sanitize(job,150),scope:sanitize(scope,1600),excluded:sanitize(excluded,1000),
    terms:sanitize(terms,900),contact:sanitize(contact,200),validUntil:sanitize(validUntil,25),currency:sanitize(currency,4),reference:sanitize(reference,50),
    subtotal:results.quote,discount:money(results.quote - results.afterDiscount),tax:results.tax,total:results.customerTotal,
    disclaimer:"Estimate only. Work and final amount are subject to written agreement; confirm exclusions and applicable taxes."};
}
export function csvEscape(v){
  let cell=String(v??"").replace(/[\r\n\t]+/g," ").trim().slice(0,2000);
  // Quoted CSV alone does NOT stop spreadsheet formula execution.
  if (/^[=+@]/.test(cell) || (cell.startsWith('-') && !/^-\d+(?:\.\d+)?$/.test(cell))) cell="'"+cell;
  return '"'+cell.replaceAll('"','""')+'"';
}

/** Pricing suggestion for new client-requested work (never auto-approved). */
export function changeOrder(original, extra = {}) {
  const workerHours = amount(extra.workerHours, "additional worker-hours");
  const materials = amount(extra.materials, "additional materials");
  const travel = amount(extra.travel, "additional travel");
  const equipment = amount(extra.equipment, "additional equipment");
  const hourly = amount(extra.hourly ?? original.hourly, "hourly cost");
  const labor = money(workerHours * hourly * (1 + original.laborBurden / 100));
  const direct = money(labor + materials + travel + equipment);
  const buffer = money(direct * original.risk / 100);
  const overhead = money((direct + buffer) * original.overheadRate / 100);
  const addedCost = money(direct + buffer + overhead);
  const margin = percent(extra.margin ?? original.targetMargin, "change-order margin", 89);
  const price = money(Math.ceil(addedCost / (1 - margin / 100) * 100) / 100);
  const combinedRevenue = money(original.afterDiscount + price);
  const combinedCost = money(original.cost + addedCost);
  return {workerHours,materials,travel,equipment,labor,direct,buffer,overhead,addedCost,
    suggestedExtraPrice:price,combinedRevenue,combinedCost,
    combinedGrossProfit:money(combinedRevenue-combinedCost),
    combinedMargin:combinedRevenue>0?money((combinedRevenue-combinedCost)/combinedRevenue*100):0,
    note:"Draft only — get the client's explicit approval before any extra work."};
}

export function exportJobsCSV(jobs) {
  const cols=["reference","customer","job","status","quote","cost","profit","margin","updated"];
  return cols.join(",")+"\n"+jobs.map(job=>cols.map(col=>csvEscape(job[col])).join(",")).join("\n")+"\n";
}
