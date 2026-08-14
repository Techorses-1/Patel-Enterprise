import React, { useState, useEffect } from "react";
import { useNavigate, NavLink, useLocation } from "react-router-dom";
import { BiLogOut, BiLogIn } from "react-icons/bi";
import { HiOutlineHome } from "react-icons/hi";
import { FiUser } from "react-icons/fi";
import { FaBox } from "react-icons/fa";
import { GiHamburgerMenu } from "react-icons/gi";
import { RxCross1 } from "react-icons/rx";
import { TbUpload } from "react-icons/tb";
import logo from "../../assets/logo/logo.png";
import "./Navbar.scss";

const Navbar = ({ children }) => {
    const [toggle, setToggle] = useState(false);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();

    // Check auth on load
    useEffect(() => {
        const checkAuth = async () => {
            try {
                setIsLoading(true);
                const response = await fetch(
                    `${import.meta.env.VITE_API_URL}/auth/me`,
                    {
                        credentials: "include",
                    }
                );

                if (response.ok) {
                    setIsLoggedIn(true);
                } else {
                    setIsLoggedIn(false);
                }
            } catch (error) {
                console.error("Auth check error:", error);
                setIsLoggedIn(false);
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();
    }, []);

    const handleLogout = async () => {
        try {
            await fetch(`${import.meta.env.VITE_API_URL}/auth/logout`, {
                method: "POST",
                credentials: "include",
            });
        } catch (error) {
            console.error("Logout error:", error);
        }

        setIsLoggedIn(false);
        navigate("/login");
    };

    const handleLogin = () => {
        navigate("/login");
    };

    const getPageTitle = () => {
        const route = location.pathname;
        switch (route) {
            case "/dashboard":
                return "Dashboard";
            case "/upload":
                return "Upload Inventory";
            default:
                return "";
        }
    };

    const pageTitle = getPageTitle();

    // Menu items
    const menuItems = [
        {
            id: "dashboard",
            icon: <HiOutlineHome />,
            title: "Dashboard",
            path: "/dashboard",
        },
        {
            id: "upload",
            icon: <TbUpload />,
            title: "Upload",
            path: "/upload",
        },

        {
            id: "inventory",
            icon: <FaBox />,
            title: "Inventory",
            path: "/inventory",
        }
    ];

    if (isLoading) {
        return (
            <div className="navbar-loading-container">
                <div className="navbar-loading-spinner"></div>
                <p>Loading...</p>
            </div>
        );
    }

    return (
        <>
            <div id="sidebar" className={toggle ? "hide" : ""}>
                <div className="logo">
                    <div className="logoBox">
                        {toggle ? (
                            <GiHamburgerMenu
                                className="menuIconHidden"
                                onClick={() => setToggle(false)}
                            />
                        ) : (
                            <>
                                <img src={logo} alt="Logo" className="sidebar-logo" />
                                <RxCross1
                                    className="menuIconHidden"
                                    onClick={() => setToggle(true)}
                                />
                            </>
                        )}
                    </div>
                </div>

                <ul className="side-menu top">
                    {menuItems.map((item) => (
                        <li key={item.id}>
                            <NavLink
                                to={item.path}
                                className={({ isActive }) => (isActive ? "active" : "")}
                            >
                                <span className="menu-icon">{item.icon}</span>
                                <span className="menu-title">{item.title}</span>
                            </NavLink>
                        </li>
                    ))}

                    {isLoggedIn && (
                        <li className="logout-menu-item">
                            <button className="sidebar-logout-btn" onClick={handleLogout}>
                                <BiLogOut />
                                <span>Logout</span>
                            </button>
                        </li>
                    )}
                </ul>
            </div>

            <div id="content">
                <nav>
                    <div className="nav-main">
                        <GiHamburgerMenu
                            className="menuIcon"
                            onClick={() => setToggle(false)}
                        />

                        {pageTitle && <div className="page-title">{pageTitle}</div>}
                    </div>

                    <div>
                        {!isLoggedIn ? (
                            <button className="icon-button" onClick={handleLogin} title="Login">
                                <BiLogIn />
                            </button>
                        ) : (
                            <div className="profile">
                                <div className="profile-icon" title="Account">
                                    <FiUser />
                                </div>
                                <button className="icon-button" onClick={handleLogout} title="Logout">
                                    <BiLogOut />
                                </button>
                            </div>
                        )}
                    </div>
                </nav>
                {children}
            </div>
        </>
    );
};

export default Navbar;