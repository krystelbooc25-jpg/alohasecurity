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

// --- 2. INITIALIZATION ---
async function loadComponents() {
    try {
        const [sidebarRes, headerRes] = await Promise.all([
            fetch('components/sidebar.html'),
            fetch('components/header.html')
        ]);

        document.getElementById('sidebar-container').innerHTML = await sidebarRes.text();
        document.getElementById('header-container').innerHTML = await headerRes.text();

        // Attach functions to window so they are globally accessible
        window.loadSection = loadSection;
        window.switchTab = switchTab;
        window.toggleSidebar = toggleSidebar;
        window.closeModal = closeModal;
        window.toggleNotifDropdown = toggleNotifDropdown;
        window.handleLogout = handleLogout;

        applySavedSidebarState();
        await loadSection('dashboard');
        fetchData();
    } catch (error) {
        console.error("Error loading components:", error);
    }
}

// --- 3. THE NAVIGATION ENGINE ---
async function loadSection(sectionName) {
    if (isAnimating) return;
    const target = document.getElementById('main-content-area');
    if (!target) return;

    const cleanName = sectionName.replace('-tab', '');
    const newIndex = tabOrder.indexOf(cleanName);
    const directionClass = newIndex > currentTabIndex ? 'slide-up' : 'slide-down';
    
    isAnimating = true;
    target.classList.add(`${directionClass}-out`);

    setTimeout(async () => {
        try {
            const response = await fetch(`sections/${cleanName}.html`);
            const html = await response.text();
            
            target.innerHTML = html;
            target.classList.remove(`${directionClass}-out`);
            target.classList.add(`${directionClass}-in`);

            currentTab = cleanName;
            currentTabIndex = newIndex;
            
            updateSidebarUI(cleanName);
            renderCurrentTab();

            setTimeout(() => {
                target.classList.remove(`${directionClass}-in`);
                isAnimating = false;
            }, 400);
        } catch (e) { 
            console.error("Error loading section:", e); 
            isAnimating = false; 
            target.classList.remove(`${directionClass}-out`);
        }
    }, 400);
}

// --- 4. DATA LOGIC ---
async function fetchData() {
    const { data, error } = await _supabase.from('applicants').select('*').order('created_at', { ascending: false });
    if (error) return console.error(error);
    
    masterData = data;
    renderCurrentTab();
    updateGlobalUI(); 
}

function renderCurrentTab() {
    if (currentTab === 'dashboard') {
        renderDashboardStats();
        if (document.getElementById('branchChart')) renderCharts();
    } else if (currentTab === 'applicants') {
        renderTableRows();
    } else if (currentTab === 'branches') {
        renderAccordions();
    } else if (currentTab === 'trash') {
        renderTrashBin();
    }
}

// --- 5. UI UPDATERS (MGA NAWALA NA FUNCTIONS) ---

function renderDashboardStats() {
    const total = document.getElementById('stat-total');
    const pending = document.getElementById('stat-pending');
    const approved = document.getElementById('stat-approved');

    if (total) total.innerText = masterData.length;
    if (pending) pending.innerText = masterData.filter(a => a.status === 'Pending').length;
    if (approved) approved.innerText = masterData.filter(a => a.status === 'Approved').length;
}

function renderTableRows() {
    const tbody = document.getElementById('applicant-table-body');
    if (!tbody) return;

    // Filter out Rejected applicants for the main table
    const activeData = masterData.filter(a => a.status !== 'Rejected');

    tbody.innerHTML = activeData.map(app => `
        <tr>
            <td style="padding-left: 20px;">
                <div style="font-weight: 700;">${app.first_name} ${app.last_name}</div>
                <div style="font-size: 11px; color: #888;">ID: ${app.id.substring(0,8)}</div>
            </td>
            <td>${app.desired_position}</td>
            <td><span class="badge ${app.status.toLowerCase()}">${app.status}</span></td>
            <td>
                <button onclick="openViewModal('${app.id}')" class="btn-hire">View Details</button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center; padding:20px;">No applicants found.</td></tr>';
}

function renderCharts() {
    const ctx1 = document.getElementById('branchChart');
    const ctx2 = document.getElementById('statusChart');
    if (!ctx1 || !ctx2) return;

    // Branch Distribution Chart
    new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: branchOptions,
            datasets: [{
                label: 'Guards Deployed',
                data: branchOptions.map(b => masterData.filter(a => a.assigned_branch === b).length),
                backgroundColor: '#D2042D'
            }]
        },
        options: { maintainAspectRatio: false }
    });

    // Status Doughnut Chart
    new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Approved', 'Rejected'],
            datasets: [{
                data: [
                    masterData.filter(a => a.status === 'Pending').length,
                    masterData.filter(a => a.status === 'Approved').length,
                    masterData.filter(a => a.status === 'Rejected').length
                ],
                backgroundColor: ['#f39c12', '#2ecc71', '#e74c3c']
            }]
        },
        options: { maintainAspectRatio: false }
    });
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
                    <span>${guards.length} Guards Deployed <i class="fas fa-chevron-down"></i></span>
                </div>
                <div class="accordion-content">
                    ${guards.map(g => `<div class="guard-row"><span>${g.first_name} ${g.last_name}</span></div>`).join('') || '<p style="padding:10px; color:#ccc;">No guards assigned.</p>'}
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
            <td><button class="btn-secondary" onclick="restoreApplicant('${app.id}')">Restore</button></td>
        </tr>`).join('') || '<tr><td colspan="3" style="text-align:center; padding:20px;">Trash Bin is empty.</td></tr>';
}

// --- 6. UTILS & ACTIONS ---
function updateSidebarUI(name) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('onclick')?.includes(name)) {
            item.classList.add('active');
        }
    });
    const title = document.getElementById('current-title');
    if (title) title.innerText = name.toUpperCase();
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('rail');
        document.getElementById('header-container')?.classList.toggle('active');
        document.getElementById('main-content-area')?.classList.toggle('active');
        localStorage.setItem('sidebar_is_rail', sidebar.classList.contains('rail'));
    }
}

function applySavedSidebarState() {
    if (localStorage.getItem('sidebar_is_rail') === 'true') {
        document.getElementById('sidebar')?.classList.add('rail');
        document.getElementById('header-container')?.classList.add('active');
        document.getElementById('main-content-area')?.classList.add('active');
    }
}

function toggleNotifDropdown(e) {
    if (e) e.stopPropagation();
    document.getElementById('notif-dropdown')?.classList.toggle('active');
}

function closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
}

function updateGlobalUI() {
    const badge = document.getElementById('notif-badge');
    if (badge) {
        const count = masterData.filter(a => a.status === 'Pending').length;
        badge.innerText = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    window.location.href = 'AdminLogin.html';
}

// Start the Dashboard
loadComponents();