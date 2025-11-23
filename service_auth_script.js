/**
 * service_auth_script.js
 * Enforces 'login' mode and hides the registration option when the user is redirected 
 * from a service-specific page (like laundry staff or admin) using the ?service=true flag.
 * This script runs after auth_script.js and overrides the mode display if the flag is present.
 */

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const isServiceRedirect = urlParams.get('service') === 'true';

    // If the service flag is not present, let auth_script.js handle the standard flow.
    if (!isServiceRedirect) {
        return;
    }

    // --- References ---
    const pageTitle = document.getElementById('page-title');
    const formTitle = document.getElementById('form-title');
    const formSubtitle = document.getElementById('form-subtitle');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const switchTextP = document.getElementById('switch-text');

    // 1. Force LOGIN mode display and update text
    if(pageTitle) pageTitle.textContent = 'Nixtz | Service Sign In';
    if(formTitle) formTitle.textContent = 'Service Access Required.';
    if(formSubtitle) formSubtitle.textContent = 'Please sign in with your authorized staff credentials.';
    
    // Ensure the correct forms are visible/hidden
    if(loginForm) loginForm.classList.remove('hidden');
    if(registerForm) registerForm.classList.add('hidden'); 

    // 2. Hide/override the registration switch link
    if(switchTextP) {
        switchTextP.innerHTML = `<p class="text-gray-400">Account access is restricted to administrator-created users only.</p>`;
    }
    
    // Note: All form submission handlers (login, forgot password) are managed by auth_script.js.
});