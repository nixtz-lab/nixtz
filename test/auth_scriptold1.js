/**
 * auth_script.js
 * Handles Login, Register, and Forgot Password interactions for Nixtz.
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- Element References ---
    const pageTitle = document.getElementById('page-title');
    const formTitle = document.getElementById('form-title');
    const formSubtitle = document.getElementById('form-subtitle');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const forgotPasswordLink = document.getElementById('forgot-password-link'); 
    const switchTextP = document.getElementById('switch-text');

    // Helper to use global showMessage or fallback to alert
    const showMsg = (text, isError) => {
        if (typeof window.showMessage === 'function') {
            window.showMessage(text, isError);
        } else {
            alert(text);
        }
    };

    // --- View Switching Logic ---
    function updateFormMode(mode) {
        const urlParams = new URLSearchParams(window.location.search);
        mode = mode || urlParams.get('mode'); 

        const isLoginMode = mode !== 'join'; 

        if (isLoginMode) {
            // LOGIN MODE
            if(pageTitle) pageTitle.textContent = 'Nixtz | Sign In';
            if(formTitle) formTitle.textContent = 'Welcome Back.';
            if(formSubtitle) formSubtitle.textContent = 'Sign in to manage your operations.';
            if(loginForm) loginForm.classList.remove('hidden');
            if(registerForm) registerForm.classList.add('hidden');
            
            if(switchTextP) {
                switchTextP.innerHTML = `Don't have an account? 
                <a href="?mode=join" class="font-medium text-nixtz-secondary hover:text-white transition duration-200 ml-1">Join Now</a>`;
            }

        } else {
            // REGISTER MODE
            if(pageTitle) pageTitle.textContent = 'Nixtz | Join';
            if(formTitle) formTitle.textContent = 'Get Started.';
            if(formSubtitle) formSubtitle.textContent = 'Create your account to optimize your business.';
            if(loginForm) loginForm.classList.add('hidden');
            if(registerForm) registerForm.classList.remove('hidden');

            if(switchTextP) {
                switchTextP.innerHTML = `Already a member? 
                <a href="?mode=login" class="font-medium text-nixtz-primary hover:text-white transition duration-200 ml-1">Sign In</a>`;
            }
        }
    }

    // --- API Handling ---
    async function handleAuth(url, data, form) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            
            if (response.ok && result.success) {
                showMsg(result.message, false);
                form.reset(); 

                if (url.includes('/login')) {
                    // Save session data (Keep tmt_ prefix for compatibility with your existing server logic)
                    localStorage.setItem('tmt_auth_token', result.token); 
                    localStorage.setItem('tmt_username', result.username); 
                    localStorage.setItem('tmt_user_role', result.role);
                    localStorage.setItem('tmt_user_membership', result.membership || 'none');
                    
                    // Redirect to Business Dashboard
                    setTimeout(() => {
                        window.location.href = 'business_dashboard.html'; 
                    }, 1000);

                } else if (url.includes('/register')) {
                    // Switch to login after registration
                    setTimeout(() => {
                         window.history.pushState(null, '', '?mode=login');
                         updateFormMode('login');
                    }, 1500);
                }

            } else {
                showMsg(result.message || 'An unknown error occurred.', true);
            }

        } catch (error) {
            console.error('Auth Error:', error);
            showMsg('Network error. Please check your connection.', true);
        }
    }

    // --- Event Listeners ---

    // 1. Switch Mode Click
    if (switchTextP) {
        switchTextP.addEventListener('click', (e) => {
            const target = e.target.closest('a');
            if (target) {
                e.preventDefault();
                const url = new URL(target.href);
                const newMode = url.searchParams.get('mode');
                window.history.pushState(null, '', `?mode=${newMode}`);
                updateFormMode(newMode);
            }
        });
    }

    // 2. Login Submit
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value.trim();
            
            if (!email || !password) return showMsg("Please fill in all fields.", true);
            
            handleAuth('/api/auth/login', { email, password }, loginForm);
        });
    }

    // 3. Register Submit
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('reg-username').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value.trim();
            const confirmPassword = document.getElementById('reg-confirm-password').value.trim();
            
            if (!username || !email || !password) return showMsg("Please fill all fields.", true);
            if (password !== confirmPassword) return showMsg("Passwords do not match.", true);
            if (password.length < 8) return showMsg("Password too short (min 8 chars).", true);
            
            handleAuth('/api/auth/register', { username, email, password }, registerForm);
        });
    }

    // 4. Forgot Password
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', async () => {
            const email = prompt("Enter your email to receive a reset link:");
            if (!email) return;

            try {
                const res = await fetch('/api/auth/forgot-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email.trim() })
                });
                const data = await res.json();
                showMsg(data.message, !data.success);
            } catch (e) {
                showMsg("Network error sending request.", true);
            }
        });
    }

    // Initialize
    updateFormMode();
});