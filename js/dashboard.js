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

let currentPage = 1;
const itemsPerPage = 6;

// --- 2. INITIALIZATION ---
async function loadComponents() {
    try {
        const [sidebarRes, headerRes] = await Promise.all([
            fetch('components/sidebar.html'),
            fetch('components/header.html')
        ]);

        document.getElementById('sidebar-container').innerHTML = await sidebarRes.text();
        document.getElementById('header-container').innerHTML = await headerRes.text();

        // FIX: Attach functions to window so Sidebar buttons can see them
        window.loadSection = loadSection;
        window.toggleSidebar = toggleSidebar;
        window.toggleNotifDropdown = toggleNotifDropdown;
        window.closeModal = closeModal;
        window.changePage = changePage;

        applySavedSidebarState();
        await loadSection('dashboard');
        fetchData();
    } catch (error) {
        console.error("Error loading shell components:", error);
    }
}

// --- 3. SECTION LOADER (FIXED) ---
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
            currentPage = 1; 
            
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
    
    // Auto-cleanup Rejected
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
    renderNotifications();
}

// --- 5. UI DISPATCHER (FIXED) ---
function renderCurrentTab() {
    if (currentTab === 'dashboard') {
        renderDashboardStats();
        renderCharts();
    } else if (currentTab === 'applicants') {
        renderTableRows();
    } else if (currentTab === 'branches') {
        renderAccordions();
    } else if (currentTab === 'trash') {
        renderTrashBin();
    }
}

// --- 6. CORE TABLE RENDERING (FIXED NULL CHECKS) ---
function renderTableRows() {
    const tbody = document.getElementById('applicant-table-body');
    if (!tbody) return;

    const activeData = masterData.filter(a => a.status?.toLowerCase() !== 'rejected');
    const totalItems = activeData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIdx = (currentPage - 1) * itemsPerPage;
    const paginatedItems = activeData.slice(startIdx, startIdx + itemsPerPage);

    // Safeguard for pagination text
    const startEl = document.getElementById('page-start');
    const endEl = document.getElementById('page-end');
    const totalEl = document.getElementById('page-total');
    if (startEl) startEl.innerText = totalItems === 0 ? 0 : startIdx + 1;
    if (endEl) endEl.innerText = Math.min(startIdx + itemsPerPage, totalItems);
    if (totalEl) totalEl.innerText = totalItems;
    
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages || totalPages === 0;

    tbody.innerHTML = paginatedItems.map(app => `
        <tr>
            <td style="padding-left: 25px;">
                <div style="font-weight: 700; color: #2d3436;">${app.first_name} ${app.last_name}</div>
                <div style="font-size: 11px; color: ${app.is_read ? '#aaa' : 'var(--primary-red)'}">
                    ${app.is_read ? 'Reviewing' : '● New Application'}
                </div>
            </td>
            <td><span class="badge-pos">${app.desired_position}</span></td>
            <td><span class="badge ${app.status.toLowerCase()}">${app.status}</span></td>
            <td style="text-align: center;">
                <div style="display: flex; justify-content: center; gap: 8px;">
                    <button class="btn-hire" onclick="openViewModal('${app.id}')">Hire</button>
                    <button class="btn-refuse" onclick="rejectApplicant('${app.id}')"><i class="fas fa-times"></i></button>
                </div>
            </td>
        </tr>`).join('');
}

function changePage(dir) {
    currentPage += dir;
    renderTableRows();
}

// --- 7. DASHBOARD STATS & CHARTS ---
function renderDashboardStats() {
    const total = document.getElementById('stat-total');
    const pending = document.getElementById('stat-pending');
    const approved = document.getElementById('stat-approved');

    if (total) total.innerText = masterData.length;
    if (pending) pending.innerText = masterData.filter(a => a.status === 'Pending').length;
    if (approved) approved.innerText = masterData.filter(a => a.status === 'Approved').length;
}

function renderCharts() {
    const ctx1 = document.getElementById('branchChart');
    const ctx2 = document.getElementById('statusChart');
    if (!ctx1 || !ctx2) return;

    if (window.chartB) window.chartB.destroy();
    if (window.chartS) window.chartS.destroy();

    window.chartB = new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: branchOptions,
            datasets: [{ label: 'Guards', data: branchOptions.map(b => masterData.filter(a => a.assigned_branch === b).length), backgroundColor: '#D2042D' }]
        },
        options: { maintainAspectRatio: false }
    });

    window.chartS = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Approved', 'Rejected'],
            datasets: [{ data: ['Pending', 'Approved', 'Rejected'].map(s => masterData.filter(a => a.status === s).length), backgroundColor: ['#f39c12', '#2ecc71', '#e74c3c'] }]
        },
        options: { maintainAspectRatio: false }
    });
}

// --- 8. REST OF LOGIC ---
function renderAccordions() {
    const container = document.getElementById('branch-accordion-container');
    if (!container) return;
    container.innerHTML = branchOptions.map(branch => {
        const guards = masterData.filter(a => a.assigned_branch === branch && a.status === 'Approved');
        return `
            <div class="branch-accordion">
                <div class="accordion-header" onclick="this.nextElementSibling.classList.toggle('active')">
                    <span><i class="fas fa-building"></i> ${branch}</span>
                    <span>${guards.length} Guards <i class="fas fa-chevron-down"></i></span>
                </div>
                <div class="accordion-content">
                    ${guards.map(g => `<div class="guard-row"><span>${g.first_name} ${g.last_name}</span></div>`).join('') || '<div style="padding:10px; color:#ccc">Empty</div>'}
                </div>
            </div>`;
    }).join('');
}

function renderTrashBin() {
    const tbody = document.getElementById('trash-table-body');
    if (!tbody) return;
    const trashed = masterData.filter(a => a.status === 'Rejected');
    tbody.innerHTML = trashed.map(app => `
        <tr>
            <td>${app.first_name} ${app.last_name}</td>
            <td><span class="badge rejected">Rejected</span></td>
            <td><button class="btn-primary" onclick="restoreApplicant('${app.id}')">Restore</button></td>
        </tr>`).join('') || '<tr><td colspan="3" style="text-align:center; padding:20px;">Trash is empty</td></tr>';
}

window.rejectApplicant = async function(id) {
    const { error } = await _supabase.from('applicants').update({ status: 'Rejected', updated_at: new Date() }).eq('id', id);
    if (!error) fetchData();
};

window.restoreApplicant = async function(id) {
    await _supabase.from('applicants').update({ status: 'Pending' }).eq('id', id);
    fetchData();
};

function updateSidebarUI(section) {
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active');
        if(el.getAttribute('onclick')?.includes(section)) el.classList.add('active');
    });
    const title = document.getElementById('current-title');
    if (title) title.innerText = section.toUpperCase();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('rail');
        document.getElementById('header-container')?.classList.toggle('active');
        document.getElementById('main-content-area')?.classList.toggle('rail-active');
        localStorage.setItem('sidebar_is_rail', sidebar.classList.contains('rail'));
    }
}

function applySavedSidebarState() {
    if (localStorage.getItem('sidebar_is_rail') === 'true') {
        document.getElementById('sidebar')?.classList.add('rail');
        document.getElementById('header-container')?.classList.add('active');
        document.getElementById('main-content-area')?.classList.add('rail-active');
    }
}

function toggleNotifDropdown(e) {
    e.stopPropagation();
    document.getElementById('notif-dropdown')?.classList.toggle('active');
}

function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

document.addEventListener('click', () => document.getElementById('notif-dropdown')?.classList.remove('active'));

loadComponents();