// --- 1. CONFIGURATION & STATE ---
const supabaseUrl = 'https://kkaelwhdcsgaodbhrxqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrYWVsd2hkY3NnYW9kYmhyeHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTA4NzksImV4cCI6MjA3MTc2Njg3OX0.wSFv1AZgZDXjGHiIwOHyWzqTDk0v6NbR4-2r90iF9ok';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let masterData = [];
let currentTab = 'dashboard';
const tabOrder = ['dashboard', 'applicants', 'branches', 'trash'];
let currentTabIndex = 0;
let isAnimating = false;

// Global Setup for Sidebar Buttons
window.loadSection = loadSection;
window.switchTab = switchTab;
window.toggleSidebar = toggleSidebar;
window.closeModal = closeModal;
window.toggleNotifDropdown = toggleNotifDropdown;

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
        await loadSection('dashboard');
        fetchData();
    } catch (error) {
        console.error("Error loading components:", error);
    }
}

// --- 3. THE NAVIGATION ENGINE (FIXED) ---
async function loadSection(sectionName) {
    if (isAnimating) return;
    const target = document.getElementById('main-content-area');
    if (!target) return;

    const newIndex = tabOrder.indexOf(sectionName.replace('-tab', ''));
    const directionClass = newIndex > currentTabIndex ? 'slide-up' : 'slide-down';
    
    isAnimating = true;
    target.classList.add(`${directionClass}-out`);

    setTimeout(async () => {
        try {
            const cleanName = sectionName.replace('-tab', '');
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
            console.error(e); 
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
        // Check if charts exist in the section before rendering
        if (document.getElementById('branchChart')) renderCharts();
    } else if (currentTab === 'applicants') {
        renderTableRows();
    } else if (currentTab === 'branches') {
        if (typeof renderAccordions === 'function') renderAccordions();
    } else if (currentTab === 'trash') {
        if (typeof renderTrashBin === 'function') renderTrashBin();
    }
}

// --- 5. UI UPDATERS ---
function renderDashboardStats() {
    const total = document.getElementById('stat-total');
    const pending = document.getElementById('stat-pending');
    const approved = document.getElementById('stat-approved');

    if (total) total.innerText = masterData.length;
    if (pending) pending.innerText = masterData.filter(a => a.status === 'Pending').length;
    if (approved) approved.innerText = masterData.filter(a => a.status === 'Approved').length;
}

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

// --- 6. UTILS & ACTIONS ---
function switchTab(tabId, el) {
    const sectionName = tabId.replace('-tab', '');
    loadSection(sectionName);
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

// Start
loadComponents();