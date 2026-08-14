import React, { useState, useEffect, useCallback } from "react";
import { toast, ToastContainer } from "react-toastify";
import {
    FaBox,
    FaStore,
    FaLaptop,
    FaSearch,
    FaFilter,
    FaCalendarAlt,
    FaSpinner,
    FaChevronLeft,
    FaChevronRight,
    FaFileExcel,
    FaPrint,
    FaTimes,
    FaCheckCircle,
    FaExclamationTriangle,
    FaMinusCircle,
    FaTimesCircle 
} from "react-icons/fa";
import "react-toastify/dist/ReactToastify.css";
import "./Inventory.scss";

const Inventory = () => {
    // ============================================
    // STATE
    // ============================================
    const [activeSource, setActiveSource] = useState("online");
    const [selectedDate, setSelectedDate] = useState("");
    const [availableDates, setAvailableDates] = useState([]);
    const [inventoryData, setInventoryData] = useState({
        items: [],
        pagination: {},
        summary: {},
        filters: {},
    });
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterType, setFilterType] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(20);
    const [lowStockThreshold, setLowStockThreshold] = useState(5);

    // ============================================
    // FETCH AVAILABLE DATES
    // ============================================
    const fetchAvailableDates = async () => {
        try {
            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/inventory/dates`,
                {
                    credentials: "include",
                }
            );

            if (!response.ok) throw new Error("Failed to fetch dates");

            const data = await response.json();
            if (data.success) {
                const dates = data.data.dates || [];
                setAvailableDates(dates);
                if (dates.length > 0 && !selectedDate) {
                    setSelectedDate(dates[0].date);
                }
            }
        } catch (error) {
            console.error("Error fetching dates:", error);
            toast.error("Failed to load dates");
        }
    };

    // ============================================
    // FETCH INVENTORY DATA
    // ============================================
    const fetchInventoryData = useCallback(async () => {
        if (!selectedDate) return;

        setIsLoading(true);

        try {
            const queryParams = new URLSearchParams({
                page: currentPage,
                limit: itemsPerPage,
                search: searchTerm,
                filter: filterType,
                threshold: lowStockThreshold,
            });

            const response = await fetch(
                `${import.meta.env.VITE_API_URL}/inventory/${activeSource}/${selectedDate}?${queryParams}`,
                {
                    credentials: "include",
                }
            );

            if (!response.ok) throw new Error("Failed to fetch inventory");

            const data = await response.json();

            if (data.success) {
                setInventoryData({
                    items: data.data.items || [],
                    pagination: data.data.pagination || {},
                    summary: data.data.summary || {},
                    filters: data.data.filters || {},
                });
            } else {
                throw new Error(data.message || "Failed to fetch inventory");
            }
        } catch (error) {
            console.error("Error fetching inventory:", error);
            toast.error(error.message || "Failed to load inventory data");
            setInventoryData({
                items: [],
                pagination: {},
                summary: {},
                filters: {},
            });
        } finally {
            setIsLoading(false);
        }
    }, [activeSource, selectedDate, currentPage, itemsPerPage, searchTerm, filterType, lowStockThreshold]);

    // ============================================
    // INITIAL LOAD
    // ============================================
    useEffect(() => {
        fetchAvailableDates();
    }, []);

    // ============================================
    // FETCH DATA WHEN DEPENDENCIES CHANGE
    // ============================================
    useEffect(() => {
        if (selectedDate) {
            fetchInventoryData();
        }
    }, [fetchInventoryData, selectedDate]);

    // ============================================
    // HANDLE SOURCE CHANGE
    // ============================================
    const handleSourceChange = (source) => {
        setActiveSource(source);
        setCurrentPage(1);
    };

    // ============================================
    // HANDLE DATE CHANGE
    // ============================================
    const handleDateChange = (date) => {
        setSelectedDate(date);
        setCurrentPage(1);
    };

    // ============================================
    // HANDLE SEARCH
    // ============================================
    const handleSearch = (e) => {
        e.preventDefault();
        setCurrentPage(1);
        fetchInventoryData();
    };

    // ============================================
    // HANDLE FILTER CHANGE
    // ============================================
    const handleFilterChange = (filter) => {
        setFilterType(filter);
        setCurrentPage(1);
    };

    // ============================================
    // HANDLE PAGE CHANGE
    // ============================================
    const handlePageChange = (page) => {
        setCurrentPage(page);
    };

    // ============================================
    // HANDLE SEARCH INPUT (Debounced)
    // ============================================
    const handleSearchInput = (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        setCurrentPage(1);
    };

    // ============================================
    // SEARCH ON ENTER KEY
    // ============================================
    const handleKeyPress = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            fetchInventoryData();
        }
    };

    // ============================================
    // CLEAR SEARCH
    // ============================================
    const clearSearch = () => {
        setSearchTerm("");
        setCurrentPage(1);
        fetchInventoryData();
    };

    // ============================================
    // FORMAT CURRENCY
    // ============================================
    const formatCurrency = (value) => {
        if (value === undefined || value === null) return "₹0";
        return `₹${Math.round(value).toLocaleString()}`;
    };

    // ============================================
    // FORMAT DATE
    // ============================================
    const formatDate = (dateStr) => {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        return d.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
        });
    };

    // ============================================
    // GET STOCK STATUS
    // ============================================
    const getStockStatus = (qty) => {
        if (qty === 0) {
            return { label: "Out of Stock", icon: <FaTimesCircle />, className: "out-of-stock" };
        } else if (qty <= lowStockThreshold) {
            return { label: "Low Stock", icon: <FaExclamationTriangle />, className: "low-stock" };
        } else {
            return { label: "In Stock", icon: <FaCheckCircle />, className: "in-stock" };
        }
    };

    // ============================================
    // GET SOURCE ICON
    // ============================================
    const getSourceIcon = (source) => {
        const icons = {
            online: <FaLaptop />,
            offline: <FaStore />,
            showroom: <FaBox />,
        };
        return icons[source] || <FaBox />;
    };

    const getSourceLabel = (source) => {
        const labels = {
            online: "Online",
            offline: "Offline",
            showroom: "Showroom",
        };
        return labels[source] || source;
    };

    const getSourceColor = (source) => {
        const colors = {
            online: "#3b82f6",
            offline: "#22c55e",
            showroom: "#8b5cf6",
        };
        return colors[source] || "#6b7280";
    };

    // ============================================
    // RENDER SUMMARY CARDS
    // ============================================
    const renderSummaryCards = () => {
        const { summary, pagination } = inventoryData;

        const cards = [
            {
                label: "Total Items",
                value: pagination.totalItems || 0,
                icon: <FaBox />,
                color: "#3b82f6",
            },
            {
                label: "Total Quantity",
                value: summary.totalQty || 0,
                icon: <FaBox />,
                color: "#22c55e",
            },
            {
                label: "Total Value",
                value: formatCurrency(summary.totalValue || 0),
                icon: <FaBox />,
                color: "#8b5cf6",
            },
        ];

        return (
            <div className="inventory-summary-cards">
                {cards.map((card, index) => (
                    <div key={index} className="inventory-summary-card">
                        <div className="summary-icon" style={{ backgroundColor: card.color + "20", color: card.color }}>
                            {card.icon}
                        </div>
                        <div className="summary-content">
                            <span className="summary-label">{card.label}</span>
                            <span className="summary-value">{card.value}</span>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // ============================================
    // RENDER FILTERS BAR
    // ============================================
    const renderFiltersBar = () => {
        const filters = [
            { value: "all", label: "All" },
            { value: "in-stock", label: "In Stock" },
            { value: "out-of-stock", label: "Out of Stock" },
            { value: "low-stock", label: "Low Stock" },
        ];

        return (
            <div className="inventory-filters-bar">
                <div className="filter-group">
                    <label>
                        <FaFilter /> Filter
                    </label>
                    <div className="filter-buttons">
                        {filters.map((filter) => (
                            <button
                                key={filter.value}
                                className={`filter-btn ${filterType === filter.value ? "active" : ""}`}
                                onClick={() => handleFilterChange(filter.value)}
                            >
                                {filter.label}
                            </button>
                        ))}
                    </div>
                </div>

                {filterType === "low-stock" && (
                    <div className="filter-group threshold-group">
                        <label>
                            <FaExclamationTriangle /> Low Stock Threshold
                        </label>
                        <input
                            type="number"
                            className="threshold-input"
                            value={lowStockThreshold}
                            onChange={(e) => setLowStockThreshold(Math.max(1, parseInt(e.target.value) || 5))}
                            min="1"
                            max="50"
                        />
                    </div>
                )}
            </div>
        );
    };

    // ============================================
    // RENDER PAGINATION
    // ============================================
    const renderPagination = () => {
        const { pagination } = inventoryData;
        const { currentPage, totalPages, totalItems, hasNextPage, hasPrevPage } = pagination;

        if (!totalPages || totalPages <= 1) return null;

        const getPageNumbers = () => {
            const pages = [];
            const maxVisible = 5;
            let start = Math.max(1, currentPage - 2);
            let end = Math.min(totalPages, currentPage + 2);

            if (end - start < maxVisible - 1) {
                if (start === 1) {
                    end = Math.min(totalPages, start + maxVisible - 1);
                } else {
                    start = Math.max(1, end - maxVisible + 1);
                }
            }

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            return pages;
        };

        return (
            <div className="inventory-pagination">
                <div className="pagination-info">
                    Showing {pagination.startIndex || 0} - {pagination.endIndex || 0} of {totalItems || 0} items
                </div>

                <div className="pagination-controls">
                    <button
                        className="pagination-btn"
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={!hasPrevPage}
                    >
                        <FaChevronLeft />
                    </button>

                    {getPageNumbers().map((page) => (
                        <button
                            key={page}
                            className={`pagination-btn ${page === currentPage ? "active" : ""}`}
                            onClick={() => handlePageChange(page)}
                        >
                            {page}
                        </button>
                    ))}

                    <button
                        className="pagination-btn"
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={!hasNextPage}
                    >
                        <FaChevronRight />
                    </button>
                </div>
            </div>
        );
    };

    // ============================================
    // RENDER TABLE
    // ============================================
    const renderTable = () => {
        const { items } = inventoryData;

        if (isLoading) {
            return (
                <div className="inventory-loading">
                    <div className="loading-spinner large"></div>
                    <p>Loading inventory data...</p>
                </div>
            );
        }

        if (items.length === 0) {
            return (
                <div className="inventory-empty">
                    <FaBox className="empty-icon" />
                    <h4>No items found</h4>
                    <p>
                        {searchTerm || filterType !== "all"
                            ? "Try adjusting your search or filters"
                            : "No inventory data available for this date"}
                    </p>
                </div>
            );
        }

        return (
            <div className="inventory-table-wrap">
                <table className="inventory-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Item No.</th>
                            <th>Name</th>
                            <th>Qty</th>
                            <th>Value</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => {
                            const status = getStockStatus(item.qty);
                            const serialNo = (inventoryData.pagination.currentPage - 1) * inventoryData.pagination.limit + index + 1;

                            return (
                                <tr key={item.item_no + index}>
                                    <td>{serialNo}</td>
                                    <td className="item-no">{item.item_no}</td>
                                    <td className="item-name">{item.description}</td>
                                    <td className="item-qty">{item.qty}</td>
                                    <td className="item-value">{formatCurrency(item.value)}</td>
                                    <td>
                                        <span className={`stock-status ${status.className}`}>
                                            {status.icon}
                                            {status.label}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        );
    };

    // ============================================
    // MAIN RENDER
    // ============================================
    return (
        <>
            <ToastContainer position="top-center" autoClose={3000} />
            <div className="inventory-main">
                <div className="inventory-header">
                    <h2>
                        <FaBox /> Inventory Data
                    </h2>
                    <p>View inventory data for Online, Offline, and Showroom</p>
                </div>

                {/* Date Dropdown */}
                <div className="inventory-controls">
                    <div className="control-group">
                        <label>
                            <FaCalendarAlt /> Select Date
                        </label>
                        <select
                            className="date-select"
                            value={selectedDate}
                            onChange={(e) => handleDateChange(e.target.value)}
                        >
                            {availableDates.map((item) => (
                                <option key={item.date} value={item.date}>
                                    {formatDate(item.date)} ({item.totalItems} items)
                                </option>
                            ))}
                            {availableDates.length === 0 && (
                                <option value="">No dates available</option>
                            )}
                        </select>
                    </div>

                    {/* Search */}
                    <div className="control-group search-group">
                        <div className="search-input-wrap">
                            <FaSearch className="search-icon" />
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Search by Item No. or Name..."
                                value={searchTerm}
                                onChange={handleSearchInput}
                                onKeyPress={handleKeyPress}
                            />
                            {searchTerm && (
                                <button className="clear-search" onClick={clearSearch}>
                                    <FaTimes />
                                </button>
                            )}
                            <button className="search-btn" onClick={fetchInventoryData}>
                                Search
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="inventory-tabs">
                    {["online", "offline", "showroom"].map((source) => (
                        <button
                            key={source}
                            className={`tab-btn ${activeSource === source ? "active" : ""}`}
                            onClick={() => handleSourceChange(source)}
                            style={{
                                borderColor: activeSource === source ? getSourceColor(source) : "transparent",
                            }}
                        >
                            <span className="tab-icon" style={{ color: getSourceColor(source) }}>
                                {getSourceIcon(source)}
                            </span>
                            <span className="tab-label">{getSourceLabel(source)}</span>
                            <span className="tab-badge" style={{ backgroundColor: getSourceColor(source) }}>
                                {inventoryData.pagination.totalItems || 0}
                            </span>
                        </button>
                    ))}
                </div>

                {/* Summary Cards */}
                {renderSummaryCards()}

                {/* Filters */}
                {renderFiltersBar()}

                {/* Table */}
                {renderTable()}

                {/* Pagination */}
                {renderPagination()}
            </div>
        </>
    );
};

export default Inventory;