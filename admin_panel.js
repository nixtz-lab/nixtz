/**
 * admin_panel.js
 * Logic for Nixtz Admin Dashboard.
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Auth Check & Utilities ---
    const token = localStorage.getItem('tmt_auth_token');
    const role = localStorage.getItem('tmt_user_role');
    
    // Simple redirect if not admin
    if (!token || (role !== 'admin' && role !== 'superadmin')) {
        window.location.href = 'index.html';
        return;
    }

    const isSuperAdmin = role === 'superadmin';

    // --- API Helper ---
    async function callApi(endpoint, method = 'GET', body = null) {
        try {
            const options = {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            };
            if (body) options.body = JSON.stringify(body);

            const res = await fetch(endpoint, options);
            const data = await res.json();

            if (!res.ok) {
                if (window.showMessage) window.showMessage(data.message || 'Operation failed', true);
                return null;
            }
            return data.data || data; 

        } catch (err) {
            console.error(err);
            if (window.showMessage) window.showMessage('Network Error', true);
            return null;
        }
    }

    // --- Tab Switching ---
    const tabs = document.querySelectorAll('.tab-button');

    function switchTab(targetId) {
        // 1. UI Update
        tabs.forEach(t => {
            t.classList.remove('text-nixtz-primary', 'border-nixtz-primary');
            t.classList.add('text-gray-400', 'border-transparent', 'hover:border-nixtz-primary/50');
        });
        const activeTab = document.querySelector(`[data-tab="${targetId}"]`);
        if (activeTab) {
            activeTab.classList.remove('text-gray-400', 'border-transparent', 'hover:border-nixtz-primary/50');
            activeTab.classList.add('text-nixtz-primary', 'border-nixtz-primary');
        }

        // 2. Content Toggle
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        const content = document.querySelector(`[data-tab-content="${targetId}"]`);
        if (content) content.classList.remove('hidden');

        // 3. Data Load Triggers
        if (targetId === 'approvals') loadPendingUsers();
        if (targetId === 'users') loadActiveUsers();
        if (targetId === 'memberships') loadMemberships();
        if (targetId === 'stock-ratings') { 
            setupRatingForm(); 
            loadRatings();
        }
        if (targetId === 'admin-management') setupAdminForm();
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });


    // --- Module: User Approvals ---
    async function loadPendingUsers() {
        const container = document.getElementById('pending-users-list');
        const countBadge = document.getElementById('pending-count');
        container.innerHTML = '<p class="text-gray-500">Loading...</p>';

        const users = await callApi('/api/admin/users/pending');
        
        if (users) {
            countBadge.textContent = users.length;
            if (users.length === 0) {
                container.innerHTML = '<p class="text-gray-500 p-4 bg-gray-800 rounded-lg">No pending users.</p>';
                return;
            }
            
            container.innerHTML = users.map(u => `
                <div class="flex justify-between items-center bg-gray-800 p-4 rounded-lg border border-gray-700 mb-2">
                    <div>
                        <p class="font-bold text-white">${u.username}</p>
                        <p class="text-sm text-gray-400">${u.email}</p>
                    </div>
                    <button data-id="${u._id}" class="approve-user-btn bg-nixtz-secondary hover:bg-[#0da070] text-white px-4 py-2 rounded-full text-sm font-bold transition">
                        Approve
                    </button>
                </div>
            `).join('');

            // Attach event listeners
            container.querySelectorAll('.approve-user-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const id = e.target.dataset.id;
                    const res = await callApi(`/api/admin/users/${id}/approve`, 'PUT');
                    if (res) {
                        window.showMessage('User approved!', false);
                        loadPendingUsers();
                    }
                });
            });
        }
    }


    // --- Module: Active Users ---
    async function loadActiveUsers() {
        const tbody = document.getElementById('active-users-body');
        tbody.innerHTML = '<tr><td colspan="3" class="px-4 py-4 text-sm text-gray-500 text-center">Loading...</td></tr>';

        const users = await callApi('/api/admin/users');
        if (users) {
            tbody.innerHTML = users.map(u => `
                <tr class="bg-nixtz-card border-b border-gray-700 hover:bg-gray-800">
                    <td class="px-4 py-3 text-white">
                        <div class="font-medium">${u.username}</div>
                        <div class="text-xs text-gray-400">${u.email}</div>
                    </td>
                    <td class="px-4 py-3 text-gray-400 text-sm hidden sm:table-cell">${u.role.toUpperCase()}</td>
                    <td class="px-4 py-3">
                        <select data-id="${u._id}" class="membership-select bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600 focus:border-nixtz-primary outline-none">
                            <option value="none" ${u.membership === 'none' ? 'selected' : ''}>None</option>
                            <option value="standard" ${u.membership === 'standard' ? 'selected' : ''}>Standard</option>
                            <option value="platinum" ${u.membership === 'platinum' ? 'selected' : ''}>Platinum</option>
                            <option value="vip" ${u.membership === 'vip' ? 'selected' : ''}>VIP</option>
                        </select>
                    </td>
                </tr>
            `).join('');

            // Attach event listeners
            tbody.querySelectorAll('.membership-select').forEach(select => {
                select.addEventListener('change', async (e) => {
                    const id = e.target.dataset.id;
                    const level = e.target.value;
                    const res = await callApi(`/api/admin/users/${id}/update-membership`, 'PUT', { membership: level });
                    if (res) window.showMessage(`Updated membership to ${level}`, false);
                    else e.target.value = e.target.querySelector('option[selected]').value; // Revert on failure
                });
            });
        }
    }

    // --- Module: Memberships ---
    async function loadMemberships() {
        const container = document.getElementById('membership-config-container');
        container.innerHTML = '<p class="text-gray-500">Loading configurations...</p>';
        
        const configs = await callApi('/api/admin/membership-config');
        if (configs) {
            container.innerHTML = configs.map(c => `
                <div class="bg-gray-800 p-6 rounded-xl border-l-4 ${c.level === 'vip' ? 'border-nixtz-secondary' : 'border-nixtz-primary'} mb-4 shadow-lg">
                    <h3 class="text-xl font-bold mb-3 uppercase text-white">${c.level} Access</h3>
                    <div class="mb-4">
                        <label class="block text-sm text-gray-400 mb-1">Monthly Price ($)</label>
                        <input type="number" value="${c.monthlyPrice}" data-level="${c.level}" data-field="price" class="config-price-input w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-nixtz-primary outline-none">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm text-gray-400 mb-1">Accessible Pages (Comma separated slugs)</label>
                        <textarea data-level="${c.level}" data-field="pages" rows="3" class="config-pages-textarea w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white resize-none focus:border-nixtz-primary outline-none">${c.pages.join(', ')}</textarea>
                    </div>
                    <button data-level="${c.level}" class="save-config-btn w-full py-2 bg-nixtz-primary hover:bg-[#3f3bbf] text-white font-bold rounded transition">
                        Save Configuration
                    </button>
                </div>
            `).join('');

            // Attach event listeners
            container.querySelectorAll('.save-config-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const level = e.target.dataset.level;
                    const price = parseFloat(document.querySelector(`.config-price-input[data-level="${level}"]`).value);
                    const pagesStr = document.querySelector(`.config-pages-textarea[data-level="${level}"]`).value;
                    const pages = pagesStr.split(',').map(s => s.trim()).filter(s => s);
                    
                    if (isNaN(price) || price < 0) { return window.showMessage('Price must be a valid positive number.', true); }

                    e.target.textContent = 'Saving...';
                    e.target.disabled = true;

                    const res = await callApi(`/api/admin/membership-config/${level}`, 'PUT', { pages, monthlyPrice: price });
                    
                    e.target.textContent = 'Save Configuration';
                    e.target.disabled = false;
                    
                    if (res) {
                        window.showMessage(`${level} config saved!`, false);
                    }
                });
            });
        }
    }

    // --- Module: Admin Management ---
    function setupAdminForm() {
        const form = document.getElementById('create-admin-form');
        const msg = document.getElementById('superadmin-message');
        
        // The endpoint call is protected by superAdminAuthMiddleware on the backend now
        if (isSuperAdmin) {
            msg.classList.add('hidden');
            form.classList.remove('hidden');
            
            form.onsubmit = async (e) => {
                e.preventDefault();
                const username = document.getElementById('admin-username').value;
                const email = document.getElementById('admin-email').value;
                const password = document.getElementById('admin-password').value;
                const button = e.target.querySelector('button[type="submit"]');

                button.textContent = 'Creating...';
                button.disabled = true;

                // 🚨 FIX: Using the correct, simplified endpoint: /api/admin/create
                const res = await callApi('/api/admin/create', 'POST', { username, email, password });
                
                button.textContent = 'Create Admin';
                button.disabled = false;

                if (res) {
                    window.showMessage(res.message, false);
                    form.reset();
                }
            };
        } else {
            msg.classList.remove('hidden');
            form.classList.add('hidden');
        }
    }

    // --- Module: Stock Ratings ---
    function getRatingLabel(rating) {
        switch (rating) {
            case 5: return { label: 'Strong Buy', color: 'text-nixtz-secondary' };
            case 4: return { label: 'Buy', color: 'text-green-400' };
            case 3: return { label: 'Hold', color: 'text-yellow-400' };
            case 2: return { label: 'Sell', color: 'text-orange-400' };
            case 1: return { label: 'Strong Sell', color: 'text-tmt-danger' };
            default: return { label: 'N/A', color: 'text-gray-500' };
        }
    }

    async function loadRatings() {
        const listContainer = document.getElementById('tmt-ratings-list');
        listContainer.innerHTML = '<p class="text-gray-500">Loading stock ratings...</p>';

        const ratings = await callApi('/api/admin/stock-ratings');

        if (!ratings) {
            listContainer.innerHTML = '<p class="text-tmt-danger">Failed to load ratings list.</p>';
            return;
        }

        if (ratings.length === 0) {
            listContainer.innerHTML = '<p class="text-gray-500 p-4 bg-gray-800 rounded-lg">No stocks have been rated yet.</p>';
            return;
        }

        listContainer.innerHTML = ratings.map(item => {
            const details = getRatingLabel(item.rating);
            const rankDisplay = item.rank ? `<span class="text-xs font-bold text-nixtz-primary bg-gray-700 px-2 py-0.5 rounded-full">${item.rank}</span>` : '';
            const targetPriceDisplay = (typeof item.targetPrice === 'number') ? `<span class="text-sm font-semibold text-white/70 ml-2">$${item.targetPrice.toFixed(2)}</span>` : '';

            return `
                <div class="tmt-rating-row">
                    <div class="tmt-rating-left">
                        <span class="font-bold text-lg text-white truncate">${item.ticker}</span>
                        ${rankDisplay}
                        ${targetPriceDisplay}
                    </div>
                    <div class="tmt-rating-right">
                        <span class="text-sm font-semibold ${details.color}">${details.label} (${item.rating}/5)</span>
                        <button data-ticker="${item.ticker}" class="delete-rating-btn tmt-delete-btn" title="Delete Rating">
                            <i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (typeof lucide !== 'undefined') { lucide.createIcons(); }

        listContainer.querySelectorAll('.delete-rating-btn').forEach(button => {
            button.addEventListener('click', handleDeleteRating);
        });
    }

    function setupRatingForm() {
        const form = document.getElementById('tmt-rating-form');
        form.removeEventListener('submit', handleSaveRating); // Prevent duplicates
        form.addEventListener('submit', handleSaveRating);
    }

    async function handleSaveRating(e) {
        e.preventDefault();
        const ticker = document.getElementById('tmt-ticker-input').value.trim().toUpperCase();
        const rating = parseInt(document.getElementById('tmt-rating-select').value, 10);
        const rank = document.getElementById('tmt-rank-input').value.trim().toUpperCase();
        const targetPrice = document.getElementById('tmt-target-price-input').value; // String value
        
        const button = e.target.querySelector('button[type="submit"]');

        if (!ticker) { return window.showMessage("Please enter a stock ticker.", true); }
        if (isNaN(rating)) { return window.showMessage("Please select a valid rating.", true); }


        button.disabled = true; button.textContent = 'Saving...';
        
        // Sending rank and targetPrice, which the backend now supports (even if null/empty)
        const result = await callApi('/api/admin/stock-rating', 'POST', { ticker, rating, rank, targetPrice });
        
        button.disabled = false; button.textContent = 'Save Rating';

        if (result) {
            window.showMessage(`Rating for ${ticker} saved!`, false);
            document.getElementById('tmt-rating-form').reset();
            loadRatings();
        }
    }

    async function handleDeleteRating(e) {
        const ticker = e.currentTarget.dataset.ticker;
        if (!confirm(`Are you sure you want to delete the rating for ${ticker}?`)) return;
        
        e.currentTarget.disabled = true;
        
        const result = await callApi(`/api/admin/stock-rating/${ticker}`, 'DELETE');

        if (result) {
            window.showMessage(result.message || `Rating for ${ticker} deleted.`, false);
            loadRatings();
        } else {
            e.currentTarget.disabled = false;
        }
    }


    // --- 9. 52-WEEK LOW SCAN LIST LOGIC (Removed from this Nixtz version, but keeping stubs if needed) ---
    // If you need the 52-week low scan tab, you must re-add the HTML and backend routes.

    // --- 10. INITIALIZATION ---
    switchTab('approvals'); // Default tab load
});