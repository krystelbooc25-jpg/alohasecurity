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

// Pagination State
let currentPage = 1;
const itemsPerPage = 6;

// --- 2. INITIALIZATION ---
async function loadComponents() {
    try {
        // Load Sidebar & Header into the main shell
        const [sidebarRes, headerRes] = await Promise.all([
            fetch('components/sidebar.html'),
            fetch('components/header.html')
        ]);

        document.getElementById('sidebar-container').innerHTML = await sidebarRes.text();
        document.getElementById('header-container').innerHTML = await headerRes.text();

        // Re-apply rail state and active classes to Topbar/Content
        applySavedSidebarState();

        // Default: Load the Dashboard section first
        await loadSection('dashboard');
        
        // Initial data fetch
        fetchData();
    } catch (error) {
        console.error("Error loading shell components:", error);
    }
}

// --- 3. SECTION LOADER (AJAX with Carousel Animation) ---
async function loadSection(sectionName) {
    if (isAnimating) return;
    const target = document.getElementById('main-content-area');
    if (!target) return;

    const newIndex = tabOrder.indexOf(sectionName);
    const directionClass = newIndex > currentTabIndex ? 'slide-up' : 'slide-down';
    
    isAnimating = true;
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
            currentPage = 1; // Reset pagination on tab switch
            
            updateSidebarUI(sectionName);
            renderCurrentTab();

            setTimeout(() => {
                target.classList.remove(`${directionClass}-in`);
                isAnimating = false;
            }, 400);
        } catch (e) { 
            console.error(e); 
            isAnimating = false; 
            target.classList.remove(`${directionClass}-out`);
        }
    }, 400);
}

// --- 4. DATA FETCHING ---
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
    updateGlobalUI(); 
}

// --- 5. UI DISPATCHER ---
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

// --- 6. FACEBOOK STYLE NOTIFICATIONS ---
function renderNotifications() {
    const list = document.getElementById('notif-items-list');
    const badge = document.getElementById('notif-badge');
    if (!list || !badge) return;

    // Filter all PENDING review applicants
    const pendingReview = masterData.filter(a => a.status === 'Pending');
    
    // Badge shows only UNREAD count
    const unreadCount = pendingReview.filter(a => !a.is_read).length;
    badge.innerText = unreadCount;
    badge.style.display = unreadCount > 0 ? 'flex' : 'none';

    if (pendingReview.length === 0) {
        list.innerHTML = `<div style="padding:40px; text-align:center; color:#888;">No new notifications</div>`;
        return;
    }

    list.innerHTML = pendingReview.map(app => {
        const isUnread = !app.is_read;
        return `
            <div class="notif-item ${isUnread ? 'unread' : ''}" onclick="handleNotifClick('${app.id}', event)">
                <div class="notif-avatar">${app.first_name[0]}</div>
                <div class="notif-content">
                    <strong>${app.first_name} ${app.last_name}</strong>
                    <p>Applied for <b>${app.desired_position}</b></p>
                </div>
                ${isUnread ? '<div class="unread-dot"></div>' : ''}
            </div>`;
    }).join('');
}

async function handleNotifClick(id, event) {
    // Mark as read in Supabase
    await _supabase.from('applicants').update({ is_read: true }).eq('id', id);
    await fetchData();
    // Go to applicants tab
    switchTab('applicants-tab');
}

// --- 7. CORE TABLE RENDERING (With Pagination Fix) ---
function renderTableRows(list) {
    const tbody = document.getElementById('applicant-table-body');
    if (!tbody) return;

    const activeData = list.filter(a => a.status?.toLowerCase() !== 'rejected');
    
    // Pagination Calculation
    const totalItems = activeData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIdx = (currentPage - 1) * itemsPerPage;
    const paginatedItems = activeData.slice(startIdx, startIdx + itemsPerPage);

    // Update Pagination Text (Fixes Showing 0 to 0)
    const startEl = document.getElementById('page-start');
    const endEl = document.getElementById('page-end');
    const totalEl = document.getElementById('page-total');
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (startEl) startEl.innerText = totalItems === 0 ? 0 : startIdx + 1;
    if (endEl) endEl.innerText = Math.min(startIdx + itemsPerPage, totalItems);
    if (totalEl) totalEl.innerText = totalItems;
    
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages || totalPages === 0;

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:50px; color:#aaa;">No applicants found.</td></tr>`;
        return;
    }

    tbody.innerHTML = paginatedItems.map(app => {
        const fullName = `${app.first_name} ${app.last_name}`;
        return `
            <tr>
                <td style="padding-left: 25px;">
                    <div style="font-weight: 700; color: #2d3436;">${fullName}</div>
                    <div style="font-size: 11px; color: ${app.is_read ? '#aaa' : 'var(--primary-red)'}">
                        ${app.is_read ? 'Reviewing' : '● New Application'}
                    </div>
                </td>
                <td><span style="background:#f1f2f6; padding:4px 10px; border-radius:6px; font-size:12px;">${app.desired_position}</span></td>
                <td><span class="badge ${app.status.toLowerCase()}">${app.status}</span></td>
                <td style="text-align: center;">
                    <div style="display: flex; justify-content: center; gap: 8px;">
                        <button class="btn-hire" onclick="openViewModal('${app.id}')">
                            <i class="fas fa-user-check"></i> Hire
                        </button>
                        <button class="btn-refuse" onclick="rejectApplicant('${app.id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function changePage(dir) {
    currentPage += dir;
    renderTableRows(masterData);
}

// --- 8. MODALS & HIRING LOGIC ---

async function openViewModal(id) {
    const app = masterData.find(a => a.id === id);
    if (!app) return;

    try {
        const res = await fetch('components/profile-modal.html');
        const container = document.getElementById('viewModal');
        container.innerHTML = await res.text();
        container.classList.add('active');

        // Populate Profile Data
        document.getElementById('v-full-name').innerText = `${app.first_name} ${app.last_name}`;
        document.getElementById('v-position').innerText = `Applying for: ${app.desired_position}`;
        document.getElementById('v-email').innerText = app.email;
        document.getElementById('v-phone').innerText = app.phone || 'N/A';
        document.getElementById('v-dob').innerText = app.dob;
        document.getElementById('v-salary').innerText = app.salary_range || 'N/A';
        document.getElementById('v-id-type').innerText = app.id_type || 'N/A';
        document.getElementById('v-experience').innerText = app.security_experience || "No experience listed.";
        document.getElementById('v-id-img').src = app.valid_id_url || 'Resources/no-image.png';

        // Button Listeners inside Modal
        document.getElementById('v-resume-btn').onclick = () => window.open(app.resume_url, '_blank');
        document.getElementById('v-reject-btn').onclick = () => { window.closeModal('viewModal'); rejectApplicant(app.id); };
        
        // Approve Button Logic: Transitions to Branch Assignment
        document.getElementById('v-approve-btn').onclick = () => {
            window.closeModal('viewModal');
            setTimeout(() => {
                openAssignModal(app.id, `${app.first_name} ${app.last_name}`);
            }, 300);
        };
    } catch (e) { console.error("Error loading modal", e); }
}

function openAssignModal(id, name) {
    const modal = document.getElementById('assignModal');
    document.getElementById('assign-applicant-name').innerText = name;
    modal.classList.add('active');
    document.getElementById('confirmAssignBtn').onclick = () => processAssignment(id);
}

async function processAssignment(id) {
    const branch = document.getElementById('branch-select').value;
    const { error } = await _supabase.from('applicants').update({ 
        status: 'Approved', 
        assigned_branch: branch,
        is_read: true,
        updated_at: new Date() 
    }).eq('id', id);

    if (!error) {
        window.closeModal('assignModal');
        fetchData();
    }
}

// --- 9. UTILITIES & SHELL LOGIC ---

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    const headerBar = document.getElementById('header-container');
    const contentBody = document.getElementById('main-content-area');
    
    if (sidebar && headerBar && contentBody) {
        sidebar.classList.toggle('rail');
        headerBar.classList.toggle('active');
        contentBody.classList.toggle('active');
        localStorage.setItem('sidebar_is_rail', sidebar.classList.contains('rail'));
    }
};

window.applySavedSidebarState = () => {
    const isRail = localStorage.getItem('sidebar_is_rail') === 'true';
    if (isRail) {
        document.getElementById('sidebar')?.classList.add('rail');
        document.getElementById('header-container')?.classList.add('active');
        document.getElementById('main-content-area')?.classList.add('active');
    }
};

window.toggleNotifDropdown = (e) => {
    e.stopPropagation();
    document.getElementById('notif-dropdown')?.classList.toggle('active');
};

window.closeModal = (id) => document.getElementById(id)?.classList.remove('active');

function updateGlobalUI() {
    renderNotifications();
    if (currentTab === 'dashboard') renderDashboardStats();
}

// Close notif when clicking away
document.addEventListener('click', () => document.getElementById('notif-dropdown')?.classList.remove('active'));

// Start
loadComponents();