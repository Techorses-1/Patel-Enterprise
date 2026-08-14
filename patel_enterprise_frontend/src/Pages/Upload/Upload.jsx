import React, { useState, useEffect, useRef } from "react";
import { Formik, Form, Field, ErrorMessage } from "formik";
import * as Yup from "yup";
import { toast, ToastContainer } from "react-toastify";
import * as XLSX from "xlsx";
import {
  FaUpload,
  FaFileExcel,
  FaCheckCircle,
  FaTimesCircle,
  FaSpinner,
  FaCalendarAlt,
  FaCloudUploadAlt,
  FaTrash,
  FaHistory,
  FaDatabase,
  FaBox,
  FaStore,
  FaLaptop,
  FaDownload,
  FaExclamationTriangle,
  FaTimes,
} from "react-icons/fa";
import "react-toastify/dist/ReactToastify.css";
import "./Upload.scss";

const Upload = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadHistory, setUploadHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState({
    online: null,
    offline: null,
    showroom: null,
  });
  const [fileErrors, setFileErrors] = useState({
    online: null,
    offline: null,
    showroom: null,
  });
  const [uploadResult, setUploadResult] = useState(null);

  const fileInputRefs = {
    online: useRef(null),
    offline: useRef(null),
    showroom: useRef(null),
  };

  // Modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteDate, setDeleteDate] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ============================================
  // FETCH UPLOAD HISTORY
  // ============================================
  const fetchUploadHistory = async () => {
    try {
      setIsLoadingHistory(true);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/upload/dates`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) throw new Error("Failed to fetch history");

      const data = await response.json();
      if (data.success) {
        setUploadHistory(data.data.dates || []);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
      toast.error("Failed to load upload history");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchUploadHistory();
  }, []);

  // ============================================
  // DOWNLOAD TEMPLATE
  // ============================================
  const downloadTemplate = () => {
    try {
      const workbook = XLSX.utils.book_new();

      const templateData = [
        ['Item No', 'Name', 'Qty', 'Value'],
        ['100010506', '8ML AHSAN AL AMEER OUD', '195', '8346'],
        ['100010507', '8ML AHSAN BLUE OUD', '197', '8431.6'],
        ['', '', '', ''],
        ['', '', '', ''],
        ['', '', '', ''],
        ['', '', '', ''],
        ['', '', '', ''],
        ['', '', '', ''],
        ['', '', '', ''],
        ['', '', '', ''],
      ];

      const sheet = XLSX.utils.aoa_to_sheet(templateData);

      sheet['!cols'] = [
        { wch: 15 },
        { wch: 45 },
        { wch: 10 },
        { wch: 15 },
      ];

      XLSX.utils.book_append_sheet(workbook, sheet, 'Template');

      const instructionsData = [
        ['📋 INVENTORY UPLOAD TEMPLATE INSTRUCTIONS'],
        [''],
        ['1. DO NOT change the column headers (Row 1)'],
        ['2. Enter your data starting from Row 2'],
        ['3. Item No - Enter the product code (e.g., 100010506)'],
        ['4. Name - Enter the product name (e.g., 8ML AHSAN AL AMEER OUD)'],
        ['5. Qty - Enter the quantity (number only)'],
        ['6. Value - Enter the total value (number only)'],
        ['7. Delete the example rows (Row 2-10) before uploading'],
        ['8. Save as .xlsx or .xls file'],
        ['9. Upload the file using the upload form'],
        [''],
        ['✅ SUPPORTED FILE FORMATS: .xlsx, .xls, .csv'],
        ['✅ MAX FILE SIZE: 10MB'],
        [''],
        ['⚠️ IMPORTANT:'],
        ['- All fields are required'],
        ['- Qty and Value must be numbers'],
        ['- Qty and Value cannot be negative'],
        ['- Item No. must be unique'],
      ];

      const instructionsSheet = XLSX.utils.aoa_to_sheet(instructionsData);
      instructionsSheet['!cols'] = [{ wch: 70 }];
      XLSX.utils.book_append_sheet(workbook, instructionsSheet, 'Instructions');

      XLSX.writeFile(workbook, 'inventory_template.xlsx');

      toast.success('📥 Template downloaded successfully!', {
        position: "top-center",
        autoClose: 2000,
      });

    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Failed to download template. Please try again.');
    }
  };

  // ============================================
  // HANDLE FILE SELECT
  // ============================================
  const handleFileSelect = (source, file) => {
    if (!file) return;

    const validTypes = [
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
    ];
    const ext = file.name.split(".").pop().toLowerCase();
    const validExts = ["xlsx", "xls", "csv"];

    if (!validTypes.includes(file.type) && !validExts.includes(ext)) {
      setFileErrors((prev) => ({
        ...prev,
        [source]: "Please select a valid Excel file (.xlsx, .xls, .csv)",
      }));
      toast.error(`${source} file: Please select a valid Excel file`);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setFileErrors((prev) => ({
        ...prev,
        [source]: "File size must be less than 10MB",
      }));
      toast.error(`${source} file: File size must be less than 10MB`);
      return;
    }

    setFileErrors((prev) => ({ ...prev, [source]: null }));
    setSelectedFiles((prev) => ({ ...prev, [source]: file }));
    setUploadResult(null);
  };

  // ============================================
  // REMOVE FILE
  // ============================================
  const removeFile = (source) => {
    setSelectedFiles((prev) => ({ ...prev, [source]: null }));
    setFileErrors((prev) => ({ ...prev, [source]: null }));
    if (fileInputRefs[source].current) {
      fileInputRefs[source].current.value = "";
    }
  };

  // ============================================
  // HANDLE UPLOAD SUBMIT
  // ============================================
  const handleUpload = async (values, { resetForm }) => {
    const { date } = values;

    // Check if at least one file is selected
    const hasFile = Object.values(selectedFiles).some((file) => file !== null);
    if (!hasFile) {
      toast.error("Please select at least one inventory file");
      return;
    }

    // Check for file errors
    const hasError = Object.values(fileErrors).some((err) => err !== null);
    if (hasError) {
      toast.error("Please fix file errors before uploading");
      return;
    }

    // ✅ REMOVED: Frontend date exists check - Backend handles it now

    try {
      setIsSubmitting(true);
      setUploadProgress(0);
      setUploadResult(null);

      const formData = new FormData();
      formData.append("date", date);

      // Append only selected files
      if (selectedFiles.online) {
        formData.append("online", selectedFiles.online);
      }
      if (selectedFiles.offline) {
        formData.append("offline", selectedFiles.offline);
      }
      if (selectedFiles.showroom) {
        formData.append("showroom", selectedFiles.showroom);
      }

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 300);

      const response = await fetch(`${import.meta.env.VITE_API_URL}/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Upload failed");
      }

      setUploadResult({
        success: true,
        data: data.data,
      });

      toast.success(`✅ Inventory uploaded successfully for ${date}!`);

      resetForm();
      setSelectedFiles({
        online: null,
        offline: null,
        showroom: null,
      });
      Object.values(fileInputRefs).forEach((ref) => {
        if (ref.current) ref.current.value = "";
      });

      await fetchUploadHistory();

      setTimeout(() => {
        setUploadProgress(0);
      }, 2000);
    } catch (error) {
      console.error("Upload error:", error);
      setUploadResult({
        success: false,
        error: error.message,
      });
      toast.error(error.message || "Failed to upload inventory");
      setUploadProgress(0);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================
  // HANDLE DELETE DATE
  // ============================================
  const handleDeleteDate = (date) => {
    setDeleteDate(date);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deleteDate || isDeleting) return;

    try {
      setIsDeleting(true);

      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/upload/${deleteDate}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Delete failed");
      }

      toast.success(`✅ Data for ${deleteDate} deleted successfully!`);
      await fetchUploadHistory();
      setShowDeleteModal(false);
      setDeleteDate(null);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(error.message || "Failed to delete data");
    } finally {
      setIsDeleting(false);
    }
  };

  // ============================================
  // VALIDATION SCHEMA
  // ============================================
  const validationSchema = Yup.object({
    date: Yup.string()
      .required("Date is required")
      .matches(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  });

  // ============================================
  // INITIAL VALUES
  // ============================================
  const initialValues = {
    date: new Date().toISOString().split("T")[0],
  };

  // ============================================
  // RENDER FILE INPUT
  // ============================================
  const renderFileInput = (source, label, icon, color) => {
    const file = selectedFiles[source];
    const error = fileErrors[source];

    return (
      <div className="file-input-wrapper">
        <div
          className={`file-drop-zone ${file ? "has-file" : ""} ${error ? "has-error" : ""
            }`}
          onClick={() => fileInputRefs[source].current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile) handleFileSelect(source, droppedFile);
          }}
        >
          <input
            type="file"
            ref={fileInputRefs[source]}
            style={{ display: "none" }}
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const selectedFile = e.target.files[0];
              if (selectedFile) handleFileSelect(source, selectedFile);
            }}
          />

          {file ? (
            <div className="file-selected">
              <FaFileExcel className="file-icon" style={{ color }} />
              <div className="file-info">
                <div className="file-name">{file.name}</div>
                <div className="file-size">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </div>
              </div>
              <button
                className="remove-file"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(source);
                }}
              >
                <FaTimesCircle />
              </button>
            </div>
          ) : (
            <div className="file-placeholder">
              <div className="upload-icon" style={{ color }}>
                {icon}
              </div>
              <p>Drop {label} file here or click to browse</p>
              <small>Supports .xlsx, .xls, .csv files</small>
            </div>
          )}
        </div>
        {error && <div className="file-error">{error}</div>}
      </div>
    );
  };

  // ============================================
  // FORMAT DATE
  // ============================================
  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // ============================================
  // GET SOURCE LABEL / ICON / COLOR
  // ============================================
  const getSourceLabel = (source) => {
    const labels = {
      online: "Online",
      offline: "Offline",
      showroom: "Showroom",
    };
    return labels[source] || source;
  };

  const getSourceIcon = (source) => {
    const icons = {
      online: <FaLaptop />,
      offline: <FaStore />,
      showroom: <FaBox />,
    };
    return icons[source] || <FaBox />;
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
  // GET SELECTED FILES COUNT
  // ============================================
  const getSelectedFilesCount = () => {
    return Object.values(selectedFiles).filter((file) => file !== null).length;
  };

  // ============================================
  // MAIN RENDER
  // ============================================
  return (
    <>
      <ToastContainer position="top-center" autoClose={3000} />
      <div className="upload-main">
        <div className="upload-page-header">
          <div className="header-left">
            <h2>
              <FaCloudUploadAlt /> Upload Inventory
            </h2>
            <p>Upload Excel files for Online, Offline, and Showroom inventory</p>
          </div>
          <div className="header-right">
            <button className="download-template-btn" onClick={downloadTemplate}>
              <FaDownload /> Download Template
            </button>
          </div>
        </div>

        <div className="upload-grid">
          {/* Upload Form */}
          <div className="upload-form-container">
            <div className="upload-form-card">
              <h3>
                <FaUpload /> Upload Files
              </h3>

              <Formik
                initialValues={initialValues}
                validationSchema={validationSchema}
                onSubmit={handleUpload}
              >
                {({ values, setFieldValue, isSubmitting: formSubmitting }) => (
                  <Form className="upload-form">
                    {/* Date Field */}
                    <div className="form-group">
                      <label htmlFor="date">
                        <FaCalendarAlt /> Select Date
                      </label>
                      <Field
                        id="date"
                        name="date"
                        type="date"
                        className="form-input"
                      />
                      <ErrorMessage
                        name="date"
                        component="div"
                        className="error-message"
                      />
                    </div>

                    {/* File Inputs */}
                    <div className="file-inputs-grid">
                      {["online", "offline", "showroom"].map((source) => (
                        <div key={source} className="file-input-group">
                          <div className="file-input-label">
                            <span
                              className="source-badge"
                              style={{
                                backgroundColor: getSourceColor(source),
                              }}
                            >
                              {getSourceIcon(source)}
                              {getSourceLabel(source)}
                            </span>
                          </div>
                          {renderFileInput(
                            source,
                            getSourceLabel(source),
                            getSourceIcon(source),
                            getSourceColor(source)
                          )}
                        </div>
                      ))}
                    </div>

                    {/* ✅ NEW: File Selection Summary */}
                    <div className="file-selection-summary">
                      <span className="summary-label">Selected Files:</span>
                      {getSelectedFilesCount() === 0 ? (
                        <span className="summary-empty">None selected</span>
                      ) : (
                        <div className="summary-tags">
                          {Object.keys(selectedFiles).map((source) => {
                            if (selectedFiles[source]) {
                              return (
                                <span
                                  key={source}
                                  className="summary-tag"
                                  style={{
                                    backgroundColor: getSourceColor(source) + "20",
                                    borderColor: getSourceColor(source),
                                    color: getSourceColor(source),
                                  }}
                                >
                                  {getSourceIcon(source)} {getSourceLabel(source)}
                                </span>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="upload-progress">
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <span className="progress-text">{uploadProgress}%</span>
                      </div>
                    )}

                    {/* Upload Result */}
                    {uploadResult && (
                      <div
                        className={`upload-result ${uploadResult.success ? "success" : "error"
                          }`}
                      >
                        {uploadResult.success ? (
                          <>
                            <FaCheckCircle className="result-icon" />
                            <div className="result-content">
                              <h4>Upload Successful!</h4>
                              <p>Date: {formatDate(uploadResult.data.date)}</p>
                              <p>Batch ID: {uploadResult.data.batchId}</p>
                              <p>
                                Items Inserted:{" "}
                                {uploadResult.data.summary.totalItemsInserted}
                              </p>
                              <p>
                                Items Updated:{" "}
                                {uploadResult.data.summary.totalItemsUpdated}
                              </p>
                              {uploadResult.data.summary.totalValue !== undefined && (
                                <p>
                                  Total Value: ₹{uploadResult.data.summary.totalValue.toLocaleString("en-IN")}
                                </p>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <FaTimesCircle className="result-icon" />
                            <div className="result-content">
                              <h4>Upload Failed</h4>
                              <p>{uploadResult.error}</p>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* Submit Button */}
                    <button
                      type="submit"
                      className="upload-submit-btn"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>
                          <FaSpinner className="spinning" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <FaUpload /> Upload Inventory
                        </>
                      )}
                    </button>
                  </Form>
                )}
              </Formik>
            </div>
          </div>

          {/* Upload History */}
          <div className="upload-history-container">
            <div className="upload-history-card">
              <h3>
                <FaHistory /> Upload History
              </h3>

              {isLoadingHistory ? (
                <div className="history-loading">
                  <FaSpinner className="spinning" />
                  <p>Loading history...</p>
                </div>
              ) : uploadHistory.length === 0 ? (
                <div className="history-empty">
                  <FaDatabase className="empty-icon" />
                  <p>No uploads yet</p>
                  <span>Upload your first inventory file</span>
                </div>
              ) : (
                <div className="history-list">
                  {uploadHistory.map((item) => (
                    <div key={item.date} className="history-item">
                      <div className="history-date">
                        <FaCalendarAlt />
                        <span>{formatDate(item.date)}</span>
                      </div>
                      <div className="history-stats">
                        <div className="stat-item online">
                          <span className="stat-dot" />
                          <span>Online: {item.online?.items || 0}</span>
                        </div>
                        <div className="stat-item offline">
                          <span className="stat-dot" />
                          <span>Offline: {item.offline?.items || 0}</span>
                        </div>
                        <div className="stat-item showroom">
                          <span className="stat-dot" />
                          <span>Showroom: {item.showroom?.items || 0}</span>
                        </div>
                      </div>
                      <div className="history-total">
                        Total: {item.totalItems || 0} items
                      </div>
                      <button
                        className="history-delete-btn"
                        onClick={() => handleDeleteDate(item.date)}
                      >
                        <FaTrash />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Delete Modal */}
      {showDeleteModal && (
        <div
          className="confirm-modal-overlay"
          onClick={() => !isDeleting && setShowDeleteModal(false)}
        >
          <div
            className="confirm-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <div className="confirm-modal-icon">
                <FaExclamationTriangle />
              </div>
              <button
                className="confirm-modal-close"
                onClick={() => !isDeleting && setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                <FaTimes />
              </button>
            </div>
            <div className="confirm-modal-body">
              <h3>Confirm Deletion</h3>
              <p>
                Are you sure you want to delete all inventory data for{" "}
                <strong>{formatDate(deleteDate)}</strong>?
                <br />
                <span style={{ color: "#ef4444", fontSize: "13px" }}>
                  This action cannot be undone.
                </span>
              </p>
            </div>
            <div className="confirm-modal-footer">
              <button
                className="confirm-modal-btn cancel"
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="confirm-modal-btn confirm"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <FaSpinner className="spinning" />
                    Deleting...
                  </>
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Upload;