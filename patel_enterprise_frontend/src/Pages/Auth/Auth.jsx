import { useFormik } from "formik";
import * as Yup from "yup";
import { useState } from "react";
import { FiMail, FiLock, FiUser, FiEye, FiEyeOff } from "react-icons/fi";
import { ToastContainer, toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "react-toastify/dist/ReactToastify.css";
import "./Auth.scss";
import logo from "../../assets/logo/logo.png";

const Auth = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();

    // Axios instance with credentials
    const api = axios.create({
        baseURL: import.meta.env.VITE_API_URL,
        withCredentials: true,
    });

    // Validation schemas
    const loginValidation = Yup.object({
        email: Yup.string()
            .email("Invalid email address")
            .required("Email is required"),
        password: Yup.string()
            .required("Password is required"),
    });

    const registerValidation = Yup.object({
        username: Yup.string()
            .min(3, "Username must be at least 3 characters")
            .required("Username is required"),
        email: Yup.string()
            .email("Invalid email address")
            .required("Email is required"),
        password: Yup.string()
            .min(6, "Password must be at least 6 characters")
            .required("Password is required"),
        confirmPassword: Yup.string()
            .oneOf([Yup.ref("password"), null], "Passwords must match")
            .required("Please confirm your password"),
    });

    const formik = useFormik({
        initialValues: {
            username: "",
            email: "",
            password: "",
            confirmPassword: "",
        },
        validationSchema: isLogin ? loginValidation : registerValidation,
        onSubmit: async (values) => {
            try {
                setIsSubmitting(true);

                if (isLogin) {
                    // LOGIN
                    const response = await api.post("/auth/login", {
                        email: values.email,
                        password: values.password,
                    });

                    toast.success("Login successful! Redirecting...", {
                        position: "top-center",
                        autoClose: 2000,
                    });

                    setTimeout(() => navigate("/dashboard"), 2000);
                } else {
                    // REGISTER
                    const response = await api.post("/auth/register", {
                        username: values.username,
                        email: values.email,
                        password: values.password,
                    });

                    toast.success("Registration successful! Please login.", {
                        position: "top-center",
                        autoClose: 2000,
                    });

                    // Switch to login after 2 seconds
                    setTimeout(() => {
                        setIsLogin(true);
                        formik.resetForm();
                    }, 2000);
                }
            } catch (error) {
                console.error("Auth error:", error);
                let errorMessage = isLogin ? "Login failed" : "Registration failed";
                if (error.response) {
                    errorMessage = error.response.data.message || errorMessage;
                }
                toast.error(errorMessage, {
                    position: "top-center",
                    autoClose: 3000,
                });
            } finally {
                setIsSubmitting(false);
            }
        },
    });

    const toggleMode = () => {
        setIsLogin(!isLogin);
        formik.resetForm();
    };

    return (
        <div className="auth-container">
            <ToastContainer />
            <div className="auth-wrapper">
                {/* LEFT: Welcome Section */}
                <div className="auth-left">
                    <div className="left-inner">
                        <img src={logo} alt="Logo" className="left-logo" />
                        <h1 className="welcome-title">
                            {isLogin ? "Welcome Back" : "Create Account"}
                        </h1>
                        <div className="divider" />
                        <p className="welcome-desc">
                            {isLogin
                                ? "From essence to invoice - streamline every step of your perfume and attar business. Log in to keep your fragrances flowing."
                                : "Join us to manage your perfume inventory seamlessly. Register now and start tracking your fragrances."}
                        </p>
                    </div>
                </div>

                {/* RIGHT: Form Section */}
                <div className="auth-right">
                    <div className="form-bg" aria-hidden="true" />

                    <div className="glass-card">
                        <h2 className="auth-title">{isLogin ? "Sign In" : "Sign Up"}</h2>
                        <p className="auth-subtitle">
                            {isLogin
                                ? "Enter your credentials below"
                                : "Create your account to get started"}
                        </p>

                        <form onSubmit={formik.handleSubmit} className="auth-form">
                            {/* Username - Only for Register */}
                            {!isLogin && (
                                <div className="form-group">
                                    <label htmlFor="username" className="form-label">
                                        <FiUser className="input-icon" />
                                        Username
                                    </label>
                                    <input
                                        id="username"
                                        name="username"
                                        type="text"
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        value={formik.values.username}
                                        className={`form-input ${formik.touched.username && formik.errors.username
                                                ? "error"
                                                : ""
                                            }`}
                                        autoComplete="username"
                                        placeholder="Enter your username"
                                    />
                                    {formik.touched.username && formik.errors.username && (
                                        <div className="error-message">{formik.errors.username}</div>
                                    )}
                                </div>
                            )}

                            {/* Email */}
                            <div className="form-group">
                                <label htmlFor="email" className="form-label">
                                    <FiMail className="input-icon" />
                                    Email Address
                                </label>
                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    onChange={formik.handleChange}
                                    onBlur={formik.handleBlur}
                                    value={formik.values.email}
                                    className={`form-input ${formik.touched.email && formik.errors.email ? "error" : ""
                                        }`}
                                    autoComplete={isLogin ? "username" : "email"}
                                    placeholder="Enter your email"
                                />
                                {formik.touched.email && formik.errors.email && (
                                    <div className="error-message">{formik.errors.email}</div>
                                )}
                            </div>

                            {/* Password */}
                            <div className="form-group">
                                <label htmlFor="password" className="form-label">
                                    <FiLock className="input-icon" />
                                    Password
                                </label>
                                <div className="password-input-container">
                                    <input
                                        id="password"
                                        name="password"
                                        type={showPassword ? "text" : "password"}
                                        onChange={formik.handleChange}
                                        onBlur={formik.handleBlur}
                                        value={formik.values.password}
                                        className={`form-input ${formik.touched.password && formik.errors.password
                                                ? "error"
                                                : ""
                                            }`}
                                        autoComplete={
                                            isLogin ? "current-password" : "new-password"
                                        }
                                        placeholder="Enter your password"
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle"
                                        onClick={() => setShowPassword(!showPassword)}
                                        aria-label={showPassword ? "Hide password" : "Show password"}
                                    >
                                        {showPassword ? <FiEyeOff /> : <FiEye />}
                                    </button>
                                </div>
                                {formik.touched.password && formik.errors.password && (
                                    <div className="error-message">{formik.errors.password}</div>
                                )}
                            </div>

                            {/* Confirm Password - Only for Register */}
                            {!isLogin && (
                                <div className="form-group">
                                    <label htmlFor="confirmPassword" className="form-label">
                                        <FiLock className="input-icon" />
                                        Confirm Password
                                    </label>
                                    <div className="password-input-container">
                                        <input
                                            id="confirmPassword"
                                            name="confirmPassword"
                                            type={showConfirmPassword ? "text" : "password"}
                                            onChange={formik.handleChange}
                                            onBlur={formik.handleBlur}
                                            value={formik.values.confirmPassword}
                                            className={`form-input ${formik.touched.confirmPassword &&
                                                    formik.errors.confirmPassword
                                                    ? "error"
                                                    : ""
                                                }`}
                                            autoComplete="new-password"
                                            placeholder="Confirm your password"
                                        />
                                        <button
                                            type="button"
                                            className="password-toggle"
                                            onClick={() =>
                                                setShowConfirmPassword(!showConfirmPassword)
                                            }
                                            aria-label={
                                                showConfirmPassword ? "Hide password" : "Show password"
                                            }
                                        >
                                            {showConfirmPassword ? <FiEyeOff /> : <FiEye />}
                                        </button>
                                    </div>
                                    {formik.touched.confirmPassword &&
                                        formik.errors.confirmPassword && (
                                            <div className="error-message">
                                                {formik.errors.confirmPassword}
                                            </div>
                                        )}
                                </div>
                            )}

                            <button
                                type="submit"
                                className="submit-button"
                                disabled={isSubmitting}
                            >
                                {isSubmitting
                                    ? isLogin
                                        ? "Logging in..."
                                        : "Registering..."
                                    : isLogin
                                        ? "Sign In"
                                        : "Create Account"}
                            </button>
                        </form>

                        {/* Toggle between Login & Register */}
                        <div className="auth-toggle">
                            <p>
                                {isLogin
                                    ? "Don't have an account?"
                                    : "Already have an account?"}
                                <button
                                    type="button"
                                    className="toggle-button"
                                    onClick={toggleMode}
                                >
                                    {isLogin ? " Sign Up" : " Sign In"}
                                </button>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Auth;