// --- 1. CONFIGURATION ---
const supabaseUrl = 'https://kkaelwhdcsgaodbhrxqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrYWVsd2hkY3NnYW9kYmhyeHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTA4NzksImV4cCI6MjA3MTc2Njg3OX0.wSFv1AZgZDXjGHiIwOHyWzqTDk0v6NbR4-2r90iF9ok';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let masterData = [];
let currentTab = 'dashboard';
const tabOrder = ['dashboard', 'applicants', 'branches', 'trash'];
let currentTabIndex = 0;
let isAnimating = false;

// Pagination Settings
let currentPage = 1;
const itemsPerPage = 6;
const branchOptions = ["Manila Main", "Quezon City", "Makati Hub", "Davao Branch", "Cebu Office"];

// --- 2. INITIALIZATION (Dito magsisimula ang lahat) ---
async function loadComponents() {
    try {
        console.log("Loading shell components...");
        const [sidebarRes, headerRes] = await Promise.all([
            fetch('components/sidebar.html'),
            fetch('components/header.html')
        ]);

        document.getElementById('sidebar-container').innerHTML = await sidebarRes.text();
        document.getElementById('header-container').innerHTML = await headerRes.text();

        // Gawing global ang mga function para matawag ng Sidebar
        window.loadSection = loadSection;
        window.toggleSidebar = toggleSidebar;
        window.closeModal = closeModal;

        applySavedSidebarState();
        
        // 1. Kunin ang Data muna
        await fetchData(); 
        
        // 2. I-load ang Dashboard UI
        await loadSection('dashboard');
        
    } catch (error) {
        console.error("Shell error:", error);
    }
}

// --- 3. THE NAVIGATION ENGINE (Ito ang naglalagay ng laman sa dashboard) ---
async function loadSection(sectionName) {
    if (isAnimating) return;
    const target = document.getElementById('main-content-area');
    if (!target) return;

    console.log("Switching to section:", sectionName);

    try {
        // Simple fetch para walang error sa pathing
        const response = await fetch(`sections/${sectionName}.html`);
        if (!response.ok) throw new Error(`File sections/${sectionName}.html not found!`);
        
        const html = await response.text();
        target.innerHTML = html;

        currentTab = sectionName;
        updateSidebarUI(sectionName);
        renderCurrentTab(); // Dito idodrowing ang stats/charts

    } catch (e) { 
        console.error("Section load error:", e);
        target.innerHTML = `<div style="padding:20px; color:red;">Error loading ${sectionName}: ${e.message}</div>`;
    }
}

// --- 4. DATA FETCHING ---
async function fetchData() {
    const { data, error } = await _supabase.from('applicants').select('*').order('created_at', { ascending: false });
    if (error) {
        console.error("Supabase Error:", error.message);
        return;
    }
    masterData = data;
    renderCurrentTab();
    updateGlobalUI(); 
}

// --- 5. RENDERING LOGIC ---
function renderCurrentTab() {
    if (currentTab === 'dashboard') {
        renderDashboardStats();
        if (document.getElementById('branchChart')) renderCharts();
    } else if (currentTab === 'applicants') {
        renderTableRows();
    }
}

function renderDashboardStats() {
    const total = document.getElementById('stat-total');
    const pending = document.getElementById('stat-pending');
    const approved = document.getElementById('stat-approved');

    if (!total) return; // Pag wala pa sa screen, wag muna drowing

    total.innerText = masterData.length;
    pending.innerText = masterData.filter(a => a.status === 'Pending').length;
    approved.innerText = masterData.filter(a => a.status === 'Approved').length;
}

function renderCharts() {
    const ctx1 = document.getElementById('branchChart');
    const ctx2 = document.getElementById('statusChart');
    if (!ctx1 || !ctx2) return;

    // Personnel by Branch Chart
    new Chart(ctx1, {
        type: 'bar',
        data: {
            labels: branchOptions,
            datasets: [{ label: 'Guards', data: branchOptions.map(b => masterData.filter(a => a.assigned_branch === b).length), backgroundColor: '#D2042D' }]
        }
    });
}

function renderTableRows() {
    const tbody = document.getElementById('applicant-table-body');
    if (!tbody) return;
    const activeData = masterData.filter(a => a.status !== 'Rejected');
    tbody.innerHTML = activeData.map(app => `
        <tr>
            <td><strong>${app.first_name} ${app.last_name}</strong></td>
            <td>${app.desired_position}</td>
            <td><span class="badge ${app.status.toLowerCase()}">${app.status}</span></td>
            <td><button onclick="openViewModal('${app.id}')" class="btn-hire">View</button></td>
        </tr>`).join('');
}

// --- 6. UTILITIES ---

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

function updateGlobalUI() {
    const badge = document.getElementById('notif-badge');
    if (badge) {
        const count = masterData.filter(a => a.status === 'Pending').length;
        badge.innerText = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

// Run
loadComponents();