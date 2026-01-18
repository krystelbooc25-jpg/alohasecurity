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

        // Attach functions to window so Sidebar/AJAX buttons can find them
        window.loadSection = loadSection;
        window.toggleSidebar = toggleSidebar;
        window.toggleNotifDropdown = toggleNotifDropdown;
        window.closeModal = closeModal;
        window.openViewModal = openViewModal;
        window.changePage = changePage;
        window.handleLogout = handleLogout;

        applySavedSidebarState();
        await loadSection('dashboard');
        fetchData();
    } catch (error) {
        console.error("Error loading shell components:", error);
    }
}

// --- 3. SECTION LOADER (AJAX) ---
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
    if (error) return console.error("Fetch Error:", error);
    
    masterData = data;
    renderCurrentTab();
    updateGlobalUI(); 
}

// --- 5. RENDER LOGIC ---
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

function renderDashboardStats() {
    if(!document.getElementById('stat-total')) return;
    document.getElementById('stat-total').innerText = masterData.length;
    document.getElementById('stat-pending').innerText = masterData.filter(a => a.status === 'Pending').length;
    document.getElementById('stat-approved').innerText = masterData.filter(a => a.status === 'Approved').length;
}

function renderTableRows() {
    const tbody = document.getElementById('applicant-table-body');
    if (!tbody) return;

    const activeData = masterData.filter(a => a.status?.toLowerCase() !== 'rejected');
    const startIdx = (currentPage - 1) * itemsPerPage;
    const paginatedItems = activeData.slice(startIdx, startIdx + itemsPerPage);

    tbody.innerHTML = paginatedItems.map(app => `
        <tr>
            <td style="padding-left: 25px;">
                <div style="font-weight: 700;">${app.first_name} ${app.last_name}</div>
                <div style="font-size: 11px; color: ${app.is_read ? '#aaa' : 'var(--primary-red)'}">
                    ${app.is_read ? 'Reviewed' : '● New Application'}
                </div>
            </td>
            <td><span class="badge-pos">${app.desired_position}</span></td>
            <td><span class="badge ${app.status?.toLowerCase()}">${app.status}</span></td>
            <td>
                <button class="btn-hire" onclick="openViewModal('${app.id}')">Hire</button>
                <button class="btn-refuse" onclick="rejectApplicant('${app.id}')"><i class="fas fa-times"></i></button>
            </td>
        </tr>`).join('');
}

// --- 6. ACTIONS (HIRE / REJECT / ASSIGN) ---

window.openViewModal = async function(id) {
    const app = masterData.find(a => a.id === id);
    if (!app) return;

    try {
        const container = document.getElementById('viewModal');
        const res = await fetch('components/profile-modal.html');
        container.innerHTML = await res.text();
        container.classList.add('active');

        // Fill Modal Data
        document.getElementById('v-full-name').innerText = `${app.first_name} ${app.last_name}`;
        document.getElementById('v-email').innerText = app.email;
        document.getElementById('v-id-img').src = app.valid_id_url || 'Resources/no-image.png';

        document.getElementById('v-approve-btn').onclick = () => {
            closeModal('viewModal');
            openAssignModal(app.id, `${app.first_name} ${app.last_name}`);
        };
    } catch (e) { console.error(e); }
};

window.openAssignModal = function(id, name) {
    document.getElementById('assign-applicant-name').innerText = name;
    document.getElementById('assignModal').classList.add('active');
    document.getElementById('confirmAssignBtn').onclick = () => processAssignment(id);
};

async function processAssignment(id) {
    const branch = document.getElementById('branch-select').value;
    const { error } = await _supabase.from('applicants')
        .update({ 
            status: 'Approved', 
            assigned_branch: branch,
            is_read: true,
            updated_at: new Date() 
        }).eq('id', id);

    if (!error) {
        closeModal('assignModal');
        fetchData();
    } else {
        alert("Error: " + error.message);
    }
}

// --- 7. UTILS ---
function closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
}

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
        document.getElementById('main-content-area')?.classList.toggle('active');
    }
}

function updateGlobalUI() {
    const badge = document.getElementById('notif-badge');
    const pending = masterData.filter(a => a.status === 'Pending' && !a.is_read).length;
    if (badge) {
        badge.innerText = pending;
        badge.style.display = pending > 0 ? 'flex' : 'none';
    }
}

async function handleLogout() {
    await _supabase.auth.signOut();
    window.location.href = 'AdminLogin.html';
}

function changePage(dir) { currentPage += dir; renderTableRows(); }

loadComponents();