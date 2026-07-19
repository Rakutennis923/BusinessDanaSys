const STORAGE_KEY = "danan-business-admin-v2";
const CLOUD_API_URL = "https://script.google.com/macros/s/AKfycby_YVfqeWsBQlHtkd1d5tILCXz3qTcIL7uAmlRI1K2Kp8xjVvxHTU7Jupw8O0nHUinz/exec";
const PARTNER_MONTH_STORAGE_KEY = "danan-partner-last-month-v1";
let cloudSyncTimer = null;
let cloudInitialLoadComplete = false;
let cloudSavePending = false;
let cloudLoadInProgress = false;
let cloudSaveInProgress = false;
let cloudWriteHoldUntil = 0;
let partnerFormDirty = false;

const defaultPartnerNames = [
  "王沛琳", "王淑貞", "冷蕙名", "余惠如", "宋美珠", "林建智", "林恒儀", "林靂玄",
  "胡春木", "徐盛雄", "陳光霆", "陳亞琴", "陳柏宏", "陳雅惠", "陳嘉儀", "詹穗芬",
  "劉志剛", "林婉茹", "黃立鈞", "潘禹璇", "鍾秀琴", "謝心瑀", "簡偉宏", "魏廉庭"
];

const goalTypes = ["進案", "委託", "帶看", "議價", "廣告", "拜訪", "發DM", "掃街", "收斡", "成交"];
const monthLabels = Array.from({ length: 12 }, (_, i) => `${i + 1}月`);

let state = loadState();

const els = {
  yearSelect: document.querySelector("#yearSelect"),
  mobileYearSelect: document.querySelector("#mobileYearSelect"),
  annualTargetInput: document.querySelector("#annualTargetInput"),
  annualTargetDisplay: document.querySelector("#annualTargetDisplay"),
  overviewKpis: document.querySelector("#overviewKpis"),
  overviewPartnerTable: document.querySelector("#overviewPartnerTable"),
  overviewPartnerDetail: document.querySelector("#overviewPartnerDetail"),
  exportOverviewBtn: document.querySelector("#exportOverviewBtn"),
  revenueChart: document.querySelector("#revenueChart"),
  profitChart: document.querySelector("#profitChart"),
  gapChart: document.querySelector("#gapChart"),
  companyTable: document.querySelector("#companyTable"),
  companyMonthSelect: document.querySelector("#companyMonthSelect"),
  companyImportFile: document.querySelector("#companyImportFile"),
  companyImportBtn: document.querySelector("#companyImportBtn"),
  companyImportStatus: document.querySelector("#companyImportStatus"),
  exportCompanyBtn: document.querySelector("#exportCompanyBtn"),
  partnerMonth: document.querySelector("#partnerMonth"),
  partnerName: document.querySelector("#partnerName"),
  exportPartnersBtn: document.querySelector("#exportPartnersBtn"),
  partnerImportFile: document.querySelector("#partnerImportFile"),
  partnerImportStatus: document.querySelector("#partnerImportStatus"),
  partnerForm: document.querySelector("#partnerForm"),
  openPartnerFormBtn: document.querySelector("#openPartnerFormBtn"),
  closePartnerFormBtn: document.querySelector("#closePartnerFormBtn"),
  partnerFormBackdrop: document.querySelector("#partnerFormBackdrop"),
  partnerFormContext: document.querySelector("#partnerFormContext"),
  annualRevenueTarget: document.querySelector("#annualRevenueTarget"),
  actualRevenue: document.querySelector("#actualRevenue"),
  actualListings: document.querySelector("#actualListings"),
  actualOffers: document.querySelector("#actualOffers"),
  actualClosings: document.querySelector("#actualClosings"),
  partnerCards: document.querySelector("#partnerCards"),
  weeklyImportFile: document.querySelector("#weeklyImportFile"),
  importStatus: document.querySelector("#importStatus"),
  weeklyForm: document.querySelector("#weeklyForm"),
  weeklyDate: document.querySelector("#weeklyDate"),
  weeklyPartner: document.querySelector("#weeklyPartner"),
  weeklyType: document.querySelector("#weeklyType"),
  weeklyTarget: document.querySelector("#weeklyTarget"),
  weeklyActual: document.querySelector("#weeklyActual"),
  weeklyFilterPartner: document.querySelector("#weeklyFilterPartner"),
  weeklyBoard: document.querySelector("#weeklyBoard"),
  exportWeeklyBtn: document.querySelector("#exportWeeklyBtn"),
  newPersonBtn: document.querySelector("#newPersonBtn"),
  peopleStatusFilter: document.querySelector("#peopleStatusFilter"),
  peopleSearch: document.querySelector("#peopleSearch"),
  peopleTable: document.querySelector("#peopleTable"),
  overviewDetailDialog: document.querySelector("#overviewDetailDialog"),
  overviewDetailTitle: document.querySelector("#overviewDetailTitle"),
  overviewDetailBody: document.querySelector("#overviewDetailBody"),
  overviewDetailClose: document.querySelector("#overviewDetailClose"),
  overviewDetailCloseBottom: document.querySelector("#overviewDetailCloseBottom"),
  personDialog: document.querySelector("#personDialog"),
  personDialogTitle: document.querySelector("#personDialogTitle"),
  personId: document.querySelector("#personId"),
  personName: document.querySelector("#personName"),
  personBranch: document.querySelector("#personBranch"),
  personTitle: document.querySelector("#personTitle"),
  personPhone: document.querySelector("#personPhone"),
  personEmail: document.querySelector("#personEmail"),
  personHireDate: document.querySelector("#personHireDate"),
  personExitDate: document.querySelector("#personExitDate"),
  personStatus: document.querySelector("#personStatus"),
  personSort: document.querySelector("#personSort"),
  personNote: document.querySelector("#personNote"),
  savePersonBtn: document.querySelector("#savePersonBtn")
};

init();

async function init() {
  setupSelects();
  bindEvents();
  render();
  await loadCloudState();
  window.setInterval(() => {
    if (document.visibilityState === "visible") loadCloudState();
  }, 30000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadCloudState();
  });
}

function loadState() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (saved) return normalizeState(saved);

  const year = new Date().getFullYear();
  return {
    year,
    annualTargets: { [year]: 6000 },
    company: seedCompany(year),
    people: seedPeople(),
    partners: seedLastYear(year),
    weekly: [],
    offers: loadLegacyOfferRecords()
  };
}

function normalizeState(raw) {
  const partnerRows = raw.partners || [];
  const weeklyRows = raw.weekly || [];
  const people = normalizePeople(raw.people, partnerRows, weeklyRows);
  return {
    year: raw.year || new Date().getFullYear(),
    annualTargets: raw.annualTargets || { [raw.year || new Date().getFullYear()]: 6000 },
    company: (raw.company || []).map((row) => {
      const closedRevenue = Number(row.closedRevenue) || Number(row.actualRevenue) || 0;
      const profit = row.profit !== undefined
        ? Number(row.profit) || 0
        : closedRevenue - (Number(row.fixedCost) || 0) - (Number(row.variableCost) || 0);
      return {
        ...row,
        closedRevenue,
        actualRevenue: Number(row.actualRevenue) || 0,
        profit
      };
    }),
    people,
    partners: partnerRows.map((record) => normalizePartnerRecord(record, people)),
    weekly: weeklyRows.map((goal) => normalizeWeeklyGoal(goal, people)),
    offers: Array.isArray(raw.offers) ? raw.offers : loadLegacyOfferRecords()
  };
}

function loadLegacyOfferRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem("danan-offer-tracker-static-v1") || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (error) {
    return [];
  }
}

function seedPeople() {
  return defaultPartnerNames.map((name, index) => personFromName(name, index + 1));
}

function normalizePeople(rawPeople, partnerRows = [], weeklyRows = []) {
  const names = [
    ...defaultPartnerNames,
    ...partnerRows.map((record) => record.partnerName),
    ...weeklyRows.map((goal) => goal.partnerName)
  ].filter(Boolean);
  const byName = new Map();

  (rawPeople || []).forEach((person, index) => {
    const normalized = {
      id: person.id || personIdFromName(person.name || `夥伴${index + 1}`),
      name: person.name || "",
      branch: person.branch || "大湳店",
      title: person.title || "業務",
      phone: person.phone || "",
      email: person.email || "",
      hireDate: person.hireDate || "",
      exitDate: person.exitDate || "",
      status: person.status === "inactive" ? "inactive" : "active",
      sort: Number(person.sort || index + 1),
      note: person.note || "",
      createdAt: person.createdAt || new Date().toISOString(),
      updatedAt: person.updatedAt || new Date().toISOString()
    };
    if (normalized.name) byName.set(normalized.name, normalized);
  });

  names.forEach((name) => {
    if (!byName.has(name)) byName.set(name, personFromName(name, byName.size + 1));
  });

  return [...byName.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "zh-Hant"));
}

function normalizePartnerRecord(record, people) {
  const person = personByName(record.partnerName, people) || personById(record.personId, people);
  return {
    ...record,
    year: Number(record.year) || new Date().getFullYear(),
    month: Number(record.month) || 1,
    personId: record.personId || person?.id || "",
    partnerName: record.partnerName || person?.name || "",
    annualRevenueTarget: Number(record.annualRevenueTarget) || 0,
    actualRevenue: Number(record.actualRevenue) || 0,
    actualListings: Number(record.actualListings) || 0,
    actualOffers: Number(record.actualOffers) || 0,
    actualClosings: Number(record.actualClosings) || 0
  };
}

function normalizeWeeklyGoal(goal, people) {
  const person = personByName(goal.partnerName, people) || personById(goal.personId, people);
  return {
    ...goal,
    personId: goal.personId || person?.id || "",
    partnerName: goal.partnerName || person?.name || ""
  };
}

function personFromName(name, sort) {
  const now = new Date().toISOString();
  return {
    id: personIdFromName(name),
    name,
    branch: "大湳店",
    title: "業務",
    phone: "",
    email: "",
    hireDate: "",
    exitDate: "",
    status: "active",
    sort,
    note: "",
    createdAt: now,
    updatedAt: now
  };
}

function personIdFromName(name) {
  let hash = 0;
  String(name).split("").forEach((char) => {
    hash = ((hash << 5) - hash) + char.charCodeAt(0);
    hash |= 0;
  });
  return `emp-${Math.abs(hash)}`;
}

function personByName(name, people = state.people) {
  return people.find((person) => person.name === name);
}

function personById(id, people = state.people) {
  return people.find((person) => person.id === id);
}

function sortedPeople(includeInactive = true) {
  return [...state.people]
    .filter((person) => includeInactive || person.status === "active")
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "zh-Hant"));
}

function activePeople() {
  return sortedPeople(false);
}

function activePartnerNames() {
  return activePeople().map((person) => person.name);
}

function allPartnerNames() {
  return sortedPeople(true).map((person) => person.name);
}

function peopleForReports(year = state.year) {
  const names = new Set(activePartnerNames());
  state.partners.filter((record) => record.year === year).forEach((record) => names.add(record.partnerName));
  state.weekly.filter((goal) => goal.year === year).forEach((goal) => names.add(goal.partnerName));
  return [...names].filter(Boolean).sort((a, b) => {
    const aPerson = personByName(a);
    const bPerson = personByName(b);
    const aSort = aPerson?.sort ?? 9999;
    const bSort = bPerson?.sort ?? 9999;
    return aSort - bSort || a.localeCompare(b, "zh-Hant");
  });
}

function personStatusLabel(name) {
  const person = personByName(name);
  if (!person) return "（歷史）";
  return person.status === "inactive" ? "（離職／停用）" : "";
}

function seedCompany(year) {
  return Array.from({ length: 12 }, (_, i) => ({
    year,
    month: i + 1,
    targetRevenue: [320, 340, 360, 380, 420, 450, 470, 480, 500, 520, 540, 560][i],
    closedRevenue: [260, 330, 310, 390, 360, 440, 0, 0, 0, 0, 0, 0][i],
    agentCount: 22,
    profit: [100, 160, 146, 212, 188, 254, 0, 0, 0, 0, 0, 0][i],
    closedDeals: [3, 4, 3, 5, 4, 5, 0, 0, 0, 0, 0, 0][i]
  }));
}

function seedLastYear(year) {
  const lastYear = year - 1;
  return defaultPartnerNames.flatMap((partner, partnerIndex) => {
    return Array.from({ length: 12 }, (_, monthIndex) => ({
      year: lastYear,
      month: monthIndex + 1,
      partnerName: partner,
      annualRevenueTarget: 1200,
      actualRevenue: monthIndex < 6 ? 55 + ((partnerIndex + monthIndex) % 6) * 8 : 0,
      actualListings: 3 + ((partnerIndex + monthIndex) % 4),
      actualOffers: 1 + ((partnerIndex + monthIndex) % 2),
      actualClosings: (partnerIndex + monthIndex) % 5 === 0 ? 1 : 0
    }));
  });
}

function setupSelects() {
  const currentYear = new Date().getFullYear();
  const currentPartnerMonth = Number(els.partnerMonth.value);
  const savedPartnerMonth = Number(localStorage.getItem(PARTNER_MONTH_STORAGE_KEY));
  const preferredPartnerMonth = savedPartnerMonth >= 1 && savedPartnerMonth <= 12
    ? savedPartnerMonth
    : currentPartnerMonth >= 1 && currentPartnerMonth <= 12 ? currentPartnerMonth : 1;
  const yearOptions = Array.from({ length: currentYear - 2020 + 2 }, (_, index) => 2020 + index)
    .map((year) => `<option ${year === state.year ? "selected" : ""}>${year}</option>`).join("");
  els.yearSelect.innerHTML = yearOptions;
  if (els.mobileYearSelect) els.mobileYearSelect.innerHTML = yearOptions;
  els.partnerMonth.innerHTML = monthLabels.map((label, i) => `<option value="${i + 1}">${label}</option>`).join("");
  els.partnerMonth.value = String(preferredPartnerMonth);
  if (els.companyMonthSelect) {
    els.companyMonthSelect.innerHTML = monthLabels.map((label, i) => `<option value="${i + 1}">${label}</option>`).join("");
    els.companyMonthSelect.value = String(new Date().getMonth() + 1);
  }
  setupPersonSelects();
  els.weeklyType.innerHTML = goalTypes.map((type) => `<option>${type}</option>`).join("");
  els.weeklyDate.value = isoDate(new Date());
}

function setupPersonSelects() {
  const activeNames = activePartnerNames();
  const reportNames = peopleForReports();
  const partnerValue = els.partnerName.value;
  const weeklyValue = els.weeklyPartner.value;
  const filterValue = els.weeklyFilterPartner?.value;

  els.partnerName.innerHTML = reportNames.length
    ? reportNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}${personStatusLabel(name)}</option>`).join("")
    : `<option value="">請先新增在職夥伴</option>`;
  els.weeklyPartner.innerHTML = activeNames.length
    ? activeNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")
    : `<option value="">請先新增在職夥伴</option>`;

  if (els.weeklyFilterPartner) {
    els.weeklyFilterPartner.innerHTML = reportNames.map((name) => (
      `<option value="${escapeHtml(name)}">${escapeHtml(name)}${personStatusLabel(name)}</option>`
    )).join("");
  }

  if (reportNames.includes(partnerValue)) els.partnerName.value = partnerValue;
  if (activeNames.includes(weeklyValue)) els.weeklyPartner.value = weeklyValue;
  if (els.weeklyFilterPartner && reportNames.includes(filterValue)) els.weeklyFilterPartner.value = filterValue;
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  const changeYear = (value) => {
    state.year = Number(value);
    els.yearSelect.value = String(state.year);
    if (els.mobileYearSelect) els.mobileYearSelect.value = String(state.year);
    state.company = ensureCompanyYear(state.year);
    ensureAnnualTarget(state.year);
    saveState();
    render();
  };
  els.yearSelect.addEventListener("change", () => changeYear(els.yearSelect.value));
  if (els.mobileYearSelect) {
    els.mobileYearSelect.addEventListener("change", () => changeYear(els.mobileYearSelect.value));
  }

  els.annualTargetInput.addEventListener("change", () => {
    state.annualTargets[state.year] = num(els.annualTargetInput.value);
    saveState();
    renderOverview();
  });

  els.partnerMonth.addEventListener("change", () => {
    partnerFormDirty = false;
    localStorage.setItem(PARTNER_MONTH_STORAGE_KEY, els.partnerMonth.value);
    fillPartnerForm();
    renderPartners();
  });
  if (els.companyMonthSelect) els.companyMonthSelect.addEventListener("change", renderCompanyTable);
  if (els.companyImportFile) {
    els.companyImportFile.addEventListener("change", () => {
      const file = els.companyImportFile.files[0];
      if (els.companyImportStatus) {
        els.companyImportStatus.textContent = file ? `已選擇：${file.name}，請按「讀取資料」` : "尚未匯入";
      }
    });
  }
  if (els.companyImportBtn) els.companyImportBtn.addEventListener("click", importCompanyExcel);
  els.partnerName.addEventListener("change", () => {
    partnerFormDirty = false;
    fillPartnerForm();
    renderPartners();
  });
  [els.annualRevenueTarget, els.actualRevenue, els.actualListings, els.actualOffers, els.actualClosings].forEach((input) => {
    input?.addEventListener("input", () => {
      partnerFormDirty = true;
      if (els.partnerImportStatus) els.partnerImportStatus.textContent = "資料輸入中，雲端讀取已暫停；請按儲存";
    });
  });
  if (els.openPartnerFormBtn) els.openPartnerFormBtn.addEventListener("click", openPartnerFormDrawer);
  if (els.closePartnerFormBtn) els.closePartnerFormBtn.addEventListener("click", closePartnerFormDrawer);
  if (els.partnerFormBackdrop) els.partnerFormBackdrop.addEventListener("click", closePartnerFormDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.partnerForm?.classList.contains("drawer-open")) closePartnerFormDrawer();
  });
  els.partnerForm.addEventListener("submit", savePartnerRecord);
  els.partnerImportFile.addEventListener("change", importPartnerExcel);
  els.weeklyForm.addEventListener("submit", saveWeeklyGoal);
  els.weeklyImportFile.addEventListener("change", importWeeklyExcel);
  els.exportOverviewBtn.addEventListener("click", exportOverviewReport);
  els.exportCompanyBtn.addEventListener("click", exportCompanyReport);
  els.exportPartnersBtn.addEventListener("click", exportPartnersReport);
  els.exportWeeklyBtn.addEventListener("click", exportWeeklyReport);
  if (els.weeklyFilterPartner) els.weeklyFilterPartner.addEventListener("change", renderWeekly);
  if (els.newPersonBtn) els.newPersonBtn.addEventListener("click", () => openPersonDialog());
  if (els.savePersonBtn) els.savePersonBtn.addEventListener("click", savePerson);
  if (els.personForm) {
    els.personForm.addEventListener("submit", (event) => {
      if (event.submitter?.value === "cancel") return;
      event.preventDefault();
      savePerson();
    });
  }
  if (els.peopleTable) {
    els.peopleTable.addEventListener("click", (event) => {
      const button = event.target.closest("[data-person-action]");
      if (!button) return;
      const person = personById(button.dataset.personId);
      if (button.dataset.personAction === "edit") openPersonDialog(person);
      if (button.dataset.personAction === "toggle") togglePersonStatus(button.dataset.personId);
    });
  }
  if (els.peopleStatusFilter) els.peopleStatusFilter.addEventListener("change", renderPeople);
  if (els.peopleSearch) els.peopleSearch.addEventListener("input", renderPeople);
  [els.overviewDetailClose, els.overviewDetailCloseBottom].forEach((button) => {
    if (button) button.addEventListener("click", () => els.overviewDetailDialog.close());
  });
  window.addEventListener("resize", () => {
    renderCompanyTable();
    renderOverviewPartnerTable();
    renderPartners();
    renderWeekly();
  });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  scheduleCloudSave();
}

async function loadCloudState() {
  if (cloudLoadInProgress || cloudSaveInProgress || Date.now() < cloudWriteHoldUntil || partnerFormDirty || els.partnerForm?.contains(document.activeElement)) return;
  cloudLoadInProgress = true;
  setSyncStatus("正在讀取 Google Sheet 資料...");

  try {
    const response = await fetch(`${CLOUD_API_URL}?action=listAll&ts=${Date.now()}`);
    const payload = await response.json();

    if (!payload.ok) throw new Error(payload.error || "Cloud load failed");
    if (partnerFormDirty || els.partnerForm?.contains(document.activeElement)) {
      if (els.partnerImportStatus) els.partnerImportStatus.textContent = "尚未儲存的輸入已保留，暫不套用雲端資料";
      return;
    }

    if (payload.state && !isCloudStateEmpty(payload.state)) {
      const localOffers = Array.isArray(state.offers) ? state.offers : [];
      const cloudAlreadySupportsOffers = Array.isArray(payload.state.offers);
      const shouldMigrateLocalOffers = localOffers.length > 0
        && (!cloudAlreadySupportsOffers || payload.state.offers.length === 0)
        && localStorage.getItem("danan-offers-cloud-migrated-v1") !== "1";
      state = normalizeState({ ...payload.state, year: state.year });
      if (shouldMigrateLocalOffers) state.offers = localOffers;
      state.company = ensureCompanyYear(state.year);
      ensureAnnualTarget(state.year);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setupSelects();
      render();
      cloudInitialLoadComplete = true;
      window.dispatchEvent(new CustomEvent("offers-cloud-loaded"));
      if (shouldMigrateLocalOffers) {
        localStorage.setItem("danan-offers-cloud-migrated-v1", "1");
        saveState();
      } else if (cloudAlreadySupportsOffers) {
        localStorage.setItem("danan-offers-cloud-migrated-v1", "1");
      }
      setSyncStatus("已讀取 Google Sheet 資料");
      return;
    }

    cloudInitialLoadComplete = true;
    saveState();
    setSyncStatus("Google Sheet 已建立，已同步目前資料");
  } catch (error) {
    console.warn(error);
    cloudInitialLoadComplete = true;
    if (cloudSavePending) scheduleCloudSave();
    setSyncStatus("雲端讀取失敗，先使用本機資料");
  } finally {
    cloudLoadInProgress = false;
  }
}

function scheduleCloudSave() {
  if (!cloudInitialLoadComplete) {
    cloudSavePending = true;
    return;
  }
  cloudSavePending = false;
  window.clearTimeout(cloudSyncTimer);
  cloudSyncTimer = window.setTimeout(saveCloudState, 700);
}

async function saveCloudState() {
  if (cloudSaveInProgress) {
    cloudSavePending = true;
    return;
  }
  cloudSaveInProgress = true;
  setSyncStatus("正在同步 Google Sheet...");

  try {
    await fetch(CLOUD_API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "saveAll", state })
    });
    cloudWriteHoldUntil = Date.now() + 5000;
    setSyncStatus("已同步 Google Sheet");
  } catch (error) {
    console.warn(error);
    setSyncStatus("雲端同步失敗，資料已先存在本機");
  } finally {
    cloudSaveInProgress = false;
    if (cloudSavePending) scheduleCloudSave();
  }
}

function isCloudStateEmpty(cloudState) {
  return !Object.keys(cloudState.annualTargets || {}).length
    && !(cloudState.company || []).length
    && !(cloudState.people || []).length
    && !(cloudState.partners || []).length
    && !(cloudState.weekly || []).length
    && !(cloudState.offers || []).length;
}

function setSyncStatus(message) {
  [els.companyImportStatus, els.partnerImportStatus, els.importStatus].forEach((target) => {
    if (target) target.textContent = message;
  });
  const offerStatus = document.querySelector("#offerImportStatus");
  if (offerStatus) offerStatus.textContent = message;
}

function ensureCompanyYear(year) {
  const rows = state.company.filter((row) => row.year === year);
  return rows.length === 12 ? state.company : [...state.company, ...seedCompany(year)];
}

function ensureAnnualTarget(year) {
  if (!state.annualTargets[year]) state.annualTargets[year] = 6000;
}

function render() {
  setupPersonSelects();
  renderOverview();
  renderCompanyTable();
  fillPartnerForm();
  renderPartners();
  renderWeekly();
  renderPeople();
}

function switchView(viewId) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewId));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
}

function isCompactView() {
  return window.matchMedia("(max-width: 1024px)").matches;
}

function isPhoneView() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function companyRows() {
  return state.company.filter((row) => row.year === state.year).sort((a, b) => a.month - b.month);
}

function monthlyPartnerRows(month) {
  return state.partners.filter((record) => record.year === state.year && record.month === month);
}

function monthlyPartnerRevenue(month) {
  return monthlyPartnerRows(month).reduce((sum, record) => sum + num(record.actualRevenue), 0);
}

function monthlyPartnerRevenueForYear(year, month) {
  return state.partners
    .filter((record) => record.year === year && record.month === month)
    .reduce((sum, record) => sum + num(record.actualRevenue), 0);
}

function monthlyPartnerClosings(month) {
  return monthlyPartnerRows(month).reduce((sum, record) => sum + num(record.actualClosings), 0);
}

function hasPartnerActivity(record) {
  return num(record.actualRevenue) || num(record.actualListings) || num(record.actualOffers) || num(record.actualClosings);
}

function monthlyAgentCount(month) {
  const names = new Set(monthlyPartnerRows(month).filter(hasPartnerActivity).map((record) => record.partnerName).filter(Boolean));
  return names.size || activePeople().length;
}

function renderOverview() {
  const rows = companyRows();
  const annualTarget = num(state.annualTargets[state.year]);
  els.annualTargetInput.value = money(annualTarget);
  els.annualTargetDisplay.textContent = `${money(annualTarget)}萬`;

  const totals = rows.reduce((sum, row) => {
    const actualRevenue = monthlyPartnerRevenue(row.month);
    const profit = calcProfit(row);
    const activeAgentCount = monthlyAgentCount(row.month);
    sum.target += row.targetRevenue;
    sum.annualTarget += annualTarget / 12;
    sum.revenue += actualRevenue;
    sum.closedRevenue += row.closedRevenue;
    sum.profit += profit;
    sum.closed += monthlyPartnerClosings(row.month);
    sum.agentMonths += activeAgentCount;
    return sum;
  }, { target: 0, annualTarget: 0, revenue: 0, closedRevenue: 0, profit: 0, closed: 0, agentMonths: 0 });

  const avgEfficiency = totals.agentMonths ? Math.round(totals.revenue / totals.agentMonths) : 0;
  const achievement = annualTarget ? Math.round((totals.revenue / annualTarget) * 100) : 0;
  const gap = totals.revenue - annualTarget;

  els.overviewKpis.innerHTML = [
    kpi("年度累積業績", `${money(totals.revenue)}萬`, `年度達成 ${achievement}%`),
    kpi("年度關帳業績", `${money(totals.closedRevenue)}萬`, "依月營運關帳業績累計"),
    kpi("年度總盈餘", `${money(totals.profit)}萬`, profitStatus(totals.profit)),
    kpi("目標差距", `${signedMoney(gap)}萬`, gap >= 0 ? "已超過年度目標" : "尚未達年度目標")
  ].join("");

  drawLineChart(els.revenueChart, rows, "actualRevenue", "targetRevenue");
  drawProfitChart(els.profitChart, rows);
  drawGapChart(els.gapChart, rows);
  renderOverviewPartnerTable();
}

function kpi(label, value, context) {
  return `<article class="kpi"><span>${label}</span><strong>${value}</strong><small>${context}</small></article>`;
}

function renderCompanyTable() {
  const rows = isCompactView() && els.companyMonthSelect
    ? companyRows().filter((row) => row.month === Number(els.companyMonthSelect.value))
    : companyRows();
  els.companyTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>月份</th><th>預測業績</th><th>實際業績</th><th>關帳業績</th><th>人數</th><th>盈餘</th><th>人效</th><th>和去年同期差距%</th><th>成交</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(companyRowHtml).join("")}
        ${isPhoneView() ? "" : companyTotalRowHtml(rows)}
      </tbody>
    </table>
  `;

  els.companyTable.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      const row = state.company.find((item) => item.year === state.year && item.month === Number(input.dataset.month));
      row[input.dataset.field] = num(input.value);
      saveState();
      render();
    });
  });
}
function renderOverviewPartnerTable() {
  const rows = annualPartnerRows();
  if (isCompactView()) {
    const selected = rows.some((row) => row.partnerName === window.selectedOverviewPartner)
      ? window.selectedOverviewPartner
      : rows[0]?.partnerName || activePartnerNames()[0];
    window.selectedOverviewPartner = selected;
    els.overviewPartnerDetail.innerHTML = "";

    els.overviewPartnerTable.innerHTML = `
      <table class="rank-table">
        <thead>
          <tr>
            <th>排名</th><th>夥伴</th><th>年度總業績</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, index) => `
            <tr class="${row.partnerName === selected ? "selected-row" : ""}">
              <td data-label="排名">${row.isAggregate ? "合計" : index + 1}</td>
            <td data-label="夥伴"><button class="link-button" type="button" data-overview-index="${index}">${annualRowName(row)}</button></td>
              <td data-label="年度總業績"><strong>${money(row.total)}萬</strong></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    els.overviewPartnerTable.querySelectorAll("[data-overview-index]").forEach((button) => {
      button.addEventListener("click", () => {
        const row = rows[Number(button.dataset.overviewIndex)];
        window.selectedOverviewPartner = row?.partnerName || selected;
        renderOverviewPartnerTable();
        openOverviewDetailDialog(row);
      });
    });
    return;
  }

  if (els.overviewPartnerDetail) els.overviewPartnerDetail.innerHTML = "";
  els.overviewPartnerTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>排名</th><th>夥伴</th>
          ${monthLabels.map((label) => `<th>${label}</th>`).join("")}
          <th>年度總業績</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row, index) => `
          <tr>
            <td data-label="排名">${row.isAggregate ? "合計" : index + 1}</td>
            <td data-label="夥伴">${annualRowName(row)}</td>
            ${row.months.map((value, monthIndex) => `<td data-label="${monthIndex + 1}月">${money(value)}萬</td>`).join("")}
            <td data-label="年度總業績"><strong>${money(row.total)}萬</strong></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function annualPartnerRows() {
  const activeRows = activePartnerNames().map((partnerName) => annualPartnerRow(partnerName, false))
    .sort((a, b) => b.total - a.total || a.partnerName.localeCompare(b.partnerName, "zh-Hant"));

  const activeNameSet = new Set(activePartnerNames());
  const inactiveNames = [...new Set(state.partners
    .filter((record) => record.year === state.year && record.partnerName && !activeNameSet.has(record.partnerName))
    .map((record) => record.partnerName))];

  const inactiveMonths = Array.from({ length: 12 }, (_, index) => inactiveNames.reduce((sum, name) => {
    const record = findPartnerRecord(name, index + 1, state.year);
    return sum + num(record?.actualRevenue);
  }, 0));
  const inactiveTotal = inactiveMonths.reduce((sum, value) => sum + value, 0);

  if (inactiveTotal > 0) {
    activeRows.push({
      partnerName: "離職夥伴合計",
      months: inactiveMonths,
      total: inactiveTotal,
      isAggregate: true
    });
  }

  return activeRows;
}

function openOverviewDetailDialog(row) {
  if (!row || !els.overviewDetailDialog) return;

  els.overviewDetailTitle.textContent = `${stripHtml(annualRowName(row))} 年度業績表`;
  els.overviewDetailBody.innerHTML = `
    <table class="overview-detail-table">
      <thead>
        <tr>
          <th>月份</th><th>業績</th>
        </tr>
      </thead>
      <tbody>
        ${row.months.map((value, index) => `
          <tr>
            <td data-label="月份">${index + 1}月</td>
            <td data-label="業績"><strong>${money(value)}萬</strong></td>
          </tr>
        `).join("")}
        <tr class="total-row">
          <td data-label="月份"><strong>年度總計</strong></td>
          <td data-label="業績"><strong>${money(row.total)}萬</strong></td>
        </tr>
      </tbody>
    </table>
  `;
  els.overviewDetailDialog.showModal();
}

function annualPartnerRow(partnerName, isAggregate) {
  const months = Array.from({ length: 12 }, (_, index) => {
    const record = findPartnerRecord(partnerName, index + 1, state.year);
    return num(record?.actualRevenue);
  });
  const total = months.reduce((sum, value) => sum + value, 0);
  return { partnerName, months, total, isAggregate };
}

function annualRowName(row) {
  return row.isAggregate ? "離職夥伴合計" : `${escapeHtml(row.partnerName)}${personStatusLabel(row.partnerName)}`;
}

function companyRowHtml(row) {
  const actualRevenue = monthlyPartnerRevenue(row.month);
  const profit = calcProfit(row);
  const agentCount = monthlyAgentCount(row.month);
  const efficiency = agentCount ? Math.round(actualRevenue / agentCount) : 0;
  const yoyRate = sameMonthYoYRate(row.month);
  const closings = monthlyPartnerClosings(row.month);
  return `
    <tr>
      <td data-label="月份">${row.month}月</td>
      ${inputCell(row, "targetRevenue", "預測業績")}
      <td data-label="實際業績"><strong>${money(actualRevenue)}萬</strong></td>
      ${inputCell(row, "closedRevenue", "關帳業績")}
      <td data-label="人數"><strong>${agentCount}</strong></td>
      ${inputCell(row, "profit", "盈餘")}
      <td data-label="人效">${money(efficiency)}萬</td>
      <td data-label="和去年同期差距%" class="${percentStatusClass(yoyRate)}">${signedPercent(yoyRate)}</td>
      <td data-label="成交"><strong>${closings}件</strong></td>
    </tr>
  `;
}

function companyTotalRowHtml(rows) {
  const total = rows.reduce((sum, row) => {
    const actualRevenue = monthlyPartnerRevenue(row.month);
    const lastYearRevenue = monthlyPartnerRevenueForYear(state.year - 1, row.month);
    const agentCount = monthlyAgentCount(row.month);
    sum.targetRevenue += num(row.targetRevenue);
    sum.actualRevenue += actualRevenue;
    sum.lastYearRevenue += lastYearRevenue;
    sum.closedRevenue += num(row.closedRevenue);
    sum.agentCount += agentCount;
    sum.profit += calcProfit(row);
    sum.closings += monthlyPartnerClosings(row.month);
    return sum;
  }, {
    targetRevenue: 0,
    actualRevenue: 0,
    lastYearRevenue: 0,
    closedRevenue: 0,
    agentCount: 0,
    profit: 0,
    closings: 0
  });
  const efficiency = total.agentCount ? total.actualRevenue / total.agentCount : 0;
  const yoyRate = percentChange(total.actualRevenue, total.lastYearRevenue);

  return `
    <tr class="total-row">
      <td data-label="月份"><strong>合計</strong></td>
      <td data-label="預測業績"><strong>${money(total.targetRevenue)}萬</strong></td>
      <td data-label="實際業績"><strong>${money(total.actualRevenue)}萬</strong></td>
      <td data-label="關帳業績"><strong>${money(total.closedRevenue)}萬</strong></td>
      <td data-label="人數"><strong>-</strong></td>
      <td data-label="盈餘"><strong>${money(total.profit)}萬</strong></td>
      <td data-label="人效"><strong>${money(efficiency)}萬</strong></td>
      <td data-label="和去年同期差距%" class="${percentStatusClass(yoyRate)}"><strong>${signedPercent(yoyRate)}</strong></td>
      <td data-label="成交"><strong>${total.closings}件</strong></td>
    </tr>
  `;
}

function inputCell(row, field, label) {
  const amountFields = ["targetRevenue", "closedRevenue", "profit"];
  const step = amountFields.includes(field) ? "0.01" : "1";
  const value = amountFields.includes(field) ? money(row[field] || 0) : row[field] || 0;
  return `<td data-label="${label}"><input type="number" min="0" step="${step}" data-month="${row.month}" data-field="${field}" value="${value}"></td>`;
}
function fillPartnerForm() {
  if (!els.partnerName.value) return;
  const record = findPartnerRecord();
  els.annualRevenueTarget.value = money(record?.annualRevenueTarget || latestAnnualTarget(els.partnerName.value));
  els.actualRevenue.value = money(record?.actualRevenue || 0);
  els.actualListings.value = record?.actualListings || 0;
  els.actualOffers.value = record?.actualOffers || 0;
  els.actualClosings.value = record?.actualClosings || 0;
  updatePartnerFormContext();
}

function updatePartnerFormContext() {
  if (!els.partnerFormContext) return;
  const monthText = els.partnerMonth.options[els.partnerMonth.selectedIndex]?.text || "";
  const partnerText = els.partnerName.options[els.partnerName.selectedIndex]?.text || "";
  els.partnerFormContext.textContent = [monthText, partnerText].filter(Boolean).join("｜");
}

function openPartnerFormDrawer() {
  if (!isCompactView()) return;
  fillPartnerForm();
  els.partnerForm.classList.add("drawer-open");
  els.partnerFormBackdrop?.classList.add("visible");
  els.openPartnerFormBtn?.setAttribute("aria-expanded", "true");
  document.body.classList.add("drawer-active");
  window.setTimeout(() => els.annualRevenueTarget?.focus(), 180);
}

function closePartnerFormDrawer() {
  els.partnerForm?.classList.remove("drawer-open");
  els.partnerFormBackdrop?.classList.remove("visible");
  els.openPartnerFormBtn?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("drawer-active");
}

function findPartnerRecord(name = els.partnerName.value, month = Number(els.partnerMonth.value), year = state.year) {
  return state.partners.find((record) => record.year === year && record.month === month && record.partnerName === name);
}

function latestAnnualTarget(name) {
  const record = [...state.partners].reverse().find((item) => item.year === state.year && item.partnerName === name && item.annualRevenueTarget);
  return record?.annualRevenueTarget || 1200;
}

function applyAnnualTargetFromMonth(partnerName, startMonth, target) {
  const person = personByName(partnerName);
  for (let month = startMonth; month <= 12; month += 1) {
    let record = findPartnerRecord(partnerName, month, state.year);
    if (!record) {
      record = {
        year: state.year,
        month,
        partnerName,
        personId: person?.id || "",
        actualRevenue: 0,
        actualListings: 0,
        actualOffers: 0,
        actualClosings: 0
      };
      state.partners.push(record);
    }
    record.annualRevenueTarget = target;
  }
}

function savePartnerRecord(event) {
  event.preventDefault();
  const month = Number(els.partnerMonth.value);
  const partnerName = els.partnerName.value;
  if (!partnerName || !personByName(partnerName) || personByName(partnerName).status !== "active") {
    alert("請先在人事管理新增或恢復一位在職夥伴。");
    return;
  }
  let record = findPartnerRecord(partnerName, month);
  if (!record) {
    record = { year: state.year, month, partnerName, personId: personByName(partnerName)?.id || "" };
    state.partners.push(record);
  }

  const annualTarget = num(els.annualRevenueTarget.value);
  Object.assign(record, {
    annualRevenueTarget: annualTarget,
    actualRevenue: num(els.actualRevenue.value),
    actualListings: num(els.actualListings.value),
    actualOffers: num(els.actualOffers.value),
    actualClosings: num(els.actualClosings.value)
  });
  applyAnnualTargetFromMonth(partnerName, month, annualTarget);

  partnerFormDirty = false;
  cloudWriteHoldUntil = Date.now() + 8000;
  saveState();
  render();
  closePartnerFormDrawer();
}

function importPartnerExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    const imported = parsePartnerExcel(text);
    upsertPartnerRecords(imported);
    saveState();
    render();
    els.partnerImportStatus.textContent = `已匯入 ${imported.length} 筆夥伴績效`;
    els.partnerImportFile.value = "";
  };
  reader.readAsText(file, "utf-8");
}

function parsePartnerExcel(text) {
  const rows = parseTabularText(text);
  if (rows.length < 2) return [];

  const headerIndex = rows.findIndex((row) => row.some((cell) => /夥伴|姓名|業務/.test(cell)));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map(normalizeHeader);
  return rows.slice(headerIndex + 1)
    .map((row) => partnerRecordFromRow(headers, row))
    .filter((record) => record.partnerName);
}

function parseTabularText(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");
  const htmlRows = [...doc.querySelectorAll("tr")].map((tr) => [...tr.children].map((cell) => cell.textContent.trim()));
  if (htmlRows.length) return htmlRows;

  return text.split(/\r?\n/)
    .map((line) => line.split(line.includes("\t") ? "\t" : ",").map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
}

function importCompanyExcel() {
  const file = els.companyImportFile?.files?.[0];
  if (!file) {
    if (els.companyImportStatus) els.companyImportStatus.textContent = "請先選擇月營運 Excel 檔";
    return;
  }

  if (els.companyImportStatus) els.companyImportStatus.textContent = "正在讀取月營運資料...";

  const isWorkbookFile = /\.(xlsx|xls)$/i.test(file.name);
  const useWorkbookParser = isWorkbookFile && window.XLSX;
  if (isWorkbookFile && !window.XLSX) {
    if (els.companyImportStatus) els.companyImportStatus.textContent = "Excel 解析套件尚未載入，請確認網路後重新整理";
    els.companyImportFile.value = "";
    return;
  }
  const reader = new FileReader();

  reader.onload = () => {
    try {
      const rows = useWorkbookParser
        ? rowsFromWorkbook(reader.result)
        : parseTabularText(String(reader.result || ""));
      const imported = parseCompanyExcel(rows);
      if (!imported.length) throw new Error("No company rows imported");
      upsertCompanyRecords(imported);
      state.company = ensureCompanyYear(state.year);
      saveState();
      render();
      if (els.companyImportStatus) els.companyImportStatus.textContent = `已匯入 ${imported.length} 筆月營運資料`;
    } catch (error) {
      console.warn(error);
      if (els.companyImportStatus) els.companyImportStatus.textContent = "匯入失敗，請確認檔案欄位格式";
    } finally {
      els.companyImportFile.value = "";
    }
  };

  if (useWorkbookParser) {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsText(file, "utf-8");
  }
}

function rowsFromWorkbook(arrayBuffer) {
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: "" });
}

function parseCompanyExcel(rows) {
  const headerIndex = rows.findIndex((row) => row.some((cell) => /year|年度|西元年|民國年/i.test(String(cell))));
  if (headerIndex < 0) return [];

  const headers = rows[headerIndex].map(normalizeHeader);
  return rows.slice(headerIndex + 1)
    .map((row) => companyRecordFromRow(headers, row))
    .filter((record) => record.year && record.month >= 1 && record.month <= 12)
    .filter((record) => num(record.closedRevenue) !== 0 || num(record.profit) !== 0);
}

function companyRecordFromRow(headers, row) {
  const get = (...names) => {
    const normalizedNames = names.map(normalizeHeader);
    const index = headers.findIndex((header) => normalizedNames.some((name) => header.includes(name)));
    return index >= 0 ? row[index] : "";
  };

  const rocYear = numberFromText(get("民國年"));
  const year = numberFromText(get("year", "西元年", "年度", "年份")) || (rocYear ? rocYear + 1911 : state.year);
  const month = numberFromText(get("month", "月份", "月"));

  return {
    year,
    month,
    targetRevenue: numberFromText(get("targetRevenue", "預測業績", "目標業績")),
    closedRevenue: numberFromText(get("closedRevenue", "關帳業績", "業績")),
    agentCount: numberFromText(get("agentCount", "人數")),
    profit: numberFromText(get("profit", "盈餘"))
  };
}

function upsertCompanyRecords(records) {
  records.forEach((record) => {
    let existing = state.company.find((row) => row.year === record.year && row.month === record.month);
    if (!existing) {
      existing = {
        year: record.year,
        month: record.month,
        targetRevenue: 0,
        closedRevenue: 0,
        agentCount: 0,
        profit: 0
      };
      state.company.push(existing);
    }

    existing.closedRevenue = num(record.closedRevenue);
    existing.profit = num(record.profit);
  });
}

function normalizeHeader(header) {
  return String(header || "").replace(/\s/g, "");
}

function partnerRecordFromRow(headers, row) {
  const findIndex = (...names) => headers.findIndex((header) => names.some((name) => header.includes(name)));
  const get = (...names) => {
    const index = findIndex(...names);
    return index >= 0 ? row[index] : "";
  };
  const getOptionalNumber = (...names) => {
    const index = findIndex(...names);
    return index >= 0 ? numberFromText(row[index]) : undefined;
  };

  const dateText = get("日期", "月份", "年月");
  const parsedMonth = numberFromText(dateText);
  return {
    year: numberFromText(get("年度", "年份")) || yearFromText(dateText) || state.year,
    month: parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : Number(els.partnerMonth.value),
    partnerName: get("夥伴", "姓名", "業務"),
    annualRevenueTarget: getOptionalNumber("年度業績目標", "年度目標", "業績目標"),
    actualRevenue: getOptionalNumber("本月業績", "實際業績", "當月業績"),
    actualListings: getOptionalNumber("進案"),
    actualOffers: getOptionalNumber("收斡", "斡旋"),
    actualClosings: getOptionalNumber("成交件數", "成交")
  };
}

function upsertPartnerRecords(records) {
  records.forEach((record) => {
    const person = ensureHistoricalPerson(record.partnerName);
    record.personId = record.personId || person?.id || "";
    const existing = state.partners.find((item) => item.year === record.year && item.month === record.month && item.partnerName === record.partnerName);
    const patch = Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
    if (existing) {
      Object.assign(existing, patch);
    } else {
      state.partners.push({
        year: record.year,
        month: record.month,
        partnerName: record.partnerName,
        personId: record.personId,
        annualRevenueTarget: record.annualRevenueTarget ?? latestAnnualTarget(record.partnerName),
        actualRevenue: record.actualRevenue ?? 0,
        actualListings: record.actualListings ?? 0,
        actualOffers: record.actualOffers ?? 0,
        actualClosings: record.actualClosings ?? 0
      });
    }
  });
}

function ensureHistoricalPerson(name) {
  if (!name) return null;
  let person = personByName(name);
  if (person) return person;

  const now = new Date().toISOString();
  person = {
    id: personIdFromName(name),
    name,
    branch: "大湳店",
    title: "歷史夥伴",
    phone: "",
    email: "",
    hireDate: "",
    exitDate: "",
    status: "inactive",
    sort: state.people.length + 1,
    note: "由歷史排名表匯入時自動建立",
    createdAt: now,
    updatedAt: now
  };
  state.people.push(person);
  return person;
}

function renderPartners() {
  const month = Number(els.partnerMonth.value);
  const reportNames = peopleForReports(state.year);
  const visiblePartners = isCompactView() ? [els.partnerName.value].filter(Boolean) : reportNames;
  const rows = visiblePartners.map((name) => findPartnerRecord(name, month) || defaultPartnerRecord(name, month));
  els.partnerCards.innerHTML = rows.map((record) => partnerCardHtml(record, month)).join("");
}

function defaultPartnerRecord(partnerName, month) {
  return {
    year: state.year,
    month,
    partnerName,
    annualRevenueTarget: latestAnnualTarget(partnerName),
    actualRevenue: 0,
    actualListings: 0,
    actualOffers: 0,
    actualClosings: 0
  };
}

function partnerCardHtml(record, selectedMonth) {
  const annualTarget = num(record.annualRevenueTarget) || latestAnnualTarget(record.partnerName);
  const ytdRevenue = partnerYtdRevenue(record.partnerName, selectedMonth, state.year);
  const lastAnnualRevenue = partnerAnnualRevenue(record.partnerName, state.year - 1);
  const achievement = rate(ytdRevenue, annualTarget);
  const latestRevenue = latestRevenueMonth(record.partnerName);
  const cardClass = achievement <= 50 ? "card-low" : achievement < 80 ? "card-mid" : "card-high";

  return `
    <article class="partner-card ${cardClass}">
      <h3>${escapeHtml(record.partnerName)}${personStatusLabel(record.partnerName)}</h3>
      <p class="advice">年度業績目標 ${money(annualTarget)}萬，目前${money(ytdRevenue)}萬達成 ${achievement}%</p>
      <div class="metric-row">
        ${metric("去年總業績", `${money(lastAnnualRevenue)}萬`, `${state.year - 1} 年`)}
        ${metric("本月業績", `${money(record.actualRevenue)}萬`, `${selectedMonth}月`)}
        ${metric("最近成交", latestRevenue || "尚無", "年/月")}
      </div>
      <div class="metric-row">
        ${metric("進案", `${record.actualListings}件`, "本月")}
        ${metric("收斡", `${record.actualOffers}件`, "本月")}
        ${metric("成交", `${record.actualClosings}件`, "本月")}
      </div>
      <div class="progress"><span style="--value:${Math.min(100, achievement)}%"></span></div>
      <p class="advice">${partnerAdvice(record, achievement, ytdRevenue - partnerYtdRevenue(record.partnerName, selectedMonth, state.year - 1))}</p>
    </article>
  `;
}

function partnerYtdRevenue(name, month, year) {
  return state.partners
    .filter((record) => record.year === year && record.partnerName === name && record.month <= month)
    .reduce((sum, record) => sum + num(record.actualRevenue), 0);
}

function partnerAnnualRevenue(name, year) {
  return state.partners
    .filter((record) => record.year === year && record.partnerName === name)
    .reduce((sum, record) => sum + num(record.actualRevenue), 0);
}

function latestRevenueMonth(name) {
  const record = [...state.partners]
    .filter((item) => item.partnerName === name && num(item.actualRevenue) > 0)
    .sort((a, b) => (b.year - a.year) || (b.month - a.month))[0];
  return record ? `${record.year}/${String(record.month).padStart(2, "0")}` : "";
}

function latestClosingMonth(name) {
  return latestRevenueMonth(name);
}

function saveWeeklyGoal(event) {
  event.preventDefault();
  const person = personByName(els.weeklyPartner.value);
  if (!person || person.status !== "active") {
    alert("請先選擇在職夥伴。");
    return;
  }
  state.weekly.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    year: state.year,
    meetingDate: els.weeklyDate.value,
    personId: person.id,
    partnerName: person.name,
    type: els.weeklyType.value,
    target: num(els.weeklyTarget.value),
    actual: num(els.weeklyActual.value),
    source: "manual"
  });
  saveState();
  els.weeklyTarget.value = 1;
  els.weeklyActual.value = 0;
  renderWeekly();
}

function importWeeklyExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    const imported = parseGoalExcel(text);
    state.weekly.push(...imported);
    saveState();
    renderWeekly();
    els.importStatus.textContent = `已匯入 ${imported.length} 筆小目標統計`;
    els.weeklyImportFile.value = "";
  };
  reader.readAsText(file, "utf-8");
}

function parseGoalExcel(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "text/html");
  const rows = [...doc.querySelectorAll("tr")].map((tr) => [...tr.children].map((cell) => cell.textContent.trim()));
  if (!rows.length) return [];

  const bodyRows = rows.filter((row) => row.length >= 6 && row[0] && row[0] !== "夥伴");
  return bodyRows.map((row) => {
    const partnerName = row[0];
    const latestDate = normalizeDate(row[1]) || isoDate(new Date());
    const totalGoals = numberFromText(row[3]);
    const completedGoals = numberFromText(row[4]);
    return {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      year: Number(latestDate.slice(0, 4)) || state.year,
      meetingDate: latestDate,
      partnerName,
      type: "月小目標統計",
      target: totalGoals,
      actual: completedGoals,
      source: "import"
    };
  }).filter((goal) => allPartnerNames().includes(goal.partnerName) && goal.target > 0);
}

function renderWeekly() {
  const rows = state.weekly.filter((goal) => goal.year === state.year);
  const grouped = rows.reduce((map, goal) => {
    map[goal.partnerName] = map[goal.partnerName] || [];
    map[goal.partnerName].push(goal);
    return map;
  }, {});

  const visiblePartners = isCompactView() && els.weeklyFilterPartner ? [els.weeklyFilterPartner.value] : peopleForReports(state.year);
  els.weeklyBoard.innerHTML = visiblePartners.map((name) => weeklyCardHtml(name, grouped[name] || [])).join("");
}

function weeklyCardHtml(name, goals) {
  const completedGoals = goals.filter((goal) => goal.actual >= goal.target);
  const done = completedGoals.length;
  const totalTarget = goals.reduce((sum, goal) => sum + num(goal.target), 0);
  const totalActual = goals.reduce((sum, goal) => sum + num(goal.actual), 0);
  const rateValue = rate(totalActual, totalTarget);
  const closingGoals = goals.filter((goal) => goal.type === "成交");
  const closingTarget = closingGoals.reduce((sum, goal) => sum + num(goal.target), 0);
  const closingActual = closingGoals.reduce((sum, goal) => sum + num(goal.actual), 0);
  const closingRate = rate(closingActual, closingTarget);
  const weakType = weakestWeeklyType(goals);
  const completedText = completedGoals.length
    ? completedGoals.map((goal) => `${goal.type} ${goal.actual}/${goal.target}`).join("、")
    : "尚無完成小目標";
  return `
    <article class="weekly-card">
      <h3>${escapeHtml(name)}${personStatusLabel(name)}</h3>
      <p class="advice">本年 ${goals.length} 筆週目標/匯入統計，達成 ${done} 筆</p>
      <div class="metric-row">
        ${metric("完成小目標數", `${done}`, `共 ${goals.length} 筆`)}
        ${metric("完成百分率", `${rateValue}%`, `${totalActual}/${totalTarget}`)}
        ${metric("成交率", `${closingRate}%`, closingTarget ? `${closingActual}/${closingTarget}` : "尚無成交目標")}
      </div>
      <div class="progress"><span style="--value:${Math.min(100, rateValue)}%"></span></div>
      <p class="completed-list"><strong>完成的小目標：</strong>${completedText}</p>
      <p class="advice">${weeklyAdvice(rateValue, weakType)}</p>
    </article>
  `;
}

function openPersonDialog(person = null) {
  els.personDialogTitle.textContent = person ? "編輯夥伴" : "新增夥伴";
  els.personId.value = person?.id || "";
  els.personName.value = person?.name || "";
  els.personBranch.value = person?.branch || "大湳店";
  els.personTitle.value = person?.title || "業務";
  els.personPhone.value = person?.phone || "";
  els.personEmail.value = person?.email || "";
  els.personHireDate.value = person?.hireDate || "";
  els.personExitDate.value = person?.exitDate || "";
  els.personStatus.value = person?.status || "active";
  els.personSort.value = person?.sort || state.people.length + 1;
  els.personNote.value = person?.note || "";
  els.personDialog.showModal();
}

function savePerson() {
  const name = els.personName.value.trim();
  if (!name) {
    alert("請輸入夥伴姓名。");
    return;
  }

  const id = els.personId.value;
  const now = new Date().toISOString();
  const payload = {
    name,
    branch: els.personBranch.value.trim() || "大湳店",
    title: els.personTitle.value.trim() || "業務",
    phone: els.personPhone.value.trim(),
    email: els.personEmail.value.trim(),
    hireDate: els.personHireDate.value,
    exitDate: els.personExitDate.value,
    status: els.personStatus.value,
    sort: Number(els.personSort.value || state.people.length + 1),
    note: els.personNote.value.trim(),
    updatedAt: now
  };

  if (payload.status === "inactive" && !payload.exitDate) payload.exitDate = isoDate(new Date());
  if (payload.status === "active") payload.exitDate = "";

  if (id) {
    const person = personById(id);
    if (!person) return;
    const oldName = person.name;
    Object.assign(person, payload);
    if (oldName !== payload.name) renamePersonInRecords(oldName, payload.name, person.id);
  } else {
    if (personByName(payload.name)) {
      alert("已有相同姓名的夥伴，請改用編輯原資料。");
      return;
    }
    state.people.push({
      id: personIdFromName(payload.name),
      ...payload,
      createdAt: now
    });
  }

  els.personDialog.close();
  refreshAfterPeopleChange();
}

function renamePersonInRecords(oldName, newName, personId) {
  state.partners.forEach((record) => {
    if (record.partnerName === oldName || record.personId === personId) {
      record.partnerName = newName;
      record.personId = personId;
    }
  });
  state.weekly.forEach((goal) => {
    if (goal.partnerName === oldName || goal.personId === personId) {
      goal.partnerName = newName;
      goal.personId = personId;
    }
  });
}

function togglePersonStatus(id) {
  const person = personById(id);
  if (!person) return;
  person.status = person.status === "active" ? "inactive" : "active";
  if (person.status === "inactive" && !person.exitDate) person.exitDate = isoDate(new Date());
  if (person.status === "active") person.exitDate = "";
  person.updatedAt = new Date().toISOString();
  refreshAfterPeopleChange();
}

function refreshAfterPeopleChange() {
  setupPersonSelects();
  saveState();
  render();
}

function renderPeople() {
  if (!els.peopleTable) return;
  const status = els.peopleStatusFilter.value;
  const query = els.peopleSearch.value.trim().toLowerCase();
  const rows = sortedPeople(true).filter((person) => {
    const matchStatus = status === "all" || person.status === status;
    const haystack = `${person.name} ${person.branch} ${person.title} ${person.phone} ${person.email}`.toLowerCase();
    return matchStatus && haystack.includes(query);
  });

  els.peopleTable.innerHTML = `
    <div class="people-table-desktop">
      <table>
        <thead>
          <tr>
            <th>排序</th><th>姓名</th><th>店別</th><th>職稱</th><th>到職日</th><th>離職日</th><th>狀態</th><th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length ? rows.map(personRowHtml).join("") : `<tr><td colspan="8">目前沒有符合條件的人員。</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="people-card-list">
      ${rows.length ? rows.map(personCardHtml).join("") : `<div class="people-empty">目前沒有符合條件的人員。</div>`}
    </div>
  `;

}

function personRowHtml(person) {
  return `
    <tr>
      <td data-label="排序">${person.sort}</td>
      <td data-label="姓名"><strong class="${person.status === "inactive" ? "inactive-name" : ""}">${escapeHtml(person.name)}</strong></td>
      <td data-label="店別">${escapeHtml(person.branch)}</td>
      <td data-label="職稱">${escapeHtml(person.title)}</td>
      <td data-label="到職日">${person.hireDate || "-"}</td>
      <td data-label="離職日">${person.exitDate || "-"}</td>
      <td data-label="狀態"><span class="status-pill ${person.status}">${person.status === "active" ? "在職" : "離職／停用"}</span></td>
      <td data-label="操作">
        <div class="row-actions">
          <button type="button" data-person-action="edit" data-person-id="${person.id}">編輯</button>
          <button class="${person.status === "active" ? "danger-action" : ""}" type="button" data-person-action="toggle" data-person-id="${person.id}">
            ${person.status === "active" ? "設為離職" : "恢復在職"}
          </button>
        </div>
      </td>
    </tr>
  `;
}

function personCardHtml(person) {
  return `
    <article class="person-card">
      <div class="person-card-head">
        <div>
          <strong class="${person.status === "inactive" ? "inactive-name" : ""}">${escapeHtml(person.name)}</strong>
          <span>${escapeHtml(person.branch)}｜${escapeHtml(person.title)}</span>
        </div>
        <span class="status-pill ${person.status}">${person.status === "active" ? "在職" : "離職／停用"}</span>
      </div>
      <dl class="person-card-info">
        <div><dt>排序</dt><dd>${person.sort}</dd></div>
        <div><dt>到職日</dt><dd>${person.hireDate || "-"}</dd></div>
        <div><dt>離職日</dt><dd>${person.exitDate || "-"}</dd></div>
        <div><dt>聯絡</dt><dd>${escapeHtml(person.phone || person.email || "-")}</dd></div>
      </dl>
      <div class="row-actions">
        <button type="button" data-person-action="edit" data-person-id="${person.id}">編輯</button>
        <button class="${person.status === "active" ? "danger-action" : ""}" type="button" data-person-action="toggle" data-person-id="${person.id}">
          ${person.status === "active" ? "設為離職" : "恢復在職"}
        </button>
      </div>
    </article>
  `;
}

function metric(label, value, context) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong><span>${context}</span></div>`;
}

function drawLineChart(svg, rows, realKey, targetKey) {
  const width = 720;
  const height = 280;
  const pad = 42;
  const values = rows.flatMap((row) => [realKey === "actualRevenue" ? monthlyPartnerRevenue(row.month) : row[realKey], row[targetKey]]);
  const max = Math.max(1, ...values);
  const x = (index) => pad + (index * (width - pad * 2)) / 11;
  const y = (value) => height - pad - (value / max) * (height - pad * 2);
  const line = (key) => rows.map((row, index) => {
    const value = key === "actualRevenue" ? monthlyPartnerRevenue(row.month) : row[key];
    return `${index ? "L" : "M"} ${x(index)} ${y(value)}`;
  }).join(" ");

  svg.innerHTML = chartBase(width, height, pad, max) + `
    <path class="line-target" d="${line(targetKey)}"></path>
    <path class="line-real" d="${line(realKey)}"></path>
    ${rows.map((row, index) => `<circle class="dot" cx="${x(index)}" cy="${y(monthlyPartnerRevenue(row.month))}" r="4"></circle>`).join("")}
    <text class="label" x="${width - 170}" y="24">實際業績</text>
    <text class="label" x="${width - 88}" y="24">預測目標</text>
  `;
}

function drawProfitChart(svg, rows) {
  const width = 720;
  const height = 280;
  const pad = 42;
  const max = Math.max(1, ...rows.map(calcProfit), ...rows.map((row) => {
    const agentCount = monthlyAgentCount(row.month);
    return agentCount ? monthlyPartnerRevenue(row.month) / agentCount : 0;
  }));
  const barWidth = (width - pad * 2) / 12 * 0.58;
  const y = (value) => height - pad - (value / max) * (height - pad * 2);
  svg.innerHTML = chartBase(width, height, pad, max) + rows.map((row, index) => {
    const x = pad + index * ((width - pad * 2) / 12) + 8;
    const profit = Math.max(0, calcProfit(row));
    return `<rect class="bar-profit" x="${x}" y="${y(profit)}" width="${barWidth}" height="${height - pad - y(profit)}"></rect>`;
  }).join("");
}

function drawGapChart(svg, rows) {
  const width = 980;
  const height = 260;
  const pad = 42;
  const max = Math.max(1, ...rows.map((row) => Math.abs(monthlyPartnerRevenue(row.month) - row.targetRevenue)));
  const zeroY = height / 2;
  const barWidth = (width - pad * 2) / 12 * 0.58;
  svg.innerHTML = `
    <line class="axis" x1="${pad}" y1="${zeroY}" x2="${width - pad}" y2="${zeroY}"></line>
    ${rows.map((row, index) => {
      const gap = monthlyPartnerRevenue(row.month) - row.targetRevenue;
      const x = pad + index * ((width - pad * 2) / 12) + 10;
      const h = Math.abs(gap) / max * (height / 2 - pad);
      const y = gap >= 0 ? zeroY - h : zeroY;
      return `<rect class="${gap >= 0 ? "bar-gap-positive" : "bar-gap-negative"}" x="${x}" y="${y}" width="${barWidth}" height="${h}"></rect>
        <text class="label" x="${x}" y="${height - 12}">${row.month}月</text>`;
    }).join("")}
  `;
}

function chartBase(width, height, pad, max) {
  return `
    <line class="axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}"></line>
    <line class="axis" x1="${pad}" y1="${pad}" x2="${pad}" y2="${height - pad}"></line>
    ${[0, .25, .5, .75, 1].map((ratio) => {
      const y = height - pad - ratio * (height - pad * 2);
      return `<line class="grid-line" x1="${pad}" y1="${y}" x2="${width - pad}" y2="${y}"></line>
        <text class="label" x="6" y="${y + 4}">${Math.round(max * ratio)}</text>`;
    }).join("")}
    ${monthLabels.map((label, index) => `<text class="label" x="${pad + (index * (width - pad * 2)) / 11 - 10}" y="${height - 12}">${label}</text>`).join("")}
  `;
}

function calcProfit(row) {
  return num(row.profit);
}

function rate(actual, target) {
  if (!target) return actual ? 100 : 0;
  return Math.round((actual / target) * 100);
}

function sameMonthYoYRate(month) {
  return percentChange(
    monthlyPartnerRevenueForYear(state.year, month),
    monthlyPartnerRevenueForYear(state.year - 1, month)
  );
}

function percentChange(current, previous) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

function num(value) {
  return Number(value) || 0;
}

function money(value) {
  return (Number(value) || 0).toFixed(2);
}

function signedMoney(value) {
  const number = Number(value) || 0;
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}`;
}

function signedPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  const number = Number(value) || 0;
  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function percentStatusClass(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return value >= 0 ? "status-good" : "status-risk";
}

function numberFromText(value) {
  const match = String(value || "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripHtml(value) {
  const div = document.createElement("div");
  div.innerHTML = String(value ?? "");
  return div.textContent || div.innerText || "";
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
}

function yearFromText(value) {
  const match = String(value || "").match(/(20\d{2})/);
  return match ? Number(match[1]) : 0;
}

function partnerAdvice(record, achievement, yoyGap) {
  if (achievement >= 80) return "年度達成率已進入衝刺區，建議聚焦高成交機率客戶與收斡品質。";
  if (achievement <= 50) return "目前低於 50%，先穩住進案與收斡，每週鎖定 2 到 3 個高影響行動。";
  if (yoyGap < 0) return "低於去年同期，建議回頭檢查近三個月進案來源與追蹤節奏。";
  return "進度尚可，建議維持本月業績節奏並增加收斡轉成交。";
}

function weakestWeeklyType(goals) {
  const misses = goals.filter((goal) => goal.actual < goal.target);
  if (!misses.length) return "";
  const counts = misses.reduce((map, goal) => {
    map[goal.type] = (map[goal.type] || 0) + 1;
    return map;
  }, {});
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function weeklyStatus(value) {
  if (value >= 80) return "加碼挑戰";
  if (value >= 60) return "穩定追蹤";
  return "需要聚焦";
}

function weeklyAdvice(value, type) {
  if (!type) return "尚無明顯卡關項目，建議保持固定回報節奏。";
  if (value < 60) return `完成率偏低，建議本週先聚焦 ${type}，目標項目不要超過 3 個。`;
  return `${type} 是近期較容易卡住的項目，建議會議時先討論阻礙與下一步行動。`;
}

function profitStatus(value) {
  if (value > 0) return "營運為正";
  if (value === 0) return "損益兩平";
  return "需要控管成本";
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function exportOverviewReport() {
  const rows = annualPartnerRows();
  const annualTarget = num(state.annualTargets[state.year]);
  const html = reportHtml("年度總覽", `
    <h1>${state.year} 年度總覽</h1>
    <p>年度目標：${money(annualTarget)} 萬元</p>
    ${els.overviewPartnerTable.innerHTML}
  `);
  downloadExcel(`年度總覽-${state.year}.xls`, html);
}

function exportCompanyReport() {
  const html = reportHtml("月營運", `
    <h1>${state.year} 月營運報表</h1>
    ${els.companyTable.innerHTML}
  `);
  downloadExcel(`月營運-${state.year}.xls`, html);
}

function exportPartnersReport() {
  const month = Number(els.partnerMonth.value);
  const rows = peopleForReports(state.year).map((partnerName) => findPartnerRecord(partnerName, month) || defaultPartnerRecord(partnerName, month));
  const table = `
    <table>
      <thead><tr><th>夥伴</th><th>年度目標</th><th>本月業績</th><th>進案</th><th>收斡</th><th>成交</th><th>年度達成率</th><th>去年同期差</th><th>最近成交</th></tr></thead>
      <tbody>
        ${rows.map((record) => {
          const annualTarget = num(record.annualRevenueTarget) || latestAnnualTarget(record.partnerName);
          const ytdRevenue = partnerYtdRevenue(record.partnerName, month, state.year);
          const lastYtdRevenue = partnerYtdRevenue(record.partnerName, month, state.year - 1);
          return `<tr>
            <td>${record.partnerName}</td>
            <td>${money(annualTarget)}</td>
            <td>${money(record.actualRevenue)}</td>
            <td>${record.actualListings}</td>
            <td>${record.actualOffers}</td>
            <td>${record.actualClosings}</td>
            <td>${rate(ytdRevenue, annualTarget)}%</td>
            <td>${signedMoney(ytdRevenue - lastYtdRevenue)}</td>
            <td>${latestClosingMonth(record.partnerName) || ""}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
  downloadExcel(`夥伴績效-${state.year}-${month}月.xls`, reportHtml("夥伴績效", `<h1>${state.year} 年 ${month} 月夥伴績效</h1>${table}`));
}

function exportWeeklyReport() {
  const rows = state.weekly.filter((goal) => goal.year === state.year);
  const table = `
    <table>
      <thead><tr><th>夥伴</th><th>日期</th><th>項目</th><th>目標</th><th>實際</th><th>是否完成</th><th>來源</th></tr></thead>
      <tbody>
        ${rows.map((goal) => `<tr>
          <td>${goal.partnerName}</td>
          <td>${goal.meetingDate}</td>
          <td>${goal.type}</td>
          <td>${goal.target}</td>
          <td>${goal.actual}</td>
          <td>${goal.actual >= goal.target ? "完成" : "未完成"}</td>
          <td>${goal.source || "manual"}</td>
        </tr>`).join("")}
      </tbody>
    </table>
  `;
  downloadExcel(`週目標-${state.year}.xls`, reportHtml("週目標", `<h1>${state.year} 週目標報表</h1>${table}`));
}

function reportHtml(title, body) {
  return `
    <html>
      <head>
        <meta charset="utf-8">
        <xml>
          <x:ExcelWorkbook xmlns:x="urn:schemas-microsoft-com:office:excel">
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>${title}</x:Name>
                <x:WorksheetOptions>
                  <x:PageSetup>
                    <x:Layout x:Orientation="Landscape"/>
                    <x:PageMargins x:Left="0.25" x:Right="0.25" x:Top="0.45" x:Bottom="0.45"/>
                  </x:PageSetup>
                  <x:FitToPage/>
                  <x:Print>
                    <x:FitWidth>1</x:FitWidth>
                    <x:FitHeight>0</x:FitHeight>
                    <x:ValidPrinterInfo/>
                    <x:PaperSizeIndex>9</x:PaperSizeIndex>
                    <x:HorizontalResolution>600</x:HorizontalResolution>
                    <x:VerticalResolution>600</x:VerticalResolution>
                  </x:Print>
                  <x:Selected/>
                  <x:FreezePanes/>
                  <x:FrozenNoSplit/>
                  <x:SplitHorizontal>1</x:SplitHorizontal>
                  <x:TopRowBottomPane>1</x:TopRowBottomPane>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <style>
          @page {
            size: A4 landscape;
            margin: 0.45cm 0.35cm;
            mso-page-orientation: landscape;
          }

          body {
            font-family: "Microsoft JhengHei", Arial, sans-serif;
            color: #1e2930;
            margin: 0;
          }

          h1 {
            font-size: 18pt;
            margin: 0 0 8px;
            color: #1f4f8f;
          }

          p {
            font-size: 10pt;
            margin: 0 0 8px;
          }

          table {
            border-collapse: collapse;
            width: 100%;
            table-layout: fixed;
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
          }

          thead {
            display: table-header-group;
          }

          tr {
            page-break-inside: avoid;
          }

          th,
          td {
            border: 1px solid #7d8b94;
            padding: 5px 6px;
            font-size: 9pt;
            vertical-align: middle;
            text-align: center;
            mso-number-format:"\\@";
            word-break: break-word;
          }

          th {
            background: #dff1ea;
            color: #163f32;
            font-weight: bold;
          }

          td:first-child,
          th:first-child {
            text-align: left;
          }

          strong {
            font-weight: bold;
            color: #1f4f8f;
          }

          .print-note {
            color: #647076;
            font-size: 9pt;
            margin-bottom: 8px;
          }
        </style>
        <title>${title}</title>
      </head>
      <body>
        <div class="print-note">A4 橫向列印版面，建議列印時選擇「符合頁寬」。</div>
        ${body}
      </body>
    </html>
  `;
}

function downloadExcel(filename, html) {
  const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/* ==================== 收斡旋管理（三檔靜態版） ==================== */
(function setupOfferManagement() {
  const root = document.querySelector("#offers");
  if (!root) return;

  const KEY = "danan-offer-tracker-static-v1";
  let records = loadOffers();
  let currentFilter = "all";
  let archivePage = 0;

  const o = {
    form: document.querySelector("#offerForm"), editId: document.querySelector("#offerEditId"), formTitle: document.querySelector("#offerFormTitle"),
    startDate: document.querySelector("#offerStartDate"), endDate: document.querySelector("#offerEndDate"), caseName: document.querySelector("#offerCaseName"),
    developer: document.querySelector("#offerDeveloper"), salesperson: document.querySelector("#offerSalesperson"), price: document.querySelector("#offerPrice"),
    deposit: document.querySelector("#offerDeposit"), serviceFee: document.querySelector("#offerServiceFee"), serviceFeeUnit: document.querySelector("#offerServiceFeeUnit"),
    bottomPrice: document.querySelector("#offerBottomPrice"), hasClause: document.querySelector("#offerHasClause"), clauseField: document.querySelector("#offerClauseField"),
    clauseNote: document.querySelector("#offerClauseNote"), eighty: document.querySelector("#offerEightyPercent"), submitBtn: document.querySelector("#offerSubmitBtn"),
    cancelEdit: document.querySelector("#offerCancelEdit"), resetBtn: document.querySelector("#offerResetBtn"), cards: document.querySelector("#offerCards"),
    filters: document.querySelector("#offerFilters"), allCount: document.querySelector("#offerAllCount"), activeCount: document.querySelector("#offerActiveCount"), urgentCount: document.querySelector("#offerUrgentCount"),
    expiredCount: document.querySelector("#offerExpiredCount"), withdrawnCount: document.querySelector("#offerWithdrawnCount"), closedCount: document.querySelector("#offerClosedCount"),
    importFile: document.querySelector("#offerImportFile"), importStatus: document.querySelector("#offerImportStatus"), templateBtn: document.querySelector("#offerTemplateBtn")
  };

  o.form.addEventListener("submit", saveOffer);
  o.hasClause.addEventListener("change", toggleClause);
  o.resetBtn.addEventListener("click", resetOfferForm);
  o.cancelEdit.addEventListener("click", resetOfferForm);
  o.filters.addEventListener("click", changeOfferFilter);
  o.cards.addEventListener("click", handleOfferCardAction);
  o.importFile.addEventListener("change", importOfferExcel);
  o.templateBtn.addEventListener("click", downloadOfferTemplate);
  window.addEventListener("offers-cloud-loaded", refreshOffersFromCloud);
  renderOffers();

  function loadOffers() {
    try {
      const saved = Array.isArray(state.offers) ? state.offers : JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(saved) ? saved.map(normalizeOffer) : [];
    } catch (error) { return []; }
  }

  function refreshOffersFromCloud() {
    records = (Array.isArray(state.offers) ? state.offers : []).map(normalizeOffer);
    renderOffers();
  }

  function normalizeOffer(item) {
    return {
      ...item,
      startDate: normalizeOfferDate(item.startDate),
      endDate: normalizeOfferDate(item.endDate),
      serviceFeeUnit: item.serviceFeeUnit || "萬元",
      offerStatus: item.offerStatus || (item.closedAt ? "closed" : item.withdrawnAt ? "withdrawn" : "active")
    };
  }

  function normalizeOfferDate(value) {
    const text = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text.slice(0, 10);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(date).reduce((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});
    return parts.year + "-" + parts.month + "-" + parts.day;
  }

  function persistOffers() {
    state.offers = records;
    localStorage.setItem(KEY, JSON.stringify(records));
    saveState();
  }

  function todayStart() {
    const date = new Date(); date.setHours(0, 0, 0, 0); return date;
  }

  function daysRemaining(endDate) {
    return Math.round((new Date(endDate + "T00:00:00").getTime() - todayStart().getTime()) / 86400000);
  }

  function isRefunded(record) { return record.offerStatus === "withdrawn" || Boolean(record.withdrawnAt); }
  function isDeal(record) { return record.offerStatus === "closed" || Boolean(record.closedAt); }
  function isExpiredOffer(record) { return !isRefunded(record) && !isDeal(record) && daysRemaining(record.endDate) < 0; }
  function isActiveOffer(record) { return !isRefunded(record) && !isDeal(record) && daysRemaining(record.endDate) >= 0; }

  function statusTime(record) {
    if (isDeal(record)) return Number(record.closedAt) || 0;
    if (isRefunded(record)) return Number(record.withdrawnAt) || 0;
    if (isExpiredOffer(record)) return new Date(record.endDate + "T00:00:00").getTime();
    return 0;
  }

  function statusLabel(record) {
    if (isDeal(record)) return "成交日期";
    if (isRefunded(record)) return "退斡日期";
    if (isExpiredOffer(record)) return "逾期日期";
    return "";
  }

  function formatDateTime(time) {
    if (!time) return "";
    return new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time));
  }

  function isOlderThanSixMonths(record) {
    const time = statusTime(record);
    if (!time) return false;
    const cutoff = todayStart(); cutoff.setMonth(cutoff.getMonth() - 6);
    return time < cutoff.getTime();
  }

  function countdown(record) {
    if (isDeal(record)) return "賀成交";
    if (isRefunded(record)) return "已退斡旋｜斡旋停止";
    const days = daysRemaining(record.endDate);
    if (days > 0) return "剩 " + days + " 天";
    if (days === 0) return "今天到期";
    return "已逾期 " + Math.abs(days) + " 天";
  }

  function saveOffer(event) {
    event.preventDefault();
    if (o.endDate.value < o.startDate.value) { alert("收斡迄日不可早於起日。"); return; }
    const old = records.find((item) => item.id === o.editId.value);
    const reactivateWithdrawn = Boolean(old && isRefunded(old) && o.endDate.value > old.endDate && daysRemaining(o.endDate.value) >= 0);
    const record = normalizeOffer({
      id: old?.id || makeOfferId(), startDate: o.startDate.value, endDate: o.endDate.value, caseName: o.caseName.value.trim(),
      developer: o.developer.value.trim(), salesperson: o.salesperson.value.trim(), offerPrice: numberValue(o.price.value),
      deposit: numberValue(o.deposit.value), serviceFee: numberValue(o.serviceFee.value), serviceFeeUnit: o.serviceFeeUnit.value,
      bottomPrice: numberValue(o.bottomPrice.value), hasClause: o.hasClause.value, clauseNote: o.hasClause.value === "是" ? o.clauseNote.value.trim() : "",
      reachesEightyPercent: o.eighty.value, createdAt: old?.createdAt || Date.now(), offerStatus: reactivateWithdrawn ? "active" : old?.offerStatus || "active",
      withdrawnAt: reactivateWithdrawn ? undefined : old?.withdrawnAt, closedAt: old?.closedAt
    });
    records = old ? records.map((item) => item.id === old.id ? record : item) : [...records, record];
    persistOffers(); resetOfferForm();
    if (reactivateWithdrawn) applyOfferFilter("active"); else renderOffers();
    document.querySelector("#offerCards")?.scrollIntoView({ behavior: "smooth" });
  }

  function resetOfferForm() {
    o.form.reset(); o.editId.value = ""; o.formTitle.textContent = "新增收斡資料"; o.submitBtn.textContent = "建立收斡卡片";
    o.cancelEdit.hidden = true; o.serviceFeeUnit.value = "萬元"; o.eighty.value = "未確認"; toggleClause();
  }

  function toggleClause() {
    const show = o.hasClause.value === "是"; o.clauseField.hidden = !show; o.clauseNote.required = show;
    if (!show) o.clauseNote.value = "";
  }

  function changeOfferFilter(event) {
    const button = event.target.closest("[data-offer-filter]"); if (!button) return;
    applyOfferFilter(button.dataset.offerFilter);
    document.querySelector("#offerCards")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyOfferFilter(filter) {
    currentFilter = filter; archivePage = 0;
    o.filters.querySelectorAll("button").forEach((button) => {
      const selected = button.dataset.offerFilter === filter;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    renderOffers();
  }

  function filteredOffers() {
    return records.filter((record) => {
      if (currentFilter === "active") return isActiveOffer(record);
      if (currentFilter === "urgent") return isActiveOffer(record) && daysRemaining(record.endDate) <= 3;
      if (currentFilter === "expired") return isExpiredOffer(record);
      if (currentFilter === "withdrawn") return isRefunded(record);
      if (currentFilter === "closed") return isDeal(record);
      return true;
    }).sort((a, b) => {
      const activeA = statusTime(a) === 0, activeB = statusTime(b) === 0;
      if (activeA && activeB) return daysRemaining(a.endDate) - daysRemaining(b.endDate) || b.createdAt - a.createdAt;
      if (activeA !== activeB) return activeA ? -1 : 1;
      return statusTime(b) - statusTime(a) || b.createdAt - a.createdAt;
    });
  }

  function renderOffers() {
    const visible = filteredOffers();
    const recent = visible.filter((record) => !isOlderThanSixMonths(record));
    const archived = visible.filter(isOlderThanSixMonths);
    archivePage = Math.min(archivePage, Math.max(archived.length - 1, 0));
    o.allCount.textContent = records.length;
    o.activeCount.textContent = records.filter(isActiveOffer).length;
    o.urgentCount.textContent = records.filter((record) => isActiveOffer(record) && daysRemaining(record.endDate) <= 3).length;
    o.expiredCount.textContent = records.filter(isExpiredOffer).length;
    o.withdrawnCount.textContent = records.filter(isRefunded).length;
    o.closedCount.textContent = records.filter(isDeal).length;
    if (!visible.length) { o.cards.innerHTML = '<div class="offer-empty">目前沒有此分類的收斡卡片</div>'; return; }
    const recentHtml = recent.map(offerCardHtml).join("");
    const archiveHtml = archived.length ? archiveHtmlBlock(archived) : "";
    o.cards.innerHTML = recentHtml + archiveHtml;
  }

  function offerCardHtml(record) {
    const refunded = isRefunded(record), deal = isDeal(record), expired = isExpiredOffer(record), days = daysRemaining(record.endDate);
    const cardClass = deal ? "closed" : refunded ? "withdrawn" : expired ? "expired" : days <= 3 ? "urgent" : "";
    const label = deal ? "已成交" : refunded ? "已退斡旋" : expired ? "已逾期" : "進行中";
    const statusDate = statusTime(record) ? '<div class="wide offer-status-date"><dt>' + statusLabel(record) + '</dt><dd>' + formatDateTime(statusTime(record)) + '</dd></div>' : "";
    const stateButtons = !refunded && !deal ? '<button class="refund" data-offer-action="refund" data-id="' + record.id + '" type="button">退斡</button><button class="deal" data-offer-action="deal" data-id="' + record.id + '" type="button">賀成交</button>' : "";
    return '<article class="offer-card ' + cardClass + '"><div class="offer-card-top"><div><small>收斡案名</small><h4>' + safe(record.caseName) + '</h4></div><span class="offer-status">' + label + '</span></div>' +
      '<dl class="offer-details"><div class="wide"><dt>收斡期間</dt><dd>' + safe(record.startDate) + ' ～ ' + safe(record.endDate) + '</dd></div>' + statusDate +
      detail("開發", record.developer) + detail("銷售", record.salesperson) + detail("出價／承購總價", amount(record.offerPrice) + " 萬") +
      detail("本案底價", record.bottomPrice ? amount(record.bottomPrice) + " 萬" : "尚未提供") + detail("斡旋金", amount(record.deposit) + " 萬") +
      detail("服務費", amount(record.serviceFee) + " " + (record.serviceFeeUnit || "萬元")) + detail("是否有但書", record.hasClause + (record.clauseNote ? "｜" + record.clauseNote : "")) +
      detail("達開價八成", record.reachesEightyPercent || "未確認") + '</dl><div class="offer-countdown">' + countdown(record) + '</div>' +
      '<div class="offer-card-actions"><button data-offer-action="edit" data-id="' + record.id + '" type="button">修改資料／延長時間</button>' + stateButtons +
      '<button data-offer-action="delete" data-id="' + record.id + '" type="button">刪除</button></div></article>';
  }

  function archiveHtmlBlock(archived) {
    return '<section class="offer-archive"><div class="offer-archive-head"><div><span>半年前歷史卡片</span><strong>第 ' + (archivePage + 1) + '／' + archived.length + ' 頁</strong></div><span>依狀態日期由近到遠</span></div>' +
      offerCardHtml(archived[archivePage]) + '<div class="offer-archive-controls"><button data-offer-action="archive-prev" type="button" ' + (archivePage === 0 ? "disabled" : "") + '>上一頁</button><span>' + (archivePage + 1) + ' / ' + archived.length + '</span><button data-offer-action="archive-next" type="button" ' + (archivePage >= archived.length - 1 ? "disabled" : "") + '>下一頁</button></div></section>';
  }

  function handleOfferCardAction(event) {
    const button = event.target.closest("[data-offer-action]"); if (!button) return;
    const action = button.dataset.offerAction;
    if (action === "archive-prev") { archivePage = Math.max(0, archivePage - 1); renderOffers(); return; }
    if (action === "archive-next") { archivePage += 1; renderOffers(); return; }
    const record = records.find((item) => item.id === button.dataset.id); if (!record) return;
    if (action === "edit") editOffer(record);
    if (action === "refund") changeOfferStatus(record.id, "withdrawn");
    if (action === "deal") changeOfferStatus(record.id, "closed");
    if (action === "delete" && confirm("確定要刪除這張收斡旋卡片嗎？")) { records = records.filter((item) => item.id !== record.id); persistOffers(); renderOffers(); }
  }

  function changeOfferStatus(id, status) {
    records = records.map((item) => item.id === id ? { ...item, offerStatus: status, withdrawnAt: status === "withdrawn" ? Date.now() : undefined, closedAt: status === "closed" ? Date.now() : undefined } : item);
    persistOffers(); applyOfferFilter(status);
  }

  function editOffer(record) {
    o.editId.value = record.id; o.startDate.value = record.startDate; o.endDate.value = record.endDate; o.caseName.value = record.caseName;
    o.developer.value = record.developer; o.salesperson.value = record.salesperson; o.price.value = record.offerPrice; o.deposit.value = record.deposit;
    o.serviceFee.value = record.serviceFee; o.serviceFeeUnit.value = record.serviceFeeUnit || "萬元"; o.bottomPrice.value = record.bottomPrice || "";
    o.hasClause.value = record.hasClause || "否"; o.clauseNote.value = record.clauseNote || ""; o.eighty.value = record.reachesEightyPercent || "未確認";
    o.formTitle.textContent = "編輯收斡資料"; o.submitBtn.textContent = "儲存修改"; o.cancelEdit.hidden = false; toggleClause();
    root.scrollIntoView({ behavior: "smooth" });
  }

  function importOfferExcel(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const workbook = XLSX.read(reader.result, { type: "array", cellDates: true });
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
        const imported = rows.map(offerFromExcelRow).filter((item) => item.startDate && item.endDate && item.caseName && item.developer && item.salesperson);
        records = [...records, ...imported]; persistOffers(); renderOffers(); o.importStatus.textContent = "已成功匯入 " + imported.length + " 筆資料";
      } catch (error) { o.importStatus.textContent = "Excel 讀取失敗，請使用下載的範本"; }
      o.importFile.value = "";
    };
    reader.readAsArrayBuffer(file);
  }

  function offerFromExcelRow(row, index) {
    const hasClause = String(cell(row, "是否有但書")).trim() === "是" ? "是" : "否";
    const eighty = String(cell(row, "出價是否有開價八成", "達開價八成")).trim();
    const unit = String(cell(row, "服務費單位")).trim();
    return normalizeOffer({ id: makeOfferId(), startDate: excelDate(cell(row, "收斡起日", "起始日期", "收斡日期(起)")), endDate: excelDate(cell(row, "收斡迄日", "結束日期", "收斡日期(迄)")),
      caseName: String(cell(row, "收斡案名", "案名")).trim(), developer: String(cell(row, "開發")).trim(), salesperson: String(cell(row, "銷售")).trim(),
      offerPrice: numberValue(cell(row, "出價/承購總價", "出價／承購總價", "出價")), deposit: numberValue(cell(row, "斡旋金/金額", "斡旋金／金額", "斡旋金")),
      serviceFee: numberValue(cell(row, "服務費")), serviceFeeUnit: unit === "%" || unit === "百分比" ? "%" : "萬元", bottomPrice: numberValue(cell(row, "本案底價", "底價")),
      hasClause, clauseNote: hasClause === "是" ? String(cell(row, "但書內容")).trim() : "", reachesEightyPercent: eighty === "是" || eighty === "否" ? eighty : "未確認",
      offerStatus: "active", createdAt: Date.now() + index });
  }

  function downloadOfferTemplate() {
    if (typeof XLSX === "undefined") { alert("Excel 元件尚未載入，請重新整理後再試。"); return; }
    const sheet = XLSX.utils.json_to_sheet([{ "收斡起日":"2026/07/18", "收斡迄日":"2026/07/21", "收斡案名":"範例案名", "開發":"王小明", "銷售":"陳小美", "出價/承購總價":1280, "斡旋金/金額":20, "服務費":4, "服務費單位":"%", "是否有但書":"是", "但書內容":"貸款需達八成", "出價是否有開價八成":"是", "本案底價":"" }]);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "收斡旋資料"); XLSX.writeFile(book, "大湳店收斡旋匯入範本.xlsx");
  }

  function cell(row, ...keys) { for (const key of keys) if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return row[key]; return ""; }
  function excelDate(value) { if (value instanceof Date) return isoLocal(value); if (typeof value === "number" && XLSX?.SSF) { const d = XLSX.SSF.parse_date_code(value); if (d) return d.y + "-" + String(d.m).padStart(2,"0") + "-" + String(d.d).padStart(2,"0"); } const m = String(value || "").replace(/[.]/g,"/").match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/); return m ? m[1] + "-" + m[2].padStart(2,"0") + "-" + m[3].padStart(2,"0") : ""; }
  function isoLocal(date) { const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0,10); }
  function detail(label, value) { return '<div><dt>' + label + '</dt><dd>' + safe(value) + '</dd></div>'; }
  function amount(value) { return new Intl.NumberFormat("zh-TW").format(numberValue(value)); }
  function numberValue(value) { return Number(value) || 0; }
  function makeOfferId() { return "offer-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,8); }
  function safe(value) { return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }
})();


