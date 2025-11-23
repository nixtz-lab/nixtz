/**
 * admin_panel.js
 * Logic for Nixtz Admin Dashboard.
 */

document.addEventListener('DOMContentLoaded', () => {
    
    // --- Auth Check ---
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
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // 1. UI Update - Reset all to gray, set active to Nixtz Primary
            tabs.forEach(t => {
                t.classList.remove('text-nixtz-primary', 'border-nixtz-primary');
                t.classList.add('text-gray-400', 'border-transparent');
            });
            tab.classList.remove('text-gray-400', 'border-transparent');
            tab.classList.add('text-nixtz-primary', 'border-nixtz-primary');

            // 2. Content Toggle
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            const targetId = tab.dataset.tab;
            const content = document.querySelector(`[data-tab-content="${targetId}"]`);
            if (content) content.classList.remove('hidden');

            // 3. Data Load Triggers
            if (targetId === 'approvals') loadPendingUsers();
            if (targetId === 'users') loadActiveUsers();
            if (targetId === 'memberships') loadMemberships();
            if (targetId === 'stock-ratings') loadRatings(); // Assuming loadRatings exists or will be added
            if (targetId === 'admin-management') setupAdminForm();
        });
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
                container.innerHTML = '<p class="text-gray-500">No pending users.</p>';
                return;
            }
            
            container.innerHTML = users.map(u => `
                <div class="flex justify-between items-center bg-gray-800 p-4 rounded-lg border border-gray-700 mb-2">
                    <div>
                        <p class="font-bold text-white">${u.username}</p>
                        <p class="text-sm text-gray-400">${u.email}</p>
                    </div>
                    <button onclick="approveUser('${u._id}')" class="bg-nixtz-secondary hover:bg-[#0da070] text-white px-4 py-2 rounded-full text-sm font-bold transition">
                        Approve
                    </button>
                </div>
            `).join('');
        }
    }

    // Global function for onclick events in template strings
    window.approveUser = async (id) => {
        const res = await callApi(`/api/admin/users/${id}/approve`, 'PUT');
        if (res) {
            window.showMessage('User approved!', false);
            loadPendingUsers();
        }
    };

    // --- Module: Active Users ---
    async function loadActiveUsers() {
        const tbody = document.getElementById('active-users-body');
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-gray-500">Loading...</td></tr>';

        const users = await callApi('/api/admin/users');
        if (users) {
            tbody.innerHTML = users.map(u => `
                <tr class="bg-gray-900 border-b border-gray-800 hover:bg-gray-800">
                    <td class="px-4 py-3 text-white">
                        <div class="font-medium">${u.username}</div>
                        <div class="text-xs text-gray-500">${u.email}</div>
                    </td>
                    <td class="px-4 py-3 text-gray-400 text-sm">${u.role}</td>
                    <td class="px-4 py-3">
                        <select onchange="changeMembership('${u._id}', this.value)" class="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600 focus:border-nixtz-primary outline-none">
                            <option value="none" ${u.membership === 'none' ? 'selected' : ''}>None</option>
                            <option value="standard" ${u.membership === 'standard' ? 'selected' : ''}>Standard</option>
                            <option value="platinum" ${u.membership === 'platinum' ? 'selected' : ''}>Platinum</option>
                            <option value="vip" ${u.membership === 'vip' ? 'selected' : ''}>VIP</option>
                        </select>
                    </td>
                </tr>
            `).join('');
        }
    }

    window.changeMembership = async (id, level) => {
        const res = await callApi(`/api/admin/users/${id}/update-membership`, 'PUT', { membership: level });
        if (res) window.showMessage(`Updated membership to ${level}`, false);
    };

    // --- Module: Memberships ---
    async function loadMemberships() {
        const container = document.getElementById('membership-config-container');
        container.innerHTML = '<p class="text-gray-500">Loading...</p>';
        
        const configs = await callApi('/api/admin/membership-config');
        if (configs) {
            container.innerHTML = configs.map(c => `
                <div class="bg-gray-800 p-6 rounded-xl border-l-4 ${c.level === 'vip' ? 'border-nixtz-secondary' : 'border-nixtz-primary'} mb-4 shadow-lg">
                    <h3 class="text-xl font-bold mb-3 uppercase text-white">${c.level} Access</h3>
                    <div class="mb-4">
                        <label class="block text-sm text-gray-400 mb-1">Monthly Price ($)</label>
                        <input type="number" value="${c.monthlyPrice}" id="price-${c.level}" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:border-nixtz-primary outline-none">
                    </div>
                    <div class="mb-4">
                        <label class="block text-sm text-gray-400 mb-1">Accessible Pages</label>
                        <textarea id="pages-${c.level}" rows="3" class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white resize-none focus:border-nixtz-primary outline-none">${c.pages.join(', ')}</textarea>
                    </div>
                    <button onclick="saveConfig('${c.level}')" class="w-full py-2 bg-nixtz-primary hover:bg-[#3f3bbf] text-white font-bold rounded transition">
                        Save Configuration
                    </button>
                </div>
            `).join('');
        }
    }

    window.saveConfig = async (level) => {
        const price = parseFloat(document.getElementById(`price-${level}`).value);
        const pagesStr = document.getElementById(`pages-${level}`).value;
        const pages = pagesStr.split(',').map(s => s.trim()).filter(s => s);

        const res = await callApi(`/api/admin/membership-config/${level}`, 'PUT', { pages, monthlyPrice: price });
        if (res) window.showMessage(`${level} config saved!`, false);
    };

    // --- Module: Admin Management ---
    function setupAdminForm() {
        const form = document.getElementById('create-admin-form');
        const msg = document.getElementById('superadmin-message');
        
        if (isSuperAdmin) {
            msg.classList.add('hidden');
            form.classList.remove('hidden');
            
            form.onsubmit = async (e) => {
                e.preventDefault();
                const username = document.getElementById('admin-username').value;
                const email = document.getElementById('admin-email').value;
                const password = document.getElementById('admin-password').value;

                // FIX: URL updated to match the backend route definition
                const res = await callApi('/api/admin/create', 'POST', { username, email, password });
                
                if (res) {
                    window.showMessage('Admin user created successfully!', false);
                    form.reset();
                }
            };
        } else {
            msg.classList.remove('hidden');
            form.classList.add('hidden');
        }
    }

    // --- Module: Stock Ratings (Placeholder for completeness if needed) ---
    async function loadRatings() {
        const list = document.getElementById('tmt-ratings-list');
        if (!list) return;
        list.innerHTML = '<p class="text-gray-500 text-sm">Loading ratings...</p>';
        
        const ratings = await callApi('/api/admin/stock-ratings');
        if (ratings) {
            list.innerHTML = ratings.map(r => `
                <div class="tmt-rating-row">
                    <div class="tmt-rating-left">
                        <span class="font-bold text-white">${r.ticker}</span>
                        <span class="text-xs text-gray-400">R:${r.rating}/5</span>
                    </div>
                    <div class="tmt-rating-right">
                        <button onclick="deleteRating('${r.ticker}')" class="tmt-delete-btn hover:bg-red-900/50 hover:text-red-400 transition">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </div>
            `).join('');
            if(window.lucide) window.lucide.createIcons();
        }

        // Setup form listener for ratings if not already done
        const ratingForm = document.getElementById('tmt-rating-form');
        if(ratingForm) {
            ratingForm.onsubmit = async (e) => {
                e.preventDefault();
                const ticker = document.getElementById('tmt-ticker-input').value;
                const rating = document.getElementById('tmt-rating-select').value;
                
                const res = await callApi('/api/admin/stock-rating', 'POST', { ticker, rating, rank: '', targetPrice: 0 });
                if(res) {
                    window.showMessage(`Rating for ${ticker} saved.`, false);
                    loadRatings(); // Refresh list
                    ratingForm.reset();
                }
            }
        }
    }
    
    window.deleteRating = async (ticker) => {
        if(!confirm(`Delete rating for ${ticker}?`)) return;
        const res = await callApi(`/api/admin/stock-rating/${ticker}`, 'DELETE');
        if(res) {
            window.showMessage('Rating deleted.', false);
            loadRatings();
        }
    }

    // --- Initialization ---
    loadPendingUsers(); // Default tab load
});