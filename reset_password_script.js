/**
 * reset_password_script.js
 * Handles the logic for the password reset page, including token validation and
 * new password submission.
 */

document.addEventListener('DOMContentLoaded', () => {

    // --- 1. Element References ---
    const loadingMessage = document.getElementById('initial-loading');
    const resetForm = document.getElementById('reset-form');
    const newPasswordInput = document.getElementById('new-password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const successMessageContainer = document.getElementById('success-message');
    const resetButton = document.getElementById('reset-button');
    
    // Assumes showMessage is available globally (from script.js)
    const showMessage = window.showMessage || console.error;

    // --- 2. Utility & Core Functions ---

    /**
     * Reads the token from the URL query parameters.
     * @returns {string|null} The reset token or null if not found.
     */
    function getTokenFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('token');
    }
    
    /**
     * Toggles visibility of UI sections.
     */
    function setUiState(state) {
        // Hide all major functional blocks initially
        loadingMessage.classList.add('hidden');
        resetForm.classList.add('hidden');
        successMessageContainer.classList.add('hidden');

        if (state === 'loading') {
            loadingMessage.classList.remove('hidden');
            loadingMessage.querySelector('p').textContent = "Validating reset token...";
        } else if (state === 'form') {
            resetForm.classList.remove('hidden');
        } else if (state === 'success') {
            successMessageContainer.classList.remove('hidden');
        } else if (state === 'error') {
             // Use the loading message container to display a static error
            loadingMessage.classList.remove('hidden');
            loadingMessage.querySelector('p').textContent = "Error: Invalid or expired reset link.";
            // Optionally, hide the spinner
            loadingMessage.querySelector('svg').classList.add('hidden');
        }
    }

    /**
     * Attempts to verify the token with the backend and proceed.
     */
    async function verifyTokenAndStart() {
        const token = getTokenFromUrl();
        if (!token) {
            return setUiState('error');
        }
        
        setUiState('loading');

        // Note: You must implement a simple GET/POST route on the server
        // (e.g., /api/auth/verify-token) that checks if the token exists and is not expired.
        // For now, we simulate success and skip the token verification API call, 
        // relying on the final reset-password step to validate.

        // We jump straight to showing the form, assuming the backend reset route 
        // will handle the actual validation upon submission.
        setUiState('form');
    }

    /**
     * Handles the new password submission.
     */
    async function handleResetSubmit(e) {
        e.preventDefault();
        
        const token = getTokenFromUrl();
        const newPassword = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        
        if (newPassword !== confirmPassword) {
            return showMessage("Passwords do not match.", true);
        }
        if (newPassword.length < 8) {
            return showMessage("Password must be at least 8 characters.", true);
        }

        resetButton.disabled = true;
        resetButton.textContent = 'Processing...';

        try {
            const response = await fetch('/api/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    token, 
                    newPassword 
                }),
            });

            const result = await response.json();
            
            if (response.ok && result.success) {
                showMessage('Password updated successfully!', false);
                setUiState('success');
            } else {
                showMessage(result.message || 'Reset failed. Link may be expired.', true);
                resetButton.disabled = false;
                resetButton.textContent = 'Reset Password';
                setUiState('form'); // Show form again with error
            }

        } catch (error) {
            console.error('Network Error during reset:', error);
            showMessage('Network error. Could not connect to the server.', true);
            resetButton.disabled = false;
            resetButton.textContent = 'Reset Password';
        }
    }

    // --- 3. Initialization and Event Listener Setup ---

    // 1. Initial check on load
    verifyTokenAndStart();

    // 2. Attach submit listener to the form
    resetForm.addEventListener('submit', handleResetSubmit);
});