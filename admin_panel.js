/**
 * admin_panel.js
 * Handles all frontend logic for the Admin Panel (Core System).
 * Depends on global showMessage from script.js
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. UTILITY FUNCTIONS ---
    
    // Get JWT token from local storage (using TMT keys for compatibility with backend)
    const getAuthToken = () => localStorage.getItem('nixtz_auth_token');
    const getRole = () => localStorage.getItem('nixtz_user_role');
    const isSuperAdmin = () => getRole() === 'superadmin';

    // Check if user is logged in and has admin rights (preventing direct access)
    // NOTE: This check should be performed by a separate script loading before this one.
    if (!getAuthToken() || !(getRole() === 'admin' || getRole() === 'superadmin')) {
        window.location.href = 'index.html'; // Redirect to home if unauthorized
        return; 
    }
    
    // --- 2. API ABSTRACTION (UNIFIED) ---
    
    async function callApi(url, method = 'GET', data = null) {
        const token = getAuthToken();
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
        const config = { method, headers, };
        if (data) config.body = JSON.stringify(data);

        try {
            const response = await fetch(url, config);
            const result = await response.json();

            if (response.ok && result.success) {
                return result.data || result;
            } else {
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

    // --- 3. TAB MANAGEMENT (Removed Stock Tabs) ---
    
    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.tab-content');

    function switchTab(targetTab) {
        tabs.forEach(tab => {
            const tabId = tab.dataset.tab;
            const content = document.querySelector(`[data-tab-content="${tabId}"]`);
            
            // Standardizing colors to use nixtz-primary
            const activeClass = 'text-nixtz-primary border-nixtz-primary';
            const inactiveClasses = 'text-gray-400 border-transparent hover:border-nixtz-primary/50';

            if (tabId === targetTab) {
                // Activate Tab
                tab.classList.remove(...inactiveClasses.split(' '));
                tab.classList.add(...activeClass.split(' '));
                if (content) content.classList.remove('hidden');
                
                // Fetch data for the active tab
                if (tabId === 'approvals') fetchPendingUsers();
                if (tabId === 'memberships') fetchMembershipConfig();
                if (tabId === 'users') fetchActiveUsers();
                if (tabId === 'admin-management') setupAdminManagement();
                // Removed stock-ratings and scan-list calls
            } else {
                // Deactivate Tab
                tab.classList.remove(...activeClass.split(' '));
                tab.classList.add(...inactiveClasses.split(' '));
                if (content) content.classList.add('hidden');
            }
        });
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // --- 4. USER APPROVALS LOGIC ---
    
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
            list.innerHTML = '<p class="text-gray-500 p-4 bg-nixtz-card rounded-lg">No pending registrations at this time. Good job!</p>';
            return;
        }

        list.innerHTML = pendingUsers.map(user => `
            <div class="flex items-center justify-between p-4 bg-nixtz-card rounded-lg border border-gray-700">
                <div>
                    <p class="font-bold text-white">${user.username}</p>
                    <p class="text-sm text-gray-400">${user.email}</p>
                    <p class="text-xs text-gray-500">Registered: ${new Date(user.createdAt).toLocaleDateString()}</p>
                </div>
                <button data-user-id="${user._id}" class="approve-button py-2 px-4 rounded-full text-sm font-semibold bg-nixtz-secondary text-nixtz-bg hover:bg-[#0da070] transition duration-200">
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

    // --- 5. ACTIVE USERS LOGIC ---

    async function fetchActiveUsers() {
        const body = document.getElementById('active-users-body');
        body.innerHTML = '<tr><td colspan="3" class="px-4 py-4 text-sm text-gray-500 text-center">Loading user list...</td></tr>';
        
        const activeUsers = await callApi('/api/admin/users');

        if (!activeUsers) {
             body.innerHTML = '<tr><td colspan="3" class="px-4 py-4 text-sm text-red-400 text-center">Failed to load active users.</td></tr>';
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
                    ${user.role === 'superadmin' ? '<span class="text-nixtz-secondary ml-1">(Super)</span>' : ''}
                </td>
                <td class="px-4 py-4 text-sm text-white">
                    <select data-user-id="${user._id}" data-current-role="${user.role}" class="membership-select block w-full bg-gray-700 border border-gray-600 rounded-lg py-1 px-2 text-sm focus:ring-nixtz-primary focus:border-nixtz-primary">
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

    // --- 6. MEMBERSHIP CONFIG LOGIC ---
    
    async function fetchMembershipConfig() {
        const container = document.getElementById('membership-config-container');
        container.innerHTML = '<div class="text-gray-500">Loading configurations...</div>';

        const config = await callApi('/api/admin/membership-config');
        
        if (!config) {
            container.innerHTML = '<p class="text-red-400">Failed to load membership configuration.</p>';
            return;
        }

        container.innerHTML = config.map(levelConfig => `
            <div class="bg-nixtz-card p-6 rounded-xl shadow-lg border-l-4 ${levelConfig.level === 'vip' ? 'border-nixtz-secondary' : 'border-nixtz-primary'}">
                <h3 class="text-xl font-extrabold mb-3 uppercase">${levelConfig.level} Access</h3>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-400 mb-1">Monthly Price ($)</label>
                    <input type="number" step="0.01" min="0" value="${levelConfig.monthlyPrice}" data-level="${levelConfig.level}" data-field="price" class="config-input block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:ring-nixtz-primary focus:border-nixtz-primary">
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-400 mb-1">Accessible Page Slugs (Comma separated)</label>
                    <textarea data-level="${levelConfig.level}" data-field="pages" rows="3" class="config-textarea block w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white resize-none focus:ring-nixtz-primary focus:border-nixtz-primary">${levelConfig.pages.join(', ')}</textarea>
                </div>
                <button data-level="${levelConfig.level}" class="update-config-button w-full py-2 px-4 rounded-lg text-sm font-bold text-white bg-nixtz-primary hover:bg-[#3f3bbf] transition duration-150">
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

    // --- 7. ADMIN MANAGEMENT LOGIC ---

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
        // 🚨 CRITICAL FIX: The consolidated route is '/api/admin/create'
        const result = await callApi('/api/admin/create', 'POST', { username, email, password });
        button.disabled = false; button.textContent = 'Create Admin User';

        if (result) {
            window.showMessage(result.message, false);
            document.getElementById('create-admin-form').reset();
        }
    }

    // --- 8. INITIALIZATION ---
    switchTab('approvals'); // Load default tab

    // Call createIcons on initial load to render any static icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});