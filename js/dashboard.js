// --- 1. CONFIGURATION ---
const supabaseUrl = 'https://kkaelwhdcsgaodbhrxqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrYWVsd2hkY3NnYW9kYmhyeHF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxOTA4NzksImV4cCI6MjA3MTc2Njg3OX0.wSFv1AZgZDXjGHiIwOHyWzqTDk0v6NbR4-2r90iF9ok';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);

let masterData = [];
let currentTab = 'dashboard';
const tabOrder = ['dashboard', 'applicants', 'branches', 'trash'];
let currentTabIndex = 0;

// Expose functions to global scope
window.loadSection = loadSection;
window.toggleSidebar = toggleSidebar;
window.closeModal = (id) => document.getElementById(id).classList.remove('active');

// --- 2. AJAX LOADERS ---
async function loadComponents() {
    try {
        const [sidebarRes, headerRes] = await Promise.all([
            fetch('components/sidebar.html'),
            fetch('components/header.html')
        ]);
        document.getElementById('sidebar-container').innerHTML = await sidebarRes.text();
        document.getElementById('header-container').innerHTML = await headerRes.text();
        
        await loadSection('dashboard');
        fetchData();
    } catch (e) { console.error("Initialization error:", e); }
}

async function loadSection(sectionName) {
    const target = document.getElementById('main-content-area');
    try {
        const response = await fetch(`sections/${sectionName}.html`);
        target.innerHTML = await response.text();
        currentTab = sectionName;
        renderCurrentTab();
    } catch (e) { console.error(e); }
}

// --- 3. DATA FETCHING ---
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
    } else if (currentTab === 'applicants') {
        renderTableRows();
    }
}

// --- 4. TABLE & PROFILE MODAL LOGIC ---
function renderTableRows() {
    const tbody = document.getElementById('applicant-table-body');
    if (!tbody) return;
    const activeData = masterData.filter(a => a.status !== 'Rejected');
    
    tbody.innerHTML = activeData.map(app => `
        <tr>
            <td style="padding-left:20px;"><strong>${app.first_name} ${app.last_name}</strong></td>
            <td>${app.desired_position}</td>
            <td><span class="badge ${app.status.toLowerCase()}">${app.status}</span></td>
            <td>
                <button onclick="openViewModal('${app.id}')" class="btn-hire">
                    <i class="fas fa-user-check"></i> Hire
                </button>
            </td>
        </tr>`).join('');
}

async function openViewModal(id) {
    const app = masterData.find(a => a.id === id);
    if (!app) return;

    try {
        // Load the Profile Modal HTML if it's not yet there
        const container = document.getElementById('viewModal');
        const res = await fetch('components/profile-modal.html');
        container.innerHTML = await res.text();

        // Populate Data
        document.getElementById('v-full-name').innerText = `${app.first_name} ${app.last_name}`;
        document.getElementById('v-position').innerText = `Applying for: ${app.desired_position}`;
        document.getElementById('v-email').innerText = app.email || 'N/A';
        document.getElementById('v-phone').innerText = app.phone || 'N/A';
        document.getElementById('v-dob').innerText = app.dob || 'N/A';
        document.getElementById('v-salary').innerText = app.salary_range || 'N/A';
        document.getElementById('v-id-type').innerText = app.id_type || 'N/A';
        document.getElementById('v-experience').innerText = app.security_experience || "None listed.";
        document.getElementById('v-id-img').src = app.valid_id_url || 'Resources/no-image.png';

        // Set Button Actions
        document.getElementById('v-resume-btn').onclick = () => window.open(app.resume_url, '_blank');
        document.getElementById('v-reject-btn').onclick = () => { window.closeModal('viewModal'); rejectApplicant(app.id); };
        document.getElementById('v-approve-btn').onclick = () => {
            window.closeModal('viewModal');
            setTimeout(() => openAssignModal(app.id, `${app.first_name} ${app.last_name}`), 300);
        };

        container.classList.add('active');
    } catch (e) { console.error(e); }
}

// --- 5. BRANCH ASSIGNMENT ---
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
        updated_at: new Date() 
    }).eq('id', id);

    if (!error) {
        window.closeModal('assignModal');
        fetchData();
    }
}

async function rejectApplicant(id) {
    const { error } = await _supabase.from('applicants').update({ status: 'Rejected' }).eq('id', id);
    if (!error) fetchData();
}

// --- UTILS ---
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('rail');
}

function updateGlobalUI() {
    const badge = document.getElementById('notif-badge');
    const count = masterData.filter(a => a.status === 'Pending').length;
    if (badge) { badge.innerText = count; badge.style.display = count > 0 ? 'flex' : 'none'; }
}

function renderDashboardStats() {
    const total = document.getElementById('stat-total');
    if (total) {
        total.innerText = masterData.length;
        document.getElementById('stat-pending').innerText = masterData.filter(a => a.status === 'Pending').length;
        document.getElementById('stat-approved').innerText = masterData.filter(a => a.status === 'Approved').length;
    }
}

loadComponents();