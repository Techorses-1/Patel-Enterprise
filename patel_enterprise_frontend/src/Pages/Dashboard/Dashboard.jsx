import React, { useState, useEffect, useCallback } from "react";
import { toast, ToastContainer } from "react-toastify";
import {
  FaChartLine,
  FaChartPie,
  FaChartBar,
  FaSearch,
  FaSpinner,
  FaDatabase,
  FaLaptop,
  FaStore,
  FaBox,
  FaArrowUp,
  FaArrowDown,
  FaExclamationTriangle,
  FaTrophy,
  FaLayerGroup,
  FaCalendarAlt,
  FaFileExcel,
  FaLayerGroup as FaAllSources,
  FaTimes,
} from "react-icons/fa";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import "react-toastify/dist/ReactToastify.css";
import "./Dashboard.scss";

const SOURCE_COLORS = {
  online: "#3b82f6",
  offline: "#22c55e",
  showroom: "#8b5cf6",
};

const SOURCE_ICONS = {
  online: <FaLaptop />,
  offline: <FaStore />,
  showroom: <FaBox />,
};

const SOURCE_LABELS = {
  online: "Online",
  offline: "Offline",
  showroom: "Showroom",
};

const ALL_SOURCES = ["online", "offline", "showroom"];

const currency = (val) =>
  val === null || val === undefined
    ? "—"
    : `₹${Number(val).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// ============================================
// HELPER: Trigger a file download from a fetch response
// ============================================
const downloadFileFromResponse = async (response, fallbackFilename) => {
  const disposition = response.headers.get("Content-Disposition");
  let filename = fallbackFilename;
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) filename = match[1];
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const Dashboard = () => {
  // ============================================
  // STATE
  // ============================================
  const [availableDates, setAvailableDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [isLoadingDates, setIsLoadingDates] = useState(true);

  const [kpis, setKpis] = useState(null);
  const [crossSource, setCrossSource] = useState(null);
  const [pareto, setPareto] = useState(null);
  const [topItems, setTopItems] = useState(null);
  const [deadStock, setDeadStock] = useState(null);
  const [isLoadingDateData, setIsLoadingDateData] = useState(false);
  const [isExportingDate, setIsExportingDate] = useState(false);

  const [comparisonSource, setComparisonSource] = useState("online");
  const [previousDate, setPreviousDate] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [comparison, setComparison] = useState(null);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);
  const [isExportingComparison, setIsExportingComparison] = useState(false);

  // Per-table search terms for the Item-Wise Delta Table.
  // Keyed by source ("online"/"offline"/"showroom") in All Sources mode,
  // or "single" in single-source mode - each table's search is independent.
  const [deltaSearch, setDeltaSearch] = useState({});

  const [trendSource, setTrendSource] = useState("online");
  const [trend, setTrend] = useState(null);
  const [isLoadingTrend, setIsLoadingTrend] = useState(false);

  const [itemSearch, setItemSearch] = useState("");
  const [itemDrilldown, setItemDrilldown] = useState(null);
  const [isLoadingItem, setIsLoadingItem] = useState(false);

  const [paretoSource, setParetoSource] = useState("all");

  // ============================================
  // FETCH: AVAILABLE DATES
  // ============================================
  const fetchDates = useCallback(async () => {
    try {
      setIsLoadingDates(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/upload/dates`,
        { credentials: "include" }
      );
      const data = await response.json();
      if (data.success) {
        const dates = (data.data.dates || []).map((d) => d.date);
        setAvailableDates(dates);
        if (dates.length > 0) {
          setSelectedDate(dates[dates.length - 1]);
          setCurrentDate(dates[dates.length - 1]);
          if (dates.length > 1) setPreviousDate(dates[dates.length - 2]);
        }
      }
    } catch (error) {
      console.error("Error fetching dates:", error);
      toast.error("Failed to load available dates");
    } finally {
      setIsLoadingDates(false);
    }
  }, []);

  useEffect(() => {
    fetchDates();
  }, [fetchDates]);

  // ============================================
  // FETCH: DATE-SCOPED DATA (KPIs, cross-source, pareto, top items, dead stock)
  // ============================================
  const loadDateData = useCallback(async (date) => {
    if (!date) return;
    try {
      setIsLoadingDateData(true);
      const base = import.meta.env.VITE_API_URL;
      const opts = { credentials: "include" };

      const [kpiRes, crossRes, paretoRes, topRes, deadRes] = await Promise.all([
        fetch(`${base}/dashboard/kpis?date=${date}`, opts),
        fetch(`${base}/dashboard/cross-source?date=${date}`, opts),
        fetch(`${base}/dashboard/pareto?date=${date}&source=${paretoSource}`, opts),
        fetch(`${base}/dashboard/top-items?date=${date}&source=all&limit=10`, opts),
        fetch(`${base}/dashboard/dead-stock?date=${date}`, opts),
      ]);

      const [kpiData, crossData, paretoData, topData, deadData] = await Promise.all([
        kpiRes.json(),
        crossRes.json(),
        paretoRes.json(),
        topRes.json(),
        deadRes.json(),
      ]);

      if (kpiData.success) setKpis(kpiData.data);
      if (crossData.success) setCrossSource(crossData.data);
      if (paretoData.success) setPareto(paretoData.data);
      if (topData.success) setTopItems(topData.data);
      if (deadData.success) setDeadStock(deadData.data);
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      toast.error("Failed to load dashboard data for this date");
    } finally {
      setIsLoadingDateData(false);
    }
  }, [paretoSource]);

  useEffect(() => {
    if (selectedDate) loadDateData(selectedDate);
  }, [selectedDate, loadDateData]);

  // ============================================
  // EXPORT: DATE SNAPSHOT
  // ============================================
  const handleExportDate = async () => {
    if (!selectedDate) return;
    try {
      setIsExportingDate(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dashboard/export/date?date=${selectedDate}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "Export failed");
      }
      await downloadFileFromResponse(response, `Inventory_Snapshot_${selectedDate}.xlsx`);
      toast.success("✅ Snapshot exported successfully!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error(error.message || "Failed to export snapshot");
    } finally {
      setIsExportingDate(false);
    }
  };

  // ============================================
  // FETCH: COMPARISON (previous vs current, single source or all)
  // ============================================
  const fetchComparison = useCallback(async () => {
    if (!previousDate || !currentDate) {
      toast.error("Please select both previous and current dates");
      return;
    }
    if (previousDate === currentDate) {
      toast.error("Previous and current dates must be different");
      return;
    }
    try {
      setIsLoadingComparison(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dashboard/comparison?source=${comparisonSource}&currentDate=${currentDate}&previousDate=${previousDate}`,
        { credentials: "include" }
      );
      const data = await response.json();
      if (data.success) {
        setComparison(data.data);
        setDeltaSearch({}); // reset all per-table searches on a fresh comparison
      } else {
        toast.error(data.message || "Failed to fetch comparison");
      }
    } catch (error) {
      console.error("Error fetching comparison:", error);
      toast.error("Failed to load comparison data");
    } finally {
      setIsLoadingComparison(false);
    }
  }, [comparisonSource, currentDate, previousDate]);

  useEffect(() => {
    if (previousDate && currentDate) fetchComparison();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonSource]);

  // ============================================
  // EXPORT: COMPARISON REPORT
  // ============================================
  const handleExportComparison = async () => {
    if (!previousDate || !currentDate) return;
    try {
      setIsExportingComparison(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dashboard/export/comparison?source=${comparisonSource}&currentDate=${currentDate}&previousDate=${previousDate}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || "Export failed");
      }
      const fallbackName = `Comparison_${comparisonSource}_${previousDate}_vs_${currentDate}.xlsx`;
      await downloadFileFromResponse(response, fallbackName);
      toast.success("✅ Comparison report exported successfully!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error(error.message || "Failed to export comparison report");
    } finally {
      setIsExportingComparison(false);
    }
  };

  // ============================================
  // FETCH: TREND (overall, per source)
  // ============================================
  const fetchTrend = useCallback(async () => {
    try {
      setIsLoadingTrend(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dashboard/trend?source=${trendSource}`,
        { credentials: "include" }
      );
      const data = await response.json();
      if (data.success) setTrend(data.data);
    } catch (error) {
      console.error("Error fetching trend:", error);
      toast.error("Failed to load trend data");
    } finally {
      setIsLoadingTrend(false);
    }
  }, [trendSource]);

  useEffect(() => {
    fetchTrend();
  }, [fetchTrend]);

  // ============================================
  // FETCH: ITEM DRILLDOWN
  // ============================================
  const handleItemSearch = async (e) => {
    e.preventDefault();
    if (!itemSearch.trim()) {
      toast.error("Enter an Item No. to search");
      return;
    }
    try {
      setIsLoadingItem(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/dashboard/item/${itemSearch.trim()}`,
        { credentials: "include" }
      );
      const data = await response.json();
      if (!response.ok) {
        toast.error(data.message || "Item not found");
        setItemDrilldown(null);
        return;
      }
      setItemDrilldown(data.data);
    } catch (error) {
      console.error("Error fetching item:", error);
      toast.error("Failed to load item data");
    } finally {
      setIsLoadingItem(false);
    }
  };

  // ============================================
  // HELPER: update a specific table's search term
  // ============================================
  const setTableSearch = (key, value) => {
    setDeltaSearch((prev) => ({ ...prev, [key]: value }));
  };

  // ============================================
  // DERIVED: chart-friendly data shapes
  // ============================================
  const sourceBarData = crossSource
    ? Object.keys(crossSource.sourceTotals).map((src) => ({
      source: SOURCE_LABELS[src],
      key: src,
      Qty: crossSource.sourceTotals[src].totalQty,
      Value: crossSource.sourceTotals[src].totalValue,
    }))
    : [];

  const valuePieData = crossSource
    ? Object.keys(crossSource.sourceTotals).map((src) => ({
      name: SOURCE_LABELS[src],
      value: crossSource.sourceTotals[src].totalValue,
      key: src,
    }))
    : [];

  const itemDrilldownChartData = itemDrilldown
    ? (() => {
      const dateSet = new Set();
      ALL_SOURCES.forEach((src) => {
        itemDrilldown.sources[src]?.trend.forEach((t) => dateSet.add(t.date));
      });
      return Array.from(dateSet)
        .sort()
        .map((date) => {
          const row = { date };
          ALL_SOURCES.forEach((src) => {
            const entry = itemDrilldown.sources[src]?.trend.find((t) => t.date === date);
            row[src] = entry ? entry.qty : null;
          });
          return row;
        });
    })()
    : [];

  const isAllSourcesMode = comparison && comparison.source === "all";

  // ============================================
  // SUB-COMPONENT: renders one source's comparison block
  // (used both in single-source mode and inside the all-sources loop)
  // ============================================
  const renderComparisonBlock = (result, sourceKey) => {
    const searchKey = sourceKey || "single";
    const searchValue = deltaSearch[searchKey] || "";

    const filteredDeltaTable = searchValue.trim()
      ? result.deltaTable.filter((row) => {
        const term = searchValue.trim().toLowerCase();
        return (
          row.item_no.toLowerCase().includes(term) ||
          row.description.toLowerCase().includes(term)
        );
      })
      : result.deltaTable;

    return (
      <div key={sourceKey || "single"} className="comparison-block">
        {sourceKey && (
          <h4 className="comparison-block-title">
            {SOURCE_ICONS[sourceKey]} {SOURCE_LABELS[sourceKey]}
          </h4>
        )}

        <div className="dashboard-summary-strip">
          <div className="summary-chip">
            Qty: {result.summary.prevTotalQty} → {result.summary.currTotalQty}
            <span className={result.summary.qtyChange >= 0 ? "up" : "down"}>
              ({result.summary.qtyChange >= 0 ? "+" : ""}
              {result.summary.qtyChange})
            </span>
          </div>
          <div className="summary-chip">
            Value: {currency(result.summary.prevTotalValue)} → {currency(result.summary.currTotalValue)}
            <span className={result.summary.valueChange >= 0 ? "up" : "down"}>
              ({result.summary.valueChange >= 0 ? "+" : ""}
              {currency(result.summary.valueChange)})
            </span>
          </div>
          <div className="summary-chip">🆕 New: {result.summary.newItemsCount}</div>
          <div className="summary-chip">🗑️ Removed: {result.summary.removedItemsCount}</div>
          <div className="summary-chip">📈 Restocked: {result.summary.restockedCount}</div>
          <div className="summary-chip">📉 Sold: {result.summary.soldCount}</div>
        </div>

        <div className="dashboard-chart-grid dashboard-chart-grid--two">
          <div className="chart-card">
            <h4>Top 10 Qty Increase</h4>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={result.topIncrease} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f8" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="item_no" type="category" width={90} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="qtyDelta" fill="#22c55e" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <h4>Top 10 Qty Decrease</h4>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={result.topDecrease} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f8" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="item_no" type="category" width={90} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="qtyDelta" fill="#ef4444" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="dashboard-table-card">
          <div className="dashboard-table-card-header">
            <h4>Item-Wise Delta Table</h4>
            <div className="table-search-box">
              <FaSearch className="table-search-icon" />
              <input
                type="text"
                placeholder="Search by Item No. or Name..."
                value={searchValue}
                onChange={(e) => setTableSearch(searchKey, e.target.value)}
              />
              {searchValue && (
                <button
                  type="button"
                  className="table-search-clear"
                  onClick={() => setTableSearch(searchKey, "")}
                >
                  <FaTimes />
                </button>
              )}
            </div>
          </div>
          <div className="dashboard-table-wrapper">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Item No.</th>
                  <th>Description</th>
                  <th>Prev Qty</th>
                  <th>Curr Qty</th>
                  <th>Qty Δ</th>
                  <th>Prev Value</th>
                  <th>Curr Value</th>
                  <th>Value Δ</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeltaTable.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="table-no-results">
                      No items match "{searchValue}"
                    </td>
                  </tr>
                ) : (
                  filteredDeltaTable.map((row) => (
                    <tr key={row.item_no}>
                      <td>{row.item_no}</td>
                      <td>{row.description}</td>
                      <td>{row.prevQty ?? "—"}</td>
                      <td>{row.currQty ?? "—"}</td>
                      <td className={row.qtyDelta >= 0 ? "cell-up" : "cell-down"}>
                        {row.qtyDelta > 0 ? "+" : ""}
                        {row.qtyDelta}
                      </td>
                      <td>{currency(row.prevValue)}</td>
                      <td>{currency(row.currValue)}</td>
                      <td className={row.valueDelta >= 0 ? "cell-up" : "cell-down"}>
                        {row.valueDelta > 0 ? "+" : ""}
                        {currency(row.valueDelta)}
                      </td>
                      <td>
                        <span className={`status-badge status-badge--${row.status}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <>
      <ToastContainer position="top-center" autoClose={3000} />
      <div className="dashboard-main">
        {/* HEADER */}
        <div className="dashboard-page-header">
          <h2>
            <FaChartBar /> Inventory Dashboard
          </h2>
          <p>Cross-source comparison and stock trend analysis</p>
        </div>

        {isLoadingDates ? (
          <div className="dashboard-loading-block">
            <FaSpinner className="spinning" />
            <p>Loading available dates...</p>
          </div>
        ) : availableDates.length === 0 ? (
          <div className="dashboard-empty-block">
            <FaDatabase className="empty-icon" />
            <p>No inventory data yet</p>
            <span>Upload inventory files to see the dashboard</span>
          </div>
        ) : (
          <>
            {/* DATE SELECTOR + EXPORT */}
            <div className="dashboard-filter-card">
              <label>
                <FaCalendarAlt /> Viewing data for
              </label>
              <select
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="dashboard-select"
              >
                {availableDates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {isLoadingDateData && <FaSpinner className="spinning inline-spinner" />}

              <button
                className="dashboard-btn dashboard-btn--export"
                onClick={handleExportDate}
                disabled={isExportingDate || isLoadingDateData}
              >
                {isExportingDate ? (
                  <FaSpinner className="spinning" />
                ) : (
                  <>
                    <FaFileExcel /> Export
                  </>
                )}
              </button>
            </div>

            {/* ============================================ */}
            {/* KPI CARDS */}
            {/* ============================================ */}
            {kpis && (
              <div className="dashboard-kpi-grid">
                <div className="kpi-card kpi-card--primary">
                  <span className="kpi-label">Total Stock Value</span>
                  <span className="kpi-value">{currency(kpis.combined.totalValue)}</span>
                </div>
                <div className="kpi-card kpi-card--primary">
                  <span className="kpi-label">Total Stock Qty</span>
                  <span className="kpi-value">{kpis.combined.totalQty.toLocaleString("en-IN")}</span>
                </div>
                {ALL_SOURCES.map((src) => {
                  const s = kpis.bySource[src];
                  if (!s) return null;
                  return (
                    <div key={src} className={`kpi-card kpi-card--${src}`}>
                      <span className="kpi-label">
                        {SOURCE_ICONS[src]} {SOURCE_LABELS[src]} Value
                      </span>
                      <span className="kpi-value">{currency(s.totalValue)}</span>
                      {s.valueChangePct !== null && (
                        <span className={`kpi-trend ${s.valueChange >= 0 ? "up" : "down"}`}>
                          {s.valueChange >= 0 ? <FaArrowUp /> : <FaArrowDown />}
                          {Math.abs(s.valueChangePct)}% vs {s.previousDate}
                        </span>
                      )}
                      <span className="kpi-sub">
                        Active SKUs: {s.activeSkus} &nbsp;|&nbsp; Dead: {s.deadStock}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ============================================ */}
            {/* CROSS-SOURCE COMPARISON */}
            {/* ============================================ */}
            {crossSource && (
              <div className="dashboard-section">
                <h3>
                  <FaChartPie /> Cross-Source Comparison
                </h3>
                <div className="dashboard-chart-grid dashboard-chart-grid--two">
                  <div className="chart-card">
                    <h4>Value by Source</h4>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={sourceBarData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f8" />
                        <XAxis dataKey="source" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(val) => currency(val)} />
                        <Bar dataKey="Value" radius={[6, 6, 0, 0]}>
                          {sourceBarData.map((entry) => (
                            <Cell key={entry.key} fill={SOURCE_COLORS[entry.key]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="chart-card">
                    <h4>Value Contribution %</h4>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={valuePieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={90}
                          paddingAngle={3}
                        >
                          {valuePieData.map((entry) => (
                            <Cell key={entry.key} fill={SOURCE_COLORS[entry.key]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(val) => currency(val)} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {crossSource.mismatches.length > 0 && (
                  <div className="dashboard-table-card">
                    <h4>
                      <FaExclamationTriangle /> Items Missing In At Least One Source (
                      {crossSource.mismatches.length})
                    </h4>
                    <div className="dashboard-table-wrapper">
                      <table className="dashboard-table">
                        <thead>
                          <tr>
                            <th>Item No.</th>
                            <th>Description</th>
                            <th>Online</th>
                            <th>Offline</th>
                            <th>Showroom</th>
                          </tr>
                        </thead>
                        <tbody>
                          {crossSource.mismatches.map((item) => (
                            <tr key={item.item_no}>
                              <td>{item.item_no}</td>
                              <td>{item.description}</td>
                              {ALL_SOURCES.map((src) => (
                                <td key={src}>
                                  {item[src] ? (
                                    item[src].qty
                                  ) : (
                                    <span className="cell-missing">missing</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============================================ */}
            {/* TIME COMPARISON */}
            {/* ============================================ */}
            <div className="dashboard-section">
              <h3>
                <FaChartLine /> Time Comparison
              </h3>
              <div className="dashboard-filter-row">
                <div className="filter-group">
                  <label>Source</label>
                  <select
                    className="dashboard-select"
                    value={comparisonSource}
                    onChange={(e) => setComparisonSource(e.target.value)}
                  >
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="showroom">Showroom</option>
                    <option value="all">All Sources</option>
                  </select>
                </div>
                <div className="filter-group">
                  <label>Previous Date</label>
                  <select
                    className="dashboard-select"
                    value={previousDate}
                    onChange={(e) => setPreviousDate(e.target.value)}
                  >
                    {availableDates.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filter-group">
                  <label>Current Date</label>
                  <select
                    className="dashboard-select"
                    value={currentDate}
                    onChange={(e) => setCurrentDate(e.target.value)}
                  >
                    {availableDates.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="dashboard-btn" onClick={fetchComparison} disabled={isLoadingComparison}>
                  {isLoadingComparison ? <FaSpinner className="spinning" /> : "Compare"}
                </button>
                {comparison && (
                  <button
                    className="dashboard-btn dashboard-btn--export"
                    onClick={handleExportComparison}
                    disabled={isExportingComparison}
                  >
                    {isExportingComparison ? (
                      <FaSpinner className="spinning" />
                    ) : (
                      <>
                        <FaFileExcel /> Export
                      </>
                    )}
                  </button>
                )}
              </div>

              {comparison && !isAllSourcesMode && renderComparisonBlock(comparison, null)}

              {comparison && isAllSourcesMode && (
                <>
                  <h4 className="comparison-block-title">
                    <FaAllSources /> Combined (All Sources)
                  </h4>
                  <div className="dashboard-summary-strip">
                    <div className="summary-chip">
                      Qty: {comparison.combinedSummary.prevTotalQty} →{" "}
                      {comparison.combinedSummary.currTotalQty}
                      <span className={comparison.combinedSummary.qtyChange >= 0 ? "up" : "down"}>
                        ({comparison.combinedSummary.qtyChange >= 0 ? "+" : ""}
                        {comparison.combinedSummary.qtyChange})
                      </span>
                    </div>
                    <div className="summary-chip">
                      Value: {currency(comparison.combinedSummary.prevTotalValue)} →{" "}
                      {currency(comparison.combinedSummary.currTotalValue)}
                      <span className={comparison.combinedSummary.valueChange >= 0 ? "up" : "down"}>
                        ({comparison.combinedSummary.valueChange >= 0 ? "+" : ""}
                        {currency(comparison.combinedSummary.valueChange)})
                      </span>
                    </div>
                    <div className="summary-chip">🆕 New: {comparison.combinedSummary.newItemsCount}</div>
                    <div className="summary-chip">
                      🗑️ Removed: {comparison.combinedSummary.removedItemsCount}
                    </div>
                    <div className="summary-chip">
                      📈 Restocked: {comparison.combinedSummary.restockedCount}
                    </div>
                    <div className="summary-chip">📉 Sold: {comparison.combinedSummary.soldCount}</div>
                  </div>

                  {ALL_SOURCES.map((src) =>
                    renderComparisonBlock(comparison.sources[src], src)
                  )}
                </>
              )}
            </div>

            {/* ============================================ */}
            {/* TREND LINE */}
            {/* ============================================ */}
            <div className="dashboard-section">
              <h3>
                <FaChartLine /> Stock Trend Over Time
              </h3>
              <div className="dashboard-filter-row">
                <div className="filter-group">
                  <label>Source</label>
                  <select
                    className="dashboard-select"
                    value={trendSource}
                    onChange={(e) => setTrendSource(e.target.value)}
                  >
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="showroom">Showroom</option>
                  </select>
                </div>
              </div>
              <div className="chart-card">
                {isLoadingTrend ? (
                  <div className="dashboard-loading-block">
                    <FaSpinner className="spinning" />
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={trend?.trend || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef1f8" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(val) => currency(val)} />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="totalValue"
                        name="Total Value"
                        stroke={SOURCE_COLORS[trendSource]}
                        strokeWidth={2.5}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* ============================================ */}
            {/* ITEM DRILL DOWN */}
            {/* ============================================ */}
            <div className="dashboard-section">
              <h3>
                <FaSearch /> Item Drill Down
              </h3>
              <form className="dashboard-filter-row" onSubmit={handleItemSearch}>
                <div className="filter-group filter-group--grow">
                  <label>Item No.</label>
                  <input
                    type="text"
                    className="dashboard-input"
                    placeholder="e.g. 100010506"
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                  />
                </div>
                <button type="submit" className="dashboard-btn" disabled={isLoadingItem}>
                  {isLoadingItem ? <FaSpinner className="spinning" /> : "Search"}
                </button>
              </form>

              {itemDrilldown && (
                <>
                  <p className="dashboard-item-title">
                    {itemDrilldown.item_no} —{" "}
                    {itemDrilldown.sources.online?.description ||
                      itemDrilldown.sources.offline?.description ||
                      itemDrilldown.sources.showroom?.description}
                  </p>
                  <div className="chart-card">
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={itemDrilldownChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#eef1f8" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        {ALL_SOURCES.map((src) =>
                          itemDrilldown.sources[src] ? (
                            <Line
                              key={src}
                              type="monotone"
                              dataKey={src}
                              name={SOURCE_LABELS[src]}
                              stroke={SOURCE_COLORS[src]}
                              strokeWidth={2.5}
                              dot={{ r: 3 }}
                              connectNulls
                            />
                          ) : null
                        )}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>

            {/* ============================================ */}
            {/* PARETO + TOP ITEMS */}
            {/* ============================================ */}
            <div className="dashboard-section">
              <h3>
                <FaTrophy /> Value Concentration
              </h3>
              <div className="dashboard-filter-row">
                <div className="filter-group">
                  <label>Source</label>
                  <select
                    className="dashboard-select"
                    value={paretoSource}
                    onChange={(e) => setParetoSource(e.target.value)}
                  >
                    <option value="all">All Sources</option>
                    <option value="online">Online</option>
                    <option value="offline">Offline</option>
                    <option value="showroom">Showroom</option>
                  </select>
                </div>
              </div>

              <div className="dashboard-chart-grid dashboard-chart-grid--two">
                <div className="chart-card">
                  <h4>Pareto — Top Items by Value (Cumulative %)</h4>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={(pareto?.items || []).slice(0, 15)}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eef1f8" />
                      <XAxis dataKey="item_no" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(val) => currency(val)} />
                      <Bar dataKey="value" fill="#3f3f91" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="dashboard-table-card dashboard-table-card--flush">
                  <h4>
                    <FaLayerGroup /> Top 10 Items by Value
                  </h4>
                  <div className="dashboard-table-wrapper">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th>Item No.</th>
                          <th>Description</th>
                          <th>Qty</th>
                          <th>Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(topItems?.topItems || []).map((item) => (
                          <tr key={item.item_no}>
                            <td>{item.item_no}</td>
                            <td>{item.description}</td>
                            <td>{item.qty}</td>
                            <td>{currency(item.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* ============================================ */}
            {/* DEAD STOCK / IMBALANCE */}
            {/* ============================================ */}
            {deadStock && (
              <div className="dashboard-section">
                <h3>
                  <FaExclamationTriangle /> Dead Stock & Imbalance
                </h3>
                <div className="dashboard-chart-grid dashboard-chart-grid--two">
                  <div className="dashboard-table-card">
                    <h4>Dead Everywhere ({deadStock.deadEverywhere.length})</h4>
                    <div className="dashboard-table-wrapper">
                      <table className="dashboard-table">
                        <thead>
                          <tr>
                            <th>Item No.</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deadStock.deadEverywhere.map((item) => (
                            <tr key={item.item_no}>
                              <td>{item.item_no}</td>
                              <td>{item.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="dashboard-table-card">
                    <h4>Source Imbalance ({deadStock.imbalance.length})</h4>
                    <div className="dashboard-table-wrapper">
                      <table className="dashboard-table">
                        <thead>
                          <tr>
                            <th>Item No.</th>
                            <th>Online</th>
                            <th>Offline</th>
                            <th>Showroom</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deadStock.imbalance.map((item) => (
                            <tr key={item.item_no}>
                              <td>{item.item_no}</td>
                              {ALL_SOURCES.map((src) => (
                                <td key={src} className={item[src] === 0 ? "cell-down" : ""}>
                                  {item[src] === null ? "—" : item[src]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default Dashboard;