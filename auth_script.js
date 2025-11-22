/**
 * auth_script.js
 * Handles form switching and AJAX communication with Express API.
 * FIX: Ensures the successful JWT token and new user data is saved to localStorage for session persistence.
 * NEW: Added Forgot Password functionality and Password Confirmation check for registration.
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Element References ---
    const pageTitle = document.getElementById('page-title');
    const formTitle = document.getElementById('form-title');
    const formSubtitle = document.getElementById('form-subtitle');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const forgotPasswordLink = document.getElementById('forgot-password-link'); // NEW REFERENCE
    // Using a reliable selector for the switch text paragraph
    const switchTextP = document.querySelector('.text-center.pt-2.text-sm p'); 
    const msgBox = document.getElementById('message-box');
    const msgText = document.getElementById('message-text');

    // --- 2. Utility Functions ---

    /**
     * Use a generic showMessage function for feedback
     * @param {string} text - The message to display.
     * @param {boolean} isError - True for red error, false for green success.
     */
    function showMessage(text, isError = false) {
        if (!msgBox || !msgText) return console.error("Message box elements not found.");

        msgText.textContent = text;
        
        // Reset classes
        msgBox.classList.remove('hidden', 'bg-red-500', 'bg-tmt-primary', 'opacity-0');
        
        if (isError) {
            msgBox.classList.add('bg-red-500'); 
        } else {
            msgBox.classList.add('bg-tmt-primary'); 
        }

        // Show with transition
        msgBox.classList.add('opacity-100');

        // Hide after 5 seconds
        setTimeout(() => {
            msgBox.classList.remove('opacity-100');
            msgBox.classList.add('opacity-0');
            // Wait for transition to finish before hiding
            setTimeout(() => msgBox.classList.add('hidden'), 300); 
        }, 5000);
    }

    /**
     * Toggles the form between Login and Register mode.
     * @param {string} [mode] - Optional: 'login' or 'join'. Defaults to URL param.
     */
    function updateFormMode(mode) {
        const urlParams = new URLSearchParams(window.location.search);
        mode = mode || urlParams.get('mode'); 

        const isLoginMode = mode !== 'join'; 

        if (isLoginMode) {
            // Show Login Form
            pageTitle.textContent = 'TMT | Sign In';
            formTitle.textContent = 'Welcome Back.';
            formSubtitle.textContent = 'Sign in to access your dashboard and tools.';
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
            
            // Set switch link to join
            switchTextP.innerHTML = `Don't have an account? 
                <a href="?mode=join" data-mode="join" class="font-medium text-tmt-secondary hover:text-tmt-primary transition duration-200 ml-1">Join Now</a>`;

        } else {
            // Show Register Form
            pageTitle.textContent = 'TMT | Join';
            formTitle.textContent = 'Join the Tree.';
            formSubtitle.textContent = 'Create your account to start your journey.';
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');

            // Set switch link to login
            switchTextP.innerHTML = `Already a member? 
                <a href="?mode=login" data-mode="login" class="font-medium text-tmt-primary hover:text-tmt-secondary transition duration-200 ml-1">Sign In</a>`;
        }
    }
    
    /**
     * Handles the API call for both Login and Registration.
     */
    async function handleAuth(url, data, form) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            const result = await response.json();
            
            if (response.ok && result.success) {
                // --- Success ---
                showMessage(result.message, false);
                form.reset(); 

                if (url.includes('/login')) {
                    // *** CRITICAL FIX: Save the JWT token and all new user data ***
                    localStorage.setItem('tmt_auth_token', result.token); 
                    localStorage.setItem('tmt_username', result.username); 
                    localStorage.setItem('tmt_user_role', result.role); // NEW
                    localStorage.setItem('tmt_user_membership', result.membership); // NEW
                    localStorage.setItem('tmt_page_access', JSON.stringify(result.pageAccess)); // NEW
                    
                    // Redirect to the main page after a successful login
                    setTimeout(() => {
                        window.location.href = 'index.html'; 
                    }, 1000);

                } else if (url.includes('/register')) {
                    // After registration, switch to login mode (user must wait for approval)
                    setTimeout(() => {
                         updateFormMode('login'); // Force switch to login
                         // Update URL without reloading
                         window.history.pushState(null, '', '?mode=login');
                    }, 1000);
                }

            } else {
                // --- Failure (from server) ---
                showMessage(result.message || 'An unknown error occurred.', true);
            }

        } catch (error) {
            // --- Network/Fetch Error ---
            console.error('Network or Fetch Error:', error);
            showMessage('Could not connect to the server. Please check your network.', true);
        }
    }
    
    /**
     * Handles the Forgot Password link click event.
     */
    async function requestPasswordReset(email) {
        const apiUrl = '/api/auth/forgot-password';
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const result = await response.json();
            
            if (response.ok && result.success) {
                showMessage(result.message, false);
            } else {
                showMessage(result.message || 'Error processing request. Account may not exist.', true);
            }

        } catch (error) {
            console.error('Network Error:', error);
            showMessage('Could not connect to the server for password reset.', true);
        }
    }


    // --- 3. Event Listeners ---
    
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value.trim();
            
            if (!email || !password) {
                return showMessage("Please fill in all fields.", true);
            }
            handleAuth('/api/auth/login', { email, password }, loginForm);
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('reg-username').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value.trim();
            // NEW: Get the confirm password value
            const confirmPassword = document.getElementById('reg-confirm-password').value.trim();
            
            if (!username || !email || !password || !confirmPassword) { // Check if all fields are filled
                return showMessage("Please fill in all fields.", true);
            }
            if (password.length < 8) {
                 return showMessage("Password must be at least 8 characters.", true);
            }
            // NEW: Check if passwords match
            if (password !== confirmPassword) {
                 return showMessage("Passwords do not match.", true);
            }
            
            handleAuth('/api/auth/register', { username, email, password }, registerForm);
        });
    }
    
    // *** NEW: Forgot Password Link Listener ***
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', () => {
            const email = prompt("Please enter your email address to receive a password reset link:");
            if (email) {
                requestPasswordReset(email.trim());
            }
        });
    }


    // *** Event listener for the dynamic link ***
    if (switchTextP) {
        switchTextP.addEventListener('click', (e) => {
            const target = e.target.closest('a');
            
            if (target) {
                e.preventDefault(); // Stop the link from navigating
                
                const url = new URL(target.href);
                const newMode = url.searchParams.get('mode');
                
                window.history.pushState(null, '', `?mode=${newMode}`);
                
                updateFormMode(newMode);
            }
        });
    }


    // --- 4. Initialization ---
    updateFormMode();
});