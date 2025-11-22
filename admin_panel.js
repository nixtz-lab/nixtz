/**
 * admin_panel.js
 * Handles all frontend logic for the Admin Panel.
 * Depends on global showMessage from script.js
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. UTILITY FUNCTIONS ---
    
    // Get JWT token from local storage
    const getAuthToken = () => localStorage.getItem('tmt_auth_token');
    const getRole = () => localStorage.getItem('tmt_user_role');
    const isSuperAdmin = () => getRole() === 'superadmin';

    // Check if user is logged in and has admin rights (preventing direct access)
    if (!getAuthToken() || !(getRole() === 'admin' || getRole() === 'superadmin')) {
        window.location.href = 'index.html'; // Redirect to home if unauthorized
        return; 
    }
    
    // --- 2. API ABSTRACTION ---
    
    /**
     * Generic function to make authenticated API requests.
     */
    async function callApi(url, method = 'GET', data = null) {
        const token = getAuthToken();
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        const config = {
            method,
            headers,
        };

        if (data) {
            config.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, config);
            const result = await response.json();

            if (response.ok && result.success) {
                return result.data || result;
            } else {
                // Use global showMessage if available, otherwise console.error
                if(typeof window.showMessage === 'function') {
                    window.showMessage(result.message || `API Error (${method} ${url})`, true);
                } else {
                    console.error(result.message || `API Error (${method} ${url})`);
                }
                return null;
            }

        } catch (error) {
            console.error(`Fetch Error ${method} ${url}:`, error);
            if(typeof window.showMessage === 'function') {
                window.showMessage('Network error. Check server connection.', true);
            }
            return null;
        }
    }

    // --- 3. TAB MANAGEMENT ---
    
    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');

    function switchTab(targetTab) {
        tabs.forEach(tab => {
            const tabId = tab.dataset.tab;
            const content = document.querySelector(`[data-tab-content="${tabId}"]`);
            
            if (tabId === targetTab) {
                // Activate Tab
                tab.classList.remove('text-gray-400', 'border-transparent', 'hover:border-tmt-primary/50');
                tab.classList.add('text-tmt-primary', 'border-tmt-primary');
                // Show Content
                if (content) content.classList.remove('hidden');
                
                // Fetch data for the active tab
                if (tabId === 'approvals') fetchPendingUsers();
                if (tabId === 'stock-ratings') { 
                    setupTmtRatingForm();
                    fetchTmtRatings(); // Load the list when the tab opens
                }
                if (tabId === 'memberships') fetchMembershipConfig();
                if (tabId === 'users') fetchActiveUsers();
                if (tabId === 'admin-management') setupAdminManagement();
                // --- NEW SCAN LIST TAB LOGIC ---
                if (tabId === 'scan-list') { 
                    setupScanTickerForm();
                    fetchScanTickers();
                }
                // --- END NEW SCAN LIST TAB LOGIC ---

            } else {
                // Deactivate Tab
                tab.classList.add('text-gray-400', 'border-transparent', 'hover:border-tmt-primary/50');
                tab.classList.remove('text-tmt-primary', 'border-tmt-primary');
                // Hide Content
                if (content) content.classList.add('hidden');
            }
        });
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // --- 4. USER APPROVALS LOGIC (UNCHANGED) ---
    
    async function fetchPendingUsers() {
        const list = document.getElementById('pending-users-list');
        list.innerHTML = '<p class="text-gray-500">Loading pending users...</p>';

        const result = await callApi('/api/admin/users/pending');
        const pendingUsers = result || [];

        if (!result) {
            list.innerHTML = '<p class="text-red-400">Failed to load users.</p>';
            document.getElementById('pending-count').textContent = 'X';
            return;
        }
        
        document.getElementById('pending-count').textContent = pendingUsers.length;

        if (pendingUsers.length === 0) {
            list.innerHTML = '<p class="text-gray-500 p-4 bg-gray-800 rounded-lg">No pending registrations at this time. Good job!</p>';
            return;
        }

        list.innerHTML = pendingUsers.map(user => `
            <div class="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700">
                <div>
                    <p class="font-bold text-white">${user.username}</p>
                    <p class="text-sm text-gray-400">${user.email}</p>
                    <p class="text-xs text-gray-500">Registered: ${new Date(user.createdAt).toLocaleDateString()}</p>
                </div>
                <button data-user-id="${user._id}" class="approve-button py-2 px-4 rounded-full text-sm font-semibold bg-tmt-primary text-tmt-bg hover:bg-[#009287] transition duration-200">
                    Approve
                </button>
            </div>
        `).join('');
        
        // Attach event listeners for approval buttons
        list.querySelectorAll('.approve-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const userId = e.target.dataset.userId;
                const result = await callApi(`/api/admin/users/${userId}/approve`, 'PUT');
                if (result) {
                    window.showMessage(`User ${result.data.username} approved as Standard User!`);
                    fetchPendingUsers(); // Refresh the list
                }
            });
        });
    }

    // --- 5. ACTIVE USERS LOGIC (UNCHANGED) ---

    async function fetchActiveUsers() {
        const body = document.getElementById('active-users-body');
        body.innerHTML = '<tr class="bg-gray-900"><td colspan="3" class="px-4 py-4 text-sm text-gray-500 text-center">Loading user list...</td></tr>';
        
        const activeUsers = await callApi('/api/admin/users');

        if (!activeUsers) {
             body.innerHTML = '<tr class="bg-gray-900"><td colspan="3" class="px-4 py-4 text-sm text-red-400 text-center">Failed to load active users.</td></tr>';
            return;
        }
        
        body.innerHTML = activeUsers.map(user => `
            <tr id="user-row-${user._id}" class="bg-gray-900 hover:bg-gray-800 transition duration-150">
                <td class="px-4 py-4 text-sm font-medium text-white">
                    ${user.username} 
                    <span class="block text-xs text-gray-500">${user.email}</span>
                </td>
                <td class="px-4 py-4 text-sm text-gray-400 hidden sm:table-cell">
                    ${user.role.toUpperCase()}
                    ${user.role === 'superadmin' ? '<span class="text-tmt-secondary ml-1">(Super)</span>' : ''}
                </td>
                <td class="px-4 py-4 text-sm text-white">
                    <select data-user-id="${user._id}" data-current-role="${user.role}" class="membership-select block w-full bg-gray-700 border border-gray-600 rounded-lg py-1 px-2 text-sm focus:ring-tmt-primary focus:border-tmt-primary">
                        <option value="none" ${user.membership === 'none' ? 'selected' : ''}>None</option>
                        <option value="standard" ${user.membership === 'standard' ? 'selected' : ''}>Standard Member</option>
                        <option value="platinum" ${user.membership === 'platinum' ? 'selected' : ''}>Platinum Member</option>
                        <option value="vip" ${user.membership === 'vip' ? 'selected' : ''}>VIP Member</option>
                    </select>
                </td>
            </tr>
        `).join('');
        
        // Attach event listeners for membership changes
        body.querySelectorAll('.membership-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const userId = e.target.dataset.userId;
                const currentRole = e.target.dataset.currentRole;
                const newMembership = e.target.value;
                const originalValue = e.target.querySelector('option[selected]').value;
                
                if (currentRole === 'admin' || currentRole === 'superadmin') {
                     window.showMessage(`Cannot change membership for an ${currentRole} user.`, true);
                     e.target.value = originalValue;
                     return;
                }
                
                const result = await callApi(`/api/admin/users/${userId}/update-membership`, 'PUT', { membership: newMembership });
                
                if (result) {
                    window.showMessage(`User ${result.data.username} membership changed to ${result.data.membership}. They must log out and log back in to refresh access.`, false);
                    e.target.querySelector('option[selected]').removeAttribute('selected');
                    e.target.querySelector(`option[value="${newMembership}"]`).setAttribute('selected', true);
                } else {
                     e.target.value = originalValue;
                }
            });
        });
    }

    // --- 6. MEMBERSHIP CONFIG LOGIC (UNCHANGED) ---
    
    async function fetchMembershipConfig() {
        const container = document.getElementById('membership-config-container');
        container.innerHTML = '<div class="text-gray-500">Loading configurations...</div>';

        const config = await callApi('/api/admin/membership-config');
        
        if (!config) {
            container.innerHTML = '<p class="text-red-400">Failed to load membership configuration.</p>';
            return;
        }

        container.innerHTML = config.map(levelConfig => `
            <div class="bg-gray-800 p-6 rounded-xl shadow-lg border-l-4 ${levelConfig.level === 'vip' ? 'border-tmt-secondary' : 'border-tmt-primary'}">
                <h3 class="text-xl font-extrabold mb-3 uppercase">${levelConfig.level} Access</h3>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-400 mb-1">Monthly Price ($)</label>
                    <input type="number" step="0.01" min="0" value="${levelConfig.monthlyPrice}" data-level="${levelConfig.level}" data-field="price" class="config-input block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-tmt-primary focus:border-tmt-primary">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-400 mb-1">Accessible Page Slugs (Comma separated)</label>
                    <textarea data-level="${levelConfig.level}" data-field="pages" rows="3" class="config-textarea block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none focus:ring-tmt-primary focus:border-tmt-primary">${levelConfig.pages.join(', ')}</textarea>
                </div>
                <button data-level="${levelConfig.level}" class="update-config-button w-full py-2 px-4 rounded-full text-sm font-bold text-tmt-bg bg-tmt-primary hover:bg-[#009287] transition duration-150">
                    Save ${levelConfig.level} Config
                </button>
            </div>
        `).join('');
        
        // Attach event listeners for updating config
        document.querySelectorAll('.update-config-button').forEach(button => {
            button.addEventListener('click', async (e) => {
                const level = e.target.dataset.level;
                const priceInput = document.querySelector(`.config-input[data-level="${level}"]`);
                const pagesTextarea = document.querySelector(`.config-textarea[data-level="${level}"]`);
                const newPrice = parseFloat(priceInput.value);
                const rawPages = pagesTextarea.value;
                const newPages = rawPages.split(',').map(s => s.trim().replace(/\.html/g, '')).filter(s => s.length > 0);
                
                if (isNaN(newPrice) || newPrice < 0) { window.showMessage('Price must be a valid positive number.', true); return; }
                
                e.target.disabled = true; e.target.textContent = 'Saving...';
                const result = await callApi(`/api/admin/membership-config/${level}`, 'PUT', { pages: newPages, monthlyPrice: newPrice });
                e.target.disabled = false; e.target.textContent = `Save ${level} Config`;
                
                if (result) {
                    pagesTextarea.value = newPages.join(', ');
                    window.showMessage(`Configuration for ${level} saved! Users of this level must re-login to see changes.`, false);
                    fetchActiveUsers(); // Refresh users list
                }
            });
        });
    }

    // --- 7. ADMIN MANAGEMENT LOGIC (UNCHANGED) ---

    function setupAdminManagement() {
        const form = document.getElementById('create-admin-form');
        const superadminMsg = document.getElementById('superadmin-message');
        if (isSuperAdmin()) {
            superadminMsg.classList.add('hidden');
            form.classList.remove('hidden');
            form.removeEventListener('submit', handleCreateAdmin); // Prevent duplicates
            form.addEventListener('submit', handleCreateAdmin);
        } else {
            superadminMsg.classList.remove('hidden');
            form.classList.add('hidden');
        }
    }
    
    async function handleCreateAdmin(e) {
        e.preventDefault();
        const username = document.getElementById('admin-username').value.trim();
        const email = document.getElementById('admin-email').value.trim();
        const password = document.getElementById('admin-password').value.trim();
        const button = e.target.querySelector('button[type="submit"]');

        if (password.length < 8) { return window.showMessage("Password must be at least 8 characters.", true); }
        
        button.disabled = true; button.textContent = 'Creating...';
        const result = await callApi('/api/admin/admins/create', 'POST', { username, email, password });
        button.disabled = false; button.textContent = 'Create Admin User';

        if (result) {
            window.showMessage(result.message, false);
            document.getElementById('create-admin-form').reset();
        }
    }

    // --- 8. TMT STOCK RATING LOGIC (UNCHANGED) ---

    function getRatingLabel(rating) {
        switch (rating) {
            case 5: return { label: 'Strong Buy', color: 'text-tmt-primary' };
            case 4: return { label: 'Buy', color: 'text-green-400' };
            case 3: return { label: 'Hold', color: 'text-tmt-secondary' };
            case 2: return { label: 'Sell', color: 'text-orange-400' };
            case 1: return { label: 'Strong Sell', color: 'text-tmt-danger' };
            default: return { label: 'N/A', color: 'text-gray-500' };
        }
    }
    
    async function fetchTmtRatings() {
        const listContainer = document.getElementById('tmt-ratings-list');
        listContainer.innerHTML = '<p class="text-gray-500">Loading rated stocks...</p>';
        
        const ratings = await callApi('/api/admin/stock-ratings');

        if (!ratings) {
            listContainer.innerHTML = '<p class="text-red-400">Failed to load ratings list. Check server logs.</p>';
            return;
        }

        if (ratings.length === 0) {
            listContainer.innerHTML = '<p class="text-gray-500">No stocks have been rated by TMT yet.</p>';
            return;
        }
        
        listContainer.innerHTML = ratings.map(item => {
            const details = getRatingLabel(item.rating);
            const rankDisplay = item.rank ? `<span class="text-xs font-bold text-tmt-secondary bg-gray-700 px-2 py-0.5 rounded-full">${item.rank}</span>` : '';
            const targetPriceDisplay = (typeof item.targetPrice === 'number') ? `<span class="text-sm font-semibold text-white/70">$${item.targetPrice.toFixed(2)}</span>` : '';

            return `
                <div class="tmt-rating-row">
                    <div class="tmt-rating-left">
                        <span class="font-bold text-lg text-white truncate">${item.ticker}</span>
                        ${rankDisplay}
                        ${targetPriceDisplay}
                    </div>
                    <div class="tmt-rating-right">
                        <span class="text-sm font-semibold ${details.color}">${details.label} (${item.rating}/5)</span>
                        <button data-ticker="${item.ticker}" class="delete-rating-btn tmt-delete-btn">
                            <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        listContainer.querySelectorAll('.delete-rating-btn').forEach(button => {
            button.addEventListener('click', handleDeleteTmtRating);
        });
    }

    function setupTmtRatingForm() {
        const form = document.getElementById('tmt-rating-form');
        if (form) {
            form.removeEventListener('submit', handleSaveTmtRating);
            form.addEventListener('submit', handleSaveTmtRating);
        }
    }

    async function handleSaveTmtRating(e) {
        e.preventDefault();
        const ticker = document.getElementById('tmt-ticker-input').value.trim().toUpperCase();
        const rating = parseInt(document.getElementById('tmt-rating-select').value, 10);
        const rank = document.getElementById('tmt-rank-input').value.trim().toUpperCase();
        const targetPrice = document.getElementById('tmt-target-price-input').value;
        
        const button = e.target.querySelector('button[type="submit"]');

        if (!ticker) {
            return window.showMessage("Please enter a stock ticker.", true);
        }

        button.disabled = true; button.textContent = 'Saving...';
        
        const result = await callApi('/api/admin/stock-rating', 'POST', { ticker, rating, rank, targetPrice });
        
        button.disabled = false; button.textContent = 'Save TMT Rating';

        if (result) {
            window.showMessage(`TMT Rating for ${ticker} saved!`, false);
            document.getElementById('tmt-rating-form').reset();
            fetchTmtRatings();
        }
    }

    async function handleDeleteTmtRating(e) {
        const ticker = e.currentTarget.dataset.ticker;
        if (!ticker) return;
        
        e.currentTarget.disabled = true;
        const icon = e.currentTarget.querySelector('i');
        if (icon) icon.classList.add('animate-spin'); 

        const result = await callApi(`/api/admin/stock-rating/${ticker}`, 'DELETE');

        if (result) {
            window.showMessage(result.message || `Rating for ${ticker} deleted.`, false);
            fetchTmtRatings();
        } else {
            e.currentTarget.disabled = false;
            if (icon) icon.classList.remove('animate-spin');
        }
    }


    // --- 9. 52-WEEK LOW SCAN LIST LOGIC (NEW SECTION) ---
    
    function setupScanTickerForm() {
        const form = document.getElementById('scan-ticker-form');
        if (form) {
            form.removeEventListener('submit', handleAddScanTicker);
            form.addEventListener('submit', handleAddScanTicker);
        }
    }

    async function fetchScanTickers() {
        const listContainer = document.getElementById('scan-ticker-list');
        listContainer.innerHTML = '<p class="text-gray-500">Loading scan list...</p>';
        
        const scanList = await callApi('/api/tmt/admin/52-week-scan'); 

        if (!scanList) {
            listContainer.innerHTML = '<p class="text-red-400">Failed to load scan list. Check server logs.</p>';
            return;
        }

        if (scanList.length === 0) {
            listContainer.innerHTML = '<p class="text-gray-500 p-4 bg-gray-800 rounded-lg">The scan list is currently empty.</p>';
            return;
        }
        
        listContainer.innerHTML = scanList.map(item => `
            <div class="tmt-rating-row"> 
                <div class="tmt-rating-left"> 
                    <span class="font-bold text-lg text-white truncate">${item.ticker}</span>
                    ${item.notes ? `<span class="text-xs font-normal text-gray-400 ml-3 truncate">(${item.notes})</span>` : ''}
                </div>
                <div class="tmt-rating-right">
                    <button data-ticker="${item.ticker}" class="delete-scan-ticker-btn tmt-delete-btn">
                        <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                    </button>
                </div>
            </div>
        `).join('');

        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        listContainer.querySelectorAll('.delete-scan-ticker-btn').forEach(button => {
            button.addEventListener('click', handleDeleteScanTicker);
        });
    }

    async function handleAddScanTicker(e) {
        e.preventDefault();
        const ticker = document.getElementById('scan-ticker-input').value.trim().toUpperCase();
        const notes = document.getElementById('scan-ticker-notes').value.trim();
        const button = e.target.querySelector('button[type="submit"]');

        if (!ticker) {
            return window.showMessage("Please enter a stock ticker.", true);
        }

        button.disabled = true; button.textContent = 'Adding...';
        
        const result = await callApi('/api/tmt/admin/52-week-scan', 'POST', { ticker, notes });
        
        button.disabled = false; button.textContent = 'Add Ticker to Scan';

        if (result) {
            window.showMessage(result.message, false);
            document.getElementById('scan-ticker-form').reset();
            fetchScanTickers();
        }
    }
    
    async function handleDeleteScanTicker(e) {
        const ticker = e.currentTarget.dataset.ticker;
        if (!ticker) return;
        
        e.currentTarget.disabled = true;
        const icon = e.currentTarget.querySelector('i');
        if (icon) icon.classList.add('animate-spin'); 

        const result = await callApi(`/api/tmt/admin/52-week-scan/${ticker}`, 'DELETE');

        if (result) {
            window.showMessage(result.message, false);
            fetchScanTickers();
        } else {
            e.currentTarget.disabled = false;
            if (icon) icon.classList.remove('animate-spin');
        }
    }
    
    // --- END 52-WEEK LOW SCAN LIST LOGIC ---


    // --- 10. INITIALIZATION (MODIFIED) ---
    switchTab('approvals');
    setupScanTickerForm(); // <--- ADDED INITIAL SETUP

    // Call createIcons on initial load to render any static icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});