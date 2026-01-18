// --- 1. CONFIGURATION & STATE ---
const supabaseUrl = 'https://kkaelwhdcsgaodbhrxqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrYWVsd2hkY3NnYW9kYmhyeHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTA4NzksImV4cCI6MjA3MTc2Njg3OX0.wSFv1AZgZDXjGHiIwOHyWzqTDk0v6NbR4-2r90iF9ok';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let masterData = [];
let currentTab = 'dashboard';
const tabOrder = ['dashboard', 'applicants', 'branches', 'trash'];
let currentTabIndex = 0;
let isAnimating = false;
const branchOptions = ["Manila Main", "Quezon City", "Makati Hub", "Davao Branch", "Cebu Office"];

// --- 2. INITIALIZATION (Load Shell Components) ---
async function loadComponents() {
    try {
        const sideRes = await fetch('components/sidebar.html');
        document.getElementById('sidebar-container').innerHTML = await sideRes.text();

        const headRes = await fetch('components/header.html');
        document.getElementById('header-container').innerHTML = await headRes.text();
        applySavedSidebarState();
        // Load Sidebar & Header into the main shell
        const [sidebarRes, headerRes] = await Promise.all([
            fetch('components/sidebar.html'),
            fetch('components/header.html')
        ]);

        document.getElementById('sidebar-container').innerHTML = await sidebarRes.text();
        document.getElementById('header-container').innerHTML = await headerRes.text();

        // Default: Load the Dashboard section first
        await loadSection('dashboard');
        
        // Initial data fetch
        fetchData();
    } catch (error) {
        console.error("Error loading shell components:", error);
    }
}

// --- 3. SECTION LOADER (AJAX Content Swapping) ---
async function loadSection(sectionName) {
    if (isAnimating) return;
    const target = document.getElementById('main-content-area');
    const newIndex = tabOrder.indexOf(sectionName);
    
    // Determine Phone-style Carousel Direction
    const directionClass = newIndex > currentTabIndex ? 'slide-up' : 'slide-down';
    isAnimating = true;

    // Fade & Slide Out
    target.classList.add(`${directionClass}-out`);

    setTimeout(async () => {
        try {
            const response = await fetch(`sections/${sectionName}.html`);
            const html = await response.text();
            
            target.innerHTML = html;
            target.classList.remove(`${directionClass}-out`);
            target.classList.add(`${directionClass}-in`);

            currentTab = sectionName;
            currentTabIndex = newIndex;
            
            updateSidebarUI(sectionName);
            renderCurrentTab();

            setTimeout(() => {
                target.classList.remove(`${directionClass}-in`);
                isAnimating = false;
            }, 400);
        } catch (e) { console.error(e); isAnimating = false; }
    }, 400);
}

async function processAssignment(id) {
    const branch = document.getElementById('branch-select').value;
    const btn = document.getElementById('confirmAssignBtn');
    
    btn.disabled = true;
    btn.innerText = "Processing...";

    const { error } = await _supabase.from('applicants')
        .update({ 
            status: 'Approved', 
            assigned_branch: branch,
            updated_at: new Date() 
        }).eq('id', id);

    if (!error) {
        closeModal('assignModal');
        fetchData(); // Refresh data
    }
    btn.disabled = false;
    btn.innerText = "Confirm Deployment";
}

async function rejectApplicant(id) {
    const confirm = await askModal("Reject Applicant?", "This will move them to the Trash Bin.");
    if (confirm) {
        await _supabase.from('applicants').update({ status: 'Rejected' }).eq('id', id);
        fetchData();
    }
}

/**
 * STEP 1: Load the Profile Modal (AJAX)
 * This is what the "Hire" button in your table should call.
 */
async function openViewModal(id) {
    // 1. Find the applicant data
    const app = masterData.find(a => a.id === id);
    if (!app) return;

    try {
        // 2. Fetch the external HTML component
        const response = await fetch('components/profile-modal.html');
        const html = await response.text();

        // 3. Target the container in your main-dashboard.html
        const container = document.getElementById('viewModal');
        container.innerHTML = html;
        container.classList.add('active');

        // 4. Populate the data into the IDs inside profile-modal.html
        document.getElementById('v-full-name').innerText = `${app.first_name} ${app.last_name}`;
        document.getElementById('v-position').innerText = `Applying for: ${app.desired_position}`;
        document.getElementById('v-email').innerText = app.email;
        document.getElementById('v-phone').innerText = app.phone || 'N/A';
        document.getElementById('v-dob').innerText = app.dob;
        document.getElementById('v-salary').innerText = app.salary_range || 'N/A';
        document.getElementById('v-id-type').innerText = app.id_type || 'N/A';
        document.getElementById('v-experience').innerText = app.security_experience || "No experience listed.";
        
        // Load the ID Image
        const img = document.getElementById('v-id-img');
        img.src = app.valid_id_url || 'Resources/no-image.png';

        // 5. Setup Action Buttons inside the Profile Modal
        
        // Button: View Resume (opens PDF in new tab)
        document.getElementById('v-resume-btn').onclick = () => window.open(app.resume_url, '_blank');

        // Button: Reject (moves to trash)
        document.getElementById('v-reject-btn').onclick = () => {
            window.closeModal('viewModal');
            rejectApplicant(app.id);
        };

        // Button: Approve & Deploy (THIS OPENS THE BRANCH SELECTOR)
        document.getElementById('v-approve-btn').onclick = () => {
            // Close this profile modal
            window.closeModal('viewModal');
            // Small delay for smooth transition, then open the Assign Modal
            setTimeout(() => {
                openAssignModal(app.id, `${app.first_name} ${app.last_name}`);
            }, 300);
        };

    } catch (error) {
        console.error("Error loading profile modal:", error);
    }
}

function openImagePreview(src) {
    if (!src || src.includes('no-image')) return; // Don't open if image is missing
    
    const viewer = document.getElementById('imageViewerModal');
    const fullImg = document.getElementById('full-preview-img');
    
    fullImg.src = src;
    viewer.classList.add('active');
}
function closeImagePreview() {
    document.getElementById('imageViewerModal').classList.remove('active');
}

/**
 * STEP 2: The Branch Assignment Modal
 * This is called only AFTER the profile is reviewed.
 */
function openAssignModal(id, name) {
    const modal = document.getElementById('assignModal');
    document.getElementById('assign-applicant-name').innerText = name;
    modal.classList.add('active');
    
    // Set the logic for the final deployment button
    document.getElementById('confirmAssignBtn').onclick = () => processAssignment(id);
}

function closeProfileModal() {
    const container = document.getElementById('viewModal');
    container.classList.remove('active');
    // Optional: Clear innerHTML to save memory
    setTimeout(() => { container.innerHTML = ''; }, 300);
}




// --- 4. DATA FETCHING & AUTO-DELETE ---
async function fetchData() {
    const { data, error } = await _supabase.from('applicants').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);
    
    masterData = data;
    
    // Auto-delete Rejected items after 3 days
    const now = new Date();
    const trashItems = masterData.filter(a => a.status?.toLowerCase() === 'rejected');
    for (let item of trashItems) {
        const rejectedDate = new Date(item.updated_at || item.created_at);
        const diffDays = Math.ceil((now - rejectedDate) / (1000 * 60 * 60 * 24));
        if (diffDays >= 3) {
            await _supabase.from('applicants').delete().eq('id', item.id);
        }
    }

    renderCurrentTab();
    updateGlobalUI(); // Stats & Notifications
}

// --- 5. UI DISPATCHER (Decides what to render) ---
function renderCurrentTab() {
    if (currentTab === 'dashboard') {
        renderDashboardStats();
        renderCharts();
    } else if (currentTab === 'applicants') {
        renderTableRows(masterData);
    } else if (currentTab === 'branches') {
        renderAccordions();
    } else if (currentTab === 'trash') {
        renderTrashBin();
    }
}

// --- 6. RENDERING FUNCTIONS ---

function updateGlobalUI() {
    const pendingApps = masterData.filter(a => a.status?.toLowerCase() === 'pending');
    
    // Notification Badge (in header.html)
    const badge = document.getElementById('notif-badge');
    if (badge) {
        badge.innerText = pendingApps.length;
        badge.style.display = pendingApps.length > 0 ? 'flex' : 'none';
    }

    // If dashboard is loaded, update cards
    if (currentTab === 'dashboard') renderDashboardStats();
}

function renderDashboardStats() {
    const statTotal = document.getElementById('stat-total');
    if (!statTotal) return; // Dashboard HTML not loaded yet

    statTotal.innerText = masterData.length;
    document.getElementById('stat-pending').innerText = masterData.filter(a => a.status?.toLowerCase() === 'pending').length;
    document.getElementById('stat-approved').innerText = masterData.filter(a => a.status?.toLowerCase() === 'approved').length;
}

/**
 * 1. Render Table with Pagination & 2 Action Buttons
 */
function renderTableRows(list) {
    const tbody = document.getElementById('applicant-table-body');
    if (!tbody) return;

    // Filter out Rejected for the active hiring pipeline
    const activeData = list.filter(a => a.status?.toLowerCase() !== 'rejected');
    
    // Pagination Logic
    const totalItems = activeData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const paginatedItems = activeData.slice(start, end);

    // Update Pagination Info UI
    document.getElementById('page-start').innerText = totalItems ? start + 1 : 0;
    document.getElementById('page-end').innerText = Math.min(end, totalItems);
    document.getElementById('page-total').innerText = totalItems;
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage === totalPages || totalPages === 0;

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:50px; color:#aaa;">No applicants found.</td></tr>`;
        return;
    }

    tbody.innerHTML = paginatedItems.map(app => {
        const fullName = `${app.first_name} ${app.last_name}`;
        const isNew = !app.is_read; // Assuming is_read column exists

        return `
            <tr>
        <td style="padding-left: 25px;">
            <div style="font-weight: 700; color: #2d3436;">${fullName}</div>
            <div style="font-size: 11px; color: ${app.is_read ? '#aaa' : 'var(--primary-red)'}">
                ${app.is_read ? 'Reviewing' : '● New Application'}
            </div>
        </td>
        <td><span class="position-tag">${app.desired_position}</span></td>
        <td><span class="badge ${app.status.toLowerCase()}">${app.status}</span></td>
        <td style="text-align: center;">
            <div style="display: flex; justify-content: center; gap: 8px;">
                
                <!-- HIRE: Now opens the Profile Modal First -->
                <button class="btn-hire" onclick="openViewModal('${app.id}')">
                    <i class="fas fa-user-check"></i> Hire
                </button>

                <!-- REFUSE: Quick action to move to Trash -->
                <button class="btn-refuse" onclick="rejectApplicant('${app.id}')">
                    <i class="fas fa-user-slash"></i>
                </button>
                
            </div>
        </td>
    </tr>`;
    }).join('');
}

function renderAccordions() {
    const container = document.getElementById('branch-accordion-container');
    if (!container) return;

    container.innerHTML = branchOptions.map(branch => {
        const guards = masterData.filter(a => a.assigned_branch === branch && a.status === 'Approved');
        return `
            <div class="branch-accordion">
                <div class="accordion-header" onclick="this.nextElementSibling.classList.toggle('active')">
                    <span><i class="fas fa-building"></i> ${branch}</span>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <span style="font-size: 0.85rem; color: #888;">${guards.length} Guards</span>
                        <i class="fas fa-chevron-down"></i>
                    </div>
                </div>
                <div class="accordion-content">
                    ${guards.map(g => `
                        <div class="guard-row">
                            <span><i class="fas fa-user-check" style="color: #2ecc71;"></i> ${g.first_name} ${g.last_name}</span>
                            <button onclick="unassign('${g.id}')" style="color:#ff4d4f; background:none; border:none; cursor:pointer;"><i class="fas fa-user-minus"></i></button>
                        </div>`).join('') || '<div style="padding: 10px; color:#ccc;">No guards assigned.</div>'}
                </div>
            </div>`;
    }).join('');
}

function renderTrashBin() {
    const cardContainer = document.getElementById('trash-card-content');
    if (!cardContainer) return;

    const trashList = masterData.filter(a => a.status?.toLowerCase() === 'rejected');
    const bulkBtn = document.getElementById('bulk-delete-btn');

    // 1. Check if Trash is Empty
    if (trashList.length === 0) {
        if (bulkBtn) bulkBtn.style.display = 'none';
        
        cardContainer.innerHTML = `
            <div class="empty-trash-state">
                <!-- Sad Trash Bin Placeholder Image -->
                <img src="https://cdn-icons-png.flaticon.com/512/11329/11329073.png" class="sad-bin-img" alt="Empty Trash">
                <h3>Your trash bin is empty</h3>
                <p>Rejected applications will appear here for 3 days.</p>
            </div>`;
        return;
    }

    // 2. Otherwise, Render the Table
    cardContainer.innerHTML = `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px; text-align: center;">
                            <input type="checkbox" id="select-all-trash" onclick="toggleSelectAllTrash(this)">
                        </th>
                        <th>Applicant Name</th>
                        <th>Position</th>
                        <th>Status</th>
                        <th style="text-align: center;">Actions</th>
                    </tr>
                </thead>
                <tbody id="trash-table-body">
                    <!-- Rows will go here -->
                </tbody>
            </table>
        </div>`;

    const tbody = document.getElementById('trash-table-body');
    tbody.innerHTML = trashList.map(app => `
        <tr>
            <td style="text-align: center;">
                <input type="checkbox" class="trash-check" data-id="${app.id}" onclick="updateTrashBulkUI()">
            </td>
            <td style="font-weight: 700; color: #2d3436;">${app.first_name} ${app.last_name}</td>
            <td><span class="position-tag">${app.desired_position}</span></td>
            <td><span class="badge rejected">Rejected</span></td>
            <td style="text-align: center;">
                <div style="display: flex; justify-content: center; gap: 8px;">
                    <button class="btn-sm btn-view" title="Restore" onclick="restoreApplicant('${app.id}')" style="background:#e6f7ff; color:#1890ff;">
                        <i class="fas fa-undo"></i>
                    </button>
                    <button class="btn-sm btn-delete" title="Permanent Delete" onclick="deleteApp('${app.id}')">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}
// --- 7. TAB & SIDEBAR LOGIC ---

function switchTab(tabId, el) {
    const sectionName = tabId.replace('-tab', '');
    if (sectionName === currentTab) return; // Don't reload if already on tab
    
    loadSection(sectionName);

    // Update Header Title (Optional: if title is in header.html)
    const title = document.getElementById('current-title');
    if (title) title.innerText = sectionName.toUpperCase();
}

function updateSidebarUI(name) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        // Check if the nav item text matches the section name
        if (item.innerText.toLowerCase().includes(name.replace('dashboard', 'dashboard'))) {
            item.classList.add('active');
        }
    });
}

/**
 * Toggles between Rail (collapsed) and Full Sidebar
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const headerBar = document.getElementById('header-container');
    const contentBody = document.getElementById('main-content-area');
    
    if (sidebar && headerBar && contentBody) {
        sidebar.classList.toggle('rail');
        headerBar.classList.toggle('active');
        contentBody.classList.toggle('active');
    }
}
/**
 * Re-applies the 'active' classes on page refresh
 */
function applySavedSidebarState() {
    const isRailSaved = localStorage.getItem('sidebar_is_rail') === 'true';
    const headerBar = document.getElementById('header-container');
    const contentBody = document.getElementById('main-content-area');
    const sidebar = document.getElementById('sidebar');

    if (isRailSaved) {
        if (sidebar) sidebar.classList.add('rail');
        if (headerBar) headerBar.classList.add('active');
        if (contentBody) contentBody.classList.add('active');
    }
}


/**
 * Apply saved sidebar state on load
 */
function applySidebarState() {
    const savedState = localStorage.getItem('admin_sidebar_state');
    if (savedState === 'rail') {
        document.body.classList.add('sidebar-is-rail');
    }
}


// --- 8. GLOBAL EVENT HANDLERS (Delete, Restore, etc.) ---

async function deleteApp(id) {
    const yes = await askModal("Delete Record?", "This is permanent.", "Delete");
    if (yes) {
        const { error } = await _supabase.from('applicants').delete().eq('id', id);
        if (!error) fetchData();
    }
}

async function restoreApplicant(id) {
    const { error } = await _supabase.from('applicants').update({ status: 'Pending' }).eq('id', id);
    if (!error) fetchData();
}

async function unassign(id) {
    const yes = await askModal("Unassign?", "Remove from branch?");
    if (yes) {
        const { error } = await _supabase.from('applicants').update({ assigned_branch: null }).eq('id', id);
        if (!error) fetchData();
    }
}

// --- 9. MODALS & UTILS ---

async function askModal(title, text, confirmText = "Confirm") {
    return new Promise((resolve) => {
        const overlay = document.getElementById('customModal');
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('modalText').innerText = text;
        document.getElementById('confirmBtn').innerText = confirmText;
        overlay.classList.add('active');
        document.getElementById('confirmBtn').onclick = () => { overlay.classList.remove('active'); resolve(true); };
        document.getElementById('cancelBtn').onclick = () => { overlay.classList.remove('active'); resolve(false); };
    });
}

function renderCharts() {
    const c1 = document.getElementById('branchChart');
    const c2 = document.getElementById('statusChart');
    if (!c1 || !c2) return;

    if (window.bChart) window.bChart.destroy();
    if (window.sChart) window.sChart.destroy();

    const branchCounts = branchOptions.map(b => masterData.filter(a => a.assigned_branch === b).length);
    window.bChart = new Chart(c1.getContext('2d'), {
        type: 'bar',
        data: { labels: branchOptions, datasets: [{ data: branchCounts, backgroundColor: '#D2042D' }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    window.sChart = new Chart(c2.getContext('2d'), {
        type: 'doughnut',
        data: { labels: ['Pending', 'Approved', 'Rejected'], datasets: [{ data: [
            masterData.filter(a => (a.status || '').toLowerCase() === 'pending').length,
            masterData.filter(a => (a.status || '').toLowerCase() === 'approved').length,
            masterData.filter(a => (a.status || '').toLowerCase() === 'rejected').length
        ], backgroundColor: ['#f39c12', '#2ecc71', '#e74c3c'] }] },
        options: { maintainAspectRatio: false }
    });
}

let currentPage = 1;
const itemsPerPage = 6;
let filteredData = []; // To hold search results for pagination

/**
 * 1. Notification Toggle Logic
 */
function toggleNotifDropdown(e) {
    e.stopPropagation();
    document.getElementById('notif-dropdown').classList.toggle('active');
}

// Close dropdown when clicking outside
window.addEventListener('click', () => {
    document.getElementById('notif-dropdown')?.classList.remove('active');
});

/**
 * 2. Mark as Read & Redirect
 * This updates Supabase, refreshes data, then takes user to the tab
 */
async function markAsRead(id) {
    const { error } = await _supabase
        .from('applicants')
        .update({ is_read: true })
        .eq('id', id);

    if (!error) {
        await fetchData(); // Refresh global data
        switchTab('applicants-tab'); // Take to tab
    }
}

/**
 * 3. Update Notification UI
 */
function renderNotifications() {
    const list = document.getElementById('notif-items-list');
    const badge = document.getElementById('notif-badge');
    if (!list || !badge) return;

    const pendingReview = masterData.filter(a => a.status === 'Pending' && !a.is_read);
    badge.innerText = pendingReview.length;
    badge.style.display = pendingReview.length > 0 ? 'flex' : 'none';

    if (pendingReview.length === 0) {
        list.innerHTML = `<div style="padding:30px; text-align:center; color:#888;">No new notifications</div>`;
        return;
    }

    list.innerHTML = pendingReview.map(app => `
        <div class="notif-item" onclick="markAndGo('${app.id}')">
            <div style="width:35px; height:35px; border-radius:10px; background:#fff1f0; color:var(--primary-red); display:flex; align-items:center; justify-content:center; font-weight:bold;">${app.first_name[0]}</div>
            <div class="notif-text">
                <strong>${app.first_name} ${app.last_name}</strong>
                <span>Review needed for ${app.desired_position}</span>
            </div>
        </div>`).join('');
}

// Mark as read in Supabase then switch to applicants tab
async function markAndGo(id) {
    await _supabase.from('applicants').update({ is_read: true }).eq('id', id);
    await fetchData(); // Refresh data
    switchTab('applicants-tab', document.querySelector('[onclick*="applicants-tab"]'));
}


function changePage(dir) {
    currentPage += dir;
    renderTableRows(masterData);
}

window.closeModal = function(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
};
window.toggleNotifDropdown = function(e) {
    if (e) e.stopPropagation();
    const dropdown = document.getElementById('notif-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');
    }
};

// Close dropdown when clicking anywhere else
document.addEventListener('click', () => {
    document.getElementById('notif-dropdown')?.classList.remove('active');
});

// --- BRANCH ACCORDION RENDERING WITH IMAGES (BRANCHES.HTML) ---
function renderAccordions() {
    const container = document.getElementById('branch-accordion-container');
    if (!container) return;

    // Placeholder images for each branch
    const branchImages = {
        "Manila Main": "https://images.unsplash.com/photo-1555636222-cae831e670b3?auto=format&fit=crop&w=800&q=80",
        "Quezon City": "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80",
        "Makati Hub": "https://images.unsplash.com/photo-1570126618983-31f4263ed974?auto=format&fit=crop&w=800&q=80",
        "Davao Branch": "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80",
        "Cebu Office": "https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80"
    };

    container.innerHTML = branchOptions.map(branch => {
        const guards = masterData.filter(a => a.assigned_branch === branch && a.status === 'Approved');
        const imgUrl = branchImages[branch] || "https://via.placeholder.com/800x300?text=Aloha+Security+Facility";

        return `
            <div class="branch-card">
                <!-- Branch Photo Section -->
                <div class="branch-image-wrapper">
                    <img src="${imgUrl}" alt="${branch}">
                    <div class="branch-info-overlay">
                        <h3 class="branch-name-text">${branch}</h3>
                    </div>
                </div>

                <!-- Accordion Toggle Bar -->
                <div class="branch-stats-bar" onclick="this.nextElementSibling.classList.toggle('active')">
                    <span style="font-size: 13px; font-weight: 700; color: #64748b;">
                        <i class="fas fa-users" style="margin-right: 8px; color: var(--primary-red);"></i>
                        ${guards.length} Deployed Personnel
                    </span>
                    <i class="fas fa-chevron-down" style="color: #cbd5e1; font-size: 12px;"></i>
                </div>

                <!-- Collapsible Personnel List -->
                <div class="guard-list-container">
                    ${guards.map(g => `
                        <div class="guard-row" style="padding: 12px 0; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center;">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <div style="width: 32px; height: 32px; border-radius: 8px; background: #e6f7ff; color: #1890ff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">
                                    ${g.first_name[0]}
                                </div>
                                <div>
                                    <div style="font-size: 14px; font-weight: 700; color: #2d3436;">${g.first_name} ${g.last_name}</div>
                                    <div style="font-size: 11px; color: #94a3b8;">${g.desired_position}</div>
                                </div>
                            </div>
                            <button onclick="unassign('${g.id}')" class="btn-refuse" style="padding: 6px 10px; font-size: 11px;">
                                <i class="fas fa-user-minus"></i> Unassign
                            </button>
                        </div>
                    `).join('') || '<div style="padding: 20px; text-align: center; color: #cbd5e1; font-size: 13px;">No personnel currently assigned to this branch.</div>'}
                </div>
            </div>`;
    }).join('');
}



// Start the Application
loadComponents();