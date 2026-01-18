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

        applySavedSidebarState();
        
        // Mahalaga: Gawing global ang function para matawag ng sidebar buttons
        window.loadSection = loadSection; 
        
        await loadSection('dashboard');
        fetchData();
    } catch (error) {
        console.error("Error loading shell components:", error);
    }
}

// --- 3. SECTION LOADER (FIXED & GLOBAL) ---
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
    
    // Cleanup logic
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

// --- 5. UI DISPATCHER (FIXED) ---
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

// --- 6. MISSING CORE LOGIC FUNCTIONS (ADDED) ---

function renderDashboardStats() {
    const total = document.getElementById('stat-total');
    const pending = document.getElementById('stat-pending');
    const approved = document.getElementById('stat-approved');

    if (total) total.innerText = masterData.length;
    if (pending) pending.innerText = masterData.filter(a => a.status === 'Pending').length;
    if (approved) approved.innerText = masterData.filter(a => a.status === 'Approved').length;
}

function renderCharts() {
    const bCtx = document.getElementById('branchChart');
    const sCtx = document.getElementById('statusChart');
    if (!bCtx || !sCtx) return;

    // Destroy existing charts to prevent hover glitches
    if (window.myBChart) window.myBChart.destroy();
    if (window.mySChart) window.mySChart.destroy();

    window.myBChart = new Chart(bCtx, {
        type: 'bar',
        data: {
            labels: branchOptions,
            datasets: [{ label: 'Guards', data: branchOptions.map(b => masterData.filter(a => a.assigned_branch === b).length), backgroundColor: '#D2042D' }]
        }
    });

    window.mySChart = new Chart(sCtx, {
        type: 'doughnut',
        data: {
            labels: ['Pending', 'Approved', 'Rejected'],
            datasets: [{ data: ['Pending', 'Approved', 'Rejected'].map(s => masterData.filter(a => a.status === s).length), backgroundColor: ['#f39c12', '#2ecc71', '#e74c3c'] }]
        }
    });
}

// Implementasyon ng Table Rendering
function renderTableRows(list) {
    const tbody = document.getElementById('applicant-table-body');
    if (!tbody) return;
    const activeData = list.filter(a => a.status?.toLowerCase() !== 'rejected');
    tbody.innerHTML = activeData.map(app => `
        <tr>
            <td style="padding-left: 20px;"><strong>${app.first_name} ${app.last_name}</strong></td>
            <td>${app.desired_position}</td>
            <td><span class="badge ${app.status.toLowerCase()}">${app.status}</span></td>
            <td><button onclick="openViewModal('${app.id}')" class="btn-hire">View</button></td>
        </tr>`).join('');
}

// --- 7. UTILITIES (SIDEBAR SYNC) ---

function updateSidebarUI(section) {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
        // Check if the onclick attribute contains the section name
        if (item.getAttribute('onclick')?.includes(section)) {
            item.classList.add('active');
        }
    });
    const title = document.getElementById('current-title');
    if (title) title.innerText = section.toUpperCase();
}

window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('rail');
        localStorage.setItem('sidebar_is_rail', sidebar.classList.contains('rail'));
    }
};

window.applySavedSidebarState = () => {
    const isRail = localStorage.getItem('sidebar_is_rail') === 'true';
    if (isRail) document.getElementById('sidebar')?.classList.add('rail');
};

function updateGlobalUI() {
    if (typeof renderNotifications === 'function') renderNotifications();
}

// Start
loadComponents();